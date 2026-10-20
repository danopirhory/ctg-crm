"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { TASK_STATUSES } from "@/lib/db/constants";
import type { TaskStatus } from "@/lib/db/types";
import type { ActiveEmployee } from "@/lib/db/queries";

import { useCanWrite } from "../../../_components/role-context";
import { addCandidateTask } from "../actions";

const UNASSIGNED = "_unassigned";

export function AddTaskForm({
  candidateId,
  employees,
}: {
  candidateId: string;
  employees: ActiveEmployee[];
}) {
  const canWrite = useCanWrite();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<TaskStatus>("Open");
  const [assignedTo, setAssignedTo] = useState<string>(UNASSIGNED);

  function reset() {
    setTitle("");
    setDescription("");
    setDueDate("");
    setStatus("Open");
    setAssignedTo(UNASSIGNED);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    startTransition(async () => {
      const r = await addCandidateTask(candidateId, {
        title,
        description,
        due_date: dueDate,
        status,
        assigned_to: assignedTo === UNASSIGNED ? "" : assignedTo,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Task added.");
      reset();
      router.refresh();
    });
  }

  if (!canWrite) return null;

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <Input
        placeholder="Task title (e.g. Follow up on resume)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        disabled={isPending}
        required
      />
      <Textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        maxLength={2000}
        disabled={isPending}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="task-due-date">
            Due date
          </label>
          <Input
            id="task-due-date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as TaskStatus)}
            disabled={isPending}
          >
            <SelectTrigger>
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
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Assigned to</label>
          <Select
            value={assignedTo}
            onValueChange={setAssignedTo}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !title.trim()}>
          {isPending ? "Adding…" : "Add task"}
        </Button>
      </div>
    </form>
  );
}
