import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  JobStatus,
  ReviewSnapshotPayload,
  RoleRubricEntry,
} from "../types";

import { fail, type Result } from "./shared";

// =====================================================================
// Candidate Review document - live, per-company.
// Aggregates everyone matched (via candidate_job_matches) to any of
// the company's Open or Paused jobs, joining the per-(candidate, job)
// review rows. Missing review rows render as Pending Resume in the UI.
// =====================================================================

export type CandidateReviewJob = {
  id: string;
  title: string;
  location: string | null;
  description: string | null;
  requirements: string | null;
  status: JobStatus;
  role_rubric: RoleRubricEntry[];
};

export type CandidateReviewCandidate = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  location: string | null;
  rank: string | null;
  military_branch: string | null;
  mos_or_specialty: string | null;
  clearance: string | null;
  years_of_service: number | null;
  target_industry: string | null;
  target_location: string | null;
  tags: string[];
  source: string | null;
  resume_url: string | null;
  reviews: CandidateReviewRow[]; // one per matched job
};

export type CandidateReviewRow = {
  job_id: string;
  state: "pending-resume" | "ready" | "manual";
  background: string[];
  strengths: string[];
  areas_to_validate: string[];
  interview_focus: string[];
  role_fit_score: number | null;
  rubric_scores: { criterion: string; score: number; weight: number }[];
  ai_model: string | null;
  ai_generated_at: string | null;
  edited_at: string | null;
};

export type CompanyReviewDocument = {
  company: {
    id: string;
    company_name: string;
    industry: string | null;
    location: string | null;
    status: string;
  };
  narrative: {
    key_takeaways: string[];
    next_steps: string[];
    notes: string[];
    generated_at: string | null;
    ai_model: string | null;
  };
  jobs: CandidateReviewJob[];
  candidates: CandidateReviewCandidate[];
  rankings: Record<string, string[]>; // job_id → ordered candidate_ids
};

export async function getCompanyReviewDocument(
  companyId: string,
): Promise<Result<CompanyReviewDocument | null>> {
  const supabase = await createClient();

  const [
    { data: company, error: companyErr },
    { data: jobsRaw, error: jobsErr },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, company_name, industry, location, status, review_key_takeaways, review_next_steps, review_notes, review_narrative_generated_at, review_narrative_ai_model",
      )
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select(
        "id, title, location, description, requirements, status, role_rubric",
      )
      .eq("company_id", companyId)
      .in("status", ["Open", "Paused"])
      .order("title", { ascending: true }),
  ]);
  if (companyErr) return fail(null, companyErr.message);
  if (jobsErr) return fail(null, jobsErr.message);
  if (!company) return { data: null, error: null };

  const narrative = {
    key_takeaways: company.review_key_takeaways ?? [],
    next_steps: company.review_next_steps ?? [],
    notes: company.review_notes ?? [],
    generated_at: company.review_narrative_generated_at,
    ai_model: company.review_narrative_ai_model,
  };
  const companySlot = {
    id: company.id,
    company_name: company.company_name,
    industry: company.industry,
    location: company.location,
    status: company.status,
  };

  const jobs: CandidateReviewJob[] = (jobsRaw ?? []).map((j) => ({
    id: j.id,
    title: j.title,
    location: j.location,
    description: j.description,
    requirements: j.requirements,
    status: j.status,
    role_rubric: Array.isArray(j.role_rubric)
      ? (j.role_rubric as RoleRubricEntry[])
      : [],
  }));

  if (jobs.length === 0) {
    return {
      data: {
        company: companySlot,
        narrative,
        jobs: [],
        candidates: [],
        rankings: {},
      },
      error: null,
    };
  }

  const jobIds = jobs.map((j) => j.id);

  const [{ data: matches }, { data: existingReviews }] = await Promise.all([
    supabase
      .from("candidate_job_matches")
      .select(
        "candidate_id, job_id, candidate:candidates(id, first_name, last_name, email, target_location, target_industry, rank, military_branch, mos_or_specialty, clearance, years_of_service, tags, source, resume_url, status)",
      )
      .in("job_id", jobIds),
    supabase
      .from("candidate_job_review")
      .select("*")
      .in("job_id", jobIds),
  ]);

  // Group reviews for fast lookup keyed candidate→job.
  const reviewMap = new Map<string, CandidateReviewRow>();
  for (const r of existingReviews ?? []) {
    const rubricScores =
      Array.isArray(r.rubric_scores) ? r.rubric_scores : [];
    reviewMap.set(`${r.candidate_id}:${r.job_id}`, {
      job_id: r.job_id,
      state: r.state,
      background: r.background ?? [],
      strengths: r.strengths ?? [],
      areas_to_validate: r.areas_to_validate ?? [],
      interview_focus: r.interview_focus ?? [],
      role_fit_score: r.role_fit_score != null ? Number(r.role_fit_score) : null,
      rubric_scores: rubricScores as CandidateReviewRow["rubric_scores"],
      ai_model: r.ai_model,
      ai_generated_at: r.ai_generated_at,
      edited_at: r.edited_at,
    });
  }

  // Build candidate index, attaching matched jobs and any review rows.
  const candidatesById = new Map<string, CandidateReviewCandidate>();
  for (const m of matches ?? []) {
    const c = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
    if (!c) continue;
    // Skip Archived candidates - they're not in active recruiting.
    if (c.status === "Archived") continue;
    let entry = candidatesById.get(c.id);
    if (!entry) {
      entry = {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        location: c.target_location,
        rank: c.rank,
        military_branch: c.military_branch,
        mos_or_specialty: c.mos_or_specialty,
        clearance: c.clearance,
        years_of_service:
          c.years_of_service != null ? Number(c.years_of_service) : null,
        target_industry: c.target_industry,
        target_location: c.target_location,
        tags: c.tags ?? [],
        source: c.source,
        resume_url: c.resume_url,
        reviews: [],
      };
      candidatesById.set(c.id, entry);
    }
    const existing = reviewMap.get(`${c.id}:${m.job_id}`);
    entry.reviews.push(
      existing ?? {
        job_id: m.job_id,
        state: "pending-resume",
        background: [],
        strengths: [],
        areas_to_validate: [],
        interview_focus: [],
        role_fit_score: null,
        rubric_scores: [],
        ai_model: null,
        ai_generated_at: null,
        edited_at: null,
      },
    );
  }

  const candidates = Array.from(candidatesById.values()).sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(
      `${b.last_name} ${b.first_name}`,
    ),
  );

  // Per-job ranking - candidates ordered by role_fit_score descending;
  // candidates with no score sink to the bottom in alphabetic order.
  const rankings: Record<string, string[]> = {};
  for (const job of jobs) {
    rankings[job.id] = candidates
      .map((c) => {
        const review = c.reviews.find((r) => r.job_id === job.id);
        return {
          id: c.id,
          name: `${c.last_name} ${c.first_name}`,
          score: review?.role_fit_score ?? -1,
        };
      })
      .sort((a, b) =>
        a.score === b.score ? a.name.localeCompare(b.name) : b.score - a.score,
      )
      .map((r) => r.id);
  }

  return {
    data: {
      company: companySlot,
      narrative,
      jobs,
      candidates,
      rankings,
    },
    error: null,
  };
}

// Lightweight listing for the /reviews snapshots library.
export type ReviewSnapshotListItem = {
  id: string;
  company_id: string;
  company_name: string;
  label: string | null;
  ai_model: string | null;
  taken_by_name: string | null;
  candidate_count: number;
  job_count: number;
  created_at: string;
};

export async function listReviewSnapshots(filters: {
  q?: string;
  companyId?: string;
} = {}): Promise<Result<ReviewSnapshotListItem[]>> {
  const supabase = await createClient();
  let query = supabase
    .from("candidate_review_snapshot")
    .select(
      "id, company_id, label, ai_model, payload, created_at, company:companies(company_name), taken:employees(first_name, last_name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.companyId) {
    query = query.eq("company_id", filters.companyId);
  }

  const { data, error } = await query;
  if (error) return fail([], error.message);

  const rows = (data ?? []).map((r) => {
    const company = Array.isArray(r.company) ? r.company[0] : r.company;
    const taken = Array.isArray(r.taken) ? r.taken[0] : r.taken;
    const payload = r.payload as ReviewSnapshotPayload;
    return {
      id: r.id,
      company_id: r.company_id,
      company_name: company?.company_name ?? "-",
      label: r.label,
      ai_model: r.ai_model,
      taken_by_name: taken
        ? `${taken.first_name} ${taken.last_name}`
        : null,
      candidate_count: payload?.candidates?.length ?? 0,
      job_count: payload?.jobs?.length ?? 0,
      created_at: r.created_at,
    };
  });

  const q = filters.q?.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.company_name.toLowerCase().includes(q) ||
          (r.label ?? "").toLowerCase().includes(q),
      )
    : rows;

  return { data: filtered, error: null };
}

export async function getReviewSnapshot(
  id: string,
): Promise<
  Result<{
    id: string;
    label: string | null;
    ai_model: string | null;
    payload: ReviewSnapshotPayload;
    taken_by_name: string | null;
    created_at: string;
  } | null>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidate_review_snapshot")
    .select(
      "id, label, ai_model, payload, created_at, taken:employees(first_name, last_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(null, error.message);
  if (!data) return { data: null, error: null };
  const taken = Array.isArray(data.taken) ? data.taken[0] : data.taken;
  return {
    data: {
      id: data.id,
      label: data.label,
      ai_model: data.ai_model,
      payload: data.payload as ReviewSnapshotPayload,
      taken_by_name: taken ? `${taken.first_name} ${taken.last_name}` : null,
      created_at: data.created_at,
    },
    error: null,
  };
}
