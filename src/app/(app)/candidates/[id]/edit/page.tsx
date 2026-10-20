import { notFound } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { getCandidate } from "@/lib/db/queries";
import { CLEARANCE_LEVELS, MILITARY_BRANCHES } from "@/lib/db/constants";
import { PageHeader } from "../../../_components/page-header";
import { ErrorState } from "../../../_components/states";
import { CandidateForm } from "../../_components/candidate-form";
import type { CandidateFormValues } from "../../schema";

// Helpers: the DB columns are free `text`, but our form constrains to the
// known set. Coerce unknown values to "" so the Select renders as unset.
const branchValue = (v: string | null): CandidateFormValues["military_branch"] =>
  v && (MILITARY_BRANCHES as readonly string[]).includes(v)
    ? (v as CandidateFormValues["military_branch"])
    : "";
const clearanceValue = (v: string | null): CandidateFormValues["clearance"] =>
  v && (CLEARANCE_LEVELS as readonly string[]).includes(v)
    ? (v as CandidateFormValues["clearance"])
    : "";

export default async function EditCandidatePage({
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
          title="Edit candidate"
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

  if (!candidate) notFound();

  const defaultValues: CandidateFormValues = {
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
    military_branch: branchValue(candidate.military_branch),
    rank: candidate.rank ?? "",
    mos_or_specialty: candidate.mos_or_specialty ?? "",
    clearance: clearanceValue(candidate.clearance),
    years_of_service:
      candidate.years_of_service == null
        ? ""
        : String(candidate.years_of_service),
    target_industry: candidate.target_industry ?? "",
    target_location: candidate.target_location ?? "",
    status: candidate.status,
    source: candidate.source ?? "",
    tags: candidate.tags.join(", "),
    marketing_consent: candidate.marketing_consent,
    linkedin: candidate.linkedin ?? "",
    resume_url: candidate.resume_url ?? "",
  };

  return (
    <>
      <PageHeader
        title={`Edit ${candidate.first_name} ${candidate.last_name}`}
        description="Update this candidate's profile."
      />
      <Card>
        <CardContent className="pt-6">
          <CandidateForm
            mode="edit"
            candidateId={candidate.id}
            defaultValues={defaultValues}
          />
        </CardContent>
      </Card>
    </>
  );
}
