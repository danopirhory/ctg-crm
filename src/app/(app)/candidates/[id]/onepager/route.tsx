import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/db/queries";
import {
  CandidateOnePagerPdf,
  type OnePagerInput,
} from "@/lib/pdf/candidate-onepager-pdf";

// Dedupe-union across the candidate's per-job review rows - same merge
// the company review document uses.
function mergeBullets(rows: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    for (const b of row) {
      const k = b.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
  }
  return out;
}

// Single-candidate submittal PDF. Pulls whatever AI review rows exist;
// renders a facts-only profile when none do.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: candidate }, { data: reviews }, employee] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "first_name, last_name, military_branch, rank, mos_or_specialty, clearance, years_of_service, target_location, target_industry",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("candidate_job_review")
      .select(
        "background, strengths, areas_to_validate, interview_focus, role_fit_score, state, job:jobs(title, company:companies(company_name))",
      )
      .eq("candidate_id", id),
    getCurrentEmployee(),
  ]);

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  const usable = (reviews ?? []).filter((r) => r.state !== "pending-resume");

  const roleFits = usable.map((r) => {
    const job = Array.isArray(r.job) ? r.job[0] : r.job;
    const company = job
      ? Array.isArray(job.company)
        ? job.company[0]
        : job.company
      : null;
    return {
      jobTitle: job?.title ?? "Unknown role",
      companyName: company?.company_name ?? "",
      score: r.role_fit_score != null ? Number(r.role_fit_score) : null,
    };
  });

  const facts = [
    candidate.military_branch && {
      label: "Branch",
      value: candidate.military_branch,
    },
    candidate.rank && { label: "Rank", value: candidate.rank },
    candidate.mos_or_specialty && {
      label: "MOS / Specialty",
      value: candidate.mos_or_specialty,
    },
    candidate.clearance && { label: "Clearance", value: candidate.clearance },
    candidate.years_of_service != null && {
      label: "Years of service",
      value: String(candidate.years_of_service),
    },
    candidate.target_location && {
      label: "Location",
      value: candidate.target_location,
    },
    candidate.target_industry && {
      label: "Target industry",
      value: candidate.target_industry,
    },
  ].filter(Boolean) as { label: string; value: string }[];

  const input: OnePagerInput = {
    name:
      `${candidate.first_name} ${candidate.last_name}`.trim() || "Candidate",
    facts,
    background: mergeBullets(usable.map((r) => r.background ?? [])),
    strengths: mergeBullets(usable.map((r) => r.strengths ?? [])),
    areasToValidate: mergeBullets(usable.map((r) => r.areas_to_validate ?? [])),
    interviewFocus: mergeBullets(usable.map((r) => r.interview_focus ?? [])),
    roleFits,
    preparedByName:
      "error" in employee
        ? null
        : `${employee.first_name} ${employee.last_name}`.trim() || null,
    generatedAt: new Date(),
  };

  const buffer = await renderToBuffer(<CandidateOnePagerPdf input={input} />);

  const slug =
    input.name
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "candidate";

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}-profile.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
