"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/db/activity";
import { getCurrentEmployeeId, getCompanyReviewDocument } from "@/lib/db/queries";
import {
  generateCandidateJobReview,
  generateCompanyReviewNarrative,
  REVIEW_DEFAULT_MODEL,
} from "@/lib/ai/review";
import { extractResumeText } from "@/lib/ai/resume-text";
import type { ReviewSnapshotPayload, RoleRubricEntry } from "@/lib/db/types";

// Dedupe-union string[] across multiple reviews (case-insensitive, but
// preserve the casing of the first occurrence).
function mergeBullets(rows: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    for (const b of row) {
      const k = b.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
  }
  return out;
}

// =====================================================================
// Candidate Review server actions.
// All paths in this file write only to the new tables introduced in
// migration 0015 (candidate_job_review + candidate_review_snapshot)
// and to jobs.role_rubric. They never touch the pipeline / matches /
// notes / placements flows.
// =====================================================================

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

async function ensureActiveEmployee(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_active_employee");
  if (error) return error.message;
  if (!data) return "You are not an active employee.";
  return null;
}

// ---------- Per-job rubric ----------

const rubricSchema = z.array(
  z.object({
    criterion: z.string().trim().min(1, "Criterion required").max(120),
    weight: z.number().int().min(1).max(5),
  }),
);

export async function saveJobRubric(
  jobId: string,
  rubric: RoleRubricEntry[],
): Promise<ActionResult> {
  if (!jobId) return { ok: false, error: "Missing job id." };
  const parsed = rubricSchema.safeParse(rubric);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid rubric.",
    };
  }
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };
  const supabase = await createClient();
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .update({ role_rubric: parsed.data })
    .eq("id", jobId)
    .select("company_id")
    .single();
  if (jobErr) return { ok: false, error: jobErr.message };
  revalidatePath(`/companies/${job.company_id}/review`);
  return { ok: true };
}

// ---------- Generate / Regenerate ----------

export async function generateReview(
  candidateId: string,
  jobId: string,
): Promise<ActionResult> {
  if (!candidateId || !jobId) {
    return { ok: false, error: "Missing candidate or job id." };
  }
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();
  const [
    { data: candidate, error: candErr },
    { data: job, error: jobErr },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, first_name, last_name, military_branch, rank, mos_or_specialty, clearance, years_of_service, target_industry, target_location, source, tags, resume_url",
      )
      .eq("id", candidateId)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select(
        "id, title, location, description, requirements, role_rubric, company_id, company:companies(company_name)",
      )
      .eq("id", jobId)
      .maybeSingle(),
  ]);
  if (candErr) return { ok: false, error: candErr.message };
  if (jobErr) return { ok: false, error: jobErr.message };
  if (!candidate) return { ok: false, error: "Candidate not found." };
  if (!job) return { ok: false, error: "Job not found." };

  const company = Array.isArray(job.company) ? job.company[0] : job.company;
  const companyName = company?.company_name ?? "";

  // 1. Pull resume text. If we can't, mark the review row pending-resume
  //    so the UI shows the badge instead of erroring.
  const resume = await extractResumeText(candidate.resume_url);
  if (!resume.ok) {
    await upsertReview(supabase, {
      candidate_id: candidateId,
      job_id: jobId,
      state: "pending-resume",
      background: [],
      strengths: [],
      areas_to_validate: [],
      interview_focus: [],
      role_fit_score: null,
      rubric_scores: null,
      ai_model: null,
      ai_generated_at: null,
    });
    revalidatePath(`/companies/${job.company_id}/review`);
    return { ok: false, error: resume.error };
  }

  // 2. Run the AI.
  const rubric: RoleRubricEntry[] = Array.isArray(job.role_rubric)
    ? (job.role_rubric as RoleRubricEntry[])
    : [];
  const ai = await generateCandidateJobReview({
    candidate: {
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      location: candidate.target_location,
      military_branch: candidate.military_branch,
      rank: candidate.rank,
      mos_or_specialty: candidate.mos_or_specialty,
      clearance: candidate.clearance,
      years_of_service:
        candidate.years_of_service != null
          ? Number(candidate.years_of_service)
          : null,
      target_industry: candidate.target_industry,
      target_location: candidate.target_location,
      source: candidate.source,
      tags: candidate.tags ?? [],
    },
    job: {
      title: job.title,
      company_name: companyName,
      location: job.location,
      description: job.description,
      requirements: job.requirements,
    },
    rubric,
    resumeText: resume.text,
  });
  if (!ai.ok) return { ok: false, error: ai.error };

  // 3. Persist.
  await upsertReview(supabase, {
    candidate_id: candidateId,
    job_id: jobId,
    state: "ready",
    background: ai.data.background,
    strengths: ai.data.strengths,
    areas_to_validate: ai.data.areas_to_validate,
    interview_focus: ai.data.interview_focus,
    role_fit_score: ai.data.role_fit_score,
    rubric_scores: ai.data.rubric_scores,
    ai_model: ai.model,
    ai_generated_at: new Date().toISOString(),
  });

  await logActivity({
    verb: "review_generated",
    summary: `AI review generated for ${job.title}`,
    candidateId,
    companyId: job.company_id,
    jobId,
    metadata: { model: ai.model, role_fit_score: ai.data.role_fit_score },
  });

  revalidatePath(`/companies/${job.company_id}/review`);
  return { ok: true };
}

// The "Generate analysis" button on the live review document. Runs the
// full report end-to-end on a single click - meant to be triggered once
// the recruiter has all candidates + resumes lined up for the open
// roles at one company.
//
// Two phases:
//   1. For every (candidate, job) match that has a resume, run / refresh
//      the per-row review. Best-effort; per-row failures don't stop the
//      run and are surfaced in the summary.
//   2. Once all reviews are persisted, ask the AI to draft the three
//      company-level narrative panels from the merged bullets +
//      rankings. Persisted to companies.review_* columns.
//
// `generateAllReviewsForCompany` is kept as a back-compat alias for any
// callers still on the older name.
export async function generateAnalysisForCompany(
  companyId: string,
): Promise<
  | {
      ok: true;
      generated: number;
      failed: number;
      firstError: string | null;
      narrativeOk: boolean;
      narrativeError: string | null;
    }
  | { ok: false; error: string }
> {
  if (!companyId) return { ok: false, error: "Missing company id." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const { data: doc, error } = await getCompanyReviewDocument(companyId);
  if (error) return { ok: false, error };
  if (!doc) return { ok: false, error: "Company not found." };

  let generated = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (const candidate of doc.candidates) {
    for (const review of candidate.reviews) {
      const r = await generateReview(candidate.id, review.job_id);
      if (r.ok) generated += 1;
      else {
        failed += 1;
        if (!firstError) firstError = r.error;
      }
    }
  }

  const n = await regenerateCompanyNarrative(companyId);
  return {
    ok: true,
    generated,
    failed,
    firstError,
    narrativeOk: n.ok,
    narrativeError: n.ok ? null : n.error,
  };
}

export const generateAllReviewsForCompany = generateAnalysisForCompany;

// Flat list of every (candidate, job) pair on the company's review
// surface. The Generate-analysis button fetches this first, then runs
// generateReview() per pair from the client so each AI call is its own
// short server-action invocation - no single long request to time out,
// live progress in the UI, and partial results persist if the tab
// closes mid-run.
export type AnalysisTarget = {
  candidateId: string;
  jobId: string;
  candidateName: string;
  jobTitle: string;
  hasResume: boolean;
};

export async function listAnalysisTargets(
  companyId: string,
): Promise<
  { ok: true; targets: AnalysisTarget[] } | { ok: false; error: string }
> {
  if (!companyId) return { ok: false, error: "Missing company id." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const { data: doc, error } = await getCompanyReviewDocument(companyId);
  if (error) return { ok: false, error };
  if (!doc) return { ok: false, error: "Company not found." };

  const jobTitleById = new Map(doc.jobs.map((j) => [j.id, j.title] as const));
  const targets: AnalysisTarget[] = [];
  for (const c of doc.candidates) {
    for (const r of c.reviews) {
      targets.push({
        candidateId: c.id,
        jobId: r.job_id,
        candidateName: `${c.first_name} ${c.last_name}`.trim(),
        jobTitle: jobTitleById.get(r.job_id) ?? "Unknown role",
        hasResume: Boolean(c.resume_url),
      });
    }
  }
  return { ok: true, targets };
}

// Run only the narrative step. Used by the "Refresh narrative" affordance
// on the live document - handy when the recruiter has tweaked individual
// candidate reviews and wants the top/bottom panels to catch up without
// regenerating every per-(candidate, job) review again.
export async function regenerateCompanyNarrative(
  companyId: string,
): Promise<ActionResult> {
  if (!companyId) return { ok: false, error: "Missing company id." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const { data: doc, error } = await getCompanyReviewDocument(companyId);
  if (error) return { ok: false, error };
  if (!doc) return { ok: false, error: "Company not found." };

  if (doc.candidates.length === 0) {
    return {
      ok: false,
      error:
        "No candidates matched to this company's jobs yet. Match candidates from the pipeline first.",
    };
  }

  const jobTitleById = new Map(doc.jobs.map((j) => [j.id, j.title] as const));

  // Build the AI input by collapsing each candidate's per-job reviews
  // into the same merged bullet sets the table shows on screen.
  const candidates = doc.candidates.map((c) => {
    const reviews = c.reviews;
    return {
      name: `${c.first_name} ${c.last_name}`.trim(),
      location: c.location,
      background: mergeBullets(reviews.map((r) => r.background)),
      strengths: mergeBullets(reviews.map((r) => r.strengths)),
      areas_to_validate: mergeBullets(reviews.map((r) => r.areas_to_validate)),
      interview_focus: mergeBullets(reviews.map((r) => r.interview_focus)),
      role_fits: reviews.map((r) => ({
        job_title: jobTitleById.get(r.job_id) ?? "Unknown role",
        score: r.role_fit_score,
      })),
    };
  });

  const candidateNameById = new Map(
    doc.candidates.map(
      (c) => [c.id, `${c.first_name} ${c.last_name}`.trim()] as const,
    ),
  );
  const rankings = doc.jobs.map((j) => ({
    job_title: j.title,
    ordered_names: (doc.rankings[j.id] ?? [])
      .map((cid) => candidateNameById.get(cid))
      .filter((n): n is string => Boolean(n)),
  }));

  const ai = await generateCompanyReviewNarrative({
    company: {
      company_name: doc.company.company_name,
      industry: doc.company.industry,
    },
    jobs: doc.jobs.map((j) => ({ id: j.id, title: j.title })),
    candidates,
    rankings,
  });
  if (!ai.ok) return { ok: false, error: ai.error };

  const supabase = await createClient();
  const { error: updateErr } = await supabase
    .from("companies")
    .update({
      review_key_takeaways: ai.data.key_takeaways,
      review_next_steps: ai.data.next_steps,
      review_notes: ai.data.notes,
      review_narrative_generated_at: new Date().toISOString(),
      review_narrative_ai_model: ai.model,
    })
    .eq("id", companyId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath(`/companies/${companyId}/review`);
  return { ok: true };
}

// ---------- Manual edits ----------

const editSchema = z.object({
  background: z.array(z.string().trim().max(80)).max(8).optional(),
  strengths: z.array(z.string().trim().max(80)).max(8).optional(),
  areas_to_validate: z.array(z.string().trim().max(80)).max(8).optional(),
  interview_focus: z.array(z.string().trim().max(80)).max(8).optional(),
  role_fit_score: z.number().min(0).max(3).optional(),
});
export type EditReviewInput = z.infer<typeof editSchema>;

export async function editReview(
  candidateId: string,
  jobId: string,
  patch: EditReviewInput,
): Promise<ActionResult> {
  if (!candidateId || !jobId) {
    return { ok: false, error: "Missing candidate or job id." };
  }
  const parsed = editSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid edit.",
    };
  }
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const employee = await getCurrentEmployeeId();
  const employeeId = "id" in employee ? employee.id : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidate_job_review")
    .update({
      ...(parsed.data.background !== undefined
        ? { background: parsed.data.background.filter(Boolean) }
        : {}),
      ...(parsed.data.strengths !== undefined
        ? { strengths: parsed.data.strengths.filter(Boolean) }
        : {}),
      ...(parsed.data.areas_to_validate !== undefined
        ? {
            areas_to_validate: parsed.data.areas_to_validate.filter(Boolean),
          }
        : {}),
      ...(parsed.data.interview_focus !== undefined
        ? { interview_focus: parsed.data.interview_focus.filter(Boolean) }
        : {}),
      ...(parsed.data.role_fit_score !== undefined
        ? { role_fit_score: parsed.data.role_fit_score }
        : {}),
      state: "manual",
      edited_at: new Date().toISOString(),
      edited_by: employeeId,
    })
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId);
  if (error) return { ok: false, error: error.message };

  const { data: job } = await supabase
    .from("jobs")
    .select("company_id")
    .eq("id", jobId)
    .maybeSingle();
  if (job) revalidatePath(`/companies/${job.company_id}/review`);
  return { ok: true };
}

// ---------- Narrative panel manual edits ----------

const narrativeFieldSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(8);

const narrativePatchSchema = z.object({
  key_takeaways: narrativeFieldSchema.optional(),
  next_steps: narrativeFieldSchema.optional(),
  notes: narrativeFieldSchema.optional(),
});

export type NarrativePatch = z.infer<typeof narrativePatchSchema>;

// Recruiter override for the AI-drafted callout panels. Sends only the
// field being edited; generated_at / ai_model stay as-is so the footer
// still reflects the last AI pass.
export async function editCompanyNarrative(
  companyId: string,
  patch: NarrativePatch,
): Promise<ActionResult> {
  if (!companyId) return { ok: false, error: "Missing company id." };
  const parsed = narrativePatchSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid edit.",
    };
  }
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      ...(parsed.data.key_takeaways !== undefined
        ? { review_key_takeaways: parsed.data.key_takeaways }
        : {}),
      ...(parsed.data.next_steps !== undefined
        ? { review_next_steps: parsed.data.next_steps }
        : {}),
      ...(parsed.data.notes !== undefined
        ? { review_notes: parsed.data.notes }
        : {}),
    })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/companies/${companyId}/review`);
  return { ok: true };
}

// ---------- Snapshot ----------

export async function takeSnapshot(
  companyId: string,
  label: string,
): Promise<ActionResult<{ id: string }>> {
  if (!companyId) return { ok: false, error: "Missing company id." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const { data: doc, error } = await getCompanyReviewDocument(companyId);
  if (error) return { ok: false, error };
  if (!doc) return { ok: false, error: "Company not found." };

  const employee = await getCurrentEmployeeId();
  const employeeId = "id" in employee ? employee.id : null;

  // Build the immutable payload - explicit copy so the snapshot never
  // depends on the live row shape changing later.
  const payload: ReviewSnapshotPayload = {
    company: {
      id: doc.company.id,
      company_name: doc.company.company_name,
      industry: doc.company.industry,
      location: doc.company.location,
    },
    narrative: {
      key_takeaways: doc.narrative.key_takeaways,
      next_steps: doc.narrative.next_steps,
      notes: doc.narrative.notes,
      generated_at: doc.narrative.generated_at,
      ai_model: doc.narrative.ai_model,
    },
    jobs: doc.jobs.map((j) => ({
      id: j.id,
      title: j.title,
      location: j.location,
      rubric: j.role_rubric,
    })),
    candidates: doc.candidates.map((c) => ({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      location: c.location,
      rank: c.rank,
      military_branch: c.military_branch,
      reviews: c.reviews.map((r) => ({
        job_id: r.job_id,
        state: r.state,
        background: r.background,
        strengths: r.strengths,
        areas_to_validate: r.areas_to_validate,
        interview_focus: r.interview_focus,
        role_fit_score: r.role_fit_score,
        rubric_scores: r.rubric_scores,
      })),
    })),
    rankings: doc.rankings,
    ai_model: REVIEW_DEFAULT_MODEL,
    taken_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { data, error: insertErr } = await supabase
    .from("candidate_review_snapshot")
    .insert({
      company_id: companyId,
      label: label.trim() || null,
      payload,
      ai_model: REVIEW_DEFAULT_MODEL,
      taken_by: employeeId,
    })
    .select("id")
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  await logActivity({
    verb: "snapshot_taken",
    summary: `Review snapshot taken${label.trim() ? `: "${label.trim()}"` : ""}`,
    companyId,
    metadata: { snapshot_id: data.id },
  });

  revalidatePath("/reviews");
  revalidatePath(`/companies/${companyId}/review`);
  return { ok: true, id: data.id };
}

export async function deleteSnapshot(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing snapshot id." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };
  const supabase = await createClient();
  const { error } = await supabase
    .from("candidate_review_snapshot")
    .delete()
    .eq("id", id);
  if (error) {
    if (/row.level.security|permission|policy/i.test(error.message)) {
      return { ok: false, error: "Only an Admin can delete a snapshot." };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/reviews");
  return { ok: true };
}

// ---------- Form-action redirects (used by the snapshot dialog) ----------

export async function takeSnapshotAndRedirect(
  formData: FormData,
): Promise<void> {
  const companyId = String(formData.get("companyId") ?? "");
  const label = String(formData.get("label") ?? "");
  const r = await takeSnapshot(companyId, label);
  if (!r.ok) throw new Error(r.error);
  redirect(`/reviews/${r.id}`);
}

// ---------- Internal helper ----------

type UpsertRow = {
  candidate_id: string;
  job_id: string;
  state: "pending-resume" | "ready" | "manual";
  background: string[];
  strengths: string[];
  areas_to_validate: string[];
  interview_focus: string[];
  role_fit_score: number | null;
  rubric_scores:
    | { criterion: string; score: number; weight: number }[]
    | null;
  ai_model: string | null;
  ai_generated_at: string | null;
};

async function upsertReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: UpsertRow,
) {
  await supabase
    .from("candidate_job_review")
    .upsert(row, { onConflict: "candidate_id,job_id" });
}
