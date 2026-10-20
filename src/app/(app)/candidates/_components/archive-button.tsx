"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
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

import { useIsAdmin } from "../../_components/role-context";
import {
  archiveCandidate,
  deleteCandidate,
  restoreCandidate,
} from "../actions";

export function ArchiveButton({
  candidateId,
  archived,
}: {
  candidateId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [isPending, startTransition] = useTransition();

  if (archived) {
    return (
      <>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const r = await restoreCandidate(candidateId);
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success("Candidate restored.");
              router.refresh();
            });
          }}
        >
          <RotateCcw className="size-4" aria-hidden />
          Restore
        </Button>

        {isAdmin ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isPending}>
                <Trash2 className="size-4" aria-hidden />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Permanently delete this candidate?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the candidate, their notes, tasks, matches, and
                  resume file. It cannot be undone. If they have placement
                  records, delete those first.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => {
                    e.preventDefault();
                    startTransition(async () => {
                      const r = await deleteCandidate(candidateId);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success("Candidate deleted.");
                      router.push("/candidates");
                      router.refresh();
                    });
                  }}
                >
                  Delete forever
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={isPending}>
          <Archive className="size-4" aria-hidden />
          Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this candidate?</AlertDialogTitle>
          <AlertDialogDescription>
            Their record stays in the database, but their status is set to
            Archived and they drop out of the default list view. You can restore
            them later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await archiveCandidate(candidateId);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success("Candidate archived.");
                router.push("/candidates");
                router.refresh();
              });
            }}
          >
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
