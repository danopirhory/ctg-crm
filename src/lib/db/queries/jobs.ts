import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { JobRow, JobStatus } from "../types";

import { fail, type Result } from "./shared";

// =====================================================================
// Jobs (joined with the parent company name)
// =====================================================================
export type JobListItem = Pick<
  JobRow,
  | "id"
  | "title"
  | "location"
  | "salary_min"
  | "salary_max"
  | "status"
  | "created_at"
> & {
  company: { id: string; company_name: string } | null;
};

export type JobFilters = {
  q?: string;
  status?: JobStatus | "all";
  companyId?: string | "all";
};

export async function listJobs(
  filters: JobFilters = {},
): Promise<Result<JobListItem[]>> {
  const supabase = await createClient();

  const q = filters.q?.trim();

  // For free-text search across {title, location, company_name}: do a quick
  // first round to find company IDs matching the term, then OR their UUIDs
  // into the main jobs query. This keeps it server-side and bounded.
  let companyIdsByName: string[] = [];
  if (q) {
    const { data: matched, error: matchedErr } = await supabase
      .from("companies")
      .select("id")
      .ilike("company_name", `%${q.replace(/[,()*]/g, " ")}%`)
      .limit(100);
    if (matchedErr) return fail([], matchedErr.message);
    companyIdsByName = (matched ?? []).map((r) => r.id);
  }

  let query = supabase
    .from("jobs")
    .select(
      `id, title, location, salary_min, salary_max, status, created_at,
       company:companies ( id, company_name )`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (q) {
    const safe = q.replace(/[,()*]/g, " ");
    const pattern = `%${safe}%`;
    const orParts = [
      `title.ilike.${pattern}`,
      `location.ilike.${pattern}`,
    ];
    if (companyIdsByName.length) {
      orParts.push(`company_id.in.(${companyIdsByName.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.companyId && filters.companyId !== "all") {
    query = query.eq("company_id", filters.companyId);
  }

  const { data, error } = await query;
  if (error) return fail([], error.message);

  const normalized: JobListItem[] = (data ?? []).map((row) => {
    const company = Array.isArray(row.company) ? row.company[0] : row.company;
    return {
      id: row.id,
      title: row.title,
      location: row.location,
      salary_min: row.salary_min,
      salary_max: row.salary_max,
      status: row.status,
      created_at: row.created_at,
      company: company
        ? { id: company.id, company_name: company.company_name }
        : null,
    };
  });

  return { data: normalized, error: null };
}

export type JobWithCompany = JobRow & {
  company: { id: string; company_name: string } | null;
};

export async function getJob(id: string): Promise<Result<JobWithCompany | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(`*, company:companies ( id, company_name )`)
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(null, error.message);
  if (!data) return { data: null, error: null };

  const company = Array.isArray(data.company)
    ? (data.company[0] ?? null)
    : data.company;

  return {
    data: { ...data, company: company ?? null },
    error: null,
  };
}

// =====================================================================
// Company options for pickers + filters (id + name only)
// =====================================================================
export type CompanyOption = { id: string; company_name: string };

export async function listCompanyOptions(): Promise<Result<CompanyOption[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, company_name")
    .order("company_name", { ascending: true })
    .limit(500);
  if (error) return fail([], error.message);
  return { data: data ?? [], error: null };
}

