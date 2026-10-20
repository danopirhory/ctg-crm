"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import type { ProspectListKind } from "@/lib/db/constants";

import { useCanWrite } from "../../_components/role-context";
import {
  convertProspectToCandidate,
  convertProspectToCompany,
} from "../actions";

// Used on the prospect list row and the prospect detail header.
// "Move to {Candidate|Employer} Pipeline" - flips pipeline_stage and
// redirects the user over to the downstream record.
export function ConvertProspectButton({
  prospectId,
  listKind,
  convertedToCandidateId,
  convertedToCompanyId,
}: {
  prospectId: string;
  listKind: ProspectListKind;
  // Kept on the props for backwards compatibility with the row markup;
  // the list query now filters out non-Prospect rows so these are
  // effectively always null at this site.
  convertedToCandidateId: string | null;
  convertedToCompanyId: string | null;
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [isPending, startTransition] = useTransition();

  const isCompany = listKind === "Company";
  const pipelineLabel = isCompany ? "Employer Pipeline" : "Candidate Pipeline";
  const targetCollection = isCompany ? "/companies" : "/candidates";

  // Defensive fallback: if a downstream id is present for any reason,
  // just offer a View link rather than re-firing the move.
  const fallbackId = isCompany ? convertedToCompanyId : convertedToCandidateId;
  if (fallbackId) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        asChild
      >
        <Link href={`${targetCollection}/${fallbackId}`}>
          View {isCompany ? "company" : "candidate"}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </Button>
    );
  }

  if (!canWrite) return <span className="text-xs text-muted-foreground">-</span>;

  function handleMove() {
    const confirmMsg = isCompany
      ? "Move this prospect into the Employer Pipeline? Their record will live in /companies. Notes, contact details, and history travel with them. You can move them back later."
      : "Move this prospect into the Candidate Pipeline? Their record will live in /candidates. Notes, contact details, and history travel with them. You can move them back later.";
    if (!confirm(confirmMsg)) return;

    startTransition(async () => {
      const r = isCompany
        ? await convertProspectToCompany(prospectId)
        : await convertProspectToCandidate(prospectId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Moved to ${pipelineLabel}.`);
      const id = "candidateId" in r ? r.candidateId : r.companyId;
      router.push(`${targetCollection}/${id}`);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 px-2 text-xs"
      onClick={handleMove}
      disabled={isPending}
    >
      {isPending ? "Moving…" : `Move to ${pipelineLabel}`}
      <ArrowRight className="size-3.5" aria-hidden />
    </Button>
  );
}
