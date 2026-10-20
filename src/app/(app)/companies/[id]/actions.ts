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

export async function addCompanyNote(
  companyId: string,
  note: string,
): Promise<ActionResult> {
  if (!companyId) return { ok: false, error: "Missing company id." };

  const parsed = noteSchema.safeParse(note);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid note.",
    };
  }

  const employee = await getCurrentEmployeeId();
  if ("error" in employee) return { ok: false, error: employee.error };

  const supabase = await createClient();
  const { error } = await supabase.from("company_notes").insert({
    company_id: companyId,
    employee_id: employee.id,
    note: parsed.data,
  });
  if (error) return { ok: false, error: error.message };

  await logActivity({
    verb: "note_added",
    summary: "Note added",
    companyId,
  });

  revalidatePath(`/companies/${companyId}`);
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

export type AddCompanyTaskInput = z.infer<typeof taskInputSchema>;

export async function addCompanyTask(
  companyId: string,
  values: AddCompanyTaskInput,
): Promise<ActionResult> {
  if (!companyId) return { ok: false, error: "Missing company id." };

  const parsed = taskInputSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid task.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title: parsed.data.title,
    description: parsed.data.description || null,
    due_date: parsed.data.due_date || null,
    status: parsed.data.status,
    related_company_id: companyId,
    assigned_to: parsed.data.assigned_to || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/companies/${companyId}`);
  return { ok: true };
}

const statusSchema = z.enum(TASK_STATUSES);

export async function updateCompanyTaskStatus(
  taskId: string,
  status: TaskStatus,
  companyId: string,
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

  if (companyId) revalidatePath(`/companies/${companyId}`);
  return { ok: true };
}

export async function deleteCompanyTask(
  taskId: string,
  companyId: string,
): Promise<ActionResult> {
  if (!taskId) return { ok: false, error: "Missing task id." };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  if (companyId) revalidatePath(`/companies/${companyId}`);
  return { ok: true };
}
