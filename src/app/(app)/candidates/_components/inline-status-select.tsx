"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { CANDIDATE_STATUSES } from "@/lib/db/constants";
import type { CandidateStatus } from "@/lib/db/types";

import { setCandidateStatus } from "../actions";

// One-click status change from the candidate detail header - no
// edit-form roundtrip. Logs to the activity timeline via the action.
export function InlineStatusSelect({
  candidateId,
  status,
}: {
  candidateId: string;
  status: CandidateStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function change(next: string) {
    if (next === status) return;
    startTransition(async () => {
      const r = await setCandidateStatus(candidateId, next as CandidateStatus);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Status set to ${next}.`);
      router.refresh();
    });
  }

  return (
    <Select value={status} onValueChange={change} disabled={isPending}>
      <SelectTrigger className="h-9 w-44" aria-label="Candidate status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CANDIDATE_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
