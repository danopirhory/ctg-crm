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

import { revertCandidateToProspect } from "../actions";

export function RevertCandidateToProspectButton({
  candidateId,
}: {
  candidateId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={isPending}>
          <Undo2 className="size-4" aria-hidden />
          Move back to Leads
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move back to their lead list?</AlertDialogTitle>
          <AlertDialogDescription>
            They&apos;ll leave the active candidates roster and reappear in
            their originating lead list. Notes, matches, placements, and
            their current pipeline status are preserved - moving them back
            into the Candidate Pipeline later restores the status they have
            now.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await revertCandidateToProspect(candidateId);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success("Moved back to Leads.");
                router.push(`/prospects/${r.listId}/${r.prospectId}`);
                router.refresh();
              });
            }}
          >
            Move back
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
