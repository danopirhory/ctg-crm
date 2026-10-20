import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CompanyRow, CompanyStatus, JobRow, TaskStatus } from "../types";

import { fail, type Result } from "./shared";

// =====================================================================
// Companies
// =====================================================================
export type CompanyListItem = Pick<
  CompanyRow,
  | "id"
  | "company_name"
  | "industry"
  | "location"
  | "status"
  | "contact_name"
  | "created_at"
>;

export type CompanyFilters = {
  q?: string;
  status?: CompanyStatus | "all";
  industry?: string;
};

export async function listCompanies(
  filters: CompanyFilters = {},
): Promise<Result<CompanyListItem[]>> {
  const supabase = await createClient();

  let query = supabase
    .from("companies")
    .select(
      "id, company_name, industry, location, status, contact_name, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const q = filters.q?.trim();
  if (q) {
    const safe = q.replace(/[,()*]/g, " ");
    const pattern = `%${safe}%`;
    query = query.or(
      `company_name.ilike.${pattern},contact_name.ilike.${pattern},contact_email.ilike.${pattern},industry.ilike.${pattern}`,
    );
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.industry?.trim()) {
    query = query.ilike("industry", `%${filters.industry.trim()}%`);
  }

  const { data, error } = await query;
  if (error) return fail([], error.message);
  return { data: data ?? [], error: null };
}

export async function getCompany(
  id: string,
): Promise<Result<CompanyRow | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(null, error.message);
  return { data, error: null };
}

// =====================================================================
// Jobs at a specific company
// =====================================================================
export type CompanyJobListItem = Pick<
  JobRow,
  | "id"
  | "title"
  | "location"
  | "salary_min"
  | "salary_max"
  | "status"
  | "created_at"
>;

export async function listCompanyJobs(
  companyId: string,
): Promise<Result<CompanyJobListItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, location, salary_min, salary_max, status, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) return fail([], error.message);
  return { data: data ?? [], error: null };
}

// =====================================================================
// Company notes (newest first, with author info)
// =====================================================================
export type CompanyNote = {
  id: string;
  note: string;
  created_at: string;
  author: { id: string; first_name: string; last_name: string } | null;
};

export async function listCompanyNotes(
  companyId: string,
): Promise<Result<CompanyNote[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_notes")
    .select("id, note, created_at, author:employees(id, first_name, last_name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) return fail([], error.message);

  const normalized: CompanyNote[] = (data ?? []).map((r) => ({
    id: r.id,
    note: r.note,
    created_at: r.created_at,
    author: Array.isArray(r.author) ? (r.author[0] ?? null) : r.author,
  }));
  return { data: normalized, error: null };
}

// =====================================================================
// Company tasks (same shape as candidate tasks)
// =====================================================================
export type CompanyTask = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  assigned: { id: string; first_name: string; last_name: string } | null;
};

export async function listCompanyTasks(
  companyId: string,
): Promise<Result<CompanyTask[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, title, description, due_date, status, created_at, assigned:employees(id, first_name, last_name)",
    )
    .eq("related_company_id", companyId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return fail([], error.message);

  const normalized: CompanyTask[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    due_date: r.due_date,
    status: r.status,
    created_at: r.created_at,
    assigned: Array.isArray(r.assigned) ? (r.assigned[0] ?? null) : r.assigned,
  }));
  return { data: normalized, error: null };
}

