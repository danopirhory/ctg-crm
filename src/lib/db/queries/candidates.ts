import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CandidateRow, CandidateStatus, TaskStatus } from "../types";

import { fail, type Result } from "./shared";

// =====================================================================
// Candidates
// =====================================================================
export type CandidateListItem = Pick<
  CandidateRow,
  | "id"
  | "first_name"
  | "last_name"
  | "email"
  | "status"
  | "target_location"
  | "military_branch"
  | "clearance"
  | "target_industry"
  | "created_at"
>;

export type CandidateFilters = {
  q?: string;
  status?: CandidateStatus | "all";
  branch?: string | "all";
  clearance?: string | "all";
  industry?: string;
};

export async function listCandidates(
  filters: CandidateFilters = {},
): Promise<Result<CandidateListItem[]>> {
  const supabase = await createClient();

  let query = supabase
    .from("candidates")
    .select(
      "id, first_name, last_name, email, status, target_location, military_branch, clearance, target_industry, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const q = filters.q?.trim();
  if (q) {
    // Escape PostgREST special chars in the user-supplied search term.
    const safe = q.replace(/[,()*]/g, " ");
    const pattern = `%${safe}%`;
    query = query.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`,
    );
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.branch && filters.branch !== "all") {
    query = query.eq("military_branch", filters.branch);
  }
  if (filters.clearance && filters.clearance !== "all") {
    query = query.eq("clearance", filters.clearance);
  }
  if (filters.industry?.trim()) {
    query = query.ilike("target_industry", `%${filters.industry.trim()}%`);
  }

  const { data, error } = await query;
  if (error) return fail([], error.message);
  return { data: data ?? [], error: null };
}

export async function getCandidate(
  id: string,
): Promise<Result<CandidateRow | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(null, error.message);
  return { data, error: null };
}

// =====================================================================
// Candidate notes (newest first, with author info)
// =====================================================================
export type CandidateNote = {
  id: string;
  note: string;
  created_at: string;
  author: { id: string; first_name: string; last_name: string } | null;
};

// Notes for a candidate ALSO include notes written against the prospect
// that was converted into this candidate - the prospect and the
// candidate share one notes timeline.
export async function listCandidateNotes(
  candidateId: string,
): Promise<Result<CandidateNote[]>> {
  const supabase = await createClient();

  // Resolve the linked prospect (if any) so we can OR the filter.
  const { data: linkedProspect } = await supabase
    .from("prospects")
    .select("id")
    .eq("converted_to_candidate_id", candidateId)
    .maybeSingle();

  const filter = linkedProspect
    ? `candidate_id.eq.${candidateId},prospect_id.eq.${linkedProspect.id}`
    : `candidate_id.eq.${candidateId}`;

  const { data, error } = await supabase
    .from("candidate_notes")
    .select("id, note, created_at, author:employees(id, first_name, last_name)")
    .or(filter)
    .order("created_at", { ascending: false });
  if (error) return fail([], error.message);

  const normalized: CandidateNote[] = (data ?? []).map((r) => ({
    id: r.id,
    note: r.note,
    created_at: r.created_at,
    author: Array.isArray(r.author) ? (r.author[0] ?? null) : r.author,
  }));
  return { data: normalized, error: null };
}

// Notes for a prospect - fetched from the same candidate_notes table
// (the table doubles as the unified notes timeline). If the prospect
// has been converted, includes notes written on the candidate side too.
export async function listProspectNotes(
  prospectId: string,
  convertedCandidateId: string | null,
): Promise<Result<CandidateNote[]>> {
  const supabase = await createClient();

  const filter = convertedCandidateId
    ? `prospect_id.eq.${prospectId},candidate_id.eq.${convertedCandidateId}`
    : `prospect_id.eq.${prospectId}`;

  const { data, error } = await supabase
    .from("candidate_notes")
    .select("id, note, created_at, author:employees(id, first_name, last_name)")
    .or(filter)
    .order("created_at", { ascending: false });
  if (error) return fail([], error.message);

  const normalized: CandidateNote[] = (data ?? []).map((r) => ({
    id: r.id,
    note: r.note,
    created_at: r.created_at,
    author: Array.isArray(r.author) ? (r.author[0] ?? null) : r.author,
  }));
  return { data: normalized, error: null };
}

// =====================================================================
// Candidate tasks (with assigned employee info)
// =====================================================================
export type CandidateTask = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  assigned: { id: string; first_name: string; last_name: string } | null;
};

export async function listCandidateTasks(
  candidateId: string,
): Promise<Result<CandidateTask[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, title, description, due_date, status, created_at, assigned:employees(id, first_name, last_name)",
    )
    .eq("related_candidate_id", candidateId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return fail([], error.message);

  const normalized: CandidateTask[] = (data ?? []).map((r) => ({
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

