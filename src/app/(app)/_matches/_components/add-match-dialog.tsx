"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { MATCH_STATUSES } from "@/lib/db/constants";
import type { MatchStatus } from "@/lib/db/types";
import type {
  CandidatePickerOption,
  JobPickerOption,
} from "@/lib/db/queries";

import { useCanWrite } from "../../_components/role-context";
import { createMatch } from "../actions";

type Props =
  | { mode: "for-candidate"; candidateId: string; jobs: JobPickerOption[] }
  | { mode: "for-job"; jobId: string; candidates: CandidatePickerOption[] };

const NONE = "_none";

export function AddMatchDialog(props: Props) {
  const canWrite = useCanWrite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [otherId, setOtherId] = useState<string>(NONE);
  const [status, setStatus] = useState<MatchStatus>("Potential Match");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setOtherId(NONE);
    setStatus("Potential Match");
    setNotes("");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (otherId === NONE) {
      toast.error(
        props.mode === "for-candidate" ? "Pick a job." : "Pick a candidate.",
      );
      return;
    }

    const input =
      props.mode === "for-candidate"
        ? {
            candidate_id: props.candidateId,
            job_id: otherId,
            match_status: status,
            notes,
          }
        : {
            candidate_id: otherId,
            job_id: props.jobId,
            match_status: status,
            notes,
          };

    startTransition(async () => {
      const r = await createMatch(input);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Match created.");
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!canWrite) return null;

  const dialogTitle =
    props.mode === "for-candidate"
      ? "Match this candidate to a job"
      : "Match a candidate to this job";
  const dialogDescription =
    props.mode === "for-candidate"
      ? "Pick the role from your jobs list. You can set the initial status and add notes."
      : "Pick the candidate from your pipeline. You can set the initial status and add notes.";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" aria-hidden />
          New match
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          {props.mode === "for-candidate" ? (
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground">Job</label>
              <Select value={otherId} onValueChange={setOtherId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a job…" />
                </SelectTrigger>
                <SelectContent>
                  {props.jobs.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No jobs available.
                    </div>
                  ) : (
                    props.jobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.title}
                        {j.company_name ? ` - ${j.company_name}` : ""}
                        {j.status !== "Open" ? ` (${j.status})` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground">Candidate</label>
              <Select value={otherId} onValueChange={setOtherId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a candidate…" />
                </SelectTrigger>
                <SelectContent>
                  {props.candidates.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No candidates available.
                    </div>
                  ) : (
                    props.candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}
                        {c.email ? ` - ${c.email}` : ""}
                        {c.status !== "New" ? ` (${c.status})` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as MatchStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATCH_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">
              Notes (optional)
            </label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              placeholder="Anything worth recording about this match…"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Create match"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
