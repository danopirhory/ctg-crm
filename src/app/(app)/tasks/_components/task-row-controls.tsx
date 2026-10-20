"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteTask, setTaskStatus } from "../actions";

// Inline complete / reopen / delete controls for one task row.
export function TaskRowControls({
  taskId,
  status,
}: {
  taskId: string;
  status: "Open" | "In Progress" | "Complete" | "Archived";
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? "Something went wrong.");
        return;
      }
      toast.success(msg);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      {status === "Complete" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={isPending}
          onClick={() => run(() => setTaskStatus(taskId, "Open"), "Reopened.")}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Reopen
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={isPending}
          onClick={() =>
            run(() => setTaskStatus(taskId, "Complete"), "Task completed.")
          }
        >
          <Check className="size-3.5" aria-hidden />
          Complete
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
        disabled={isPending}
        onClick={() => {
          if (!confirm("Delete this task permanently?")) return;
          run(() => deleteTask(taskId), "Task deleted.");
        }}
        aria-label="Delete task"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}
