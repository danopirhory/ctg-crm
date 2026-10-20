"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { deleteProspect } from "../actions";

// Inline row delete. RLS allows Admin only; non-Admins don't see it.
// Notes that are shared with a downstream candidate stay intact -
// the action detaches them from the lead before deletion.
export function DeleteProspectButton({
  prospectId,
  displayName,
  redirectTo,
  label,
}: {
  prospectId: string;
  displayName: string;
  /** If set, navigate here after a successful delete (e.g. back to the list). */
  redirectTo?: string;
  /** If set, render a full labeled button instead of the icon-only control. */
  label?: string;
}) {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [isPending, startTransition] = useTransition();

  if (!isAdmin) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {label ? (
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isPending}
          >
            <Trash2 className="size-4" aria-hidden />
            {label}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            disabled={isPending}
            aria-label={`Delete ${displayName}`}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {displayName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Removes this lead from the list permanently. If they&apos;ve
            been promoted to the Candidate Pipeline, the candidate record
            and any shared notes stay intact - only the lead-list entry
            goes away. This cannot be undone.
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
                const r = await deleteProspect(prospectId);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success("Lead deleted.");
                if (redirectTo) router.push(redirectTo);
                router.refresh();
              });
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
