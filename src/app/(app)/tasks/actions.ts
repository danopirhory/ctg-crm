"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/db/activity";
import { TASK_STATUSES } from "@/lib/db/constants";
import type { TaskStatus } from "@/lib/db/types";

type ActionResult = { ok: true } | { ok: false; error: string };

async function ensureActiveEmployee(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_active_employee");
  if (error) return error.message;
  if (!data) return "You are not an active employee.";
  return null;
}

function revalidateTaskSurfaces() {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().trim().max(5000),
  due_date: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Invalid date"),
  assigned_to: z.string().trim(), // employee id or "" for unassigned
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export async function createTask(input: CreateTaskInput): Promise<ActionResult> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title: v.title,
    description: v.description || null,
    due_date: v.due_date || null,
    assigned_to: v.assigned_to || null,
    status: "Open",
  });
  if (error) return { ok: false, error: error.message };

  await logActivity({
    verb: "task_created",
    summary: `Task created: ${v.title}`,
  });

  revalidateTaskSurfaces();
  return { ok: true };
}

export async function setTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<ActionResult> {
  if (!taskId) return { ok: false, error: "Missing task id." };
  if (!TASK_STATUSES.includes(status)) {
    return { ok: false, error: "Invalid status." };
  }
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("title, related_candidate_id, related_company_id")
    .eq("id", taskId)
    .maybeSingle();
  const { error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  if (status === "Complete" && task) {
    await logActivity({
      verb: "task_completed",
      summary: `Task completed: ${task.title}`,
      candidateId: task.related_candidate_id,
      companyId: task.related_company_id,
    });
  }

  revalidateTaskSurfaces();
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  if (!taskId) return { ok: false, error: "Missing task id." };
  const gate = await ensureActiveEmployee();
  if (gate) return { ok: false, error: gate };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  revalidateTaskSurfaces();
  return { ok: true };
}
