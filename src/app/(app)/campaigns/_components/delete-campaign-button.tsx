"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteCampaign } from "../actions";

// Deletes a campaign (any status) plus its per-recipient send rows and
// attachment files. Suppression entries survive - an unsubscribe stays
// honored even if the campaign that caused it is deleted. Two modes:
//   icon  - trash button for a row on /campaigns
//   label - full button for the campaign detail header (redirects back)
export function DeleteCampaignButton({
  campaignId,
  campaignName,
  status,
  variant = "icon",
}: {
  campaignId: string;
  campaignName: string;
  status: string;
  variant?: "icon" | "label";
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function click(e: React.MouseEvent) {
    e.stopPropagation();
    const warning =
      status === "Draft"
        ? `Delete the draft "${campaignName}"?`
        : `Delete "${campaignName}"? Its send history and stats will be removed (unsubscribes stay honored). This cannot be undone.`;
    if (!confirm(warning)) return;
    startTransition(async () => {
      const r = await deleteCampaign(campaignId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Campaign deleted.");
      if (variant === "label") router.push("/campaigns");
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
      aria-label={`Delete ${campaignName}`}
      title="Delete campaign"
      className="h-7 px-2 text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="size-3.5" aria-hidden />
    </Button>
  );
}
