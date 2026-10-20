import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// =====================================================================
// Resume text extractor. Resolves a candidate's resume_url into the
// raw text the AI prompt needs. Three real cases:
//
//   1. resume_url is null OR points at an external link
//      (LinkedIn / personal site) → no text available, caller should
//      mark the row as Pending Resume.
//
//   2. resume_url is a path inside our Supabase Storage 'resumes'
//      bucket → download the file and extract text by type:
//        - .pdf  → pdf-parse (vision fallback for scanned PDFs)
//        - .docx → mammoth (raw text)
//        - .doc  → unsupported (ask for PDF/DOCX)
//
//   3. resume_url ends in .txt → download + return as-is.
//
// Scanned PDFs (no text layer) get a second chance: the raw PDF is
// sent to gpt-4o as a file input and transcribed verbatim. Costs one
// extra AI call but only fires when pdf-parse comes back empty.
// =====================================================================

const STORAGE_BUCKET = "resumes";

export type ExtractedResume =
  | { ok: true; text: string; bytes: number }
  | { ok: false; reason: "no-url" | "external" | "fetch" | "parse"; error: string };

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function extractResumeText(
  resumeUrl: string | null | undefined,
): Promise<ExtractedResume> {
  if (!resumeUrl) {
    return { ok: false, reason: "no-url", error: "Candidate has no resume on file." };
  }

  // LinkedIn URLs and any other off-platform link - we can't scrape.
  if (isExternalUrl(resumeUrl)) {
    return {
      ok: false,
      reason: "external",
      error:
        "Resume is an external link (e.g. LinkedIn). Upload a PDF for AI review.",
    };
  }

  let bytes: ArrayBuffer;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(resumeUrl);
    if (error || !data) {
      return {
        ok: false,
        reason: "fetch",
        error: error?.message ?? "Could not download resume from storage.",
      };
    }
    bytes = await data.arrayBuffer();
  } catch (e) {
    return {
      ok: false,
      reason: "fetch",
      error: e instanceof Error ? e.message : "Could not download resume.",
    };
  }

  const lower = resumeUrl.toLowerCase();
  if (lower.endsWith(".txt")) {
    const text = new TextDecoder("utf-8").decode(bytes);
    return { ok: true, text, bytes: bytes.byteLength };
  }

  // Word documents. The uploader accepts .doc/.docx, so the AI review
  // must read them too (otherwise the candidate shows "Pending Resume"
  // despite having a resume on file). mammoth extracts the raw text
  // from .docx; the legacy binary .doc format isn't supported.
  if (lower.endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      const text = (value ?? "").trim();
      if (text.length < 40) {
        return {
          ok: false,
          reason: "parse",
          error:
            "The Word document appears to contain no readable text. Re-save it as a PDF and re-upload.",
        };
      }
      return { ok: true, text, bytes: bytes.byteLength };
    } catch (e) {
      return {
        ok: false,
        reason: "parse",
        error: e instanceof Error ? e.message : "Could not read the Word document.",
      };
    }
  }
  if (lower.endsWith(".doc")) {
    return {
      ok: false,
      reason: "parse",
      error:
        "Legacy .doc files can't be read for AI review. Re-save as PDF or .docx and re-upload.",
    };
  }

  // pdfjs (bundled inside pdf-parse) expects browser canvas globals that
  // Node doesn't provide. @napi-rs/canvas supplies native implementations;
  // without them, loading pdf-parse in the Next server runtime can die with
  // "ReferenceError: DOMMatrix is not defined" before parsing even starts.
  if (typeof globalThis.DOMMatrix === "undefined") {
    try {
      const canvas = await import("@napi-rs/canvas");
      const g = globalThis as Record<string, unknown>;
      g.DOMMatrix = canvas.DOMMatrix;
      g.ImageData ??= canvas.ImageData;
      g.Path2D ??= canvas.Path2D;
    } catch {
      // Canvas unavailable on this platform. pdf-parse may still load; if
      // it doesn't, the vision fallback below takes over.
    }
  }

  // pdf-parse v2 uses a class API. Dynamic import keeps it out of any
  // client bundle and means the (heavy) pdfjs runtime only loads when
  // we actually need to parse a PDF.
  let PDFParse: typeof import("pdf-parse").PDFParse | null = null;
  try {
    ({ PDFParse } = await import("pdf-parse"));
  } catch {
    PDFParse = null;
  }

  // Parser module failed to load (runtime/bundler issue, not a bad PDF).
  // The resume itself is fine, so transcribe it with the vision model
  // rather than failing the review.
  if (!PDFParse) {
    const vision = await transcribePdfWithVision(bytes);
    if (vision.ok) {
      return { ok: true, text: vision.text, bytes: bytes.byteLength };
    }
    return {
      ok: false,
      reason: "parse",
      error: `The PDF parser failed to load and the AI transcription fallback also failed: ${vision.error}`,
    };
  }

  try {
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    const result = await parser.getText();
    await parser.destroy();
    const text = (result.text ?? "").trim();
    if (text.length < 40) {
      // No text layer - likely a scanned/photographed resume. Hand the
      // raw PDF to the vision model for a verbatim transcription.
      const vision = await transcribePdfWithVision(bytes);
      if (vision.ok) {
        return { ok: true, text: vision.text, bytes: bytes.byteLength };
      }
      return {
        ok: false,
        reason: "parse",
        error: `Resume appears to be a scanned image (no text layer) and the AI transcription fallback failed: ${vision.error}`,
      };
    }
    return { ok: true, text, bytes: bytes.byteLength };
  } catch (e) {
    // Parser crashed mid-parse - same vision fallback as scanned PDFs.
    const vision = await transcribePdfWithVision(bytes);
    if (vision.ok) {
      return { ok: true, text: vision.text, bytes: bytes.byteLength };
    }
    return {
      ok: false,
      reason: "parse",
      error: e instanceof Error ? e.message : "Could not parse PDF.",
    };
  }
}

// gpt-4o accepts PDFs as file inputs (each page is rasterized +
// OCR-ish read by the model). We ask for a plain verbatim
// transcription so the downstream review prompt sees the same shape
// of input it would get from pdf-parse.
async function transcribePdfWithVision(
  bytes: ArrayBuffer,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      ok: false,
      error: "OPENAI_API_KEY is not set, so the vision fallback is unavailable.",
    };
  }
  try {
    const [{ generateText }, { createOpenAI }] = await Promise.all([
      import("ai"),
      import("@ai-sdk/openai"),
    ]);
    const client = createOpenAI({ apiKey: key });
    const { text } = await generateText({
      model: client("gpt-4o"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe ALL text from this resume PDF verbatim. Preserve section headings and bullet structure as plain text lines. Output only the transcription - no commentary, no markdown fences.",
            },
            {
              type: "file",
              data: new Uint8Array(bytes),
              mediaType: "application/pdf",
              filename: "resume.pdf",
            },
          ],
        },
      ],
      temperature: 0,
    });
    const t = text.trim();
    if (t.length < 40) {
      return {
        ok: false,
        error: "The vision model could not read usable text from the PDF.",
      };
    }
    return { ok: true, text: t };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Vision transcription failed.",
    };
  }
}
