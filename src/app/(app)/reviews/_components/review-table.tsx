import Link from "next/link";
import { Lightbulb, ListChecks, StickyNote } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { RoleFitBar } from "./role-fit-bar";

// =====================================================================
// Read-only table primitives shared between the live company review
// page (/companies/[id]/review) and the frozen snapshot page
// (/reviews/[id]). The shape is built to match the review PDF
// template: one row per candidate, six columns wide.
// =====================================================================

export type RoleFit = {
  jobId: string;
  jobTitle: string;
  score: number | null;
  state: "pending-resume" | "ready" | "manual";
};

export type ReviewTableRow = {
  candidateId: string;
  name: string;
  location: string | null;
  militaryBranch: string | null;
  rank: string | null;
  background: string[];
  strengths: string[];
  areasToValidate: string[];
  interviewFocus: string[];
  roleFits: RoleFit[];
  bestScore: number;
};

// Document banner - the dark strip at the very top of the PDF
// ("CTG & <Client> Candidate Review Notes | <date> | Internal Use Only").
// Server-rendered, so the timestamp is deterministic from the doc state.
export function DocumentBanner({
  companyName,
  generatedAt,
}: {
  companyName: string;
  generatedAt: string | null;
}) {
  const dateLabel = generatedAt
    ? new Date(generatedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York",
      })
    : new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York",
      });
  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-semibold">CTG & {companyName}</span>
        <span className="text-muted-foreground">Candidate Review Notes</span>
      </div>
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="tabular-nums">{dateLabel}</span>
        <span className="hidden sm:inline">·</span>
        <span className="hidden sm:inline">Internal Use Only</span>
      </div>
    </div>
  );
}

// Six-column candidate table. `renderRegenerate` is optional so the
// snapshot view can render without per-row buttons.
export function ReviewTable({
  rows,
  renderRegenerate,
}: {
  rows: ReviewTableRow[];
  renderRegenerate?: (row: ReviewTableRow, fit: RoleFit) => React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full min-w-[1100px] border-collapse text-xs">
        <thead className="bg-muted/40">
          <tr className="text-left">
            <Th className="w-[160px]">Candidate &amp; Location</Th>
            <Th>Background Summary</Th>
            <Th>Strengths</Th>
            <Th>Areas to Validate</Th>
            <Th className="w-[180px]">Role Fit</Th>
            <Th>Interview Focus</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.candidateId}
              className={cn(
                "align-top",
                idx % 2 === 1 && "bg-muted/10",
                "border-t",
              )}
            >
              <Td>
                <Link
                  href={`/candidates/${row.candidateId}`}
                  className="font-semibold leading-tight hover:underline"
                >
                  {row.name}
                </Link>
                {row.location ? (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {row.location}
                  </div>
                ) : null}
                {row.militaryBranch || row.rank ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.militaryBranch ? (
                      <Badge variant="outline" className="text-[10px]">
                        {row.militaryBranch}
                      </Badge>
                    ) : null}
                    {row.rank ? (
                      <Badge variant="outline" className="text-[10px]">
                        {row.rank}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </Td>
              <Td>{bulletList(row.background)}</Td>
              <Td>{bulletList(row.strengths)}</Td>
              <Td>{bulletList(row.areasToValidate)}</Td>
              <Td>
                {row.roleFits.length === 0 ? (
                  <p className="italic text-muted-foreground">-</p>
                ) : (
                  <div className="grid gap-2">
                    {row.roleFits.map((fit) => (
                      <div key={fit.jobId} className="grid gap-1">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {fit.jobTitle}
                        </div>
                        <RoleFitBar score={fit.score} />
                        {fit.state === "pending-resume" ? (
                          <span className="w-fit rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[9px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                            Pending resume
                          </span>
                        ) : null}
                        {renderRegenerate ? (
                          <div>{renderRegenerate(row, fit)}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </Td>
              <Td>{bulletList(row.interviewFocus)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Three-up callout panels at top and bottom of the doc. Matches the
// soft-card visual from the PDF; collapses to an "empty" hint when the
// AI hasn't drafted yet.
export function NarrativePanel({
  title,
  items,
  emptyHint,
  className,
  action,
}: {
  title: "Key Takeaways" | "Next Steps" | "Notes";
  items: string[];
  emptyHint: string;
  className?: string;
  // Optional header affordance - the live document passes the edit
  // pencil here; snapshots leave it out so they stay visibly frozen.
  action?: React.ReactNode;
}) {
  const Icon =
    title === "Key Takeaways"
      ? Lightbulb
      : title === "Next Steps"
        ? ListChecks
        : StickyNote;
  return (
    <section
      className={cn(
        "rounded-md border bg-emerald-50/40 p-4 dark:bg-emerald-950/10",
        className,
      )}
    >
      <header className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-emerald-700 dark:text-emerald-300" aria-hidden />
        <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          {title}
        </h2>
        {action ? <span className="ml-auto">{action}</span> : null}
      </header>
      {items.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="grid gap-1 text-xs leading-relaxed">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-emerald-600 dark:bg-emerald-400"
              />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Per-job ranked candidate list. Mirrors the bottom-left "Ranking
// Summary" callout in the PDF.
export function RankingSummary({
  jobs,
}: {
  jobs: { id: string; title: string; orderedCandidateNames: string[] }[];
}) {
  return (
    <section className="rounded-md border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Ranking Summary</h2>
      {jobs.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          No jobs to rank against yet.
        </p>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => (
            <div key={job.id} className="grid gap-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Best fit for {job.title}
              </div>
              {job.orderedCandidateNames.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">-</p>
              ) : (
                <ol className="grid gap-1 text-xs">
                  {job.orderedCandidateNames.map((name, i) => (
                    <li
                      key={`${job.id}-${i}`}
                      className="flex items-center gap-2"
                    >
                      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background tabular-nums">
                        {i + 1}
                      </span>
                      <span className="font-medium">{name}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Internal helpers - kept local to avoid leaking table-only styling.
function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "border-b border-border/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3 align-top">{children}</td>;
}

function bulletList(items: string[]) {
  if (items.length === 0) {
    return <p className="italic text-muted-foreground">-</p>;
  }
  return (
    <ul className="grid gap-0.5 text-xs leading-snug">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span
            aria-hidden
            className="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-foreground/60"
          />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
