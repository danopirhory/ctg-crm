import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Append-only activity logger. ALWAYS best-effort: a failed log line
// must never fail the action that called it, so every path swallows
// errors after a console.error.

export type ActivityVerb =
  | "status_changed"
  | "match_added"
  | "match_removed"
  | "note_added"
  | "task_created"
  | "task_completed"
  | "review_generated"
  | "snapshot_taken"
  | "intake_received"
  | "returned_to_leads"
  | "candidate_created"
  | "campaign_sent"
  | "email_event";

export type ActivityInput = {
  verb: ActivityVerb;
  summary: string;
  candidateId?: string | null;
  companyId?: string | null;
  prospectId?: string | null;
  jobId?: string | null;
  metadata?: Record<string, unknown>;
};

// Session-authenticated path (server actions). Resolves the acting
// employee from the session so the timeline shows who did it.
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let actorId: string | null = null;
    if (user) {
      const { data } = await supabase
        .from("employees")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      actorId = data?.id ?? null;
    }
    const { error } = await supabase.from("activities").insert({
      verb: input.verb,
      summary: input.summary,
      actor_employee_id: actorId,
      candidate_id: input.candidateId ?? null,
      company_id: input.companyId ?? null,
      prospect_id: input.prospectId ?? null,
      job_id: input.jobId ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) console.error("[activity]", error.message);
  } catch (e) {
    console.error("[activity]", e instanceof Error ? e.message : e);
  }
}

// Service-role path for the public intake routes (no session).
export async function logActivityAsSystem(input: ActivityInput): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("activities").insert({
      verb: input.verb,
      summary: input.summary,
      actor_employee_id: null,
      candidate_id: input.candidateId ?? null,
      company_id: input.companyId ?? null,
      prospect_id: input.prospectId ?? null,
      job_id: input.jobId ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) console.error("[activity]", error.message);
  } catch (e) {
    console.error("[activity]", e instanceof Error ? e.message : e);
  }
}
