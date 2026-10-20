import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { getReviewSnapshot } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/date-format";

import { PageHeader } from "../../_components/page-header";
import { ErrorState } from "../../_components/states";
import { DeleteSnapshotButton } from "../_components/delete-snapshot-button";
import {
  DocumentBanner,
  NarrativePanel,
  RankingSummary,
  ReviewTable,
  type ReviewTableRow,
} from "../_components/review-table";

// Same dedupe-union as the live page so the snapshot renders identically
// to the document the recruiter froze.
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

export default async function SnapshotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: snap, error } = await getReviewSnapshot(id);

  if (error) {
    return (
      <>
        <PageHeader
          title="Review snapshot"
          actions={
            <Button variant="outline" asChild>
              <Link href="/reviews">
                <ArrowLeft className="size-4" aria-hidden />
                Back
              </Link>
            </Button>
          }
        />
        <ErrorState message={error} />
      </>
    );
  }
  if (!snap) notFound();

  const { payload } = snap;
  // Older snapshots (pre-migration 0018) won't have a narrative block;
  // fall back to empty arrays so the panels render the empty hint
  // instead of crashing on undefined.
  const narrative = payload.narrative ?? {
    key_takeaways: [],
    next_steps: [],
    notes: [],
    generated_at: null,
    ai_model: null,
  };

  const jobTitleById = new Map(
    payload.jobs.map((j) => [j.id, j.title] as const),
  );
  const candidateNameById = new Map(
    payload.candidates.map(
      (c) => [c.id, `${c.first_name} ${c.last_name}`.trim()] as const,
    ),
  );

  const rows: ReviewTableRow[] = payload.candidates
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
        title={`Snapshot - ${payload.company.company_name}`}
        description={
          <span className="text-xs">
            Taken {formatDateTime(snap.created_at)}
            {snap.taken_by_name ? ` by ${snap.taken_by_name}` : ""}
            {snap.ai_model ? ` · ${snap.ai_model}` : ""}
            {snap.label ? (
              <>
                {" · "}
                <em>&ldquo;{snap.label}&rdquo;</em>
              </>
            ) : null}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/reviews">
                <ArrowLeft className="size-4" aria-hidden />
                All snapshots
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/companies/${payload.company.id}/review`}>
                <Building2 className="size-4" aria-hidden />
                Open live document
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/reviews/${snap.id}/pdf`}>
                <Download className="size-4" aria-hidden />
                Download PDF
              </a>
            </Button>
            <DeleteSnapshotButton
              snapshotId={snap.id}
              snapshotLabel={snap.label}
              variant="label"
            />
          </>
        }
      />

      <p className="mb-6 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        This is a frozen-in-time copy. The data here will never change, even if
        the underlying candidates, jobs, or scores have moved on since the
        snapshot was taken.
      </p>

      <DocumentBanner
        companyName={payload.company.company_name}
        generatedAt={snap.created_at}
      />

      {payload.jobs.length === 0 || rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            This snapshot captured no active jobs or candidates.
          </CardContent>
        </Card>
      ) : (
        <>
          <NarrativePanel
            title="Key Takeaways"
            items={narrative.key_takeaways}
            emptyHint="This snapshot did not include a narrative draft."
            className="mb-6"
          />

          <ReviewTable rows={rows} />

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <RankingSummary
              jobs={payload.jobs.map((j) => ({
                id: j.id,
                title: j.title,
                orderedCandidateNames: (payload.rankings[j.id] ?? [])
                  .map((cid) => candidateNameById.get(cid))
                  .filter((n): n is string => Boolean(n)),
              }))}
            />
            <NarrativePanel
              title="Next Steps"
              items={narrative.next_steps}
              emptyHint="This snapshot did not include workflow directives."
            />
            <NarrativePanel
              title="Notes"
              items={narrative.notes}
              emptyHint="This snapshot did not include cross-cutting notes."
            />
          </div>
        </>
      )}
    </>
  );
}
