"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncCompanyToOriginProspect } from "@/lib/db/prospect-sync";
import { moveProspectBackToPrevious } from "../prospects/actions";
import {
  companyFormSchema,
  toDbPayload,
  type CompanyFormValues,
} from "./schema";

type ActionResult = { ok: true; id: string } | { ok: false; error: string };

async function ensureActiveEmployee(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_active_employee");
  if (error) return error.message;
  if (!data) return "You are not an active employee.";
  return null;
}

export async function createCompany(
  values: CompanyFormValues,
): Promise<ActionResult> {
  const parsed = companyFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid form data",
    };
  }

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .insert(toDbPayload(parsed.data))
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/companies");
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

export async function updateCompany(
  id: string,
  values: CompanyFormValues,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing company id" };

  const parsed = companyFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid form data",
    };
  }

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const payload = toDbPayload(parsed.data);
  const { data, error } = await supabase
    .from("companies")
    .update(payload)
    .eq("id", id)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  // Push shared fields back to the originating prospect (no-op if this
  // company was never converted from one).
  await syncCompanyToOriginProspect(id, {
    company_name: payload.company_name,
    industry: payload.industry,
    location: payload.location,
    hiring_needs: payload.hiring_needs,
    contact_name: payload.contact_name,
    contact_email: payload.contact_email,
    contact_phone: payload.contact_phone,
    notes: payload.notes,
  });

  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  revalidatePath("/prospects");
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

// "Archive" for companies = set status to Inactive. The schema has no
// dedicated Archived status for companies (Do Not Contact is a different
// intent), so Inactive is the soft-delete equivalent.
export async function archiveCompany(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing company id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ status: "Inactive" })
    .eq("id", id)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

// Permanent delete (Admin-only, enforced by RLS). Can be deleted directly
// from the company page without archiving first. Open jobs and any placement
// history block via ON DELETE RESTRICT; we surface those as friendly errors
// so the user knows what to clear first.
export async function deleteCompany(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing company id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();

  const { data: existing, error: lookupErr } = await supabase
    .from("companies")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!existing) return { ok: false, error: "Company not found." };

  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) {
    if (/foreign key|jobs/i.test(error.message)) {
      return {
        ok: false,
        error:
          "Can't delete: this company still has jobs. Delete those jobs first.",
      };
    }
    if (/foreign key|placements/i.test(error.message)) {
      return {
        ok: false,
        error:
          "Can't delete: this company has placement records. Delete the placements first.",
      };
    }
    if (/row.level.security|permission|policy/i.test(error.message)) {
      return { ok: false, error: "Only an Admin can delete a company." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/companies");
  revalidatePath("/dashboard");
  return { ok: true, id };
}

// Move a company back to their previous category (typically Prospect).
// Thin wrapper around the unified move-back action in prospects/actions
// so there's one source of truth for the stage-flip + snapshot logic.
export async function revertCompanyToProspect(
  id: string,
): Promise<
  { ok: true; listId: string; prospectId: string } | { ok: false; error: string }
> {
  if (!id) return { ok: false, error: "Missing company id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const { data: linked, error: linkedErr } = await supabase
    .from("prospects")
    .select("id")
    .eq("converted_to_company_id", id)
    .maybeSingle();
  if (linkedErr) return { ok: false, error: linkedErr.message };
  if (!linked) {
    return {
      ok: false,
      error: "This company wasn't converted from a prospect list.",
    };
  }

  const r = await moveProspectBackToPrevious(linked.id);
  if (!r.ok) return r;
  return { ok: true, listId: r.listId, prospectId: linked.id };
}

export async function restoreCompany(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing company id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ status: "Prospect" })
    .eq("id", id)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}
