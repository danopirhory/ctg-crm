"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/db/activity";
import { getCurrentEmployeeId } from "@/lib/db/queries";
import { TASK_STATUSES } from "@/lib/db/constants";
import type { TaskStatus } from "@/lib/db/types";

type ActionResult = { ok: true } | { ok: false; error: string };

// =====================================================================
// Notes
// =====================================================================
const noteSchema = z
  .string()
  .trim()
  .min(1, "Note can't be empty.")
  .max(5000, "Note is too long (max 5000 characters).");

export async function addCandidateNote(
  candidateId: string,
  note: string,
): Promise<ActionResult> {
  if (!candidateId) return { ok: false, error: "Missing candidate id." };

  const parsed = noteSchema.safeParse(note);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note." };
  }

  const employee = await getCurrentEmployeeId();
  if ("error" in employee) return { ok: false, error: employee.error };

  const supabase = await createClient();

  // Cross-link to the originating prospect (if any) so the note shows up
  // on both the candidate and prospect detail pages.
  const { data: linked } = await supabase
    .from("prospects")
    .select("id, list_id")
    .eq("converted_to_candidate_id", candidateId)
    .maybeSingle();

  const { error } = await supabase.from("candidate_notes").insert({
    candidate_id: candidateId,
    prospect_id: linked?.id ?? null,
    employee_id: employee.id,
    note: parsed.data,
  });
  if (error) return { ok: false, error: error.message };

  await logActivity({
    verb: "note_added",
    summary: "Note added",
    candidateId,
    prospectId: linked?.id ?? null,
  });

  revalidatePath(`/candidates/${candidateId}`);
  if (linked) revalidatePath(`/prospects/${linked.list_id}/${linked.id}`);
  return { ok: true };
}

// =====================================================================
// Tasks
// =====================================================================
const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(2000),
  due_date: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v),
      "Invalid due date.",
    ),
  status: z.enum(TASK_STATUSES),
  assigned_to: z.string().trim(),
});

export type AddTaskInput = z.infer<typeof taskInputSchema>;

export async function addCandidateTask(
  candidateId: string,
  values: AddTaskInput,
): Promise<ActionResult> {
  if (!candidateId) return { ok: false, error: "Missing candidate id." };

  const parsed = taskInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid task." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title: parsed.data.title,
    description: parsed.data.description || null,
    due_date: parsed.data.due_date || null,
    status: parsed.data.status,
    related_candidate_id: candidateId,
    assigned_to: parsed.data.assigned_to || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true };
}

const statusSchema = z.enum(TASK_STATUSES);

export async function updateCandidateTaskStatus(
  taskId: string,
  status: TaskStatus,
  candidateId: string,
): Promise<ActionResult> {
  if (!taskId) return { ok: false, error: "Missing task id." };

  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: parsed.data })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  if (candidateId) revalidatePath(`/candidates/${candidateId}`);
  return { ok: true };
}

export async function deleteCandidateTask(
  taskId: string,
  candidateId: string,
): Promise<ActionResult> {
  if (!taskId) return { ok: false, error: "Missing task id." };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  if (candidateId) revalidatePath(`/candidates/${candidateId}`);
  return { ok: true };
}
