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

import {
  CANDIDATE_STATUSES,
  CLEARANCE_LEVELS,
  MILITARY_BRANCHES,
} from "@/lib/db/constants";

const ANY = "all";

export function CandidateFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Derive every filter from the URL during render. The text inputs are
  // uncontrolled (defaultValue + a key tied to the URL) so the user can type
  // freely, and we push on submit/reset/select-change.
  const currentQ = sp.get("q") ?? "";
  const currentStatus = sp.get("status") ?? ANY;
  const currentBranch = sp.get("branch") ?? ANY;
  const currentClearance = sp.get("clearance") ?? ANY;
  const currentIndustry = sp.get("industry") ?? "";

  const hasActiveFilters =
    Boolean(currentQ) ||
    currentStatus !== ANY ||
    currentBranch !== ANY ||
    currentClearance !== ANY ||
    Boolean(currentIndustry);

  // A key derived from the URL so resetting (or back/forward) flips the
  // uncontrolled inputs back to the defaults.
  const formKey = sp.toString();

  function pushFrom(form: HTMLFormElement, overrides?: Partial<Record<string, string>>) {
    const fd = new FormData(form);
    const values: Record<string, string> = {
      q: String(fd.get("q") ?? "").trim(),
      status: String(fd.get("status") ?? ANY),
      branch: String(fd.get("branch") ?? ANY),
      clearance: String(fd.get("clearance") ?? ANY),
      industry: String(fd.get("industry") ?? "").trim(),
      ...overrides,
    };

    const params = new URLSearchParams();
    if (values.q) params.set("q", values.q);
    if (values.status !== ANY) params.set("status", values.status);
    if (values.branch !== ANY) params.set("branch", values.branch);
    if (values.clearance !== ANY) params.set("clearance", values.clearance);
    if (values.industry) params.set("industry", values.industry);

    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/candidates?${qs}` : "/candidates");
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    pushFrom(e.currentTarget);
  }

  function reset() {
    startTransition(() => {
      router.push("/candidates");
    });
  }

  return (
    <form
      key={formKey}
      data-candidate-filters
      onSubmit={onSubmit}
      className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={currentQ}
            placeholder="Search name or email"
            className="pl-9"
            aria-label="Search candidates"
          />
        </div>

        {/* Hidden inputs mirror the current select values so FormData picks
            them up even when the user hits Search without touching them. The
            visible Selects below push immediately on change. */}
        <input type="hidden" name="status" value={currentStatus} />
        <input type="hidden" name="branch" value={currentBranch} />
        <input type="hidden" name="clearance" value={currentClearance} />

        <Select
          value={currentStatus}
          onValueChange={(v) => {
            const form = document.querySelector<HTMLFormElement>(
              "form[data-candidate-filters]",
            );
            if (form) pushFrom(form, { status: v });
          }}
        >
          <SelectTrigger aria-label="Status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            {CANDIDATE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={currentBranch}
          onValueChange={(v) => {
            const form = document.querySelector<HTMLFormElement>(
              "form[data-candidate-filters]",
            );
            if (form) pushFrom(form, { branch: v });
          }}
        >
          <SelectTrigger aria-label="Branch">
            <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any branch</SelectItem>
            {MILITARY_BRANCHES.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={currentClearance}
          onValueChange={(v) => {
            const form = document.querySelector<HTMLFormElement>(
              "form[data-candidate-filters]",
            );
            if (form) pushFrom(form, { clearance: v });
          }}
        >
          <SelectTrigger aria-label="Clearance">
            <SelectValue placeholder="Clearance" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any clearance</SelectItem>
            {CLEARANCE_LEVELS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          name="industry"
          defaultValue={currentIndustry}
          placeholder="Industry contains…"
          aria-label="Target industry contains"
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
