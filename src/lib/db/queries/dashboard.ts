import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CandidateStatus, TaskStatus } from "../types";

import { fail, type Result } from "./shared";
import {
  estimateFee,
  PLACEMENT_SELECT,
  normalizePlacementRow,
  type PlacementListItem,
} from "./placements";

// =====================================================================
// Dashboard overview - every metric the dashboard shows in one shot.
// =====================================================================
export type DashboardOverview = {
  totalCandidates: number;
  newCandidatesThisWeek: number;
  contactedCandidates: number;
  qualifiedCandidates: number;
  submittedCandidates: number;
  interviewing: number;
  offers: number;
  openJobs: number;
  activeCompanies: number;
  placements: number;
  estimatedRevenue: number;
};

// Monday-start "this week". Returns an ISO string in UTC.
function startOfWeekISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString();
}

const EMPTY_OVERVIEW: DashboardOverview = {
  totalCandidates: 0,
  newCandidatesThisWeek: 0,
  contactedCandidates: 0,
  qualifiedCandidates: 0,
  submittedCandidates: 0,
  interviewing: 0,
  offers: 0,
  openJobs: 0,
  activeCompanies: 0,
  placements: 0,
  estimatedRevenue: 0,
};

export async function getDashboardOverview(): Promise<
  Result<DashboardOverview>
> {
  const supabase = await createClient();
  const weekStart = startOfWeekISO();

  // 12 queries in parallel. Each is a HEAD count except the last, which
  // pulls fee fields so we can sum estimateFee() locally.
  const [
    total,
    newWeek,
    contacted,
    qualified,
    submitted,
    interviewing,
    offers,
    openJobs,
    activeCompanies,
    placementsCount,
    placementsFee,
  ] = await Promise.all([
    // "Pipeline" = candidates actively being worked. Archived candidates
    // were sent back to Leads (or retired) and Placed ones are closed
    // deals - counting either inflates the dashboard number.
    supabase
      .from("candidates")
      .select("*", { count: "exact", head: true })
      .not("status", "in", "(Archived,Placed)"),
    supabase
      .from("candidates")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStart),
    supabase
      .from("candidates")
      .select("*", { count: "exact", head: true })
      .eq("status", "Contacted"),
    supabase
      .from("candidates")
      .select("*", { count: "exact", head: true })
      .eq("status", "Qualified"),
    supabase
      .from("candidates")
      .select("*", { count: "exact", head: true })
      .eq("status", "Submitted"),
    supabase
      .from("candidates")
      .select("*", { count: "exact", head: true })
      .eq("status", "Interviewing"),
    supabase
      .from("candidates")
      .select("*", { count: "exact", head: true })
      .eq("status", "Offer"),
    supabase
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "Open"),
    supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .neq("status", "Inactive")
      .neq("status", "Do Not Contact"),
    supabase.from("placements").select("*", { count: "exact", head: true }),
    supabase
      .from("placements")
      .select("flat_fee, starting_salary, fee_percentage")
      .limit(2000),
  ]);

  const all = [
    total,
    newWeek,
    contacted,
    qualified,
    submitted,
    interviewing,
    offers,
    openJobs,
    activeCompanies,
    placementsCount,
    placementsFee,
  ];
  const firstError = all.find((r) => r.error)?.error;
  if (firstError) return fail(EMPTY_OVERVIEW, firstError.message);

  const estimatedRevenue = (placementsFee.data ?? []).reduce(
    (sum, p) =>
      sum +
      estimateFee({
        flat_fee: p.flat_fee,
        starting_salary: p.starting_salary,
        fee_percentage: p.fee_percentage,
      }),
    0,
  );

  return {
    data: {
      totalCandidates: total.count ?? 0,
      newCandidatesThisWeek: newWeek.count ?? 0,
      contactedCandidates: contacted.count ?? 0,
      qualifiedCandidates: qualified.count ?? 0,
      submittedCandidates: submitted.count ?? 0,
      interviewing: interviewing.count ?? 0,
      offers: offers.count ?? 0,
      openJobs: openJobs.count ?? 0,
      activeCompanies: activeCompanies.count ?? 0,
      placements: placementsCount.count ?? 0,
      estimatedRevenue,
    },
    error: null,
  };
}

// =====================================================================
// Dashboard activity lists
// =====================================================================

export type RecentCandidate = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: CandidateStatus;
  source: string | null;
  created_at: string;
};

export async function listRecentCandidates(
  limit = 6,
): Promise<Result<RecentCandidate[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, email, status, source, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fail([], error.message);
  return { data: data ?? [], error: null };
}

export type UpcomingTask = {
  id: string;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  assigned: { id: string; first_name: string; last_name: string } | null;
  candidate: { id: string; first_name: string; last_name: string } | null;
  company: { id: string; company_name: string } | null;
};

export async function listUpcomingTasks(
  limit = 6,
): Promise<Result<UpcomingTask[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `id, title, due_date, status,
       assigned:employees ( id, first_name, last_name ),
       candidate:candidates ( id, first_name, last_name ),
       company:companies ( id, company_name )`,
    )
    .neq("status", "Complete")
    .neq("status", "Archived")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fail([], error.message);

  const normalized: UpcomingTask[] = (data ?? []).map((r) => {
    const assigned = Array.isArray(r.assigned)
      ? (r.assigned[0] ?? null)
      : r.assigned;
    const candidate = Array.isArray(r.candidate)
      ? (r.candidate[0] ?? null)
      : r.candidate;
    const company = Array.isArray(r.company)
      ? (r.company[0] ?? null)
      : r.company;
    return {
      id: r.id,
      title: r.title,
      due_date: r.due_date,
      status: r.status,
      assigned,
      candidate,
      company,
    };
  });
  return { data: normalized, error: null };
}

export async function listRecentPlacements(
  limit = 5,
): Promise<Result<PlacementListItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("placements")
    .select(PLACEMENT_SELECT)
    .order("placement_date", { ascending: false })
    .limit(limit);
  if (error) return fail([], error.message);
  return { data: (data ?? []).map(normalizePlacementRow), error: null };
}

export type OpenJobToStaff = {
  id: string;
  title: string;
  location: string | null;
  created_at: string;
  company: { id: string; company_name: string } | null;
  match_count: number;
};

export async function listOpenJobsToStaff(
  limit = 6,
): Promise<Result<OpenJobToStaff[]>> {
  const supabase = await createClient();
  // Fetch open jobs with the count of matched candidates as an aggregate
  // embed. Then sort by fewest matches first (then oldest first) so the
  // jobs most in need of sourcing rise to the top.
  const { data, error } = await supabase
    .from("jobs")
    .select(
      `id, title, location, created_at,
       company:companies ( id, company_name ),
       matches:candidate_job_matches ( count )`,
    )
    .eq("status", "Open")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return fail([], error.message);

  type CountEmbed = { count?: number };
  const normalized: OpenJobToStaff[] = (data ?? []).map((r) => {
    const company = Array.isArray(r.company)
      ? (r.company[0] ?? null)
      : r.company;
    const matchEntries = Array.isArray(r.matches)
      ? (r.matches as CountEmbed[])
      : r.matches
        ? [r.matches as CountEmbed]
        : [];
    const match_count = matchEntries[0]?.count ?? 0;
    return {
      id: r.id,
      title: r.title,
      location: r.location,
      created_at: r.created_at,
      company: company
        ? { id: company.id, company_name: company.company_name }
        : null,
      match_count,
    };
  });

  normalized.sort((a, b) => {
    if (a.match_count !== b.match_count) return a.match_count - b.match_count;
    return a.created_at.localeCompare(b.created_at);
  });

  return { data: normalized.slice(0, limit), error: null };
}

