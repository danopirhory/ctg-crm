"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { undoPlacement } from "../actions";

// Reverses a placement: restores the job and candidate statuses that
// were captured at placement time, records an audit note on the
// candidate, then deletes the placement row. Admin-only (RLS).
export function UndoPlacementButton({ placementId }: { placementId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={isPending}>
          <Undo2 className="size-4" aria-hidden />
          Undo placement
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo this placement?</AlertDialogTitle>
          <AlertDialogDescription>
            The placement row will be removed. If this was the only
            placement on the job, the job&apos;s status is restored to what
            it was beforehand (or to Open if no snapshot exists). If the
            candidate is currently Placed, they&apos;ll be moved back to
            their previous pipeline status. A timestamped note is added to
            the candidate&apos;s timeline as an audit trail. Other notes,
            tasks, and history stay intact.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await undoPlacement(placementId);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success("Placement undone.");
                router.push("/placements");
                router.refresh();
              });
            }}
          >
            Undo placement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
