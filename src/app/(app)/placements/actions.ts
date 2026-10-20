"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployeeId } from "@/lib/db/queries";
import {
  CANDIDATE_STATUSES,
  INVOICE_STATUSES,
  JOB_STATUSES,
} from "@/lib/db/constants";
import type {
  CandidateStatus,
  InvoiceStatus,
  JobStatus,
} from "@/lib/db/types";

import {
  placementFormSchema,
  toDbPayload,
  type PlacementFormValues,
} from "./schema";

type ActionResult = { ok: true; id: string } | { ok: false; error: string };

async function ensureActiveEmployee(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_active_employee");
  if (error) return error.message;
  if (!data) return "You are not an active employee.";
  return null;
}

function revalidateAffected(p: {
  candidate_id: string;
  company_id: string;
  job_id: string;
}) {
  revalidatePath("/placements");
  revalidatePath("/dashboard");
  revalidatePath(`/candidates/${p.candidate_id}`);
  revalidatePath(`/companies/${p.company_id}`);
  revalidatePath(`/jobs/${p.job_id}`);
}

export async function createPlacement(
  values: PlacementFormValues,
): Promise<ActionResult> {
  const parsed = placementFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid placement.",
    };
  }

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();

  // Snapshot the current job + candidate status so a future
  // "Undo placement" can deterministically restore them. We capture
  // them BEFORE the insert because the form may also intend to bump
  // those statuses (e.g. candidate → Placed) afterwards.
  const payload = toDbPayload(parsed.data);
  const [jobLookup, candidateLookup] = await Promise.all([
    supabase.from("jobs").select("status").eq("id", payload.job_id).maybeSingle(),
    supabase
      .from("candidates")
      .select("status")
      .eq("id", payload.candidate_id)
      .maybeSingle(),
  ]);

  const { data, error } = await supabase
    .from("placements")
    .insert({
      ...payload,
      job_status_before: jobLookup.data?.status ?? null,
      candidate_status_before: candidateLookup.data?.status ?? null,
    })
    .select("id, candidate_id, company_id, job_id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateAffected(data);
  revalidatePath(`/placements/${data.id}`);
  return { ok: true, id: data.id };
}

export async function updatePlacement(
  id: string,
  values: PlacementFormValues,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing placement id" };

  const parsed = placementFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid placement.",
    };
  }

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();

  // Capture the previous parent IDs so we can invalidate them too if the
  // placement was reassigned (rare, but a data correction case).
  const { data: existing } = await supabase
    .from("placements")
    .select("candidate_id, company_id, job_id")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("placements")
    .update(toDbPayload(parsed.data))
    .eq("id", id)
    .select("id, candidate_id, company_id, job_id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateAffected(data);
  if (existing) {
    if (existing.candidate_id !== data.candidate_id)
      revalidatePath(`/candidates/${existing.candidate_id}`);
    if (existing.company_id !== data.company_id)
      revalidatePath(`/companies/${existing.company_id}`);
    if (existing.job_id !== data.job_id)
      revalidatePath(`/jobs/${existing.job_id}`);
  }
  revalidatePath(`/placements/${data.id}`);
  return { ok: true, id: data.id };
}

const invoiceStatusSchema = z.enum(INVOICE_STATUSES);

export async function updatePlacementInvoiceStatus(
  id: string,
  status: InvoiceStatus,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing placement id" };
  if (!invoiceStatusSchema.safeParse(status).success) {
    return { ok: false, error: "Invalid invoice status." };
  }

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("placements")
    .update({ invoice_status: status })
    .eq("id", id)
    .select("id, candidate_id, company_id, job_id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateAffected(data);
  revalidatePath(`/placements/${data.id}`);
  return { ok: true, id: data.id };
}

export async function deletePlacement(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing placement id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("placements")
    .select("candidate_id, company_id, job_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("placements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (existing) revalidateAffected(existing);
  return { ok: true, id };
}

// "Undo placement" - the user-facing reverse of createPlacement.
// Restores the job and candidate statuses captured at placement time,
// records an audit note on the candidate, then removes the placement
// row. Notes/tasks/match history on the candidate, job, and company
// are untouched.
//
// Job restoration rules:
//   * If there are OTHER placements still referencing this job, the
//     job stays as-is (it was filled by more than this one placement).
//   * Otherwise, restore to job_status_before. If no snapshot exists
//     (pre-migration row) and the job is currently 'Filled', flip back
//     to 'Open' as a safe default.
//
// Candidate restoration:
//   * Only flips if the candidate's status is currently 'Placed' (the
//     only status the placement event can have plausibly caused). We
//     don't overwrite a status the user moved them to manually.
export async function undoPlacement(
  id: string,
): Promise<
  | { ok: true; candidateId: string; companyId: string; jobId: string }
  | { ok: false; error: string }
> {
  if (!id) return { ok: false, error: "Missing placement id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();

  const { data: placement, error: lookupErr } = await supabase
    .from("placements")
    .select(
      "id, candidate_id, company_id, job_id, placement_date, starting_salary, job_status_before, candidate_status_before",
    )
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!placement) return { ok: false, error: "Placement not found." };

  // 1. Audit note on the candidate before we destroy the row, so the
  //    activity timeline keeps the trail.
  const employee = await getCurrentEmployeeId();
  const employeeId = "id" in employee ? employee.id : null;
  const auditBody = [
    `Placement undone on ${new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })}.`,
    `Placement date: ${placement.placement_date}.`,
    placement.starting_salary != null
      ? `Starting salary: $${Number(placement.starting_salary).toLocaleString()}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
  await supabase.from("candidate_notes").insert({
    candidate_id: placement.candidate_id,
    employee_id: employeeId,
    note: auditBody,
  });

  // 2. Decide whether to flip the job's status back. Only if this is
  //    the LAST placement on the job - multiple placements means the
  //    job was filled in aggregate and shouldn't reopen on a single
  //    undo.
  const { count: siblingCount } = await supabase
    .from("placements")
    .select("id", { count: "exact", head: true })
    .eq("job_id", placement.job_id)
    .neq("id", placement.id);

  if (!siblingCount || siblingCount === 0) {
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("status")
      .eq("id", placement.job_id)
      .maybeSingle();
    if (jobRow) {
      let restoredJobStatus: JobStatus | null = null;
      const snap = placement.job_status_before;
      if (snap && (JOB_STATUSES as readonly string[]).includes(snap)) {
        restoredJobStatus = snap as JobStatus;
      } else if (jobRow.status === "Filled") {
        restoredJobStatus = "Open";
      }
      if (restoredJobStatus && restoredJobStatus !== jobRow.status) {
        await supabase
          .from("jobs")
          .update({ status: restoredJobStatus })
          .eq("id", placement.job_id);
      }
    }
  }

  // 3. Decide whether to flip the candidate's status. Only meaningful
  //    if they're sitting at 'Placed' right now.
  const { data: candidateRow } = await supabase
    .from("candidates")
    .select("status")
    .eq("id", placement.candidate_id)
    .maybeSingle();
  if (candidateRow?.status === "Placed") {
    const snap = placement.candidate_status_before;
    const restoredCandidateStatus: CandidateStatus =
      snap &&
      (CANDIDATE_STATUSES as readonly string[]).includes(snap) &&
      snap !== "Placed"
        ? (snap as CandidateStatus)
        : "Offer";
    await supabase
      .from("candidates")
      .update({ status: restoredCandidateStatus })
      .eq("id", placement.candidate_id);
  }

  // 4. Finally, drop the placement row itself.
  const { error: delErr } = await supabase
    .from("placements")
    .delete()
    .eq("id", placement.id);
  if (delErr) {
    if (/row.level.security|permission|policy/i.test(delErr.message)) {
      return {
        ok: false,
        error: "Only an Admin can undo a placement.",
      };
    }
    return { ok: false, error: delErr.message };
  }

  revalidateAffected({
    candidate_id: placement.candidate_id,
    company_id: placement.company_id,
    job_id: placement.job_id,
  });
  return {
    ok: true,
    candidateId: placement.candidate_id,
    companyId: placement.company_id,
    jobId: placement.job_id,
  };
}
