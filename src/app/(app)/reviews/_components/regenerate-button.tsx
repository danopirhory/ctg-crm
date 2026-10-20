"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { generateReview } from "../actions";

// Single-row "Regenerate this review" trigger. When a review row is
// pending-resume, this is the only path to convert it to a real review.
export function RegenerateReviewButton({
  candidateId,
  jobId,
  state,
}: {
  candidateId: string;
  jobId: string;
  state: "pending-resume" | "ready" | "manual";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const fresh = state === "pending-resume";
  const Icon = fresh ? Sparkles : RefreshCw;
  const label = fresh
    ? isPending
      ? "Analyzing…"
      : "Generate"
    : isPending
      ? "Regenerating…"
      : "Regenerate";

  function click() {
    startTransition(async () => {
      const r = await generateReview(candidateId, jobId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Review updated.");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={fresh ? "default" : "outline"}
      className="h-7 px-2 text-xs"
      disabled={isPending}
      onClick={click}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}
