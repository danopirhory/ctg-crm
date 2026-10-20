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

import { deleteCompany } from "../actions";

// Shown next to Restore when a company is Inactive (archived). RLS
// only allows Admins to actually execute the delete; the caller wraps
// this in <RoleGate allow={["Admin"]}> so the button doesn't render
// for Recruiters/Viewers.
export function DeleteCompanyButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={isPending}>
          <Trash2 className="size-4" aria-hidden />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete this company?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the company and its company-side notes/tasks. It
            cannot be undone. If the company still has jobs or placement
            records the delete will be blocked - clear those first.
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
                const r = await deleteCompany(companyId);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success("Company deleted.");
                router.push("/companies");
                router.refresh();
              });
            }}
          >
            Delete forever
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
