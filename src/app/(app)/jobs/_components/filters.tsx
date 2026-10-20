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

import { JOB_STATUSES } from "@/lib/db/constants";
import type { CompanyOption } from "@/lib/db/queries";

const ANY = "all";

export function JobFilters({ companies }: { companies: CompanyOption[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentQ = sp.get("q") ?? "";
  const currentStatus = sp.get("status") ?? ANY;
  const currentCompany = sp.get("company") ?? ANY;

  const hasActiveFilters =
    Boolean(currentQ) || currentStatus !== ANY || currentCompany !== ANY;
  const formKey = sp.toString();

  function pushFrom(
    form: HTMLFormElement,
    overrides?: Partial<Record<string, string>>,
  ) {
    const fd = new FormData(form);
    const values: Record<string, string> = {
      q: String(fd.get("q") ?? "").trim(),
      status: String(fd.get("status") ?? ANY),
      company: String(fd.get("company") ?? ANY),
      ...overrides,
    };

    const params = new URLSearchParams();
    if (values.q) params.set("q", values.q);
    if (values.status !== ANY) params.set("status", values.status);
    if (values.company !== ANY) params.set("company", values.company);

    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/jobs?${qs}` : "/jobs");
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    pushFrom(e.currentTarget);
  }

  function reset() {
    startTransition(() => {
      router.push("/jobs");
    });
  }

  return (
    <form
      key={formKey}
      data-job-filters
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
            placeholder="Search title, company, location"
            className="pl-9"
            aria-label="Search jobs"
          />
        </div>

        <input type="hidden" name="status" value={currentStatus} />
        <input type="hidden" name="company" value={currentCompany} />

        <Select
          value={currentStatus}
          onValueChange={(v) => {
            const form = document.querySelector<HTMLFormElement>(
              "form[data-job-filters]",
            );
            if (form) pushFrom(form, { status: v });
          }}
        >
          <SelectTrigger aria-label="Status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            {JOB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={currentCompany}
          onValueChange={(v) => {
            const form = document.querySelector<HTMLFormElement>(
              "form[data-job-filters]",
            );
            if (form) pushFrom(form, { company: v });
          }}
        >
          <SelectTrigger aria-label="Company">
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any company</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.company_name}
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
