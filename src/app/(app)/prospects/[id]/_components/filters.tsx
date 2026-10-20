"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// URL-driven filters for the in-list (single lead list) view. Mirrors
// the Leads-index filter pattern: server-side ilike on the searchable
// fields plus a small location filter.
export function LeadRowFilters({ listId }: { listId: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentQ = sp.get("q") ?? "";
  const currentLocation = sp.get("location") ?? "";

  const hasActiveFilters = Boolean(currentQ) || Boolean(currentLocation);
  const basePath = `/prospects/${listId}`;
  const formKey = sp.toString();

  function pushFrom(form: HTMLFormElement) {
    const fd = new FormData(form);
    const q = String(fd.get("q") ?? "").trim();
    const location = String(fd.get("location") ?? "").trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (location) params.set("location", location);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath);
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    pushFrom(e.currentTarget);
  }

  function reset() {
    startTransition(() => {
      router.push(basePath);
    });
  }

  return (
    <form
      key={formKey}
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
            placeholder="Search name, email, phone, company, or title"
            className="pl-9"
            aria-label="Search leads in this list"
          />
        </div>
        <Input
          name="location"
          defaultValue={currentLocation}
          placeholder="Location contains…"
          aria-label="Location contains"
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
