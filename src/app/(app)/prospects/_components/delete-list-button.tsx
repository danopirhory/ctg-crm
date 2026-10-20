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

import { useCanDelete } from "../../_components/role-context";
import { deleteProspectList } from "../actions";

export function DeleteListButton({
  listId,
  listName,
}: {
  listId: string;
  listName: string;
}) {
  const router = useRouter();
  const canDelete = useCanDelete();
  const [isPending, startTransition] = useTransition();

  if (!canDelete) return null;

  function handleConfirm() {
    startTransition(async () => {
      const r = await deleteProspectList(listId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("List deleted.");
      router.push("/prospects");
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={isPending}>
          <Trash2 className="size-4" aria-hidden />
          Delete list
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{listName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the list and every prospect inside it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
