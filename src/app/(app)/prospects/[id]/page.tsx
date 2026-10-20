import Link from "next/link";
import { notFound } from "next/navigation";
import { CornerLeftUp, Folder, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  getProspectList,
  listProspectLists,
  listProspectsForList,
  LEAD_ROW_SORT_COLUMNS,
  type LeadRowSortColumn,
} from "@/lib/db/queries";
import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "../../_components/page-header";
import { RoleGate } from "../../_components/role-gate";
import { ErrorState } from "../../_components/states";
import { AddProspectDialog } from "../_components/add-prospect-dialog";
import { BulkAddDialog } from "../_components/bulk-add-dialog";
import { ConvertProspectButton } from "../_components/convert-prospect-button";
import { DeleteProspectButton } from "../_components/delete-prospect-button";
import { EditListDialog } from "../_components/edit-list-dialog";
import { DeleteListButton } from "../_components/delete-list-button";
import { LeadRowFilters } from "./_components/filters";
import { SortableHeader } from "./_components/sortable-header";
import { LeadRowPagination } from "./_components/pagination";
import {
  BulkActionsBar,
  BulkSelectAllCheckbox,
  BulkSelectCheckbox,
  BulkSelectProvider,
} from "./_components/bulk-select";

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type SearchParams = Promise<{
  q?: string;
  location?: string;
  sort?: string;
  dir?: string;
  page?: string;
}>;

export default async function ProspectListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const sort =
    sp.sort && (LEAD_ROW_SORT_COLUMNS as readonly string[]).includes(sp.sort)
      ? (sp.sort as LeadRowSortColumn)
      : undefined;
  const dir = sp.dir === "desc" ? "desc" : "asc";
  const parsedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const filters = {
    q: sp.q,
    location: sp.location,
    sort,
    dir: sort ? dir : undefined,
    page,
  } as const;
  const hasActiveFilters = Boolean(sp.q || sp.location);
  // Whole-list stat counts run in parallel with the data + count fetch.
  // They don't apply the user's row filters - these cards summarize the
  // imported list as a whole, not the current view.
  const statsClient = await createClient();
  const statBase = () =>
    statsClient.from("prospects").select("id", { count: "exact", head: true }).eq("list_id", id);

  const [
    { data: list, error: listError },
    { data: pageData, error: pError },
    consentedCountQ,
    withEmailCountQ,
  ] = await Promise.all([
    getProspectList(id),
    listProspectsForList(id, filters),
    statBase().eq("marketing_consent", true),
    statBase().not("email", "is", null),
  ]);
  const prospects = pageData.data;

  if (listError) {
    return (
      <>
        <PageHeader
          title="Prospect list"
          actions={
            <Button variant="outline" asChild>
              <Link href="/prospects">Back</Link>
            </Button>
          }
        />
        <ErrorState message={listError} />
      </>
    );
  }
  if (!list) notFound();

  const isCompany = list.kind === "Company";
  const itemNoun = isCompany ? "companies" : "prospects";

  const total = pageData.total;
  const consented = consentedCountQ.count ?? 0;
  const withEmail = withEmailCountQ.count ?? 0;

  // Same-kind sibling lists for the bulk "Move to list…" dropdown,
  // plus this list's parent (if it's a sub-list) and its own sub-lists.
  const { data: allLists } = await listProspectLists({});
  const otherLists = allLists
    .filter((l) => l.kind === list.kind && l.id !== list.id)
    .map((l) => ({ id: l.id, name: l.name }));
  const parentList = list.parent_list_id
    ? allLists.find((l) => l.id === list.parent_list_id) ?? null
    : null;
  const subLists = allLists
    .filter((l) => l.parent_list_id === list.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const isTopLevel = !list.parent_list_id;
  // File-explorer view: show sub-list "folders" as the first rows of the
  // leads table. Hidden while a lead search/filter is active so results
  // stay clean (the filter targets leads, not folders).
  const showFolders = !hasActiveFilters && subLists.length > 0;
  // Same-kind top-level lists this one could be nested under.
  const parentOptions = allLists
    .filter(
      (l) => l.kind === list.kind && l.id !== list.id && !l.parent_list_id,
    )
    .map((l) => ({ id: l.id, name: l.name }));

  const headerDescription =
    parentList || list.description ? (
      <span className="flex flex-col gap-0.5">
        {parentList ? (
          <Link
            href={`/prospects/${parentList.id}`}
            className="inline-flex w-fit items-center gap-1 text-xs hover:underline"
          >
            <CornerLeftUp className="size-3" aria-hidden />
            Sub-list of {parentList.name}
          </Link>
        ) : null}
        {list.description ? <span>{list.description}</span> : null}
      </span>
    ) : undefined;

  return (
    <BulkSelectProvider>
    <>
      <PageHeader
        title={list.name}
        description={headerDescription}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/prospects">Back</Link>
            </Button>
            {isTopLevel ? (
              <RoleGate allow={["Admin", "Recruiter"]}>
                <Button variant="outline" asChild>
                  <Link href={`/prospects/new?parent=${list.id}`}>
                    <Plus className="size-4" aria-hidden />
                    New sub-list
                  </Link>
                </Button>
              </RoleGate>
            ) : null}
            <Button variant="outline" asChild>
              <a href={`/prospects/${list.id}/export`}>Export CSV</a>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/campaigns/new?list=${list.id}`}>Email list</Link>
            </Button>
            <AddProspectDialog listId={list.id} listKind={list.kind} />
            <BulkAddDialog listId={list.id} listKind={list.kind} />
            <EditListDialog
              list={{
                id: list.id,
                name: list.name,
                description: list.description,
                source: list.source,
                kind: list.kind,
                parent_list_id: list.parent_list_id,
              }}
              parentOptions={parentOptions}
              hasChildren={subLists.length > 0}
            />
            <DeleteListButton listId={list.id} listName={list.name} />
          </>
        }
      />

      {/* Stats */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              Total {itemNoun}
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {total.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {list.source ? `Source: ${list.source}` : `${list.kind} list`}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>With email</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {withEmail.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Reachable by email campaigns
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Marketing consent</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {consented.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Confirmed lawful basis at list creation
          </CardContent>
        </Card>
      </div>


      {/* Filter / search bar */}
      <LeadRowFilters listId={list.id} />

      <BulkActionsBar listId={list.id} otherLists={otherLists} />

      {/* Prospects table - sub-list folders render as the first rows,
          then the leads, like a file explorer. */}
      {pError ? (
        <ErrorState message={pError} />
      ) : prospects.length === 0 && !showFolders ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {hasActiveFilters
              ? "No matches in this list. Try clearing some filters."
              : `This list has no ${itemNoun}.`}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              {isCompany ? (
                <TableRow>
                  <TableHead className="w-8">
                    <BulkSelectAllCheckbox
                      pageIds={prospects.map((p) => p.id)}
                    />
                  </TableHead>
                  <TableHead>
                    <SortableHeader column="first_name" label="First Name" />
                  </TableHead>
                  <TableHead>
                    <SortableHeader column="last_name" label="Last Name" />
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <SortableHeader column="phone" label="Phone" />
                  </TableHead>
                  <TableHead>
                    <SortableHeader column="email" label="Email" />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <SortableHeader column="title" label="Title" />
                  </TableHead>
                  <TableHead>
                    <SortableHeader column="company_name" label="Company" />
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    <SortableHeader column="location" label="Location" />
                  </TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              ) : (
                <TableRow>
                  <TableHead className="w-8">
                    <BulkSelectAllCheckbox
                      pageIds={prospects.map((p) => p.id)}
                    />
                  </TableHead>
                  <TableHead>
                    <SortableHeader column="first_name" label="First Name" />
                  </TableHead>
                  <TableHead>
                    <SortableHeader column="last_name" label="Last Name" />
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <SortableHeader column="phone" label="Phone" />
                  </TableHead>
                  <TableHead>
                    <SortableHeader column="email" label="Email" />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <SortableHeader column="rank" label="Rank" />
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    <SortableHeader column="location" label="Location" />
                  </TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {/* Folder rows: sub-lists shown first, like a file explorer.
                  colSpan covers the middle data columns between the
                  checkbox and the Action cell. */}
              {showFolders
                ? subLists.map((s) => (
                    <TableRow key={`folder-${s.id}`} className="bg-muted/20">
                      <TableCell className="w-8" />
                      <TableCell colSpan={isCompany ? 7 : 6}>
                        <Link
                          href={`/prospects/${s.id}`}
                          className="inline-flex items-center gap-2 font-medium hover:underline"
                        >
                          <Folder
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span>{s.name}</span>
                          <span className="text-xs font-normal text-muted-foreground tabular-nums">
                            {s.prospect_count.toLocaleString()} {itemNoun}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/prospects/${s.id}`}
                          className="text-sm text-muted-foreground hover:text-foreground"
                        >
                          Open →
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                : null}
              {prospects.length === 0 && showFolders ? (
                <TableRow>
                  <TableCell
                    colSpan={isCompany ? 9 : 8}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No {itemNoun} directly in this list - open a folder above.
                  </TableCell>
                </TableRow>
              ) : null}
              {prospects.map((p) => {
                const firstNameCell = (
                  <TableCell className="font-medium">
                    <Link
                      href={`/prospects/${list.id}/${p.id}`}
                      className="hover:underline"
                    >
                      {p.first_name ?? "-"}
                    </Link>
                  </TableCell>
                );
                const lastNameCell = (
                  <TableCell className="font-medium">
                    <Link
                      href={`/prospects/${list.id}/${p.id}`}
                      className="hover:underline"
                    >
                      {p.last_name ?? "-"}
                    </Link>
                  </TableCell>
                );
                const phoneCell = (
                  <TableCell className="hidden sm:table-cell text-muted-foreground tabular-nums">
                    {p.phone ?? "-"}
                  </TableCell>
                );
                return (
                  <TableRow key={p.id}>
                    <TableCell className="w-8">
                      <BulkSelectCheckbox id={p.id} />
                    </TableCell>
                    {isCompany ? (
                      <>
                        {firstNameCell}
                        {lastNameCell}
                        {phoneCell}
                        <TableCell className="text-muted-foreground">
                          {p.email ?? "-"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {p.title ?? "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.company_name ?? "-"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {p.location ?? "-"}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        {firstNameCell}
                        {lastNameCell}
                        {phoneCell}
                        <TableCell className="text-muted-foreground">
                          {p.email ?? "-"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {p.rank ?? "-"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {p.location ?? "-"}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ConvertProspectButton
                          prospectId={p.id}
                          listKind={list.kind}
                          // Only treat the lead as "already in the
                          // downstream pipeline" when the stage actually
                          // says so. After a Move-back-to-Leads, the
                          // candidate FK lingers (so re-promotion can
                          // resurrect the snapshot), but the lead is
                          // back in the Prospect stage and should show
                          // "Move to Pipeline" again.
                          convertedToCandidateId={
                            p.pipeline_stage === "Candidate"
                              ? p.converted_to_candidate_id
                              : null
                          }
                          convertedToCompanyId={
                            p.pipeline_stage === "Company"
                              ? p.converted_to_company_id
                              : null
                          }
                        />
                        <DeleteProspectButton
                          prospectId={p.id}
                          displayName={
                            [p.first_name, p.last_name]
                              .filter(Boolean)
                              .join(" ") ||
                            p.company_name ||
                            "this lead"
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <LeadRowPagination
        page={pageData.page}
        pageCount={pageData.pageCount}
        pageSize={pageData.pageSize}
        total={pageData.total}
      />

      <p className="mt-4 text-xs text-muted-foreground">
        List created {formatDate(list.created_at)}
        {list.consent_confirmed_at
          ? ` · Lawful-basis confirmed ${formatDate(list.consent_confirmed_at)}`
          : ""}
      </p>
    </>
    </BulkSelectProvider>
  );
}
