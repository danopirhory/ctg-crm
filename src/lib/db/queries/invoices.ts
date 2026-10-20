import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { InvoiceStatus } from "../types";

import { fail, type Result } from "./shared";

// =====================================================================
// Invoicing - derives an invoice amount from each placement based on
// the company's compensation model (Flat = fixed dollar, Percent = % of
// starting salary). A placement can still override fees on its own row
// (placements.flat_fee / placements.fee_percentage); we honour the
// override when present and fall back to the company default otherwise.
// =====================================================================

export type InvoiceRow = {
  placement_id: string;
  placement_date: string;
  invoice_status: InvoiceStatus;
  candidate: { id: string; first_name: string; last_name: string } | null;
  company: {
    id: string;
    company_name: string;
    compensation_type: "Flat" | "Percent";
    compensation_flat_fee: number;
    compensation_fee_percentage: number;
  } | null;
  job: { id: string; title: string } | null;
  starting_salary: number | null;
  // Effective fee values after the placement-override + company-default
  // fallback. Both are populated; only one is used in the calculation.
  effective_flat_fee: number | null;
  effective_fee_percentage: number | null;
  effective_compensation_type: "Flat" | "Percent";
  invoice_amount: number;
};

export type InvoiceFilters = {
  status?: InvoiceStatus | "all";
  q?: string;
};

export async function listInvoices(
  filters: InvoiceFilters = {},
): Promise<Result<InvoiceRow[]>> {
  const supabase = await createClient();

  let query = supabase
    .from("placements")
    .select(
      "id, placement_date, invoice_status, starting_salary, flat_fee, fee_percentage, candidate:candidates(id, first_name, last_name), company:companies(id, company_name, compensation_type, compensation_flat_fee, compensation_fee_percentage), job:jobs(id, title)",
    )
    .order("placement_date", { ascending: false })
    .limit(500);

  if (filters.status && filters.status !== "all") {
    query = query.eq("invoice_status", filters.status);
  }

  const { data, error } = await query;
  if (error) return fail([], error.message);

  const rows: InvoiceRow[] = (data ?? []).map((p) => {
    const candidate = Array.isArray(p.candidate) ? p.candidate[0] : p.candidate;
    const company = Array.isArray(p.company) ? p.company[0] : p.company;
    const job = Array.isArray(p.job) ? p.job[0] : p.job;

    // Placement overrides win. If both are null, fall back to the
    // company's chosen compensation model.
    const overrideFlat = p.flat_fee != null && p.flat_fee > 0;
    const overridePct = p.fee_percentage != null && p.fee_percentage > 0;
    let effectiveType: "Flat" | "Percent";
    let effectiveFlat: number | null;
    let effectivePct: number | null;

    if (overrideFlat) {
      effectiveType = "Flat";
      effectiveFlat = Number(p.flat_fee);
      effectivePct = null;
    } else if (overridePct) {
      effectiveType = "Percent";
      effectiveFlat = null;
      effectivePct = Number(p.fee_percentage);
    } else if (company) {
      effectiveType = company.compensation_type as "Flat" | "Percent";
      effectiveFlat =
        company.compensation_type === "Flat"
          ? Number(company.compensation_flat_fee)
          : null;
      effectivePct =
        company.compensation_type === "Percent"
          ? Number(company.compensation_fee_percentage)
          : null;
    } else {
      effectiveType = "Flat";
      effectiveFlat = 0;
      effectivePct = null;
    }

    let invoiceAmount = 0;
    if (effectiveType === "Flat" && effectiveFlat != null) {
      invoiceAmount = effectiveFlat;
    } else if (
      effectiveType === "Percent" &&
      effectivePct != null &&
      p.starting_salary != null
    ) {
      invoiceAmount = Number(p.starting_salary) * (effectivePct / 100);
    }

    return {
      placement_id: p.id,
      placement_date: p.placement_date,
      invoice_status: p.invoice_status,
      candidate: candidate
        ? {
            id: candidate.id,
            first_name: candidate.first_name,
            last_name: candidate.last_name,
          }
        : null,
      company: company
        ? {
            id: company.id,
            company_name: company.company_name,
            compensation_type: company.compensation_type as "Flat" | "Percent",
            compensation_flat_fee: Number(company.compensation_flat_fee),
            compensation_fee_percentage: Number(
              company.compensation_fee_percentage,
            ),
          }
        : null,
      job: job ? { id: job.id, title: job.title } : null,
      starting_salary:
        p.starting_salary != null ? Number(p.starting_salary) : null,
      effective_flat_fee: effectiveFlat,
      effective_fee_percentage: effectivePct,
      effective_compensation_type: effectiveType,
      invoice_amount: invoiceAmount,
    };
  });

  const q = filters.q?.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => {
        const candidateName = r.candidate
          ? `${r.candidate.first_name} ${r.candidate.last_name}`.toLowerCase()
          : "";
        const companyName = r.company?.company_name.toLowerCase() ?? "";
        const jobTitle = r.job?.title.toLowerCase() ?? "";
        return (
          candidateName.includes(q) ||
          companyName.includes(q) ||
          jobTitle.includes(q)
        );
      })
    : rows;

  return { data: filtered, error: null };
}

