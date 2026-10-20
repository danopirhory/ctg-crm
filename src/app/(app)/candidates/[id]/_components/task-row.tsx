"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Trash2, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { TASK_STATUSES } from "@/lib/db/constants";
import type { TaskStatus } from "@/lib/db/types";
import type { CandidateTask } from "@/lib/db/queries";

import {
  useCanDelete,
  useCanWrite,
} from "../../../_components/role-context";
import {
  deleteCandidateTask,
  updateCandidateTaskStatus,
} from "../actions";

function formatDate(iso: string | null) {
  if (!iso) return null;
  // due_date is a `date` column → 'YYYY-MM-DD'. Treat as local to avoid TZ
  // off-by-one when displaying.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const COMPLETED: TaskStatus[] = ["Complete", "Archived"];

export function TaskRow({
  task,
  candidateId,
}: {
  task: CandidateTask;
  candidateId: string;
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const canDelete = useCanDelete();
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [isPending, startTransition] = useTransition();

  const dimmed = COMPLETED.includes(status);

  function changeStatus(next: string) {
    const nextStatus = next as TaskStatus;
    const prev = status;
    setStatus(nextStatus);
    startTransition(async () => {
      const r = await updateCandidateTaskStatus(
        task.id,
        nextStatus,
        candidateId,
      );
      if (!r.ok) {
        toast.error(r.error);
        setStatus(prev);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("Delete this task?")) return;
    startTransition(async () => {
      const r = await deleteCandidateTask(task.id, candidateId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Task deleted.");
      router.refresh();
    });
  }

  return (
    <div
      className={`grid gap-2 rounded-md border p-3 ${dimmed ? "bg-muted/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <p
            className={`text-sm font-medium ${dimmed ? "text-muted-foreground line-through" : ""}`}
          >
            {task.title}
          </p>
          {task.description ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {task.description}
            </p>
          ) : null}
        </div>
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete task"
            disabled={isPending}
            onClick={handleDelete}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Calendar className="size-3.5" aria-hidden />
          {formatDate(task.due_date) ?? "No due date"}
        </span>
        <span className="inline-flex items-center gap-1">
          <User className="size-3.5" aria-hidden />
          {task.assigned
            ? `${task.assigned.first_name} ${task.assigned.last_name}`
            : "Unassigned"}
        </span>
        <Select
          value={status}
          onValueChange={changeStatus}
          disabled={isPending || !canWrite}
        >
          <SelectTrigger size="sm" className="h-7 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
