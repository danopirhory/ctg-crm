import "server-only";

import { createClient } from "@/lib/supabase/server";

import { fail, type Result } from "./shared";

// =====================================================================
// Activity timeline reads. Writes live in src/lib/db/activity.ts.
// =====================================================================

export type ActivityItem = {
  id: string;
  verb: string;
  summary: string;
  created_at: string;
  actor: { first_name: string; last_name: string } | null;
  job: { id: string; title: string } | null;
};

export async function listActivitiesFor(
  subject:
    | { candidateId: string }
    | { companyId: string }
    | { prospectId: string },
  limit = 50,
): Promise<Result<ActivityItem[]>> {
  const supabase = await createClient();
  let query = supabase
    .from("activities")
    .select(
      `id, verb, summary, created_at,
       actor:employees ( first_name, last_name ),
       job:jobs ( id, title )`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if ("candidateId" in subject) {
    query = query.eq("candidate_id", subject.candidateId);
  } else if ("companyId" in subject) {
    query = query.eq("company_id", subject.companyId);
  } else {
    query = query.eq("prospect_id", subject.prospectId);
  }

  const { data, error } = await query;
  if (error) return fail([], error.message);

  const normalized: ActivityItem[] = (data ?? []).map((r) => {
    const actor = Array.isArray(r.actor) ? (r.actor[0] ?? null) : r.actor;
    const job = Array.isArray(r.job) ? (r.job[0] ?? null) : r.job;
    return {
      id: r.id,
      verb: r.verb,
      summary: r.summary,
      created_at: r.created_at,
      actor,
      job,
    };
  });
  return { data: normalized, error: null };
}
