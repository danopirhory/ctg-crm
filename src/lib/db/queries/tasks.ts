import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "../types";

import { fail, type Result } from "./shared";

// =====================================================================
// Tasks hub - the /tasks management surface. The dashboard widget uses
// the lighter listUpcomingTasks in ./dashboard; this one powers full
// management (all statuses, assignee info, linked records).
// =====================================================================

export type TaskHubItem = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  assigned: { id: string; first_name: string; last_name: string } | null;
  candidate: { id: string; first_name: string; last_name: string } | null;
  company: { id: string; company_name: string } | null;
};

export type TaskHubFilter = "open" | "complete" | "all";

export async function listAllTasks(
  filter: TaskHubFilter = "open",
): Promise<Result<TaskHubItem[]>> {
  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select(
      `id, title, description, due_date, status, created_at,
       assigned:employees ( id, first_name, last_name ),
       candidate:candidates ( id, first_name, last_name ),
       company:companies ( id, company_name )`,
    )
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (filter === "open") {
    query = query.in("status", ["Open", "In Progress"]);
  } else if (filter === "complete") {
    query = query.eq("status", "Complete");
  } else {
    query = query.neq("status", "Archived");
  }

  const { data, error } = await query;
  if (error) return fail([], error.message);

  const normalized: TaskHubItem[] = (data ?? []).map((r) => {
    const assigned = Array.isArray(r.assigned)
      ? (r.assigned[0] ?? null)
      : r.assigned;
    const candidate = Array.isArray(r.candidate)
      ? (r.candidate[0] ?? null)
      : r.candidate;
    const company = Array.isArray(r.company)
      ? (r.company[0] ?? null)
      : r.company;
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      due_date: r.due_date,
      status: r.status,
      created_at: r.created_at,
      assigned,
      candidate,
      company,
    };
  });
  return { data: normalized, error: null };
}
