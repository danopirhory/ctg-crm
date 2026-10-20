"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useDroppable } from "@dnd-kit/core";
import { FileText, Undo2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
} from "../../_components/kanban/board";
import type {
  CandidateBoardData,
  CandidateKanbanCard as CandidateCard,
  JobKanbanColumn,
} from "@/lib/db/queries";
import type { CandidateStatus } from "@/lib/db/types";

import {
  moveCandidateKanbanCard,
  removeCandidateFromJob,
} from "./kanban-actions";

type Props = { data: CandidateBoardData };

// =====================================================================
// Column model. Two parent "buckets" (Prospects, Pipeline) each split
// into named sub-columns mapped to candidate.status values:
//
//   Prospects bucket:
//     Non-Vetted (Sent Resume)   → status 'New' or 'Resume Sent'
//     Vetted (Resume Review)     → status 'Screened' or 'Qualified'
//
//   Pipeline bucket:
//     Interview Prep (Initial Call Complete)   → 'Contacted'
//     Ready to Interview (Interview Prep Complete) → 'Submitted'
//     Interviewing                              → 'Interviewing' or 'Offer'
//
//   Job columns                  → candidate_job_matches per active job
// =====================================================================

const PROSPECTS_NON_VETTED: CandidateStatus[] = ["New", "Resume Sent"];
const PROSPECTS_VETTED: CandidateStatus[] = ["Screened", "Qualified"];
const PIPELINE_PREP: CandidateStatus[] = ["Contacted"];
const PIPELINE_READY: CandidateStatus[] = ["Submitted"];
const PIPELINE_INTERVIEWING: CandidateStatus[] = ["Interviewing", "Offer"];
const PIPELINE_PASSED_OVER: CandidateStatus[] = ["Passed Over"];

const PROSPECTS_ACCENT = "bg-amber-50/60 dark:bg-amber-950/20";
const PIPELINE_ACCENT = "bg-blue-50/60 dark:bg-blue-950/20";
const PASSED_OVER_ACCENT = "bg-red-100/80 dark:bg-red-950/30";

type MoveInput = { cardId: string; fromColumn: string; toColumn: string };

// Client-side mirror of the server move semantics in kanban-actions.ts,
// applied instantly via useOptimistic so the card lands before the
// round trip finishes. Must stay in sync with SUB_BUCKET_STATUS there.
const SUB_BUCKET_LOCAL_STATUS: Record<string, CandidateStatus> = {
  "prospects-non-vetted": "New",
  "prospects-vetted": "Screened",
  "pipeline-prep": "Contacted",
  "pipeline-ready": "Submitted",
  "pipeline-interviewing": "Interviewing",
  "pipeline-passed-over": "Passed Over",
};

function applyMoveLocally(
  data: CandidateBoardData,
  input: MoveInput,
): CandidateBoardData {
  const [kind, candidateId] = input.cardId.split(":");
  if (kind !== "candidate" || !candidateId) return data;
  const { fromColumn, toColumn } = input;

  if (toColumn === "back-to-leads") {
    return {
      ...data,
      candidates: data.candidates.filter((c) => c.id !== candidateId),
      jobs: data.jobs.map((j) => ({
        ...j,
        matched_candidate_ids: j.matched_candidate_ids.filter(
          (id) => id !== candidateId,
        ),
      })),
    };
  }

  if (toColumn in SUB_BUCKET_LOCAL_STATUS) {
    const status = SUB_BUCKET_LOCAL_STATUS[toColumn];
    return {
      ...data,
      candidates: data.candidates.map((c) =>
        c.id === candidateId ? { ...c, status } : c,
      ),
      jobs: fromColumn.startsWith("job:")
        ? data.jobs.map((j) =>
            j.id === fromColumn.slice(4)
              ? {
                  ...j,
                  matched_candidate_ids: j.matched_candidate_ids.filter(
                    (id) => id !== candidateId,
                  ),
                }
              : j,
          )
        : data.jobs,
    };
  }

  if (toColumn.startsWith("job:")) {
    const toJobId = toColumn.slice(4);
    const fromJobId = fromColumn.startsWith("job:")
      ? fromColumn.slice(4)
      : null;
    return {
      ...data,
      jobs: data.jobs.map((j) => {
        if (j.id === toJobId && !j.matched_candidate_ids.includes(candidateId)) {
          return {
            ...j,
            matched_candidate_ids: [...j.matched_candidate_ids, candidateId],
          };
        }
        if (fromJobId && j.id === fromJobId && fromJobId !== toJobId) {
          return {
            ...j,
            matched_candidate_ids: j.matched_candidate_ids.filter(
              (id) => id !== candidateId,
            ),
          };
        }
        return j;
      }),
    };
  }

  return data;
}

export function CandidatesKanban({ data }: Props) {
  const router = useRouter();
  // Optimistic board: the reducer applies the move instantly; the
  // transition holds it until router.refresh() delivers fresh server
  // props (which either confirm the move or revert it on failure).
  const [board, applyOptimistic] = React.useOptimistic(data, applyMoveLocally);
  const [, startTransition] = React.useTransition();

  const candidateById = new Map(board.candidates.map((c) => [c.id, c]));
  const byStatus = (statuses: CandidateStatus[]) =>
    board.candidates.filter((c) => statuses.includes(c.status));

  const nonVetted = byStatus(PROSPECTS_NON_VETTED);
  const vetted = byStatus(PROSPECTS_VETTED);
  const prep = byStatus(PIPELINE_PREP);
  const ready = byStatus(PIPELINE_READY);
  const interviewing = byStatus(PIPELINE_INTERVIEWING);
  const passedOver = byStatus(PIPELINE_PASSED_OVER);

  function handleMove(input: MoveInput) {
    startTransition(async () => {
      applyOptimistic(input);
      const r = await moveCandidateKanbanCard(input);
      if (!r.ok) {
        toast.error(r.error);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  function renderOverlay(activeId: string) {
    const [, id] = activeId.split(":");
    const card = candidateById.get(id);
    return card ? <CandidateCardBody card={card} /> : null;
  }

  // Three independent columns, each a top-aligned vertical stack:
  //
  //   Left:    Non-Vetted → Vetted → Back to lead source drop zone
  //   Middle:  Interview Prep → Ready to Interview → Interviewing
  //   Right:   one bucket per active job (alphabetical)
  //
  // Columns are flex children rather than a shared CSS grid so each
  // stack grows to its own content height - a long Non-Vetted list no
  // longer forces empty space in the columns beside it.
  const sortedJobs = [...board.jobs].sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  return (
    <KanbanBoard
      onMove={handleMove}
      renderOverlay={renderOverlay}
      containerClassName="flex items-start gap-3 overflow-x-auto pb-4"
    >
      {/* Left column - Prospects, then the return drop zone */}
      <div className="flex min-w-[280px] flex-1 flex-col gap-3">
        <SubBucket
          id="prospects-non-vetted"
          title="Non-Vetted"
          titleNote="Sent Resume"
          parent="Prospects"
          accent={PROSPECTS_ACCENT}
          cards={nonVetted}
          emptyHint="New candidates moved from Leads land here."
          router={router}
        />
        <SubBucket
          id="prospects-vetted"
          title="Vetted"
          titleNote="Resume Review Complete"
          parent="Prospects"
          accent={PROSPECTS_ACCENT}
          cards={vetted}
          emptyHint="Drop a candidate here once they've been vetted."
          router={router}
        />
        <LeadReturnDropZone />
      </div>

      {/* Middle column - Pipeline stages */}
      <div className="flex min-w-[280px] flex-1 flex-col gap-3">
        <SubBucket
          id="pipeline-prep"
          title="Interview Prep"
          titleNote="Initial Call Complete"
          parent="Pipeline"
          accent={PIPELINE_ACCENT}
          cards={prep}
          emptyHint="Drop vetted candidates here once they're working the pipeline."
          router={router}
        />
        <SubBucket
          id="pipeline-ready"
          title="Ready to Interview"
          titleNote="Interview Prep Complete"
          parent="Pipeline"
          accent={PIPELINE_ACCENT}
          cards={ready}
          emptyHint="Drop candidates here when they're ready to interview."
          router={router}
        />
        <SubBucket
          id="pipeline-interviewing"
          title="Interviewing"
          parent="Pipeline"
          accent={PIPELINE_ACCENT}
          cards={interviewing}
          emptyHint="Drop candidates here while they're actively interviewing."
          router={router}
        />
        <SubBucket
          id="pipeline-passed-over"
          title="Passed Over"
          parent="Pipeline"
          accent={PASSED_OVER_ACCENT}
          cards={passedOver}
          emptyHint="Drop candidates here who interviewed but weren't selected."
          router={router}
        />
      </div>

      {/* Right column - one bucket per active job */}
      <div className="flex min-w-[280px] flex-1 flex-col gap-3">
        {sortedJobs.length > 0 ? (
          sortedJobs.map((job) => (
            <JobColumn
              key={job.id}
              job={job}
              allCandidates={candidateById}
              onCardClick={(id) => router.push(`/candidates/${id}`)}
            />
          ))
        ) : (
          <div className="grid min-h-[120px] place-items-center rounded-lg border border-dashed bg-card p-3 text-center text-xs text-muted-foreground">
            No active jobs yet. Add a job from a company card to create a
            bucket here.
          </div>
        )}
      </div>
    </KanbanBoard>
  );
}

// Destructive drop target sitting below the Prospects buckets. Dropping
// a candidate card here removes them from the Candidate Pipeline and
// sends them back to their originating lead list (via the existing
// "Move back to Leads" flow). Candidates without a linked lead see a
// friendly error toast - nothing else changes.
function LeadReturnDropZone({ style }: { style?: React.CSSProperties }) {
  const { setNodeRef, isOver } = useDroppable({ id: "back-to-leads" });
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "grid min-h-[180px] place-items-center rounded-lg border-2 border-dashed border-destructive bg-destructive/5 p-3 text-center transition-colors",
        isOver && "bg-destructive/15 ring-2 ring-destructive",
      )}
    >
      <div className="flex flex-col items-center gap-1">
        <Undo2 className="size-4 text-destructive" aria-hidden />
        <div className="text-xs font-semibold text-destructive">
          Move back to lead source
        </div>
        <div className="text-[10px] font-normal leading-tight text-destructive/80">
          Drop to remove from pipeline.
        </div>
      </div>
    </div>
  );
}

function SubBucket({
  id,
  title,
  titleNote,
  parent,
  accent,
  cards,
  emptyHint,
  router,
  style,
}: {
  id: string;
  title: string;
  // Optional small annotation rendered next to the bold title. Used to
  // call out the meaning of a sub-bucket without burying it in the
  // subtitle (e.g. "Vetted - Resume Review Complete").
  titleNote?: string;
  parent: string;
  accent: string;
  cards: CandidateCard[];
  emptyHint: string;
  router: ReturnType<typeof useRouter>;
  style?: React.CSSProperties;
}) {
  return (
    <KanbanColumn
      id={id}
      title={
        titleNote ? (
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <span>{title}</span>
            <span className="text-[10px] font-normal italic text-muted-foreground">
              {titleNote}
            </span>
          </span>
        ) : (
          title
        )
      }
      subtitle={`${parent} · ${cards.length}`}
      accent={accent}
      emptyHint={emptyHint}
      style={style}
      className="w-auto min-w-0"
    >
      {cards.map((c) => (
        <KanbanCard
          key={c.id}
          id={`candidate:${c.id}`}
          columnId={id}
          onClick={() => router.push(`/candidates/${c.id}`)}
        >
          <CandidateCardBody card={c} />
        </KanbanCard>
      ))}
    </KanbanColumn>
  );
}

function JobColumn({
  job,
  allCandidates,
  onCardClick,
  style,
}: {
  job: JobKanbanColumn;
  allCandidates: Map<string, CandidateCard>;
  onCardClick: (candidateId: string) => void;
  style?: React.CSSProperties;
}) {
  const matched = job.matched_candidate_ids
    .map((cid) => allCandidates.get(cid))
    .filter((c): c is CandidateCard => Boolean(c));
  const columnId = `job:${job.id}`;
  return (
    <KanbanColumn
      id={columnId}
      title={job.title}
      subtitle={job.company?.company_name ?? "-"}
      accent="bg-violet-50/60 dark:bg-violet-950/20"
      headerExtra={
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {job.status}
        </Badge>
      }
      emptyHint="Drag candidates here to put them up for this role."
      style={style}
      className="w-auto min-w-0"
    >
      {matched.map((c) => (
        <KanbanCard
          key={`${columnId}-${c.id}`}
          // dnd-kit keys draggables by id alone; if the same candidate
          // appears in multiple job columns (or also in a pipeline
          // sub-bucket) every duplicate id animates together. Namespacing
          // the job-bucket card id with the job keeps each (candidate,
          // job) draggable independent. Downstream parsers (overlay
          // renderer, kanban-actions) read the candidate id from
          // split(':')[1], which still works for both id formats.
          id={`candidate:${c.id}:job:${job.id}`}
          columnId={columnId}
          onClick={() => onCardClick(c.id)}
        >
          <div className="relative pr-5">
            <RemoveFromJobButton
              candidateId={c.id}
              jobId={job.id}
              candidateName={
                `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "this candidate"
              }
              jobTitle={job.title}
            />
            <CandidateCardBody card={c} />
          </div>
        </KanbanCard>
      ))}
    </KanbanColumn>
  );
}

// Sits in the top-right corner of a candidate card inside a job bucket
// only. Removes the (candidate, job) match without touching the
// candidate's pipeline status. pointerDown/mouseDown propagation has
// to be stopped or dnd-kit's PointerSensor will hijack the click and
// start a drag instead of firing onClick.
function RemoveFromJobButton({
  candidateId,
  jobId,
  candidateName,
  jobTitle,
}: {
  candidateId: string;
  jobId: string;
  candidateName: string;
  jobTitle: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function click(e: React.MouseEvent) {
    e.stopPropagation();
    if (
      !confirm(
        `Remove ${candidateName} from the "${jobTitle}" job bucket? Their pipeline status stays the same; only the match for this role goes away.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await removeCandidateFromJob(candidateId, jobId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Removed from job.");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      aria-label={`Remove ${candidateName} from ${jobTitle}`}
      title={`Remove from ${jobTitle}`}
      disabled={isPending}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={click}
      className={cn(
        "absolute right-0 top-0 grid size-5 place-items-center rounded-full border bg-background text-muted-foreground transition-colors",
        "hover:border-destructive hover:bg-destructive hover:text-destructive-foreground",
        isPending && "opacity-50",
      )}
    >
      <X className="size-3" aria-hidden />
    </button>
  );
}

function CandidateCardBody({ card }: { card: CandidateCard }) {
  const name =
    `${card.first_name ?? ""} ${card.last_name ?? ""}`.trim() || "-";
  return (
    // Name + email on the left; status / resume / location wrap to the
    // right of them to keep each card down to ~two lines tall.
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate font-medium leading-tight">{name}</div>
        {card.email ? (
          <div className="truncate text-xs text-muted-foreground">
            {card.email}
          </div>
        ) : null}
      </div>
      <div className="flex max-w-[55%] shrink-0 flex-col items-end gap-1 text-[10px] text-muted-foreground">
        {/* Status + resume on top, city/state underneath. */}
        <div className="flex items-center justify-end gap-1">
          <Badge variant="outline" className="text-[10px]">
            {card.status}
          </Badge>
          {card.resume_url ? (
            <span
              title="Resume on file"
              className="inline-flex items-center text-emerald-600 dark:text-emerald-400"
            >
              <FileText className="size-3" aria-label="Resume on file" />
            </span>
          ) : (
            <span
              title="No resume yet - AI review unavailable"
              className="rounded border border-amber-300 bg-amber-50 px-1 text-[9px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
            >
              No resume
            </span>
          )}
        </div>
        {card.target_location ? (
          <span className="text-right">{card.target_location}</span>
        ) : null}
      </div>
    </div>
  );
}
