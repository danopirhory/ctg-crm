// Shared resume constants (used by both client validation and server helpers).

export const RESUME_BUCKET = "resumes";

export const RESUME_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const RESUME_ALLOWED_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const RESUME_ALLOWED_EXTENSIONS = ["pdf", "doc", "docx"] as const;

export function validateResumeFile(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > RESUME_MAX_BYTES) {
    return {
      ok: false,
      error: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max is ${RESUME_MAX_BYTES / 1024 / 1024} MB.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: "File is empty." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  const mimeOk = (RESUME_ALLOWED_MIME as readonly string[]).includes(file.type);
  const extOk = ext != null && (RESUME_ALLOWED_EXTENSIONS as readonly string[]).includes(ext);

  // Browsers sometimes report empty/incorrect MIME for .doc / .docx, so we
  // accept on EITHER the MIME or the extension match. Storage bucket config
  // re-validates server-side anyway.
  if (!mimeOk && !extOk) {
    return { ok: false, error: "Only PDF, DOC, or DOCX files are allowed." };
  }

  return { ok: true };
}

export function resumeExtensionFor(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext && (RESUME_ALLOWED_EXTENSIONS as readonly string[]).includes(ext) ? ext : "pdf";
}
