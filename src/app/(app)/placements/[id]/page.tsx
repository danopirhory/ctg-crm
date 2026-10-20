import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Briefcase, Pencil, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import {
  estimateFee,
  getPlacement,
  getProspectOriginByCandidate,
  getProspectOriginByCompany,
} from "@/lib/db/queries";

import { PageHeader } from "../../_components/page-header";
import { ProspectOriginBanner } from "../../_components/prospect-origin-banner";
import { RoleGate } from "../../_components/role-gate";
import { StatusBadge } from "../../_components/status-badge";
import { ErrorState } from "../../_components/states";
import { InvoiceStatusSelect } from "../_components/invoice-status-select";
import { UndoPlacementButton } from "../_components/undo-placement-button";

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(n: number | null) {
  if (n == null || Number.isNaN(n)) return "-";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`grid gap-1 ${full ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function PlacementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: placement, error } = await getPlacement(id);

  if (error) {
    return (
      <>
        <PageHeader
          title="Placement"
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

  const fee = estimateFee({
    flat_fee: placement.flat_fee,
    starting_salary: placement.starting_salary,
    fee_percentage: placement.fee_percentage,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let guaranteeActive = false;
  if (placement.guarantee_end_date) {
    const [gy, gm, gd] = placement.guarantee_end_date.split("-").map(Number);
    guaranteeActive = new Date(gy, gm - 1, gd).getTime() >= today.getTime();
  }

  const candidateName = placement.candidate
    ? `${placement.candidate.first_name} ${placement.candidate.last_name}`
    : "-";

  const [candidateOrigin, companyOrigin] = await Promise.all([
    placement.candidate
      ? getProspectOriginByCandidate(placement.candidate.id)
      : Promise.resolve(null),
    placement.company
      ? getProspectOriginByCompany(placement.company.id)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title={`Placement - ${candidateName}`}
        description={
          placement.company?.company_name && placement.job?.title
            ? `${placement.job.title} at ${placement.company.company_name}`
            : undefined
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/placements">Back</Link>
            </Button>
            <RoleGate allow={["Admin", "Recruiter"]}>
              <Button asChild>
                <Link href={`/placements/${placement.id}/edit`}>
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </Link>
              </Button>
            </RoleGate>
            <RoleGate allow={["Admin"]}>
              <UndoPlacementButton placementId={placement.id} />
            </RoleGate>
          </>
        }
      />

      <ProspectOriginBanner
        origin={candidateOrigin}
        via="placement-via-candidate"
      />
      <ProspectOriginBanner origin={companyOrigin} via="company" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Financials</span>
              <span className="flex items-center gap-2">
                <StatusBadge value={placement.invoice_status} />
                <RoleGate allow={["Admin", "Recruiter"]}>
                  <InvoiceStatusSelect
                    placementId={placement.id}
                    initial={placement.invoice_status}
                  />
                </RoleGate>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Placement date">
                {formatDate(placement.placement_date)}
              </Field>
              <Field label="Guarantee end date">
                <span className="flex items-center gap-2">
                  {formatDate(placement.guarantee_end_date)}
                  {placement.guarantee_end_date ? (
                    <span
                      className={`text-xs ${guaranteeActive ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      ({guaranteeActive ? "active" : "expired"})
                    </span>
                  ) : null}
                </span>
              </Field>

              <div className="sm:col-span-2">
                <Separator className="my-2" />
              </div>

              <Field label="Starting salary">
                <span className="tabular-nums">
                  {formatCurrency(placement.starting_salary)}
                </span>
              </Field>
              <Field label="Fee percentage">
                {placement.fee_percentage != null
                  ? `${placement.fee_percentage}%`
                  : "-"}
              </Field>
              <Field label="Flat fee">
                <span className="tabular-nums">
                  {formatCurrency(placement.flat_fee)}
                </span>
              </Field>
              <Field label="Estimated fee">
                <span className="font-semibold tabular-nums">
                  {fee > 0 ? formatCurrency(fee) : "-"}
                </span>
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linked records</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              <Field label="Candidate">
                {placement.candidate ? (
                  <Link
                    href={`/candidates/${placement.candidate.id}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <UserRound className="size-4" aria-hidden />
                    {placement.candidate.first_name}{" "}
                    {placement.candidate.last_name}
                  </Link>
                ) : (
                  "-"
                )}
              </Field>
              <Field label="Company">
                {placement.company ? (
                  <Link
                    href={`/companies/${placement.company.id}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Building2 className="size-4" aria-hidden />
                    {placement.company.company_name}
                  </Link>
                ) : (
                  "-"
                )}
              </Field>
              <Field label="Job">
                {placement.job ? (
                  <Link
                    href={`/jobs/${placement.job.id}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Briefcase className="size-4" aria-hidden />
                    {placement.job.title}
                  </Link>
                ) : (
                  "-"
                )}
              </Field>
              <Separator />
              <Field label="Created">{formatDate(placement.created_at)}</Field>
              <Field label="Last updated">
                {formatDate(placement.updated_at)}
              </Field>
              <Field label="Placement ID">
                <span className="font-mono text-xs break-all">
                  {placement.id}
                </span>
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
