"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/db/activity";
import { MATCH_STATUSES } from "@/lib/db/constants";
import type { MatchStatus } from "@/lib/db/types";

type ActionResult = { ok: true; id: string } | { ok: false; error: string };

async function ensureActiveEmployee(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_active_employee");
  if (error) return error.message;
  if (!data) return "You are not an active employee.";
  return null;
}

// Status transitions that auto-stamp a corresponding timestamp column when
// that column is still NULL. Reverting status does NOT clear stamps.
function autoStamps(
  status: MatchStatus,
  current: {
    submitted_at: string | null;
    offer_date: string | null;
    placement_date: string | null;
  },
): Record<string, string> {
  const now = new Date().toISOString();
  const stamps: Record<string, string> = {};
  if (status === "Submitted" && !current.submitted_at) stamps.submitted_at = now;
  if (status === "Offer" && !current.offer_date) stamps.offer_date = now;
  if (status === "Placed" && !current.placement_date) stamps.placement_date = now;
  return stamps;
}

// =====================================================================
// Create
// =====================================================================
const createMatchSchema = z.object({
  candidate_id: z.string().uuid("Pick a candidate"),
  job_id: z.string().uuid("Pick a job"),
  match_status: z.enum(MATCH_STATUSES),
  notes: z.string().trim().max(5000),
});

export type CreateMatchInput = z.infer<typeof createMatchSchema>;

export async function createMatch(
  input: CreateMatchInput,
): Promise<ActionResult> {
  const parsed = createMatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid match.",
    };
  }

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const stamps = autoStamps(parsed.data.match_status, {
    submitted_at: null,
    offer_date: null,
    placement_date: null,
  });

  const { data, error } = await supabase
    .from("candidate_job_matches")
    .insert({
      candidate_id: parsed.data.candidate_id,
      job_id: parsed.data.job_id,
      match_status: parsed.data.match_status,
      notes: parsed.data.notes.trim() || null,
      ...stamps,
    })
    .select("id, candidate_id, job_id")
    .single();

  if (error) {
    // Friendlier message for the unique (candidate_id, job_id) constraint.
    if (/duplicate key|unique/i.test(error.message)) {
      return {
        ok: false,
        error: "This candidate is already matched to this job.",
      };
    }
    return { ok: false, error: error.message };
  }

  // Timeline entry on the candidate (job title pulled for readability).
  const { data: job } = await supabase
    .from("jobs")
    .select("title, company_id")
    .eq("id", data.job_id)
    .maybeSingle();
  await logActivity({
    verb: "match_added",
    summary: `Matched to job: ${job?.title ?? "Unknown role"}`,
    candidateId: data.candidate_id,
    companyId: job?.company_id ?? null,
    jobId: data.job_id,
  });

  revalidatePath(`/candidates/${data.candidate_id}`);
  revalidatePath(`/jobs/${data.job_id}`);
  return { ok: true, id: data.id };
}

// =====================================================================
// Update status (with auto-stamp)
// =====================================================================
const statusSchema = z.enum(MATCH_STATUSES);

export async function updateMatchStatus(
  matchId: string,
  status: MatchStatus,
): Promise<ActionResult> {
  if (!matchId) return { ok: false, error: "Missing match id" };
  if (!statusSchema.safeParse(status).success) {
    return { ok: false, error: "Invalid status." };
  }

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("candidate_job_matches")
    .select(
      "candidate_id, job_id, submitted_at, offer_date, placement_date",
    )
    .eq("id", matchId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!existing) return { ok: false, error: "Match not found." };

  const stamps = autoStamps(status, existing);

  const { data, error } = await supabase
    .from("candidate_job_matches")
    .update({ match_status: status, ...stamps })
    .eq("id", matchId)
    .select("id, candidate_id, job_id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/candidates/${data.candidate_id}`);
  revalidatePath(`/jobs/${data.job_id}`);
  return { ok: true, id: data.id };
}

// =====================================================================
// Update notes
// =====================================================================
const notesSchema = z.string().trim().max(5000);

export async function updateMatchNotes(
  matchId: string,
  notes: string,
): Promise<ActionResult> {
  if (!matchId) return { ok: false, error: "Missing match id" };
  const parsed = notesSchema.safeParse(notes);
  if (!parsed.success) {
    return { ok: false, error: "Notes are too long." };
  }

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidate_job_matches")
    .update({ notes: parsed.data || null })
    .eq("id", matchId)
    .select("id, candidate_id, job_id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/candidates/${data.candidate_id}`);
  revalidatePath(`/jobs/${data.job_id}`);
  return { ok: true, id: data.id };
}

// =====================================================================
// Delete (Admin per RLS)
// =====================================================================
export async function deleteMatch(matchId: string): Promise<ActionResult> {
  if (!matchId) return { ok: false, error: "Missing match id" };

  const gateError = await ensureActiveEmployee();
  if (gateError) return { ok: false, error: gateError };

  const supabase = await createClient();

  // Look up parents for cache invalidation before we delete.
  const { data: existing } = await supabase
    .from("candidate_job_matches")
    .select("candidate_id, job_id")
    .eq("id", matchId)
    .maybeSingle();

  const { error } = await supabase
    .from("candidate_job_matches")
    .delete()
    .eq("id", matchId);
  if (error) return { ok: false, error: error.message };

  if (existing) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title, company_id")
      .eq("id", existing.job_id)
      .maybeSingle();
    await logActivity({
      verb: "match_removed",
      summary: `Removed from job: ${job?.title ?? "Unknown role"}`,
      candidateId: existing.candidate_id,
      companyId: job?.company_id ?? null,
      jobId: existing.job_id,
    });
    revalidatePath(`/candidates/${existing.candidate_id}`);
    revalidatePath(`/jobs/${existing.job_id}`);
  }
  return { ok: true, id: matchId };
}
