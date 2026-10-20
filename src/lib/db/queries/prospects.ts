import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { LeadListAssignee } from "../constants";
import type { Database } from "../types";

import { fail, type Result } from "./shared";

// =====================================================================
// Prospects
// =====================================================================

type ProspectListRow =
  Database["public"]["Tables"]["prospect_lists"]["Row"];
type ProspectRow = Database["public"]["Tables"]["prospects"]["Row"];

export type ProspectListListItem = Pick<
  ProspectListRow,
  | "id"
  | "name"
  | "description"
  | "source"
  | "kind"
  | "assigned_to"
  | "parent_list_id"
  | "created_at"
  | "updated_at"
> & {
  prospect_count: number;
};

export type LeadListFilters = {
  q?: string;
  kind?: "all" | "Candidate" | "Company";
  // An assignee name, "Unassigned", or "all".
  assigned?: string;
};

export async function listProspectLists(
  filters: LeadListFilters = {},
): Promise<Result<ProspectListListItem[]>> {
  const supabase = await createClient();

  // Manual order first (drag-and-drop on /prospects); lists that have
  // never been positioned (null sort_order) follow, newest first.
  let query = supabase
    .from("prospect_lists")
    .select(
      "id, name, description, source, kind, assigned_to, parent_list_id, created_at, updated_at",
    )
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const q = filters.q?.trim();
  if (q) {
    // Escape PostgREST special chars in the user-supplied search term.
    const safe = q.replace(/[,()*]/g, " ");
    const pattern = `%${safe}%`;
    query = query.or(
      `name.ilike.${pattern},description.ilike.${pattern},source.ilike.${pattern}`,
    );
  }
  if (filters.kind && filters.kind !== "all") {
    query = query.eq("kind", filters.kind);
  }
  if (filters.assigned && filters.assigned !== "all") {
    query =
      filters.assigned === "Unassigned"
        ? query.is("assigned_to", null)
        : query.eq("assigned_to", filters.assigned as LeadListAssignee);
  }

  const { data: lists, error: listsError } = await query;
  if (listsError) return fail([], listsError.message);
  if (!lists?.length) return { data: [], error: null };

  // Count every row in each list, including members that have been
  // promoted out - the lists are the source of truth for who came in
  // through which import / source.
  // Count each list with exact HEAD counts. A single `.in("list_id", ids)`
  // select is capped at Supabase's default 1000-row limit, so a large list
  // (e.g. a 10k-row import) exhausts that cap and starves every other list's
  // count to 0. Per-list head counts are exact and cheap.
  const countResults = await Promise.all(
    lists.map(async (l) => {
      const totalRes = await supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .eq("list_id", l.id);
      return { id: l.id, total: totalRes.count ?? 0 };
    }),
  );

  const counts = new Map<string, number>(
    countResults.map((c) => [c.id, c.total]),
  );

  return {
    data: lists.map((l) => ({
      ...l,
      prospect_count: counts.get(l.id) ?? 0,
    })),
    error: null,
  };
}

export async function getProspectList(
  id: string,
): Promise<Result<ProspectListRow | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospect_lists")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(null, error.message);
  return { data, error: null };
}

export async function getProspect(
  id: string,
): Promise<Result<ProspectRow | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(null, error.message);
  return { data, error: null };
}

export type ProspectListItem = Pick<
  ProspectRow,
  | "id"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "title"
  | "company_name"
  | "industry"
  | "hiring_needs"
  | "location"
  | "notes"
  | "marketing_consent"
  | "converted_to_candidate_id"
  | "converted_to_company_id"
  | "military_branch"
  | "rank"
  | "mos_or_specialty"
  | "clearance"
  | "years_of_service"
  | "tags"
  | "source"
  | "resume_url"
  | "pipeline_stage"
  | "created_at"
>;

// Columns the in-list table allows sorting on. Anything outside this
// allow-list is ignored, so the URL can't smuggle an arbitrary
// expression into .order().
export const LEAD_ROW_SORT_COLUMNS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "title",
  "company_name",
  "rank",
  "location",
] as const;
export type LeadRowSortColumn = (typeof LEAD_ROW_SORT_COLUMNS)[number];

export type LeadRowFilters = {
  q?: string;
  location?: string;
  sort?: LeadRowSortColumn;
  dir?: "asc" | "desc";
  page?: number; // 1-based
  pageSize?: number;
};

export const DEFAULT_LEAD_PAGE_SIZE = 100;

export type ProspectListPage = {
  data: ProspectListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

// Build the search-aware base filter so the count query and the data
// query stay in sync. Returns an applier that mutates a supabase query.
function applyLeadRowFilters<Q extends { ilike: (...a: never[]) => Q; or: (...a: never[]) => Q }>(
  query: Q,
  filters: LeadRowFilters,
): Q {
  const q = filters.q?.trim();
  if (q) {
    const safe = q.replace(/[,()*]/g, " ");
    const pattern = `%${safe}%`;
    query = (query.or as (s: string) => Q)(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},company_name.ilike.${pattern},title.ilike.${pattern}`,
    );
  }
  const location = filters.location?.trim();
  if (location) {
    query = (query.ilike as (col: string, val: string) => Q)(
      "location",
      `%${location}%`,
    );
  }
  return query;
}

export async function listProspectsForList(
  listId: string,
  filters: LeadRowFilters = {},
): Promise<Result<ProspectListPage>> {
  const supabase = await createClient();
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? DEFAULT_LEAD_PAGE_SIZE, 500));
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Show every row in the list. Leads that have been promoted to the
  // Candidate / Employer pipeline keep their membership in the source
  // list - the Action column distinguishes "Move to Pipeline" rows
  // from already-converted "View candidate" rows.
  let data = supabase
    .from("prospects")
    .select(
      "id, first_name, last_name, email, phone, title, company_name, industry, hiring_needs, location, notes, marketing_consent, converted_to_candidate_id, converted_to_company_id, military_branch, rank, mos_or_specialty, clearance, years_of_service, tags, source, resume_url, pipeline_stage, created_at",
    )
    .eq("list_id", listId);

  if (filters.sort) {
    data = data.order(filters.sort, {
      ascending: filters.dir !== "desc",
      nullsFirst: false,
    });
  } else {
    data = data
      .order("company_name", { ascending: true, nullsFirst: false })
      .order("last_name", { ascending: true, nullsFirst: false });
  }

  data = applyLeadRowFilters(data, filters).range(from, to);

  // Separate count query - head: true is a cheap HEAD request that
  // returns just the total, not the rows.
  const countQuery = applyLeadRowFilters(
    supabase
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .eq("list_id", listId),
    filters,
  );

  const [{ data: rows, error: dataErr }, { count, error: countErr }] =
    await Promise.all([data, countQuery]);

  if (dataErr)
    return fail(
      { data: [], total: 0, page, pageSize, pageCount: 0 },
      dataErr.message,
    );
  if (countErr)
    return fail(
      { data: rows ?? [], total: 0, page, pageSize, pageCount: 0 },
      countErr.message,
    );

  const total = count ?? 0;
  return {
    data: {
      data: rows ?? [],
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
    error: null,
  };
}

// Fetch every prospect in a list (used by the bulk-sync server action).
export async function listAllProspectsInList(
  listId: string,
): Promise<Result<ProspectRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("list_id", listId)
    .limit(5000);
  if (error) return fail([], error.message);
  return { data: data ?? [], error: null };
}

// Origin breadcrumb: given a downstream id (candidate or company), find
// the originating prospect + its list. Used by candidate/company/
// placement detail pages to show "Originally from prospect list X".
export type ProspectOrigin = {
  prospect_id: string;
  list_id: string;
  list_name: string;
  list_kind: "Candidate" | "Company";
  source: string | null;
};

async function fetchProspectOrigin(
  column: "converted_to_candidate_id" | "converted_to_company_id",
  downstreamId: string,
): Promise<ProspectOrigin | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("id, list:prospect_lists(id, name, kind, source)")
    .eq(column, downstreamId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const list = Array.isArray(data.list) ? data.list[0] : data.list;
  if (!list) return null;
  return {
    prospect_id: data.id,
    list_id: list.id,
    list_name: list.name,
    list_kind: list.kind,
    source: list.source ?? null,
  };
}

export function getProspectOriginByCandidate(
  candidateId: string,
): Promise<ProspectOrigin | null> {
  return fetchProspectOrigin("converted_to_candidate_id", candidateId);
}

export function getProspectOriginByCompany(
  companyId: string,
): Promise<ProspectOrigin | null> {
  return fetchProspectOrigin("converted_to_company_id", companyId);
}

