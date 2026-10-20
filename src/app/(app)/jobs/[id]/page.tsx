import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import {
  getJob,
  listCandidateOptions,
  listMatchesForJob,
  listPlacementsForJob,
} from "@/lib/db/queries";

import { PageHeader } from "../../_components/page-header";
import { RoleGate } from "../../_components/role-gate";
import { StatusBadge } from "../../_components/status-badge";
import { ErrorState } from "../../_components/states";
import { AddMatchDialog } from "../../_matches/_components/add-match-dialog";
import { MatchRow } from "../../_matches/_components/match-row";
import { PlacementsMiniList } from "../../placements/_components/placements-mini-list";
import { DeleteJobButton } from "../_components/delete-job-button";
import { JobStatusSelect } from "../_components/job-status-select";

function formatDate(iso: string | null) {
  if (!iso) return "-";
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

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: job, error } = await getJob(id);

  if (error) {
    return (
      <>
        <PageHeader
          title="Job"
          actions={
            <Button variant="outline" asChild>
              <Link href="/jobs">Back</Link>
            </Button>
          }
        />
        <ErrorState message={error} />
      </>
    );
  }

  if (!job) notFound();

  const [
    { data: matches, error: matchesError },
    { data: candidateOptions },
    { data: placements, error: placementsError },
  ] = await Promise.all([
    listMatchesForJob(job.id),
    listCandidateOptions(),
    listPlacementsForJob(job.id),
  ]);

  return (
    <>
      <PageHeader
        title={job.title}
        description={job.company?.company_name ?? "-"}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/jobs">Back</Link>
            </Button>
            <RoleGate allow={["Admin", "Recruiter"]}>
              <Button asChild>
                <Link href={`/jobs/${job.id}/edit`}>
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </Link>
              </Button>
            </RoleGate>
            <RoleGate allow={["Admin"]}>
              <DeleteJobButton jobId={job.id} />
            </RoleGate>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span>Role</span>
              <span className="flex items-center gap-2">
                <StatusBadge value={job.status} />
                <RoleGate allow={["Admin", "Recruiter"]}>
                  <JobStatusSelect jobId={job.id} initial={job.status} />
                </RoleGate>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Location">{job.location ?? "-"}</Field>
              <Field label="Job type">{job.job_type ?? "-"}</Field>
              <Field label="Salary range" full>
                <span className="tabular-nums">
                  {formatSalaryRange(job.salary_min, job.salary_max)}
                </span>
              </Field>

              <div className="sm:col-span-2">
                <Separator className="my-2" />
              </div>

              <Field label="Description" full>
                {job.description ?? (
                  <span className="text-muted-foreground">-</span>
                )}
              </Field>
              <Field label="Requirements" full>
                {job.requirements ?? (
                  <span className="text-muted-foreground">-</span>
                )}
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              <Field label="Client">
                {job.company ? (
                  <Link
                    href={`/companies/${job.company.id}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Building2 className="size-4" aria-hidden />
                    {job.company.company_name}
                  </Link>
                ) : (
                  "-"
                )}
              </Field>
              <Separator />
              <Field label="Created">{formatDate(job.created_at)}</Field>
              <Field label="Last updated">
                {formatDate(job.updated_at)}
              </Field>
              <Field label="Job ID">
                <span className="font-mono text-xs break-all">{job.id}</span>
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Matched candidates */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">
            Matched candidates
            {matches.length ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {matches.length}
              </span>
            ) : null}
          </CardTitle>
          <AddMatchDialog
            mode="for-job"
            jobId={job.id}
            candidates={candidateOptions}
          />
        </CardHeader>
        <CardContent>
          {matchesError ? (
            <ErrorState message={matchesError} />
          ) : matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No candidates matched to this job yet.
            </p>
          ) : (
            <ul className="grid gap-2">
              {matches.map((m) => (
                <li key={m.id}>
                  <MatchRow
                    match={m}
                    placementContext={
                      m.candidate
                        ? {
                            candidate_id: m.candidate.id,
                            job_id: job.id,
                            company_id: job.company_id,
                          }
                        : undefined
                    }
                    heading={
                      m.candidate ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/candidates/${m.candidate.id}`}
                            className="font-medium hover:underline"
                          >
                            {m.candidate.first_name} {m.candidate.last_name}
                          </Link>
                          {m.candidate.email ? (
                            <span className="text-xs text-muted-foreground">
                              {m.candidate.email}
                            </span>
                          ) : null}
                          <StatusBadge value={m.candidate.status} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          (Candidate deleted)
                        </span>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
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
              No placements for this job yet.
            </p>
          ) : (
            <PlacementsMiniList placements={placements} hide={["job"]} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
