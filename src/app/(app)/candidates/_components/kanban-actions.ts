"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import { setCandidateStatus } from "../actions";
import { moveProspectBackToPrevious } from "../../prospects/actions";
import { createMatch, deleteMatch } from "../../_matches/actions";
import type { CandidateStatus } from "@/lib/db/types";

// Auto-created Candidate-kind list that holds candidates which were
// created directly in the Candidate Pipeline (not from a lead) and then
// sent back to Leads via the red drop zone. Find-or-create-on-demand so
// no seed migration is needed.
const RETURNED_LEADS_LIST_NAME = "Candidates Returned to Leads";

async function findOrCreateReturnedLeadsList(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ ok: true; listId: string } | { ok: false; error: string }> {
  const { data: existing, error: findErr } = await supabase
    .from("prospect_lists")
    .select("id")
    .eq("name", RETURNED_LEADS_LIST_NAME)
    .maybeSingle();
  if (findErr) return { ok: false, error: findErr.message };
  if (existing) return { ok: true, listId: existing.id };

  const { data: created, error: createErr } = await supabase
    .from("prospect_lists")
    .insert({
      name: RETURNED_LEADS_LIST_NAME,
      description:
        "Auto-generated. Holds candidates who were created directly in the Candidate Pipeline and later sent back to Leads.",
      source: "Pipeline return",
      kind: "Candidate",
      consent_confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (createErr || !created) {
    return {
      ok: false,
      error: createErr?.message ?? "Could not create the auto-leads list.",
    };
  }
  return { ok: true, listId: created.id };
}

// =====================================================================
// Candidate Pipeline kanban: dispatch a drag-and-drop card move.
//
// Sub-bucket → candidate.status mapping (must mirror the column model
// in candidates-kanban.tsx). Dropping onto a sub-bucket flips the
// candidate's status to the first value in its list, so the next render
// shows them in that column.
// =====================================================================

const SUB_BUCKET_STATUS: Record<string, CandidateStatus> = {
  "prospects-non-vetted": "New",
  "prospects-vetted": "Screened",
  "pipeline-prep": "Contacted",
  "pipeline-ready": "Submitted",
  "pipeline-interviewing": "Interviewing",
  "pipeline-passed-over": "Passed Over",
  placements: "Placed",
};

type Result = { ok: true } | { ok: false; error: string };

export async function moveCandidateKanbanCard(input: {
  cardId: string;
  fromColumn: string;
  toColumn: string;
}): Promise<Result> {
  const { cardId, fromColumn, toColumn } = input;
  if (fromColumn === toColumn) return { ok: true };

  const [cardKind, candidateId] = cardId.split(":");
  if (cardKind !== "candidate" || !candidateId) {
    return { ok: false, error: "Invalid card id." };
  }

  const supabase = await createClient();

  // Dragged onto the red "Move back to lead source" drop zone - revert
  // the candidate to a lead. Two paths:
  //
  //   1. Candidate originated from a lead (prospects.converted_to_candidate_id
  //      already points at them). Use the normal move-back-to-previous
  //      flow so they reappear in their originating list with the
  //      pre-revert status snapshotted for later resurrection.
  //
  //   2. Candidate was created directly in the Candidate Pipeline.
  //      Auto-create (or reuse) the "Candidates Returned to Leads"
  //      Candidate-kind list, drop a prospect row in there pre-linked
  //      to this candidate, snapshot the current status, and archive
  //      the candidate so they leave the board.
  if (toColumn === "back-to-leads") {
    const { data: linked, error: linkedErr } = await supabase
      .from("prospects")
      .select("id")
      .eq("converted_to_candidate_id", candidateId)
      .maybeSingle();
    if (linkedErr) return { ok: false, error: linkedErr.message };

    if (linked) {
      const r = await moveProspectBackToPrevious(linked.id);
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true };
    }

    // Path 2 - direct-created candidate. Pull the candidate's data so
    // we can mirror it onto the new lead row.
    const { data: candidate, error: cErr } = await supabase
      .from("candidates")
      .select(
        "first_name, last_name, email, phone, target_industry, target_location, status, military_branch, rank, mos_or_specialty, clearance, years_of_service, source, tags, resume_url, marketing_consent",
      )
      .eq("id", candidateId)
      .maybeSingle();
    if (cErr) return { ok: false, error: cErr.message };
    if (!candidate) return { ok: false, error: "Candidate not found." };

    const listResult = await findOrCreateReturnedLeadsList(supabase);
    if (!listResult.ok) return { ok: false, error: listResult.error };
    const listId = listResult.listId;

    // Insert the new lead row, pre-linked to this candidate so a future
    // Move-to-Pipeline drag resurrects the same candidate row instead
    // of creating a duplicate (the existing convert action checks for
    // converted_to_candidate_id and restores the snapshotted status).
    const { error: insertErr } = await supabase.from("prospects").insert({
      list_id: listId,
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      email: candidate.email,
      phone: candidate.phone,
      industry: candidate.target_industry,
      location: candidate.target_location,
      military_branch: candidate.military_branch,
      rank: candidate.rank,
      mos_or_specialty: candidate.mos_or_specialty,
      clearance: candidate.clearance,
      years_of_service: candidate.years_of_service,
      source: candidate.source ?? "Pipeline return",
      tags: candidate.tags,
      resume_url: candidate.resume_url,
      marketing_consent: candidate.marketing_consent,
      converted_to_candidate_id: candidateId,
      pipeline_stage: "Prospect",
      previous_pipeline_stage: "Candidate",
      snapshot_candidate_status: candidate.status,
    });
    if (insertErr) return { ok: false, error: insertErr.message };

    // Archive the candidate so the kanban hides them.
    const { error: archiveErr } = await supabase
      .from("candidates")
      .update({ status: "Archived" })
      .eq("id", candidateId);
    if (archiveErr) return { ok: false, error: archiveErr.message };

    revalidatePath("/candidates");
    revalidatePath(`/candidates/${candidateId}`);
    revalidatePath("/prospects");
    revalidatePath(`/prospects/${listId}`);
    revalidatePath("/dashboard");
    return { ok: true };
  }

  // Sub-bucket drops just set the candidate's status. The board
  // re-renders and the card snaps to the matching column.
  if (toColumn in SUB_BUCKET_STATUS) {
    const nextStatus = SUB_BUCKET_STATUS[toColumn];
    const s = await setCandidateStatus(candidateId, nextStatus);
    if (!s.ok) return { ok: false, error: s.error };

    // If we just moved out of a job column we no longer want them
    // tagged for that job. Status flips are independent of matches.
    if (fromColumn.startsWith("job:")) {
      const jobId = fromColumn.slice(4);
      const { data: m } = await supabase
        .from("candidate_job_matches")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("job_id", jobId)
        .maybeSingle();
      if (m) await deleteMatch(m.id);
    }
    return { ok: true };
  }

  // Drop into a job column: ensure the candidate has a match for it.
  if (toColumn.startsWith("job:")) {
    const targetJobId = toColumn.slice(4);
    if (fromColumn.startsWith("job:") && fromColumn !== toColumn) {
      const fromJobId = fromColumn.slice(4);
      const { data: prior } = await supabase
        .from("candidate_job_matches")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("job_id", fromJobId)
        .maybeSingle();
      if (prior) await deleteMatch(prior.id);
    }
    const m = await createMatch({
      candidate_id: candidateId,
      job_id: targetJobId,
      match_status: "Potential Match",
      notes: "",
    });
    if (!m.ok) {
      if (/already matched/i.test(m.error)) return { ok: true };
      return { ok: false, error: m.error };
    }
    return { ok: true };
  }

  return { ok: false, error: "Unsupported drop target." };
}

// Direct-click variant of "drag the job-bucket card out of its column"
// - surfaces an X button on each job-bucket card so the recruiter can
// kick a candidate off a single job without dragging. Leaves the
// candidate's pipeline status alone; only the match for THIS job goes
// away.
export async function removeCandidateFromJob(
  candidateId: string,
  jobId: string,
): Promise<Result> {
  if (!candidateId || !jobId) {
    return { ok: false, error: "Missing candidate or job id." };
  }
  const supabase = await createClient();
  const { data: match, error: lookupErr } = await supabase
    .from("candidate_job_matches")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!match) return { ok: true };

  const r = await deleteMatch(match.id);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/candidates");
  return { ok: true };
}
