import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import {
  getCandidate,
  getProspectOriginByCandidate,
  listActiveEmployees,
  listCandidateNotes,
  listCandidateTasks,
  listJobOptions,
  listMatchesForCandidate,
  listPlacementsForCandidate,
} from "@/lib/db/queries";
import { formatDate, formatDateTime } from "@/lib/date-format";

import { PageHeader } from "../../_components/page-header";
import { ActivityTimeline } from "../../_components/activity-timeline";
import { InlineStatusSelect } from "../_components/inline-status-select";
import { DraftOutreachButton } from "./_components/draft-outreach-button";
import { AiNotesButton } from "./_components/ai-notes-button";
import { ProspectOriginBanner } from "../../_components/prospect-origin-banner";
import { RoleGate } from "../../_components/role-gate";
import { StatusBadge } from "../../_components/status-badge";
import { ErrorState } from "../../_components/states";
import { ArchiveButton } from "../_components/archive-button";
import { RevertCandidateToProspectButton } from "../_components/revert-to-prospect-button";
import { createResumeSignedUrl } from "../_lib/signed-url";
import { AddNoteForm } from "./_components/add-note-form";
import { AddTaskForm } from "./_components/add-task-form";
import { TaskRow } from "./_components/task-row";
import { AddMatchDialog } from "../../_matches/_components/add-match-dialog";
import { MatchRow } from "../../_matches/_components/match-row";
import { PlacementsMiniList } from "../../placements/_components/placements-mini-list";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: candidate, error } = await getCandidate(id);

  if (error) {
    return (
      <>
        <PageHeader
          title="Candidate"
          actions={
            <Button variant="outline" asChild>
              <Link href="/candidates">Back</Link>
            </Button>
          }
        />
        <ErrorState message={error} />
      </>
    );
  }

  if (!candidate) {
    notFound();
  }

  const fullName = `${candidate.first_name} ${candidate.last_name}`.trim();
  const archived = candidate.status === "Archived";

  // Short-lived signed URL for the resume; regenerated on each page render.
  // The download attribute on the signed URL forces a friendly filename.
  const resumeDownloadName = candidate.resume_url
    ? `${candidate.last_name}_${candidate.first_name}_resume.${candidate.resume_url.split(".").pop() ?? "pdf"}`
    : undefined;

  // Fetch the resume signed URL, notes, tasks, and active employees in
  // parallel. None of these block on each other.
  const [
    resumeRes,
    { data: notes, error: notesError },
    { data: tasks, error: tasksError },
    { data: employees },
    { data: matches, error: matchesError },
    { data: jobOptions },
    { data: placements, error: placementsError },
    prospectOrigin,
  ] = await Promise.all([
    candidate.resume_url
      ? createResumeSignedUrl(candidate.resume_url, {
          downloadAs: resumeDownloadName,
        })
      : Promise.resolve({ url: null, error: null }),
    listCandidateNotes(candidate.id),
    listCandidateTasks(candidate.id),
    listActiveEmployees(),
    listMatchesForCandidate(candidate.id),
    listJobOptions(),
    listPlacementsForCandidate(candidate.id),
    getProspectOriginByCandidate(candidate.id),
  ]);
  const { url: resumeUrl, error: resumeError } = resumeRes;

  return (
    <>
      <PageHeader
        title={fullName}
        description={candidate.email ?? "No email on file"}
        actions={
          <>
            <RoleGate allow={["Admin", "Recruiter"]}>
              <InlineStatusSelect
                candidateId={candidate.id}
                status={candidate.status}
              />
            </RoleGate>
            <Button variant="outline" asChild>
              <Link href="/candidates">Back</Link>
            </Button>
            {resumeUrl ? (
              <Button variant="outline" asChild>
                <a href={resumeUrl} target="_blank" rel="noreferrer">
                  <Download className="size-4" aria-hidden />
                  View resume
                </a>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <a href={`/candidates/${candidate.id}/onepager`}>
                <Download className="size-4" aria-hidden />
                One-pager PDF
              </a>
            </Button>
            <RoleGate allow={["Admin", "Recruiter"]}>
              <DraftOutreachButton
                candidateId={candidate.id}
                jobs={(matches ?? [])
                  .filter((m) => m.job)
                  .map((m) => ({
                    id: m.job!.id,
                    label: `${m.job!.title}${m.job!.company ? ` - ${m.job!.company.company_name}` : ""}`,
                  }))}
              />
            </RoleGate>
            <RoleGate allow={["Admin", "Recruiter"]}>
              <Button asChild>
                <Link href={`/candidates/${candidate.id}/edit`}>
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </Link>
              </Button>
            </RoleGate>
            {prospectOrigin && !archived ? (
              <RoleGate allow={["Admin", "Recruiter"]}>
                <RevertCandidateToProspectButton candidateId={candidate.id} />
              </RoleGate>
            ) : null}
            <RoleGate allow={["Admin", "Recruiter"]}>
              <ArchiveButton
                candidateId={candidate.id}
                archived={archived}
              />
            </RoleGate>
          </>
        }
      />

      <ProspectOriginBanner origin={prospectOrigin} via="candidate" />


      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Profile</span>
              <StatusBadge value={candidate.status} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="First name">{candidate.first_name}</Field>
              <Field label="Last name">{candidate.last_name}</Field>
              <Field label="Email">{candidate.email ?? "-"}</Field>
              <Field label="Phone">{candidate.phone ?? "-"}</Field>

              <div className="sm:col-span-2">
                <Separator className="my-2" />
              </div>

              <Field label="Military branch">
                {candidate.military_branch ?? "-"}
              </Field>
              <Field label="Rank">{candidate.rank ?? "-"}</Field>
              <Field label="MOS / Specialty">
                {candidate.mos_or_specialty ?? "-"}
              </Field>
              <Field label="Years of service">
                {candidate.years_of_service ?? "-"}
              </Field>
              <Field label="Clearance">{candidate.clearance ?? "-"}</Field>

              <div className="sm:col-span-2">
                <Separator className="my-2" />
              </div>

              <Field label="Target industry">
                {candidate.target_industry ?? "-"}
              </Field>
              <Field label="Target location">
                {candidate.target_location ?? "-"}
              </Field>
              <Field label="Source">{candidate.source ?? "-"}</Field>
              <Field label="Tags">
                {candidate.tags.length === 0 ? (
                  <span className="text-muted-foreground">-</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {candidate.tags.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </div>
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
              <Field label="Marketing consent">
                {candidate.marketing_consent ? "Yes" : "No"}
              </Field>
              <Field label="LinkedIn">
                {candidate.linkedin ? (
                  <a
                    href={candidate.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {candidate.linkedin}
                  </a>
                ) : (
                  <span className="text-muted-foreground">
                    No LinkedIn on file
                  </span>
                )}
              </Field>
              <Field label="Resume">
                {!candidate.resume_url ? (
                  <span className="text-muted-foreground">No resume on file</span>
                ) : resumeError ? (
                  <span className="text-destructive text-xs">
                    Resume file is unavailable ({resumeError}).
                  </span>
                ) : resumeUrl ? (
                  <a
                    href={resumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <FileText className="size-4" aria-hidden />
                    Open resume
                  </a>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </Field>
              <Separator />
              <Field label="Created">{formatDate(candidate.created_at)}</Field>
              <Field label="Last updated">
                {formatDate(candidate.updated_at)}
              </Field>
              <Field label="Candidate ID">
                <span className="font-mono text-xs break-all">
                  {candidate.id}
                </span>
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Matches */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">
            Matched jobs
            {matches.length ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {matches.length}
              </span>
            ) : null}
          </CardTitle>
          <AddMatchDialog
            mode="for-candidate"
            candidateId={candidate.id}
            jobs={jobOptions}
          />
        </CardHeader>
        <CardContent>
          {matchesError ? (
            <ErrorState message={matchesError} />
          ) : matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not matched to any jobs yet.
            </p>
          ) : (
            <ul className="grid gap-2">
              {matches.map((m) => (
                <li key={m.id}>
                  <MatchRow
                    match={m}
                    placementContext={
                      m.job && m.job.company
                        ? {
                            candidate_id: candidate.id,
                            job_id: m.job.id,
                            company_id: m.job.company.id,
                          }
                        : undefined
                    }
                    heading={
                      m.job ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/jobs/${m.job.id}`}
                            className="font-medium hover:underline"
                          >
                            {m.job.title}
                          </Link>
                          {m.job.company ? (
                            <Link
                              href={`/companies/${m.job.company.id}`}
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              {m.job.company.company_name}
                            </Link>
                          ) : null}
                          <StatusBadge value={m.job.status} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          (Job deleted)
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
              No placements for this candidate yet.
            </p>
          ) : (
            <PlacementsMiniList
              placements={placements}
              hide={["candidate"]}
            />
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span>
              Notes
              {notes.length ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {notes.length}
                </span>
              ) : null}
            </span>
            <AiNotesButton candidateId={candidate.id} />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <AddNoteForm candidateId={candidate.id} />

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
          <AddTaskForm candidateId={candidate.id} employees={employees} />

          {tasksError ? (
            <ErrorState message={tasksError} />
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
          ) : (
            <ul className="grid gap-2">
              {tasks.map((t) => (
                <li key={t.id}>
                  <TaskRow task={t} candidateId={candidate.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <ActivityTimeline subject={{ candidateId: candidate.id }} />
      </div>
    </>
  );
}
