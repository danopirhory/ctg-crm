"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw } from "lucide-react";
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
import { archiveCompany, restoreCompany } from "../actions";
import { DeleteCompanyButton } from "./delete-company-button";

export function CompanyArchiveButton({
  companyId,
  archived,
}: {
  companyId: string;
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
              const r = await restoreCompany(companyId);
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success("Company restored.");
              router.refresh();
            });
          }}
        >
          <RotateCcw className="size-4" aria-hidden />
          Restore
        </Button>
        {isAdmin ? <DeleteCompanyButton companyId={companyId} /> : null}
      </>
    );
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={isPending}>
            <Archive className="size-4" aria-hidden />
            Archive
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this company?</AlertDialogTitle>
            <AlertDialogDescription>
              Their record stays in the database, but their status is set to
              Inactive. You can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const r = await archiveCompany(companyId);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success("Company archived.");
                  router.push("/companies");
                  router.refresh();
                });
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {isAdmin ? <DeleteCompanyButton companyId={companyId} /> : null}
    </>
  );
}
