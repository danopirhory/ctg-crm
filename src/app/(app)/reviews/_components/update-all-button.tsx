"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import {
  generateReview,
  listAnalysisTargets,
  regenerateCompanyNarrative,
} from "../actions";

type Progress = {
  done: number;
  total: number;
  label: string;
};

// The single "Generate analysis" trigger. Fetches the (candidate, job)
// target list, then drives one short server-action call per pair from
// the client - live progress, no long-request timeout risk, and rows
// persist as they finish. Ends with the company-narrative pass.
export function UpdateAllButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [progress, setProgress] = React.useState<Progress | null>(null);
  const running = progress !== null;

  async function run() {
    const t = await listAnalysisTargets(companyId);
    if (!t.ok) {
      toast.error(t.error);
      setProgress(null);
      return;
    }
    if (t.targets.length === 0) {
      toast.error(
        "No candidates matched to this company's jobs yet. Match candidates from the pipeline first.",
      );
      setProgress(null);
      return;
    }

    const missingResume = t.targets.filter((x) => !x.hasResume).length;
    if (missingResume > 0) {
      const proceed = confirm(
        `${missingResume} of ${t.targets.length} candidate-role pairs have no resume on file and will stay "Pending Resume". Run the analysis for the rest?`,
      );
      if (!proceed) {
        setProgress(null);
        return;
      }
    }

    // +1 step for the narrative pass at the end.
    const total = t.targets.length + 1;
    let generated = 0;
    let failed = 0;
    let firstError: string | null = null;

    for (let i = 0; i < t.targets.length; i++) {
      const target = t.targets[i];
      setProgress({
        done: i,
        total,
        label: `${target.candidateName} × ${target.jobTitle}`,
      });
      try {
        const r = await generateReview(target.candidateId, target.jobId);
        if (r.ok) generated += 1;
        else {
          failed += 1;
          if (!firstError) firstError = r.error;
        }
      } catch (e) {
        failed += 1;
        if (!firstError)
          firstError = e instanceof Error ? e.message : "Unexpected error.";
      }
      // Refresh so finished rows appear in the table while the run
      // continues - the recruiter can read results as they land.
      router.refresh();
    }

    setProgress({ done: total - 1, total, label: "Drafting narrative…" });
    const n = await regenerateCompanyNarrative(companyId);

    setProgress(null);
    const parts = [`${generated} reviews`];
    if (failed > 0) parts.push(`${failed} skipped`);
    parts.push(n.ok ? "narrative drafted" : "narrative skipped");
    toast[failed > 0 || !n.ok ? "warning" : "success"](parts.join(" · "), {
      description: firstError ?? (n.ok ? undefined : n.error),
    });
    router.refresh();
  }

  function click() {
    if (running) return;
    if (
      !confirm(
        "Run the full analysis for every candidate × open role at this company? One AI call per pair plus a narrative pass.",
      )
    ) {
      return;
    }
    setProgress({ done: 0, total: 1, label: "Preparing…" });
    void run();
  }

  if (running && progress) {
    const pct =
      progress.total > 0
        ? Math.round((progress.done / progress.total) * 100)
        : 0;
    return (
      <div className="flex min-w-56 flex-col gap-1 rounded-md border px-3 py-1.5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-muted-foreground">
            {progress.label}
          </span>
          <span className="shrink-0 font-medium tabular-nums">
            {progress.done}/{progress.total}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <Button type="button" variant="default" onClick={click}>
      <Sparkles className="size-4" aria-hidden />
      Generate analysis
    </Button>
  );
}
