"use server";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/db/activity";
import { getCurrentEmployee } from "@/lib/db/queries";
import {
  generateOutreachDraft,
  structureCallNotes,
  translateSearchQuery,
  type OutreachDraft,
  type StructuredNotes,
} from "@/lib/ai/assist";

// Server actions for the AI assists. Kept in one file at the
// (app) root because they're invoked from several surfaces (candidate
// detail, lead detail, the Ctrl+K palette).

async function ensureActiveEmployee(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_active_employee");
  if (error) return error.message;
  if (!data) return "You are not an active employee.";
  return null;
}

// ---------- Outreach draft ----------

export async function draftOutreach(input: {
  candidateId: string;
  jobId: string | null;
  channel: "email" | "linkedin";
}): Promise<
  { ok: true; draft: OutreachDraft } | { ok: false; error: string }
> {
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };
  if (!input.candidateId) return { ok: false, error: "Missing candidate id." };

  const supabase = await createClient();
  const [{ data: candidate }, employee] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "first_name, last_name, military_branch, rank, mos_or_specialty, clearance, target_location, target_industry",
      )
      .eq("id", input.candidateId)
      .maybeSingle(),
    getCurrentEmployee(),
  ]);
  if (!candidate) return { ok: false, error: "Candidate not found." };

  let job: { title: string; company_name: string; location: string | null } | null =
    null;
  if (input.jobId) {
    const { data: j } = await supabase
      .from("jobs")
      .select("title, location, company:companies(company_name)")
      .eq("id", input.jobId)
      .maybeSingle();
    if (j) {
      const company = Array.isArray(j.company) ? j.company[0] : j.company;
      job = {
        title: j.title,
        company_name: company?.company_name ?? "",
        location: j.location,
      };
    }
  }

  const r = await generateOutreachDraft({
    channel: input.channel,
    recipient: {
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      military_branch: candidate.military_branch,
      rank: candidate.rank,
      mos_or_specialty: candidate.mos_or_specialty,
      clearance: candidate.clearance,
      location: candidate.target_location,
      target_industry: candidate.target_industry,
    },
    job,
    senderName: "error" in employee ? null : employee.first_name,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, draft: r.data };
}

// ---------- Natural-language candidate search ----------

export type AiSearchHit = {
  id: string;
  name: string;
  subtitle: string;
};

export async function aiCandidateSearch(
  query: string,
): Promise<{ ok: true; hits: AiSearchHit[] } | { ok: false; error: string }> {
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };
  const q = query.trim();
  if (q.length < 4) return { ok: true, hits: [] };

  const t = await translateSearchQuery(q);
  if (!t.ok) return { ok: false, error: t.error };
  const f = t.data;

  const supabase = await createClient();
  let dbq = supabase
    .from("candidates")
    .select(
      "id, first_name, last_name, status, military_branch, rank, clearance, target_location, target_industry, years_of_service",
    )
    .neq("status", "Archived")
    .limit(15);

  if (f.military_branch) dbq = dbq.ilike("military_branch", `%${f.military_branch}%`);
  if (f.clearance_level) dbq = dbq.ilike("clearance", `%${f.clearance_level}%`);
  else if (f.clearance_required) dbq = dbq.not("clearance", "is", null);
  if (f.min_years_of_service != null) {
    dbq = dbq.gte("years_of_service", f.min_years_of_service);
  }
  if (f.location_terms.length > 0) {
    dbq = dbq.or(
      f.location_terms
        .map((term) => `target_location.ilike.%${term.replace(/[,()%_]/g, " ")}%`)
        .join(","),
    );
  }
  if (f.industry_terms.length > 0) {
    dbq = dbq.or(
      f.industry_terms
        .map((term) => `target_industry.ilike.%${term.replace(/[,()%_]/g, " ")}%`)
        .join(","),
    );
  }
  if (f.name_terms.length > 0) {
    dbq = dbq.or(
      f.name_terms
        .flatMap((term) => {
          const safe = term.replace(/[,()%_]/g, " ");
          return [`first_name.ilike.%${safe}%`, `last_name.ilike.%${safe}%`];
        })
        .join(","),
    );
  }

  const { data, error } = await dbq;
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    hits: (data ?? []).map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`.trim(),
      subtitle:
        [c.status, c.military_branch, c.clearance, c.target_location]
          .filter(Boolean)
          .join(" · ") || "-",
    })),
  };
}

// ---------- Call-note structuring ----------

export async function structureNotes(
  raw: string,
): Promise<{ ok: true; notes: StructuredNotes } | { ok: false; error: string }> {
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };
  if (raw.trim().length < 20) {
    return { ok: false, error: "Paste at least a few lines of notes first." };
  }
  const r = await structureCallNotes(raw);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, notes: r.data };
}

// Persists the structured result: one formatted note + optional tasks.
export async function saveStructuredNotes(input: {
  candidateId: string;
  notes: StructuredNotes;
  createTasks: boolean;
}): Promise<{ ok: true; tasksCreated: number } | { ok: false; error: string }> {
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };
  if (!input.candidateId) return { ok: false, error: "Missing candidate id." };

  const employee = await getCurrentEmployee();
  if ("error" in employee) return { ok: false, error: employee.error };

  const supabase = await createClient();
  const formatted = [
    input.notes.summary,
    "",
    ...input.notes.key_points.map((p) => `• ${p}`),
    ...(input.notes.action_items.length > 0 && !input.createTasks
      ? ["", "Follow-ups:", ...input.notes.action_items.map((a) => `→ ${a}`)]
      : []),
  ].join("\n");

  const { error: noteErr } = await supabase.from("candidate_notes").insert({
    candidate_id: input.candidateId,
    employee_id: employee.id,
    note: formatted,
  });
  if (noteErr) return { ok: false, error: noteErr.message };

  let tasksCreated = 0;
  if (input.createTasks && input.notes.action_items.length > 0) {
    const { error: taskErr } = await supabase.from("tasks").insert(
      input.notes.action_items.map((title) => ({
        title,
        status: "Open" as const,
        related_candidate_id: input.candidateId,
        assigned_to: employee.id,
      })),
    );
    if (!taskErr) tasksCreated = input.notes.action_items.length;
  }

  await logActivity({
    verb: "note_added",
    summary: `Call notes structured by AI${tasksCreated > 0 ? ` (+${tasksCreated} tasks)` : ""}`,
    candidateId: input.candidateId,
  });

  return { ok: true, tasksCreated };
}
