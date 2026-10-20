"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { saveJobRubric } from "../actions";
import type { RoleRubricEntry } from "@/lib/db/types";

// Per-job rubric editor. Empty rubric → AI infers criteria on the fly;
// a saved rubric pins them so candidates score consistently across runs.
export function RubricEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: RoleRubricEntry[];
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState<RoleRubricEntry[]>(
    initial.length > 0 ? initial : [],
  );
  const [isPending, startTransition] = React.useTransition();

  function update(i: number, patch: Partial<RoleRubricEntry>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function add() {
    setRows((prev) => [...prev, { criterion: "", weight: 3 }]);
  }

  function save() {
    const cleaned = rows
      .map((r) => ({
        criterion: r.criterion.trim(),
        weight: Math.max(1, Math.min(5, Math.round(Number(r.weight) || 0))),
      }))
      .filter((r) => r.criterion.length > 0);
    startTransition(async () => {
      const r = await saveJobRubric(jobId, cleaned);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Rubric saved.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium">Role rubric</p>
          <p className="text-[10px] text-muted-foreground">
            One row per criterion · weight 1-5. Leave empty to let the AI
            infer from the job description.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={add}
            disabled={isPending}
          >
            <Plus className="size-3" aria-hidden /> Add
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={save}
            disabled={isPending}
          >
            <Save className="size-3" aria-hidden />
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded border border-dashed bg-background p-3 text-xs text-muted-foreground">
          No explicit rubric yet - AI will pick its own criteria each time.
        </p>
      ) : (
        <div className="grid gap-1.5">
          {rows.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_72px_28px] items-center gap-2"
            >
              <Input
                value={row.criterion}
                onChange={(e) => update(i, { criterion: e.target.value })}
                placeholder="e.g. Cybersecurity knowledge"
                maxLength={120}
                disabled={isPending}
                className="h-8 text-xs"
              />
              <Input
                type="number"
                min={1}
                max={5}
                value={row.weight}
                onChange={(e) =>
                  update(i, { weight: Number(e.target.value) || 0 })
                }
                disabled={isPending}
                className="h-8 text-xs tabular-nums"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={() => remove(i)}
                disabled={isPending}
                aria-label="Remove criterion"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
