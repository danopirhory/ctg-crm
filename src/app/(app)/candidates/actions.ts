"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncCandidateToOriginProspect } from "@/lib/db/prospect-sync";
import { findDuplicatesByEmail, type DuplicateHit } from "@/lib/db/dedupe";
import { logActivity } from "@/lib/db/activity";
import { moveProspectBackToPrevious } from "../prospects/actions";
import {
  candidateFormSchema,
  toDbPayload,
  type CandidateFormValues,
} from "./schema";
import { RESUME_BUCKET } from "./_lib/resume";

type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; duplicates?: DuplicateHit[] };

async function ensureActiveEmployee(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_active_employee");
  if (error) return error.message;
  if (!data) return "You are not an active employee.";
  return null;
}

export async function createCandidate(
  values: CandidateFormValues,
  opts?: { allowDuplicate?: boolean },
): Promise<ActionResult> {
  const parsed = candidateFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form data" };
  }

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  // Soft duplicate gate: if this email already belongs to a candidate
  // or a lead, bounce back with the matches so the form can ask
  // "create anyway?". A second submit with allowDuplicate proceeds.
  if (!opts?.allowDuplicate && parsed.data.email?.trim()) {
    const duplicates = await findDuplicatesByEmail(parsed.data.email);
    if (duplicates.length > 0) {
      return {
        ok: false,
        error: "A record with this email already exists.",
        duplicates,
      };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .insert(toDbPayload(parsed.data))
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logActivity({
    verb: "candidate_created",
    summary: "Candidate created",
    candidateId: data.id,
  });

  revalidatePath("/candidates");
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

export async function updateCandidate(
  id: string,
  values: CandidateFormValues,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing candidate id" };

  const parsed = candidateFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form data" };
  }

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();

  // Look up the existing resume path so we can clean up storage when the
  // user replaces or removes the file.
  const { data: existing } = await supabase
    .from("candidates")
    .select("resume_url")
    .eq("id", id)
    .maybeSingle();
  const oldPath = existing?.resume_url ?? null;

  const payload = toDbPayload(parsed.data);
  const { data, error } = await supabase
    .from("candidates")
    .update(payload)
    .eq("id", id)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  // Fire-and-forget cleanup. If it fails the row is already correct; the
  // worst case is an orphaned file in storage.
  if (oldPath && oldPath !== payload.resume_url) {
    await supabase.storage.from(RESUME_BUCKET).remove([oldPath]);
  }

  // Push shared fields back to the originating prospect (no-op if this
  // candidate was never converted from one). Keeps the prospect view in
  // sync as one record per individual.
  await syncCandidateToOriginProspect(id, {
    first_name: payload.first_name,
    last_name: payload.last_name,
    email: payload.email,
    phone: payload.phone,
    target_industry: payload.target_industry,
    target_location: payload.target_location,
    marketing_consent: payload.marketing_consent,
    military_branch: payload.military_branch,
    rank: payload.rank,
    mos_or_specialty: payload.mos_or_specialty,
    clearance: payload.clearance,
    years_of_service: payload.years_of_service,
    tags: payload.tags,
    source: payload.source,
    resume_url: payload.resume_url,
    linkedin: payload.linkedin,
  });

  revalidatePath("/candidates");
  revalidatePath(`/candidates/${id}`);
  revalidatePath("/prospects");
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

export async function archiveCandidate(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing candidate id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .update({ status: "Archived" })
    .eq("id", id)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/candidates");
  revalidatePath(`/candidates/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

// Lightweight status setter used by the Candidates kanban for
// Pipeline ↔ Placements drags. Validates against the enum and
// revalidates affected paths. RLS already gates writes.
import { CANDIDATE_STATUSES } from "@/lib/db/constants";
import type { CandidateStatus } from "@/lib/db/types";
export async function setCandidateStatus(
  id: string,
  status: CandidateStatus,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing candidate id" };
  if (!(CANDIDATE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Invalid status." };
  }
  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };
  const supabase = await createClient();
  // Pull the prior status so the timeline shows the transition.
  const { data: before } = await supabase
    .from("candidates")
    .select("status, first_name, last_name")
    .eq("id", id)
    .maybeSingle();
  const { data, error } = await supabase
    .from("candidates")
    .update({ status })
    .eq("id", id)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  if (before && before.status !== status) {
    await logActivity({
      verb: "status_changed",
      summary: `Status: ${before.status} → ${status}`,
      candidateId: id,
      metadata: { from: before.status, to: status },
    });
  }
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

export async function restoreCandidate(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing candidate id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .update({ status: "New" })
    .eq("id", id)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/candidates");
  revalidatePath(`/candidates/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

// Move a candidate back to their previous category (typically Prospect).
// Thin wrapper around the unified move-back action in prospects/actions
// so there's one source of truth for the stage-flip + snapshot logic.
export async function revertCandidateToProspect(
  id: string,
): Promise<
  { ok: true; listId: string; prospectId: string } | { ok: false; error: string }
> {
  if (!id) return { ok: false, error: "Missing candidate id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const { data: linked, error: linkedErr } = await supabase
    .from("prospects")
    .select("id")
    .eq("converted_to_candidate_id", id)
    .maybeSingle();
  if (linkedErr) return { ok: false, error: linkedErr.message };
  if (!linked) {
    return {
      ok: false,
      error: "This candidate wasn't converted from a prospect list.",
    };
  }

  const r = await moveProspectBackToPrevious(linked.id);
  if (!r.ok) return r;
  return { ok: true, listId: r.listId, prospectId: linked.id };
}

// Permanent delete - only available after a candidate has been Archived,
// and only Admins can actually execute it (RLS-enforced). Placements
// would block via ON DELETE RESTRICT on the placements FK; we surface
// that as a friendly error so the user knows what to clear first.
export async function deleteCandidate(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing candidate id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();

  // Grab the resume path + archived flag before deleting so we can
  // refuse non-archived deletes and clean up storage afterwards.
  const { data: existing, error: lookupErr } = await supabase
    .from("candidates")
    .select("status, resume_url")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!existing) return { ok: false, error: "Candidate not found." };
  if (existing.status !== "Archived") {
    return {
      ok: false,
      error: "Archive this candidate before deleting.",
    };
  }

  const { error } = await supabase.from("candidates").delete().eq("id", id);
  if (error) {
    if (/foreign key|placements/i.test(error.message)) {
      return {
        ok: false,
        error:
          "Can't delete: this candidate has placement records. Delete the placements first.",
      };
    }
    if (/row.level.security|permission|policy/i.test(error.message)) {
      return { ok: false, error: "Only an Admin can delete a candidate." };
    }
    return { ok: false, error: error.message };
  }

  // Best-effort resume cleanup - if it fails we just leak the file.
  if (existing.resume_url) {
    await supabase.storage.from(RESUME_BUCKET).remove([existing.resume_url]);
  }

  revalidatePath("/candidates");
  revalidatePath("/dashboard");
  return { ok: true, id };
}
