"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { JOB_STATUSES } from "@/lib/db/constants";
import type { JobStatus } from "@/lib/db/types";

import { updateJobStatus } from "../actions";

// Quick status changer for the job detail page header. Optimistic
// update with toast feedback; rolls back the local state on error.
export function JobStatusSelect({
  jobId,
  initial,
}: {
  jobId: string;
  initial: JobStatus;
}) {
  const router = useRouter();
  const [value, setValue] = useState<JobStatus>(initial);
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    const nextStatus = next as JobStatus;
    if (nextStatus === value) return;
    const prev = value;
    setValue(nextStatus);
    startTransition(async () => {
      const r = await updateJobStatus(jobId, nextStatus);
      if (!r.ok) {
        toast.error(r.error);
        setValue(prev);
        return;
      }
      toast.success(`Job marked ${nextStatus}.`);
      router.refresh();
    });
  }

  return (
    <Select value={value} onValueChange={change} disabled={isPending}>
      <SelectTrigger className="w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {JOB_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
