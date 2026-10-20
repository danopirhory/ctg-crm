"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { JOB_STATUSES } from "@/lib/db/constants";
import type { JobStatus } from "@/lib/db/types";
import { jobFormSchema, toDbPayload, type JobFormValues } from "./schema";

type ActionResult = { ok: true; id: string } | { ok: false; error: string };

const jobStatusSchema = z.enum(JOB_STATUSES);

async function ensureActiveEmployee(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_active_employee");
  if (error) return error.message;
  if (!data) return "You are not an active employee.";
  return null;
}

export async function createJob(values: JobFormValues): Promise<ActionResult> {
  const parsed = jobFormSchema.safeParse(values);
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
    .from("jobs")
    .insert(toDbPayload(parsed.data))
    .select("id, company_id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  // The parent company detail page lists jobs at that company.
  revalidatePath(`/companies/${data.company_id}`);
  return { ok: true, id: data.id };
}

export async function updateJob(
  id: string,
  values: JobFormValues,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing job id" };

  const parsed = jobFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid form data",
    };
  }

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();

  // Look up the previous company_id so we can revalidate both the old and
  // new company pages when a job moves between companies.
  const { data: existing } = await supabase
    .from("jobs")
    .select("company_id")
    .eq("id", id)
    .maybeSingle();
  const oldCompanyId = existing?.company_id ?? null;

  const payload = toDbPayload(parsed.data);
  const { data, error } = await supabase
    .from("jobs")
    .update(payload)
    .eq("id", id)
    .select("id, company_id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/dashboard");
  revalidatePath(`/companies/${data.company_id}`);
  if (oldCompanyId && oldCompanyId !== data.company_id) {
    revalidatePath(`/companies/${oldCompanyId}`);
  }
  return { ok: true, id: data.id };
}

// Quick status flip - used by the dropdown on the job detail page to
// mark Open / Paused / Filled / Closed without going through the full
// edit form. Validates against the enum and revalidates affected pages.
export async function updateJobStatus(
  id: string,
  status: JobStatus,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing job id" };

  const parsed = jobStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status." };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ status: parsed.data })
    .eq("id", id)
    .select("id, company_id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/companies/${data.company_id}`);
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

// Permanent delete. Placements would block via ON DELETE RESTRICT on
// the placements FK - surface that as a friendly error. RLS already
// restricts DELETE to Admins. Related candidate_job_matches cascade.
export async function deleteJob(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing job id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();

  const { data: existing, error: lookupErr } = await supabase
    .from("jobs")
    .select("company_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!existing) return { ok: false, error: "Job not found." };

  const { error } = await supabase.from("jobs").delete().eq("id", id);
  if (error) {
    if (/foreign key|placements/i.test(error.message)) {
      return {
        ok: false,
        error:
          "Can't delete: this job has placement records. Undo or delete those placements first.",
      };
    }
    if (/row.level.security|permission|policy/i.test(error.message)) {
      return { ok: false, error: "Only an Admin can delete a job." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/jobs");
  revalidatePath(`/companies/${existing.company_id}`);
  revalidatePath("/dashboard");
  return { ok: true, id };
}
