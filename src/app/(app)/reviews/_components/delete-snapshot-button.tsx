"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteSnapshot } from "../actions";

// Deletes a frozen snapshot. RLS only allows Admins; everyone else gets
// the friendly error from the action. Two render modes:
//   icon  - trash button for a table row on /reviews
//   label - full button for the snapshot detail header (redirects back
//           to the library after deleting the page you're standing on)
export function DeleteSnapshotButton({
  snapshotId,
  snapshotLabel,
  variant = "icon",
}: {
  snapshotId: string;
  snapshotLabel: string | null;
  variant?: "icon" | "label";
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function click(e: React.MouseEvent) {
    e.stopPropagation();
    const name = snapshotLabel ? `"${snapshotLabel}"` : "this snapshot";
    if (
      !confirm(
        `Permanently delete ${name}? This cannot be undone - the frozen document and its PDF will be gone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await deleteSnapshot(snapshotId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Snapshot deleted.");
      if (variant === "label") {
        router.push("/reviews");
      }
      router.refresh();
    });
  }

  if (variant === "label") {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={click}
        className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
      >
        <Trash2 className="size-4" aria-hidden />
        {isPending ? "Deleting…" : "Delete"}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={click}
      aria-label="Delete snapshot"
      title="Delete snapshot"
      className="h-7 px-2 text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="size-3.5" aria-hidden />
    </Button>
  );
}
