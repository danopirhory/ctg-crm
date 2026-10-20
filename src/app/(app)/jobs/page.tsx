import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  listCompanyOptions,
  listJobs,
  type JobFilters,
} from "@/lib/db/queries";
import type { JobStatus } from "@/lib/db/types";
import { JOB_STATUSES } from "@/lib/db/constants";

import { PageHeader } from "../_components/page-header";
import { RoleGate } from "../_components/role-gate";
import { StatusBadge } from "../_components/status-badge";
import { EmptyState, ErrorState } from "../_components/states";
import { JobFilters as FiltersBar } from "./_components/filters";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatSalaryRange(min: number | null, max: number | null) {
  if (min == null && max == null) return "-";
  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  if (min != null && max != null) return `${fmt(min)} - ${fmt(max)}`;
  if (min != null) return `from ${fmt(min)}`;
  if (max != null) return `up to ${fmt(max)}`;
  return "-";
}

type SearchParams = Promise<{
  q?: string;
  status?: string;
  company?: string;
}>;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const status =
    sp.status && (JOB_STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as JobStatus)
      : "all";

  const filters: JobFilters = {
    q: sp.q,
    status,
    companyId: sp.company ?? "all",
  };

  const [{ data: jobs, error }, { data: companies }] = await Promise.all([
    listJobs(filters),
    listCompanyOptions(),
  ]);

  const hasActiveFilters = Boolean(sp.q || sp.status || sp.company);

  return (
    <>
      <PageHeader
        title="Jobs"
        description={
          error
            ? undefined
            : `${jobs.length} job${jobs.length === 1 ? "" : "s"}${hasActiveFilters ? " match your filters" : ""}`
        }
        actions={
          <RoleGate allow={["Admin", "Recruiter"]}>
            <Button asChild>
              <Link href="/jobs/new">
                <Plus className="size-4" aria-hidden />
                New job
              </Link>
            </Button>
          </RoleGate>
        }
      />

      <FiltersBar companies={companies} />

      {error ? (
        <ErrorState message={error} />
      ) : jobs.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matches" : "No jobs yet"}
          description={
            hasActiveFilters
              ? "Try clearing some filters."
              : 'Click "New job" to add your first one.'
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="hidden md:table-cell">Salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-medium">
                    <Link href={`/jobs/${j.id}`} className="hover:underline">
                      {j.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {j.company ? (
                      <Link
                        href={`/companies/${j.company.id}`}
                        className="hover:underline"
                      >
                        {j.company.company_name}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {j.location ?? "-"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground tabular-nums">
                    {formatSalaryRange(j.salary_min, j.salary_max)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={j.status} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {formatDate(j.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
