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

import { revertCompanyToProspect } from "../actions";

export function RevertCompanyToProspectButton({
  companyId,
}: {
  companyId: string;
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
            They&apos;ll leave the active companies roster and reappear in
            their originating lead list. Notes, jobs, placements, and their
            current company status are preserved - moving them back into the
            Employer Pipeline later restores the status they have now.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await revertCompanyToProspect(companyId);
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
