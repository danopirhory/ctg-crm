"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { MATCH_STATUSES } from "@/lib/db/constants";
import type { MatchStatus } from "@/lib/db/types";

import {
  useCanDelete,
  useCanWrite,
} from "../../_components/role-context";
import {
  deleteMatch,
  updateMatchNotes,
  updateMatchStatus,
} from "../actions";

export type MatchRowData = {
  id: string;
  match_status: MatchStatus;
  submitted_at: string | null;
  interview_date: string | null;
  offer_date: string | null;
  placement_date: string | null;
  notes: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function MatchRow({
  match,
  heading,
  placementContext,
}: {
  match: MatchRowData;
  heading: React.ReactNode;
  // When provided AND the match's local status is "Placed", show a
  // "Create placement" button that deep-links to /placements/new with
  // these IDs pre-filled.
  placementContext?: {
    candidate_id: string;
    job_id: string;
    company_id: string;
  };
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const canDelete = useCanDelete();
  const [status, setStatus] = useState<MatchStatus>(match.match_status);
  const [isPending, startTransition] = useTransition();

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(match.notes ?? "");

  function changeStatus(next: string) {
    const nextStatus = next as MatchStatus;
    const prev = status;
    setStatus(nextStatus);
    startTransition(async () => {
      const r = await updateMatchStatus(match.id, nextStatus);
      if (!r.ok) {
        toast.error(r.error);
        setStatus(prev);
        return;
      }
      router.refresh();
    });
  }

  function saveNotes() {
    startTransition(async () => {
      const r = await updateMatchNotes(match.id, notesText);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Notes saved.");
      setEditingNotes(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("Remove this match?")) return;
    startTransition(async () => {
      const r = await deleteMatch(match.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Match removed.");
      router.refresh();
    });
  }

  const dates: Array<{ label: string; iso: string | null }> = [
    { label: "Submitted", iso: match.submitted_at },
    { label: "Interview", iso: match.interview_date },
    { label: "Offer", iso: match.offer_date },
    { label: "Placed", iso: match.placement_date },
  ];

  const showCreatePlacement =
    canWrite && status === "Placed" && placementContext != null;
  const placementHref = placementContext
    ? `/placements/new?candidate=${placementContext.candidate_id}` +
      `&job=${placementContext.job_id}` +
      `&company=${placementContext.company_id}` +
      (match.placement_date
        ? `&placement_date=${match.placement_date.slice(0, 10)}`
        : "")
    : "";

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 text-sm">{heading}</div>
        <Select
          value={status}
          onValueChange={changeStatus}
          disabled={isPending || !canWrite}
        >
          <SelectTrigger size="sm" className="h-8 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATCH_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showCreatePlacement ? (
          <Button asChild size="sm" variant="outline">
            <Link href={placementHref}>
              <Receipt className="size-4" aria-hidden />
              Create placement
            </Link>
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove match"
            disabled={isPending}
            onClick={handleDelete}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      {/* Dates row - only render entries that have a value */}
      {dates.some((d) => d.iso) ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {dates.map(({ label, iso }) =>
            iso ? (
              <span key={label}>
                <span className="font-medium text-foreground">{label}:</span>{" "}
                {formatDate(iso)}
              </span>
            ) : null,
          )}
        </div>
      ) : null}

      {/* Notes */}
      {editingNotes ? (
        <div className="mt-1 grid gap-2">
          <Textarea
            rows={3}
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            maxLength={5000}
            disabled={isPending}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveNotes} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setNotesText(match.notes ?? "");
                setEditingNotes(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-start justify-between gap-2">
          {match.notes ? (
            <p className="whitespace-pre-wrap text-sm">{match.notes}</p>
          ) : (
            <span className="text-xs italic text-muted-foreground">
              No notes.
            </span>
          )}
          {canWrite ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="-mr-2 -mt-1"
              onClick={() => setEditingNotes(true)}
            >
              {match.notes ? "Edit notes" : "Add notes"}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
