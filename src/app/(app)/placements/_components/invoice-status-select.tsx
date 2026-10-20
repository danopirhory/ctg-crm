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

import { INVOICE_STATUSES } from "@/lib/db/constants";
import type { InvoiceStatus } from "@/lib/db/types";

import { updatePlacementInvoiceStatus } from "../actions";

export function InvoiceStatusSelect({
  placementId,
  initial,
}: {
  placementId: string;
  initial: InvoiceStatus;
}) {
  const router = useRouter();
  const [value, setValue] = useState<InvoiceStatus>(initial);
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    const nextStatus = next as InvoiceStatus;
    const prev = value;
    setValue(nextStatus);
    startTransition(async () => {
      const r = await updatePlacementInvoiceStatus(placementId, nextStatus);
      if (!r.ok) {
        toast.error(r.error);
        setValue(prev);
        return;
      }
      toast.success("Invoice status updated.");
      router.refresh();
    });
  }

  return (
    <Select value={value} onValueChange={change} disabled={isPending}>
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {INVOICE_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
