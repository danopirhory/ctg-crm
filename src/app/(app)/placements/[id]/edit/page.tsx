import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import {
  getPlacement,
  listCandidateOptions,
  listJobOptions,
} from "@/lib/db/queries";
import { INVOICE_STATUSES } from "@/lib/db/constants";

import { PageHeader } from "../../../_components/page-header";
import { ErrorState } from "../../../_components/states";
import { PlacementForm } from "../../_components/placement-form";
import type { PlacementFormValues } from "../../schema";

const invoiceValue = (v: string): PlacementFormValues["invoice_status"] =>
  (INVOICE_STATUSES as readonly string[]).includes(v)
    ? (v as PlacementFormValues["invoice_status"])
    : "Not Invoiced";

export default async function EditPlacementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [
    { data: placement, error },
    { data: candidates },
    { data: jobs },
  ] = await Promise.all([
    getPlacement(id),
    listCandidateOptions(),
    listJobOptions(),
  ]);

  if (error) {
    return (
      <>
        <PageHeader
          title="Edit placement"
          actions={
            <Button variant="outline" asChild>
              <Link href="/placements">Back</Link>
            </Button>
          }
        />
        <ErrorState message={error} />
      </>
    );
  }

  if (!placement) notFound();

  const defaultValues: PlacementFormValues = {
    candidate_id: placement.candidate_id,
    job_id: placement.job_id,
    company_id: placement.company_id,
    placement_date: placement.placement_date,
    starting_salary:
      placement.starting_salary == null
        ? ""
        : String(placement.starting_salary),
    fee_percentage:
      placement.fee_percentage == null
        ? ""
        : String(placement.fee_percentage),
    flat_fee: placement.flat_fee == null ? "" : String(placement.flat_fee),
    invoice_status: invoiceValue(placement.invoice_status),
    guarantee_end_date: placement.guarantee_end_date ?? "",
  };

  return (
    <>
      <PageHeader
        title="Edit placement"
        description={
          placement.candidate
            ? `${placement.candidate.first_name} ${placement.candidate.last_name}`
            : undefined
        }
      />
      <Card>
        <CardContent className="pt-6">
          <PlacementForm
            mode="edit"
            placementId={placement.id}
            candidates={candidates}
            jobs={jobs}
            defaultValues={defaultValues}
          />
        </CardContent>
      </Card>
    </>
  );
}
