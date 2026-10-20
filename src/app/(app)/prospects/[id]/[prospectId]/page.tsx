import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import {
  getProspect,
  getProspectList,
  listProspectNotes,
} from "@/lib/db/queries";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { createResumeSignedUrl } from "../../../candidates/_lib/signed-url";

import { PageHeader } from "../../../_components/page-header";
import { RoleGate } from "../../../_components/role-gate";
import { ErrorState } from "../../../_components/states";
import { ConvertProspectButton } from "../../_components/convert-prospect-button";
import { DeleteProspectButton } from "../../_components/delete-prospect-button";
import { AddProspectNoteForm } from "./_components/add-prospect-note-form";

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

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string; prospectId: string }>;
}) {
  const { id: listId, prospectId } = await params;

  const [{ data: list, error: listError }, { data: prospect, error: pError }] =
    await Promise.all([getProspectList(listId), getProspect(prospectId)]);

  // Notes are best fetched after we know the converted_to_candidate_id so
  // the query OR's against both ids. Cheap enough to skip parallelism.

  if (listError || pError) {
    return (
      <>
        <PageHeader
          title="Prospect"
          actions={
            <Button variant="outline" asChild>
              <Link href={`/prospects/${listId}`}>Back</Link>
            </Button>
          }
        />
        <ErrorState message={listError ?? pError ?? "Failed to load."} />
      </>
    );
  }

  if (!list || !prospect || prospect.list_id !== listId) notFound();

  // No remnants: once the individual has moved into the Candidate or
  // Employer pipeline, their record lives there. Bounce the user over
  // instead of showing a stale prospect view.
  if (
    prospect.pipeline_stage === "Candidate" &&
    prospect.converted_to_candidate_id
  ) {
    redirect(`/candidates/${prospect.converted_to_candidate_id}`);
  }
  if (
    prospect.pipeline_stage === "Company" &&
    prospect.converted_to_company_id
  ) {
    redirect(`/companies/${prospect.converted_to_company_id}`);
  }

  const { data: notes, error: notesError } = await listProspectNotes(
    prospect.id,
    prospect.converted_to_candidate_id,
  );

  // Resume link: new uploads (from the website or CRM) store a storage PATH
  // in the private `resumes` bucket - sign it. Legacy rows may hold a full URL
  // (e.g. an old LinkedIn link) - use those as-is.
  let resumeHref: string | null = null;
  if (prospect.resume_url) {
    if (/^https?:\/\//i.test(prospect.resume_url)) {
      resumeHref = prospect.resume_url;
    } else {
      const { url } = await createResumeSignedUrl(prospect.resume_url);
      resumeHref = url;
    }
  }

  const isCompany = list.kind === "Company";
  const fullName =
    [prospect.first_name, prospect.last_name].filter(Boolean).join(" ") ||
    prospect.company_name ||
    "-";

  // We're guaranteed to be in pipeline_stage='Prospect' here (the
  // redirect above bounces moved-on rows). Edit always happens on the
  // prospect surface using the shared form.
  const editHref = `/prospects/${listId}/${prospectId}/edit`;

  return (
    <>
      <PageHeader
        title={fullName}
        description={
          isCompany
            ? prospect.company_name ?? undefined
            : prospect.email ?? "No email on file"
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/prospects/${listId}`}>Back</Link>
            </Button>
            <RoleGate allow={["Admin", "Recruiter"]}>
              <Button asChild>
                <Link href={editHref}>
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </Link>
              </Button>
            </RoleGate>
            <ConvertProspectButton
              prospectId={prospect.id}
              listKind={list.kind}
              convertedToCandidateId={prospect.converted_to_candidate_id}
              convertedToCompanyId={prospect.converted_to_company_id}
            />
            <DeleteProspectButton
              prospectId={prospect.id}
              displayName={fullName}
              redirectTo={`/prospects/${listId}`}
              label="Delete"
            />
          </>
        }
      />

      {/* Pipeline-stage breadcrumb back up to the list */}
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Link href={`/prospects/${list.id}`} className="hover:underline">
          {list.name}
        </Link>
        <ArrowRight className="size-3" aria-hidden />
        <span>{fullName}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            {isCompany ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Company name">
                  {prospect.company_name ?? "-"}
                </Field>
                <Field label="Industry">{prospect.industry ?? "-"}</Field>

                <div className="sm:col-span-2">
                  <Separator className="my-2" />
                </div>

                <Field label="Contact first name">
                  {prospect.first_name ?? "-"}
                </Field>
                <Field label="Contact last name">
                  {prospect.last_name ?? "-"}
                </Field>
                <Field label="Contact email">{prospect.email ?? "-"}</Field>
                <Field label="Contact phone">{prospect.phone ?? "-"}</Field>
                <Field label="Contact title">{prospect.title ?? "-"}</Field>
                <Field label="Location">{prospect.location ?? "-"}</Field>

                <div className="sm:col-span-2">
                  <Separator className="my-2" />
                </div>

                <div className="sm:col-span-2">
                  <Field label="Hiring needs">
                    <span className="whitespace-pre-wrap">
                      {prospect.hiring_needs ?? "-"}
                    </span>
                  </Field>
                </div>
              </dl>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="First name">{prospect.first_name ?? "-"}</Field>
                <Field label="Last name">{prospect.last_name ?? "-"}</Field>
                <Field label="Email">{prospect.email ?? "-"}</Field>
                <Field label="Phone">{prospect.phone ?? "-"}</Field>

                <div className="sm:col-span-2">
                  <Separator className="my-2" />
                </div>

                <Field label="Military branch">
                  {prospect.military_branch ?? "-"}
                </Field>
                <Field label="Rank">{prospect.rank ?? "-"}</Field>
                <Field label="MOS / Specialty">
                  {prospect.mos_or_specialty ?? "-"}
                </Field>
                <Field label="Years of service">
                  {prospect.years_of_service ?? "-"}
                </Field>
                <Field label="Clearance">{prospect.clearance ?? "-"}</Field>
                <Field label="Current title">{prospect.title ?? "-"}</Field>

                <div className="sm:col-span-2">
                  <Separator className="my-2" />
                </div>

                <Field label="Target industry">
                  {prospect.industry ?? "-"}
                </Field>
                <Field label="Target location">
                  {prospect.location ?? "-"}
                </Field>
                <Field label="Source">
                  {prospect.source ?? list.source ?? "-"}
                </Field>
                <Field label="Tags">
                  {prospect.tags.length === 0 ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {prospect.tags.map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Field>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              <Field label="List">
                <Link
                  href={`/prospects/${list.id}`}
                  className="text-primary hover:underline"
                >
                  {list.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {list.kind} list
                </div>
              </Field>
              <Field label="Marketing consent">
                {prospect.marketing_consent ? "Yes" : "No"}
              </Field>
              {!isCompany ? (
                <Field label="LinkedIn">
                  {prospect.linkedin ? (
                    <a
                      href={prospect.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline break-all"
                    >
                      {prospect.linkedin}
                    </a>
                  ) : (
                    "No LinkedIn on file"
                  )}
                </Field>
              ) : null}
              {!isCompany ? (
                <Field label="Resume">
                  {!prospect.resume_url ? (
                    "No resume on file"
                  ) : resumeHref ? (
                    <a
                      href={resumeHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline break-all"
                    >
                      Open resume
                    </a>
                  ) : (
                    <span className="text-destructive text-xs">
                      Resume file is unavailable.
                    </span>
                  )}
                </Field>
              ) : null}
              <Separator />
              <Field label="Added">{formatDate(prospect.created_at)}</Field>
              <Field label="Last updated">
                {formatDate(prospect.updated_at)}
              </Field>
              <Field label="Prospect ID">
                <span className="font-mono text-xs break-all">
                  {prospect.id}
                </span>
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Notes - shared timeline with the linked candidate */}
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
          <AddProspectNoteForm prospectId={prospect.id} />

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
    </>
  );
}
