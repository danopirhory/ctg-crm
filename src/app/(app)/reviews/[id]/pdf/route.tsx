import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { getReviewSnapshot } from "@/lib/db/queries";
import {
  CandidateReviewPdf,
  mergeBullets,
  type PdfCandidateRow,
  type PdfRanking,
} from "@/lib/pdf/candidate-review-pdf";

// Stream a snapshot as a PDF. Uses the frozen JSONB payload so the
// download matches the on-screen snapshot exactly, regardless of any
// later edits to the live document.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data: snap, error } = await getReviewSnapshot(id);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  if (!snap) {
    return NextResponse.json({ error: "Snapshot not found." }, { status: 404 });
  }

  const { payload } = snap;
  const narrative = payload.narrative ?? {
    key_takeaways: [],
    next_steps: [],
    notes: [],
    generated_at: null,
    ai_model: null,
  };

  const jobTitleById = new Map(
    payload.jobs.map((j) => [j.id, j.title] as const),
  );
  const candidateNameById = new Map(
    payload.candidates.map(
      (c) => [c.id, `${c.first_name} ${c.last_name}`.trim()] as const,
    ),
  );

  const rows: PdfCandidateRow[] = payload.candidates
    .map((c) => {
      const bestScore = c.reviews.reduce<number>(
        (m, r) =>
          r.role_fit_score != null && r.role_fit_score > m
            ? r.role_fit_score
            : m,
        -1,
      );
      return {
        candidateId: c.id,
        name: `${c.first_name} ${c.last_name}`.trim() || "-",
        location: c.location,
        militaryBranch: c.military_branch,
        rank: c.rank,
        background: mergeBullets(c.reviews.map((r) => r.background)),
        strengths: mergeBullets(c.reviews.map((r) => r.strengths)),
        areasToValidate: mergeBullets(
          c.reviews.map((r) => r.areas_to_validate),
        ),
        interviewFocus: mergeBullets(c.reviews.map((r) => r.interview_focus)),
        roleFits: c.reviews.map((r) => ({
          jobId: r.job_id,
          jobTitle: jobTitleById.get(r.job_id) ?? "Unknown role",
          score: r.role_fit_score,
        })),
        bestScore,
      };
    })
    .sort((a, b) =>
      a.bestScore === b.bestScore
        ? a.name.localeCompare(b.name)
        : b.bestScore - a.bestScore,
    );

  const rankings: PdfRanking[] = payload.jobs.map((j) => ({
    jobId: j.id,
    jobTitle: j.title,
    orderedCandidateNames: (payload.rankings[j.id] ?? [])
      .map((cid) => candidateNameById.get(cid))
      .filter((n): n is string => Boolean(n)),
  }));

  const generatedAt = new Date(snap.created_at);

  const buffer = await renderToBuffer(
    <CandidateReviewPdf
      input={{
        companyName: payload.company.company_name,
        preparedByName: snap.taken_by_name,
        generatedAt,
        narrative: {
          keyTakeaways: narrative.key_takeaways,
          nextSteps: narrative.next_steps,
          notes: narrative.notes,
        },
        rows,
        rankings,
      }}
    />,
  );

  const filename = filenameFor(payload.company.company_name, generatedAt);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function filenameFor(companyName: string, when: Date): string {
  const slug =
    companyName
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "company";
  const ymd = when.toISOString().slice(0, 10);
  return `${slug}-candidate-review-${ymd}.pdf`;
}
