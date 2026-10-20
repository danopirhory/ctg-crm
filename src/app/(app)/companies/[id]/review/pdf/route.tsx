import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import {
  getCompanyReviewDocument,
  getCurrentEmployee,
} from "@/lib/db/queries";
import {
  CandidateReviewPdf,
  mergeBullets,
  type PdfCandidateRow,
  type PdfRanking,
} from "@/lib/pdf/candidate-review-pdf";

// Stream the company's live review document as a PDF download. Same
// data path the on-screen page uses, so what you see is what the
// client gets.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data: doc, error } = await getCompanyReviewDocument(id);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const employee = await getCurrentEmployee();
  const preparedByName =
    "error" in employee
      ? null
      : `${employee.first_name} ${employee.last_name}`.trim() || null;

  const jobTitleById = new Map(doc.jobs.map((j) => [j.id, j.title] as const));
  const candidateNameById = new Map(
    doc.candidates.map(
      (c) => [c.id, `${c.first_name} ${c.last_name}`.trim()] as const,
    ),
  );

  const rows: PdfCandidateRow[] = doc.candidates
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

  const rankings: PdfRanking[] = doc.jobs.map((j) => ({
    jobId: j.id,
    jobTitle: j.title,
    orderedCandidateNames: (doc.rankings[j.id] ?? [])
      .map((cid) => candidateNameById.get(cid))
      .filter((n): n is string => Boolean(n)),
  }));

  const generatedAt = doc.narrative.generated_at
    ? new Date(doc.narrative.generated_at)
    : new Date();

  const buffer = await renderToBuffer(
    <CandidateReviewPdf
      input={{
        companyName: doc.company.company_name,
        preparedByName,
        generatedAt,
        narrative: {
          keyTakeaways: doc.narrative.key_takeaways,
          nextSteps: doc.narrative.next_steps,
          notes: doc.narrative.notes,
        },
        rows,
        rankings,
      }}
    />,
  );

  const filename = filenameFor(doc.company.company_name, generatedAt);

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
