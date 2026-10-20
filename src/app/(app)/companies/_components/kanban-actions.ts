"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import {
  convertProspectToCompany,
  moveProspectBackToPrevious,
} from "../../prospects/actions";

// =====================================================================
// Companies kanban dispatcher.
// Columns:
//   prospects          - Company Leads: company-kind prospect rows still
//                        in the Prospect stage (not yet converted)
//   company_prospects  - Company Prospects: companies at status 'Prospect'
//   companies          - Companies: status beyond 'Prospect' (not Inactive)
//
// Card identifiers:
//   prospect:<prospectId>
//   company:<companyId>
// =====================================================================

type Result = { ok: true } | { ok: false; error: string };

async function setCompanyStatus(
  companyId: string,
  status: "Prospect" | "Contacted",
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ status })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/companies");
  revalidatePath(`/companies/${companyId}`);
  return { ok: true };
}

export async function moveCompaniesKanbanCard(input: {
  cardId: string;
  fromColumn: string;
  toColumn: string;
}): Promise<Result> {
  const { cardId, fromColumn, toColumn } = input;
  if (fromColumn === toColumn) return { ok: true };

  const [cardKind, cardKey] = cardId.split(":");
  if (!cardKind || !cardKey) return { ok: false, error: "Invalid card id." };

  if (
    cardKind === "prospect" &&
    (toColumn === "company_prospects" || toColumn === "companies")
  ) {
    // Conversion lands the company at status 'Prospect' (or restores a
    // snapshotted status for leads that were previously sent back).
    const r = await convertProspectToCompany(cardKey);
    if (!r.ok) return { ok: false, error: r.error };

    if (toColumn === "companies") {
      // Dropped straight into the Companies bucket - promote past the
      // qualification stage, but never downgrade a restored status.
      const supabase = await createClient();
      const { data: c } = await supabase
        .from("companies")
        .select("status")
        .eq("id", r.companyId)
        .maybeSingle();
      if (c?.status === "Prospect") {
        const s = await setCompanyStatus(r.companyId, "Contacted");
        if (!s.ok) return s;
      }
    }
    return { ok: true };
  }

  if (cardKind === "company" && toColumn === "company_prospects") {
    return setCompanyStatus(cardKey, "Prospect");
  }

  if (cardKind === "company" && toColumn === "companies") {
    return setCompanyStatus(cardKey, "Contacted");
  }

  if (cardKind === "company" && toColumn === "prospects") {
    const supabase = await createClient();
    const { data: linked } = await supabase
      .from("prospects")
      .select("id")
      .eq("converted_to_company_id", cardKey)
      .maybeSingle();
    if (!linked) {
      return {
        ok: false,
        error: "This company wasn't created from a prospect list.",
      };
    }
    const r = await moveProspectBackToPrevious(linked.id);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true };
  }

  return { ok: false, error: "Unsupported drag." };
}
