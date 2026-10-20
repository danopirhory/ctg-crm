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

import { LEAD_LIST_ASSIGNEES, PROSPECT_LIST_KINDS } from "@/lib/db/constants";

const ANY = "all";

// URL-driven filters for the Leads index, mirroring the pattern used on
// /candidates. Text search is a fuzzy match across name, description,
// and source; the Kind select pushes immediately on change.
export function LeadListFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentQ = sp.get("q") ?? "";
  const currentKind = sp.get("kind") ?? ANY;
  const currentAssigned = sp.get("assigned") ?? ANY;

  const hasActiveFilters =
    Boolean(currentQ) || currentKind !== ANY || currentAssigned !== ANY;

  // Tie the form's `key` to the current URL so reset / back-button
  // navigation flips the uncontrolled inputs back to the new defaults.
  const formKey = sp.toString();

  function pushFrom(
    form: HTMLFormElement,
    overrides?: Partial<Record<string, string>>,
  ) {
    const fd = new FormData(form);
    const values: Record<string, string> = {
      q: String(fd.get("q") ?? "").trim(),
      kind: String(fd.get("kind") ?? ANY),
      assigned: String(fd.get("assigned") ?? ANY),
      ...overrides,
    };

    const params = new URLSearchParams();
    if (values.q) params.set("q", values.q);
    if (values.kind !== ANY) params.set("kind", values.kind);
    if (values.assigned !== ANY) params.set("assigned", values.assigned);

    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/prospects?${qs}` : "/prospects");
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    pushFrom(e.currentTarget);
  }

  function reset() {
    startTransition(() => {
      router.push("/prospects");
    });
  }

  return (
    <form
      key={formKey}
      data-lead-filters
      onSubmit={onSubmit}
      className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={currentQ}
            placeholder="Search lists by name, description, or source"
            className="pl-9"
            aria-label="Search lead lists"
          />
        </div>

        {/* Hidden mirror so a plain form submit still picks up the kind */}
        <input type="hidden" name="kind" value={currentKind} />

        <Select
          value={currentKind}
          onValueChange={(v) => {
            const form = document.querySelector<HTMLFormElement>(
              "form[data-lead-filters]",
            );
            if (form) pushFrom(form, { kind: v });
          }}
        >
          <SelectTrigger aria-label="Type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any type</SelectItem>
            {PROSPECT_LIST_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Hidden mirror so a plain form submit still picks up the assignee */}
        <input type="hidden" name="assigned" value={currentAssigned} />

        <Select
          value={currentAssigned}
          onValueChange={(v) => {
            const form = document.querySelector<HTMLFormElement>(
              "form[data-lead-filters]",
            );
            if (form) pushFrom(form, { assigned: v });
          }}
        >
          <SelectTrigger aria-label="Assigned to">
            <SelectValue placeholder="Assigned to" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Anyone</SelectItem>
            {LEAD_LIST_ASSIGNEES.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
            <SelectItem value="Unassigned">Unassigned</SelectItem>
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
