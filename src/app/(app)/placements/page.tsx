import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  estimateFee,
  getPlacementSummary,
  listPlacements,
} from "@/lib/db/queries";

import { PageHeader } from "../_components/page-header";
import { RoleGate } from "../_components/role-gate";
import { StatusBadge } from "../_components/status-badge";
import { EmptyState, ErrorState } from "../_components/states";
import { PlacementSummaryCards } from "./_components/summary-cards";

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

export default async function PlacementsPage() {
  const [
    { data: summary, error: summaryError },
    { data: placements, error: listError },
  ] = await Promise.all([getPlacementSummary(), listPlacements()]);

  return (
    <>
      <PageHeader
        title="Placements"
        description="Closed deals and invoice tracking."
        actions={
          <RoleGate allow={["Admin", "Recruiter"]}>
            <Button asChild>
              <Link href="/placements/new">
                <Plus className="size-4" aria-hidden />
                New placement
              </Link>
            </Button>
          </RoleGate>
        }
      />

      {summaryError ? (
        <ErrorState message={summaryError} />
      ) : (
        <div className="mb-6">
          <PlacementSummaryCards summary={summary} />
        </div>
      )}

      {listError ? (
        <ErrorState message={listError} />
      ) : placements.length === 0 ? (
        <EmptyState
          title="No placements yet"
          description='Mark a candidate-job match as "Placed", then click "Create placement".'
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="hidden md:table-cell">Job</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="hidden md:table-cell tabular-nums">
                  Est. fee
                </TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Guarantee
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {placements.map((p) => {
                const fee = estimateFee({
                  flat_fee: p.flat_fee,
                  starting_salary: p.starting_salary,
                  fee_percentage: p.fee_percentage,
                });
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/placements/${p.id}`}
                        className="hover:underline"
                      >
                        {p.candidate
                          ? `${p.candidate.first_name} ${p.candidate.last_name}`
                          : "-"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.company ? (
                        <Link
                          href={`/companies/${p.company.id}`}
                          className="hover:underline"
                        >
                          {p.company.company_name}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {p.job ? (
                        <Link
                          href={`/jobs/${p.job.id}`}
                          className="hover:underline"
                        >
                          {p.job.title}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {formatDate(p.placement_date)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell tabular-nums">
                      {fee > 0 ? formatCurrency(fee) : "-"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={p.invoice_status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatDate(p.guarantee_end_date)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
