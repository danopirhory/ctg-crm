import { Card, CardContent } from "@/components/ui/card";
import {
  listCandidateOptions,
  listJobOptions,
} from "@/lib/db/queries";
import { PageHeader } from "../../_components/page-header";
import { ErrorState } from "../../_components/states";
import { PlacementForm } from "../_components/placement-form";
import {
  placementFormDefaults,
  type PlacementFormValues,
} from "../schema";

type SearchParams = Promise<{
  candidate?: string;
  job?: string;
  company?: string;
  placement_date?: string;
}>;

export default async function NewPlacementPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const [{ data: candidates, error: cErr }, { data: jobs, error: jErr }] =
    await Promise.all([listCandidateOptions(), listJobOptions()]);

  if (cErr || jErr) {
    return (
      <>
        <PageHeader title="New placement" />
        <ErrorState message={cErr ?? jErr ?? "Could not load pickers."} />
      </>
    );
  }

  // Validate preset IDs against the loaded options so a stale URL gracefully
  // falls back to empty selections.
  const presetCandidate =
    sp.candidate && candidates.some((c) => c.id === sp.candidate)
      ? sp.candidate
      : "";
  const presetJob =
    sp.job && jobs.some((j) => j.id === sp.job) ? sp.job : "";
  const presetJobCompany = jobs.find((j) => j.id === presetJob)?.company_id;
  const presetCompany =
    presetJobCompany ??
    (sp.company &&
    jobs.some((j) => j.company_id === sp.company) /* derived sanity */
      ? sp.company
      : "");

  const presetDate =
    sp.placement_date && /^\d{4}-\d{2}-\d{2}$/.test(sp.placement_date)
      ? sp.placement_date
      : placementFormDefaults.placement_date;

  const defaultValues: PlacementFormValues = {
    ...placementFormDefaults,
    candidate_id: presetCandidate,
    job_id: presetJob,
    company_id: presetCompany,
    placement_date: presetDate,
  };

  return (
    <>
      <PageHeader
        title="New placement"
        description="Record a closed deal."
      />
      <Card>
        <CardContent className="pt-6">
          {candidates.length === 0 || jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You need at least one candidate and one job before you can record
              a placement.
            </p>
          ) : (
            <PlacementForm
              mode="create"
              candidates={candidates}
              jobs={jobs}
              defaultValues={defaultValues}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
