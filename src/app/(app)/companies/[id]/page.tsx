import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  getCompany,
  getProspectOriginByCompany,
  listActiveEmployees,
  listCompanyJobs,
  listCompanyNotes,
  listCompanyTasks,
  listPlacementsForCompany,
} from "@/lib/db/queries";
import { formatDate, formatDateTime } from "@/lib/date-format";

import { PageHeader } from "../../_components/page-header";
import { ActivityTimeline } from "../../_components/activity-timeline";
import { ProspectOriginBanner } from "../../_components/prospect-origin-banner";
import { RoleGate } from "../../_components/role-gate";
import { StatusBadge } from "../../_components/status-badge";
import { ErrorState } from "../../_components/states";
import { CompanyArchiveButton } from "../_components/archive-button";
import { RevertCompanyToProspectButton } from "../_components/revert-to-prospect-button";
import { AddNoteForm } from "./_components/add-note-form";
import { AddTaskForm } from "./_components/add-task-form";
import { TaskRow } from "./_components/task-row";
import { PlacementsMiniList } from "../../placements/_components/placements-mini-list";

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

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`grid gap-1 ${full ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: company, error } = await getCompany(id);

  if (error) {
    return (
      <>
        <PageHeader
          title="Company"
          actions={
            <Button variant="outline" asChild>
              <Link href="/companies">Back</Link>
            </Button>
          }
        />
        <ErrorState message={error} />
      </>
    );
  }

  if (!company) notFound();

  const archived = company.status === "Inactive";

  const [
    { data: jobs, error: jobsError },
    { data: notes, error: notesError },
    { data: tasks, error: tasksError },
    { data: employees },
    { data: placements, error: placementsError },
    prospectOrigin,
  ] = await Promise.all([
    listCompanyJobs(company.id),
    listCompanyNotes(company.id),
    listCompanyTasks(company.id),
    listActiveEmployees(),
    listPlacementsForCompany(company.id),
    getProspectOriginByCompany(company.id),
  ]);

  return (
    <>
      <PageHeader
        title={company.company_name}
        description={company.industry ?? "-"}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/companies">Back</Link>
            </Button>
            <RoleGate allow={["Admin", "Recruiter"]}>
              <Button variant="outline" asChild>
                <Link href={`/companies/${company.id}/review`}>
                  Candidate Review
                </Link>
              </Button>
            </RoleGate>
            <RoleGate allow={["Admin", "Recruiter"]}>
              <Button asChild>
                <Link href={`/companies/${company.id}/edit`}>
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </Link>
              </Button>
            </RoleGate>
            {prospectOrigin && !archived ? (
              <RoleGate allow={["Admin", "Recruiter"]}>
                <RevertCompanyToProspectButton companyId={company.id} />
              </RoleGate>
            ) : null}
            <RoleGate allow={["Admin", "Recruiter"]}>
              <CompanyArchiveButton
                companyId={company.id}
                archived={archived}
              />
            </RoleGate>
          </>
        }
      />

      <ProspectOriginBanner origin={prospectOrigin} via="company" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Profile</span>
              <StatusBadge value={company.status} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary contact">
                {company.contact_name ?? "-"}
              </Field>
              <Field label="Contact email">
                {company.contact_email ? (
                  <a
                    href={`mailto:${company.contact_email}`}
                    className="text-primary hover:underline"
                  >
                    {company.contact_email}
                  </a>
                ) : (
                  "-"
                )}
              </Field>
              <Field label="Contact phone">
                {company.contact_phone ?? "-"}
              </Field>
              <Field label="Industry">{company.industry ?? "-"}</Field>
              <Field label="Location">{company.location ?? "-"}</Field>

              <div className="sm:col-span-2">
                <Separator className="my-2" />
              </div>

              <Field label="Hiring needs" full>
                {company.hiring_needs ?? (
                  <span className="text-muted-foreground">-</span>
                )}
              </Field>
              <Field label="Notes" full>
                {company.notes ?? (
                  <span className="text-muted-foreground">-</span>
                )}
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              <Field label="Created">{formatDate(company.created_at)}</Field>
              <Field label="Last updated">
                {formatDate(company.updated_at)}
              </Field>
              <Field label="Company ID">
                <span className="font-mono text-xs break-all">
                  {company.id}
                </span>
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Related jobs */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">
            Jobs at this company
            {jobs.length ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {jobs.length}
              </span>
            ) : null}
          </CardTitle>
          <RoleGate allow={["Admin", "Recruiter"]}>
            <Button asChild size="sm" variant="outline">
              <Link href={`/jobs/new?company=${company.id}`}>
                <Plus className="size-4" aria-hidden />
                New job
              </Link>
            </Button>
          </RoleGate>
        </CardHeader>
        <CardContent>
          {jobsError ? (
            <ErrorState message={jobsError} />
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No jobs on file for this company.
            </p>
          ) : (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Location
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      Salary
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Added
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/jobs/${j.id}`}
                          className="hover:underline"
                        >
                          {j.title}
                        </Link>
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
        </CardContent>
      </Card>

      {/* Placements */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">
            Placements
            {placements.length ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {placements.length}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {placementsError ? (
            <ErrorState message={placementsError} />
          ) : placements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No placements with this company yet.
            </p>
          ) : (
            <PlacementsMiniList
              placements={placements}
              hide={["company"]}
            />
          )}
        </CardContent>
      </Card>

      {/* Notes timeline */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">
            Notes
            {notes.length ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {notes.length}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <AddNoteForm companyId={company.id} />

          {notesError ? (
            <ErrorState message={notesError} />
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="grid gap-3">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="grid gap-1 rounded-md border bg-muted/20 p-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {n.author
                        ? `${n.author.first_name} ${n.author.last_name}`
                        : "Unknown"}
                    </span>
                    <span>{formatDateTime(n.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{n.note}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Tasks */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">
            Tasks
            {tasks.length ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {tasks.length}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <AddTaskForm companyId={company.id} employees={employees} />

          {tasksError ? (
            <ErrorState message={tasksError} />
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
          ) : (
            <ul className="grid gap-2">
              {tasks.map((t) => (
                <li key={t.id}>
                  <TaskRow task={t} companyId={company.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <ActivityTimeline subject={{ companyId: company.id }} />
      </div>
    </>
  );
}
