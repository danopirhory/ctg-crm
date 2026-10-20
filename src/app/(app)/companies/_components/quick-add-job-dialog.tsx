"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

import { createJob } from "../../jobs/actions";

// Minimal "add a job to this company" form, opened from a Company card
// on the Clients board. Just the essentials - title, location, notes/
// requirements; status defaults to Open so the new job immediately
// shows up as a column on the Candidates board.
export function QuickAddJobDialog({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const [title, setTitle] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [requirements, setRequirements] = React.useState("");

  function reset() {
    setTitle("");
    setLocation("");
    setRequirements("");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    startTransition(async () => {
      const r = await createJob({
        company_id: companyId,
        title: title.trim(),
        location: location.trim(),
        salary_min: "",
        salary_max: "",
        job_type: "",
        description: "",
        requirements: requirements.trim(),
        status: "Open",
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Job created.");
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
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <Plus className="size-3" aria-hidden /> Job
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New job for {companyName}</DialogTitle>
          <DialogDescription>
            Creates an Open job. It will appear as a column on the
            Candidates board so you can drop candidates into it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">Title</label>
            <Input
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Logistics Manager"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">
              Location <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Austin, TX"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">
              Requirements / notes
              <span className="text-muted-foreground"> (optional)</span>
            </label>
            <Textarea
              rows={3}
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
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
              {isPending ? "Creating…" : "Create job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
