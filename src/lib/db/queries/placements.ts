import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, InvoiceStatus } from "../types";

import { fail, type Result } from "./shared";

type PlacementRow = Database["public"]["Tables"]["placements"]["Row"];

// =====================================================================
// Placements
// =====================================================================
export type PlacementListItem = Pick<
  PlacementRow,
  | "id"
  | "placement_date"
  | "starting_salary"
  | "fee_percentage"
  | "flat_fee"
  | "invoice_status"
  | "guarantee_end_date"
  | "created_at"
> & {
  candidate: { id: string; first_name: string; last_name: string } | null;
  company: { id: string; company_name: string } | null;
  job: { id: string; title: string } | null;
};

export function normalizePlacementRow<
  T extends Record<string, unknown> & {
    candidate?: unknown;
    company?: unknown;
    job?: unknown;
  },
>(r: T): PlacementListItem {
  const candidate = Array.isArray(r.candidate)
    ? (r.candidate[0] ?? null)
    : (r.candidate as PlacementListItem["candidate"] | null) ?? null;
  const company = Array.isArray(r.company)
    ? (r.company[0] ?? null)
    : (r.company as PlacementListItem["company"] | null) ?? null;
  const job = Array.isArray(r.job)
    ? (r.job[0] ?? null)
    : (r.job as PlacementListItem["job"] | null) ?? null;
  return {
    id: r.id as string,
    placement_date: r.placement_date as string,
    starting_salary: r.starting_salary as number | null,
    fee_percentage: r.fee_percentage as number | null,
    flat_fee: r.flat_fee as number | null,
    invoice_status: r.invoice_status as InvoiceStatus,
    guarantee_end_date: r.guarantee_end_date as string | null,
    created_at: r.created_at as string,
    candidate,
    company,
    job,
  };
}

export const PLACEMENT_SELECT =
  `id, placement_date, starting_salary, fee_percentage, flat_fee,
   invoice_status, guarantee_end_date, created_at,
   candidate:candidates ( id, first_name, last_name ),
   company:companies ( id, company_name ),
   job:jobs ( id, title )`;

export async function listPlacements(): Promise<Result<PlacementListItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("placements")
    .select(PLACEMENT_SELECT)
    .order("placement_date", { ascending: false })
    .limit(500);
  if (error) return fail([], error.message);
  return { data: (data ?? []).map(normalizePlacementRow), error: null };
}

export async function listPlacementsForCandidate(
  candidateId: string,
): Promise<Result<PlacementListItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("placements")
    .select(PLACEMENT_SELECT)
    .eq("candidate_id", candidateId)
    .order("placement_date", { ascending: false });
  if (error) return fail([], error.message);
  return { data: (data ?? []).map(normalizePlacementRow), error: null };
}

export async function listPlacementsForCompany(
  companyId: string,
): Promise<Result<PlacementListItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("placements")
    .select(PLACEMENT_SELECT)
    .eq("company_id", companyId)
    .order("placement_date", { ascending: false });
  if (error) return fail([], error.message);
  return { data: (data ?? []).map(normalizePlacementRow), error: null };
}

export async function listPlacementsForJob(
  jobId: string,
): Promise<Result<PlacementListItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("placements")
    .select(PLACEMENT_SELECT)
    .eq("job_id", jobId)
    .order("placement_date", { ascending: false });
  if (error) return fail([], error.message);
  return { data: (data ?? []).map(normalizePlacementRow), error: null };
}

export type PlacementWithRels = PlacementRow & {
  candidate: { id: string; first_name: string; last_name: string } | null;
  company: { id: string; company_name: string } | null;
  job: { id: string; title: string } | null;
};

export async function getPlacement(
  id: string,
): Promise<Result<PlacementWithRels | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("placements")
    .select(
      `*,
       candidate:candidates ( id, first_name, last_name ),
       company:companies ( id, company_name ),
       job:jobs ( id, title )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(null, error.message);
  if (!data) return { data: null, error: null };

  const candidate = Array.isArray(data.candidate)
    ? (data.candidate[0] ?? null)
    : data.candidate;
  const company = Array.isArray(data.company)
    ? (data.company[0] ?? null)
    : data.company;
  const job = Array.isArray(data.job) ? (data.job[0] ?? null) : data.job;

  return {
    data: { ...data, candidate, company, job } as PlacementWithRels,
    error: null,
  };
}

// =====================================================================
// Placement summary (used by dashboard + /placements header)
// =====================================================================
export type PlacementSummary = {
  total: number;
  estimatedRevenue: number;
  unpaidInvoices: number;
  activeGuarantees: number;
};

export async function getPlacementSummary(): Promise<Result<PlacementSummary>> {
  const supabase = await createClient();
  // One round trip to fetch the columns we need; aggregation in JS is fine
  // at this scale (200 cap).
  const { data, error } = await supabase
    .from("placements")
    .select("starting_salary, fee_percentage, flat_fee, invoice_status, guarantee_end_date")
    .limit(2000);
  if (error)
    return fail(
      { total: 0, estimatedRevenue: 0, unpaidInvoices: 0, activeGuarantees: 0 },
      error.message,
    );

  const rows = data ?? [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let estimatedRevenue = 0;
  let unpaidInvoices = 0;
  let activeGuarantees = 0;

  for (const p of rows) {
    estimatedRevenue += estimateFee({
      flat_fee: p.flat_fee,
      starting_salary: p.starting_salary,
      fee_percentage: p.fee_percentage,
    });

    // "Unpaid": billed-but-not-resolved. Paid + Refunded are settled.
    if (p.invoice_status !== "Paid" && p.invoice_status !== "Refunded") {
      unpaidInvoices += 1;
    }

    if (p.guarantee_end_date) {
      const [y, m, d] = p.guarantee_end_date.split("-").map(Number);
      const end = new Date(y, m - 1, d);
      if (end.getTime() >= today.getTime()) activeGuarantees += 1;
    }
  }

  return {
    data: {
      total: rows.length,
      estimatedRevenue,
      unpaidInvoices,
      activeGuarantees,
    },
    error: null,
  };
}

// Shared fee estimator. Exported so other modules can apply the same logic.
export function estimateFee(p: {
  flat_fee: number | null;
  starting_salary: number | null;
  fee_percentage: number | null;
}): number {
  if (p.flat_fee != null) return Number(p.flat_fee);
  if (p.starting_salary != null && p.fee_percentage != null) {
    return Number(p.starting_salary) * (Number(p.fee_percentage) / 100);
  }
  return 0;
}

