"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

import type { LeadRowSortColumn } from "@/lib/db/queries";

// Click a column header to sort by it. Cycle is: unsorted → asc → desc
// → unsorted. The current sort state lives in `?sort=&dir=` so it's
// bookmarkable and survives back/forward navigation.
export function SortableHeader({
  column,
  label,
  align,
}: {
  column: LeadRowSortColumn;
  label: React.ReactNode;
  align?: "left" | "right";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const currentSort = sp.get("sort");
  const currentDir = sp.get("dir") === "desc" ? "desc" : "asc";
  const isActive = currentSort === column;

  function next() {
    const params = new URLSearchParams(sp.toString());
    if (!isActive) {
      params.set("sort", column);
      params.set("dir", "asc");
    } else if (currentDir === "asc") {
      params.set("sort", column);
      params.set("dir", "desc");
    } else {
      params.delete("sort");
      params.delete("dir");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const Icon = isActive ? (currentDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={next}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground",
        align === "right" && "ml-auto",
      )}
      aria-label={`Sort by ${typeof label === "string" ? label : column}${
        isActive ? `, currently ${currentDir}ending` : ""
      }`}
    >
      <span>{label}</span>
      <Icon
        className={cn(
          "size-3",
          isActive ? "text-foreground" : "text-muted-foreground/70",
        )}
        aria-hidden
      />
    </button>
  );
}
