"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { saveStructuredNotes, structureNotes } from "../../../ai-actions";
import type { StructuredNotes } from "@/lib/ai/assist";

// Paste-notes structurer (AI Notetaker lite): raw call scribbles in,
// clean summary + bullets + follow-up tasks out.
export function AiNotesButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [raw, setRaw] = React.useState("");
  const [result, setResult] = React.useState<StructuredNotes | null>(null);
  const [createTasks, setCreateTasks] = React.useState(true);
  const [isPending, startTransition] = React.useTransition();

  function reset() {
    setRaw("");
    setResult(null);
    setCreateTasks(true);
  }

  function generate() {
    startTransition(async () => {
      const r = await structureNotes(raw);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setResult(r.notes);
    });
  }

  function save() {
    if (!result) return;
    startTransition(async () => {
      const r = await saveStructuredNotes({
        candidateId,
        notes: result,
        createTasks: createTasks && result.action_items.length > 0,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.tasksCreated > 0
          ? `Note saved · ${r.tasksCreated} task${r.tasksCreated === 1 ? "" : "s"} created.`
          : "Note saved.",
      );
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Sparkles className="size-3.5" aria-hidden />
          Structure call notes
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Structure call notes</DialogTitle>
          <DialogDescription>
            Paste raw notes from a call. AI distills them into a summary,
            key points, and follow-up tasks - nothing saves until you
            confirm.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="grid gap-3">
            <Textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={10}
              placeholder={"left voicemail tues… called back, wants 95k min, can't relocate before june, send resume to the client, follow up after his terminal leave starts…"}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" onClick={generate} disabled={isPending}>
                {isPending ? "Structuring…" : "Structure with AI"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Summary
              </h3>
              <p className="text-sm">{result.summary}</p>
            </div>
            <div className="grid gap-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Key points
              </h3>
              <ul className="grid list-disc gap-0.5 pl-5 text-sm">
                {result.key_points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            {result.action_items.length > 0 ? (
              <div className="grid gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Follow-ups
                </h3>
                <ul className="grid list-disc gap-0.5 pl-5 text-sm">
                  {result.action_items.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
                <Label className="flex items-center gap-2 text-xs font-normal">
                  <Checkbox
                    checked={createTasks}
                    onCheckedChange={(v) => setCreateTasks(v === true)}
                  />
                  Create these as tasks assigned to me
                </Label>
              </div>
            ) : null}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setResult(null)}
                disabled={isPending}
              >
                Back
              </Button>
              <Button type="button" onClick={save} disabled={isPending}>
                {isPending ? "Saving…" : "Save note"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
