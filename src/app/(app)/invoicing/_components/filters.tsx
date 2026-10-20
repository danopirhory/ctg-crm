"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { INVOICE_STATUSES } from "@/lib/db/constants";

const ANY = "all";

// URL-driven filters for the Invoicing index. Mirrors the Leads /
// Candidates filter pattern: text search across candidate/company/job
// + invoice status select that pushes immediately on change.
export function InvoiceFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentQ = sp.get("q") ?? "";
  const currentStatus = sp.get("status") ?? ANY;
  const hasActiveFilters = Boolean(currentQ) || currentStatus !== ANY;
  const formKey = sp.toString();

  function pushFrom(
    form: HTMLFormElement,
    overrides?: Partial<Record<string, string>>,
  ) {
    const fd = new FormData(form);
    const values: Record<string, string> = {
      q: String(fd.get("q") ?? "").trim(),
      status: String(fd.get("status") ?? ANY),
      ...overrides,
    };
    const params = new URLSearchParams();
    if (values.q) params.set("q", values.q);
    if (values.status !== ANY) params.set("status", values.status);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/invoicing?${qs}` : "/invoicing");
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    pushFrom(e.currentTarget);
  }

  function reset() {
    startTransition(() => {
      router.push("/invoicing");
    });
  }

  return (
    <form
      key={formKey}
      data-invoice-filters
      onSubmit={onSubmit}
      className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={currentQ}
            placeholder="Search candidate, company, or job"
            className="pl-9"
            aria-label="Search invoices"
          />
        </div>

        <input type="hidden" name="status" value={currentStatus} />

        <Select
          value={currentStatus}
          onValueChange={(v) => {
            const form = document.querySelector<HTMLFormElement>(
              "form[data-invoice-filters]",
            );
            if (form) pushFrom(form, { status: v });
          }}
        >
          <SelectTrigger aria-label="Invoice status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            {INVOICE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          Search
        </Button>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={reset}
          >
            <X className="size-4" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}
