import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  getCurrentEmployee,
  listProspectLists,
  type LeadListFilters as LeadListFiltersType,
} from "@/lib/db/queries";
import { LEAD_LIST_ASSIGNEES, PROSPECT_LIST_KINDS } from "@/lib/db/constants";

import { PageHeader } from "../_components/page-header";
import { RoleGate } from "../_components/role-gate";
import { EmptyState, ErrorState } from "../_components/states";
import { LeadListFilters } from "./_components/filters";
import { LeadListsTable } from "./_components/lists-table";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type SearchParams = Promise<{ q?: string; kind?: string; assigned?: string }>;

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const kind = sp.kind && (PROSPECT_LIST_KINDS as readonly string[]).includes(sp.kind)
    ? (sp.kind as "Candidate" | "Company")
    : ("all" as const);

  const assigned =
    sp.assigned &&
    ([...LEAD_LIST_ASSIGNEES, "Unassigned"] as readonly string[]).includes(
      sp.assigned,
    )
      ? sp.assigned
      : "all";

  const filters: LeadListFiltersType = { q: sp.q, kind, assigned };
  const [{ data: lists, error }, me] = await Promise.all([
    listProspectLists(filters),
    getCurrentEmployee(),
  ]);
  const hasActiveFilters = Boolean(
    sp.q || (sp.kind && sp.kind !== "all") || assigned !== "all",
  );
  // The list order is global (shared by every user), so only admins may
  // change it - everyone else gets a plain table without drag handles.
  const isAdmin = !("error" in me) && me.role === "Admin";

  return (
    <>
      <PageHeader
        title="Leads"
        description={
          error
            ? undefined
            : `${lists.length} list${lists.length === 1 ? "" : "s"}${hasActiveFilters ? " match your filters" : ""}`
        }
        actions={
          <RoleGate allow={["Admin", "Recruiter"]}>
            <Button asChild>
              <Link href="/prospects/new">
                <Plus className="size-4" aria-hidden />
                New list
              </Link>
            </Button>
          </RoleGate>
        }
      />

      <LeadListFilters />

      {error ? (
        <ErrorState message={error} />
      ) : lists.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matches" : "No lead lists yet"}
          description={
            hasActiveFilters
              ? "Try clearing some filters."
              : 'Click "New list" and paste a CSV/TSV of names + emails to import your first one.'
          }
        />
      ) : (
        <LeadListsTable
          // Remount whenever the server-rendered order/membership/assignment
          // changes so the client's optimistic state never goes stale.
          key={lists.map((l) => `${l.id}:${l.assigned_to ?? ""}`).join("|")}
          lists={lists.map((l) => ({
            id: l.id,
            name: l.name,
            description: l.description,
            source: l.source,
            kind: l.kind,
            assigned_to: l.assigned_to,
            parent_list_id: l.parent_list_id,
            prospect_count: l.prospect_count,
            created: formatDate(l.created_at),
          }))}
          canReorder={isAdmin && !hasActiveFilters}
          // Folder view: sub-lists start collapsed so the top-level lists
          // read cleanly; expand via the arrow. When a search/filter is
          // active, start expanded so matching sub-lists stay visible.
          collapseByDefault={!hasActiveFilters}
        />
      )}
    </>
  );
}
