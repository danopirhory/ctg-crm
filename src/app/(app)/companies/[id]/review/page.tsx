import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { getCompanyReviewDocument } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/date-format";

import { PageHeader } from "../../../_components/page-header";
import { ErrorState } from "../../../_components/states";
import { RegenerateReviewButton } from "../../../reviews/_components/regenerate-button";
import { UpdateAllButton } from "../../../reviews/_components/update-all-button";
import { SnapshotDialog } from "../../../reviews/_components/snapshot-dialog";
import { RubricEditor } from "../../../reviews/_components/rubric-editor";
import { AIConsentBanner } from "../../../reviews/_components/consent-banner";
import { NarrativeEditButton } from "../../../reviews/_components/narrative-edit-button";
import {
  ReviewTable,
  type ReviewTableRow,
  NarrativePanel,
  RankingSummary,
  DocumentBanner,
} from "../../../reviews/_components/review-table";

// Dedupe-union bullets across all of a candidate's per-job reviews so
// the table renders one merged set per cell, matching the PDF template
// which has only one bullet column per candidate, not per (candidate,
// job).
function mergeBullets(rows: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    for (const b of row) {
      const k = b.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
  }
  return out;
}

export default async function CompanyReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: doc, error } = await getCompanyReviewDocument(id);

  if (error) {
    return (
      <>
        <PageHeader
          title="Candidate Review"
          actions={
            <Button variant="outline" asChild>
              <Link href={`/companies/${id}`}>
                <ArrowLeft className="size-4" aria-hidden />
                Back to company
              </Link>
            </Button>
          }
        />
        <ErrorState message={error} />
      </>
    );
  }
  if (!doc) notFound();

  const candidateNameById = new Map(
    doc.candidates.map(
      (c) => [c.id, `${c.first_name} ${c.last_name}`.trim()] as const,
    ),
  );
  const jobTitleById = new Map(doc.jobs.map((j) => [j.id, j.title] as const));

  // Build one collapsed row per candidate; sort by their best score
  // across all matched roles, tiebreak by last name. Mirrors the PDF's
  // "strongest first" reading order.
  const rows: ReviewTableRow[] = doc.candidates
    .map((c) => {
      const bestScore = c.reviews.reduce<number>(
        (m, r) =>
          r.role_fit_score != null && r.role_fit_score > m
            ? r.role_fit_score
            : m,
        -1,
      );
      return {
        candidateId: c.id,
        name: `${c.first_name} ${c.last_name}`.trim() || "-",
        location: c.location,
        militaryBranch: c.military_branch,
        rank: c.rank,
        background: mergeBullets(c.reviews.map((r) => r.background)),
        strengths: mergeBullets(c.reviews.map((r) => r.strengths)),
        areasToValidate: mergeBullets(
          c.reviews.map((r) => r.areas_to_validate),
        ),
        interviewFocus: mergeBullets(c.reviews.map((r) => r.interview_focus)),
        roleFits: c.reviews.map((r) => ({
          jobId: r.job_id,
          jobTitle: jobTitleById.get(r.job_id) ?? "Unknown role",
          score: r.role_fit_score,
          state: r.state,
        })),
        bestScore,
      };
    })
    .sort((a, b) =>
      a.bestScore === b.bestScore
        ? a.name.localeCompare(b.name)
        : b.bestScore - a.bestScore,
    );

  return (
    <>
      <PageHeader
        title={`Candidate Review - ${doc.company.company_name}`}
        description="One-page review packet. Click Generate analysis to run the full AI pass for every candidate × open role, plus the strategic Key Takeaways / Next Steps / Notes panels."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/companies/${id}`}>
                <ArrowLeft className="size-4" aria-hidden />
                Back to company
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/reviews">
                <FileText className="size-4" aria-hidden />
                Snapshots
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/companies/${id}/review/pdf`}>
                <Download className="size-4" aria-hidden />
                Download PDF
              </a>
            </Button>
            <UpdateAllButton companyId={id} />
            <SnapshotDialog companyId={id} />
          </>
        }
      />

      <AIConsentBanner />

      <DocumentBanner
        companyName={doc.company.company_name}
        generatedAt={doc.narrative.generated_at}
      />

      {doc.jobs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No active jobs at this company. Add an Open or Paused job to start
            generating candidate reviews.
          </CardContent>
        </Card>
      ) : doc.candidates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No candidates matched to this company&apos;s jobs yet. Drop a
            candidate into any of these job columns on the Candidate Pipeline
            board and they&apos;ll appear here.
          </CardContent>
        </Card>
      ) : (
        <>
          <NarrativePanel
            title="Key Takeaways"
            items={doc.narrative.key_takeaways}
            emptyHint="Click Generate analysis to draft strategic highlights."
            className="mb-6"
            action={
              <NarrativeEditButton
                companyId={id}
                field="key_takeaways"
                title="Key Takeaways"
                initial={doc.narrative.key_takeaways}
              />
            }
          />

          {doc.jobs.some((j) => j.role_rubric.length > 0) ||
          doc.jobs.length > 0 ? (
            <section className="mb-6 grid gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Job rubrics
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {doc.jobs.map((job) => (
                  <div key={job.id} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{job.title}</h3>
                        <Badge variant="secondary" className="text-[10px]">
                          {job.status}
                        </Badge>
                      </div>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                      >
                        <Link href={`/jobs/${job.id}`}>Open job →</Link>
                      </Button>
                    </div>
                    <RubricEditor jobId={job.id} initial={job.role_rubric} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <ReviewTable
            rows={rows}
            renderRegenerate={(row, fit) => (
              <RegenerateReviewButton
                candidateId={row.candidateId}
                jobId={fit.jobId}
                state={fit.state}
              />
            )}
          />

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <RankingSummary
              jobs={doc.jobs.map((j) => ({
                id: j.id,
                title: j.title,
                orderedCandidateNames: (doc.rankings[j.id] ?? [])
                  .map((cid) => candidateNameById.get(cid))
                  .filter((n): n is string => Boolean(n)),
              }))}
            />
            <NarrativePanel
              title="Next Steps"
              items={doc.narrative.next_steps}
              emptyHint="Workflow directives will appear after Generate analysis."
              action={
                <NarrativeEditButton
                  companyId={id}
                  field="next_steps"
                  title="Next Steps"
                  initial={doc.narrative.next_steps}
                />
              }
            />
            <NarrativePanel
              title="Notes"
              items={doc.narrative.notes}
              emptyHint="Cross-cutting reminders will appear after Generate analysis."
              action={
                <NarrativeEditButton
                  companyId={id}
                  field="notes"
                  title="Notes"
                  initial={doc.narrative.notes}
                />
              }
            />
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Reviews and the three callout panels regenerate only when you click{" "}
            <em>Generate analysis</em>. Snapshot the document to freeze the
            current version for sharing.
            {doc.narrative.generated_at ? (
              <>
                {" "}Last narrative draft:{" "}
                <span className="tabular-nums">
                  {formatDateTime(doc.narrative.generated_at)}
                </span>
                {doc.narrative.ai_model ? ` · ${doc.narrative.ai_model}` : ""}
              </>
            ) : null}
          </p>
        </>
      )}
    </>
  );
}
