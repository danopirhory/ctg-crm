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

import { COMPANY_STATUSES } from "@/lib/db/constants";

const ANY = "all";

export function CompanyFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentQ = sp.get("q") ?? "";
  const currentStatus = sp.get("status") ?? ANY;
  const currentIndustry = sp.get("industry") ?? "";

  const hasActiveFilters =
    Boolean(currentQ) || currentStatus !== ANY || Boolean(currentIndustry);

  const formKey = sp.toString();

  function pushFrom(
    form: HTMLFormElement,
    overrides?: Partial<Record<string, string>>,
  ) {
    const fd = new FormData(form);
    const values: Record<string, string> = {
      q: String(fd.get("q") ?? "").trim(),
      status: String(fd.get("status") ?? ANY),
      industry: String(fd.get("industry") ?? "").trim(),
      ...overrides,
    };

    const params = new URLSearchParams();
    if (values.q) params.set("q", values.q);
    if (values.status !== ANY) params.set("status", values.status);
    if (values.industry) params.set("industry", values.industry);

    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/companies?${qs}` : "/companies");
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    pushFrom(e.currentTarget);
  }

  function reset() {
    startTransition(() => {
      router.push("/companies");
    });
  }

  return (
    <form
      key={formKey}
      data-company-filters
      onSubmit={onSubmit}
      className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={currentQ}
            placeholder="Search name, contact, email, industry"
            className="pl-9"
            aria-label="Search companies"
          />
        </div>

        <input type="hidden" name="status" value={currentStatus} />

        <Select
          value={currentStatus}
          onValueChange={(v) => {
            const form = document.querySelector<HTMLFormElement>(
              "form[data-company-filters]",
            );
            if (form) pushFrom(form, { status: v });
          }}
        >
          <SelectTrigger aria-label="Status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            {COMPANY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          name="industry"
          defaultValue={currentIndustry}
          placeholder="Industry contains…"
          aria-label="Industry contains"
        />
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
