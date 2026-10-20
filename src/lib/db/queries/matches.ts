import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CandidateStatus, JobStatus, MatchStatus } from "../types";

import { fail, type Result } from "./shared";

// =====================================================================
// Candidate ↔ Job matches
// =====================================================================
export type MatchBase = {
  id: string;
  match_status: MatchStatus;
  submitted_at: string | null;
  interview_date: string | null;
  offer_date: string | null;
  placement_date: string | null;
  notes: string | null;
  created_at: string;
};

export type CandidateMatch = MatchBase & {
  job:
    | {
        id: string;
        title: string;
        status: JobStatus;
        company: { id: string; company_name: string } | null;
      }
    | null;
};

export async function listMatchesForCandidate(
  candidateId: string,
): Promise<Result<CandidateMatch[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidate_job_matches")
    .select(
      `id, match_status, submitted_at, interview_date, offer_date, placement_date, notes, created_at,
       job:jobs (
         id, title, status,
         company:companies ( id, company_name )
       )`,
    )
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (error) return fail([], error.message);

  const normalized: CandidateMatch[] = (data ?? []).map((r) => {
    const job = Array.isArray(r.job) ? (r.job[0] ?? null) : r.job;
    let jobNormalized: CandidateMatch["job"] = null;
    if (job) {
      const company = Array.isArray(job.company)
        ? (job.company[0] ?? null)
        : job.company;
      jobNormalized = {
        id: job.id,
        title: job.title,
        status: job.status,
        company: company
          ? { id: company.id, company_name: company.company_name }
          : null,
      };
    }
    return {
      id: r.id,
      match_status: r.match_status,
      submitted_at: r.submitted_at,
      interview_date: r.interview_date,
      offer_date: r.offer_date,
      placement_date: r.placement_date,
      notes: r.notes,
      created_at: r.created_at,
      job: jobNormalized,
    };
  });

  return { data: normalized, error: null };
}

export type JobMatch = MatchBase & {
  candidate:
    | {
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        status: CandidateStatus;
      }
    | null;
};

export async function listMatchesForJob(
  jobId: string,
): Promise<Result<JobMatch[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidate_job_matches")
    .select(
      `id, match_status, submitted_at, interview_date, offer_date, placement_date, notes, created_at,
       candidate:candidates ( id, first_name, last_name, email, status )`,
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) return fail([], error.message);

  const normalized: JobMatch[] = (data ?? []).map((r) => {
    const c = Array.isArray(r.candidate)
      ? (r.candidate[0] ?? null)
      : r.candidate;
    return {
      id: r.id,
      match_status: r.match_status,
      submitted_at: r.submitted_at,
      interview_date: r.interview_date,
      offer_date: r.offer_date,
      placement_date: r.placement_date,
      notes: r.notes,
      created_at: r.created_at,
      candidate: c
        ? {
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            email: c.email,
            status: c.status,
          }
        : null,
    };
  });

  return { data: normalized, error: null };
}

// =====================================================================
// Pickers used by the AddMatchDialog
// =====================================================================
export type JobPickerOption = {
  id: string;
  title: string;
  status: JobStatus;
  company_id: string;
  company_name: string | null;
};

export async function listJobOptions(): Promise<Result<JobPickerOption[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, status, company_id, company:companies ( company_name )")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return fail([], error.message);

  const normalized: JobPickerOption[] = (data ?? []).map((r) => {
    const company = Array.isArray(r.company)
      ? (r.company[0] ?? null)
      : r.company;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      company_id: r.company_id,
      company_name: company?.company_name ?? null,
    };
  });
  return { data: normalized, error: null };
}

export type CandidatePickerOption = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: CandidateStatus;
};

export async function listCandidateOptions(): Promise<
  Result<CandidatePickerOption[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, email, status")
    .order("last_name", { ascending: true })
    .limit(500);
  if (error) return fail([], error.message);
  return { data: data ?? [], error: null };
}

