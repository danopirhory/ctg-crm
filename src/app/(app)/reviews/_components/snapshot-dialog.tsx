"use client";

import { useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { takeSnapshot } from "../actions";
import { useRouter } from "next/navigation";

// Freeze the current live document into the snapshots library. We use a
// dialog (not a server form action) so we can toast the success and
// navigate to the new snapshot via router.push - feels nicer than a
// full reload.
export function SnapshotDialog({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const r = await takeSnapshot(companyId, label);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Snapshot saved.");
      setOpen(false);
      setLabel("");
      router.push(`/reviews/${r.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Camera className="size-4" aria-hidden />
          Snapshot
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save a snapshot</DialogTitle>
          <DialogDescription>
            Freezes the current document - candidates, scores, rubrics,
            rankings - into an immutable record. Use the label to make it
            easy to find later (e.g. &quot;Before final interviews&quot;).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="label">
              Label <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Before final interviews"
              maxLength={200}
              disabled={isPending}
              autoFocus
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
              {isPending ? "Saving…" : "Save snapshot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
