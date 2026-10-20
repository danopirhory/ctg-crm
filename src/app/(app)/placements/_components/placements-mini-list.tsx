import Link from "next/link";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { estimateFee, type PlacementListItem } from "@/lib/db/queries";

import { StatusBadge } from "../../_components/status-badge";

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

// Columns to hide based on the parent context (since e.g. on a candidate
// detail page we don't need to show the candidate column).
type HideColumn = "candidate" | "company" | "job";

export function PlacementsMiniList({
  placements,
  hide = [],
}: {
  placements: PlacementListItem[];
  hide?: HideColumn[];
}) {
  const isHidden = (c: HideColumn) => hide.includes(c);

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            {!isHidden("candidate") ? <TableHead>Candidate</TableHead> : null}
            {!isHidden("company") ? (
              <TableHead className="hidden md:table-cell">Company</TableHead>
            ) : null}
            {!isHidden("job") ? (
              <TableHead className="hidden md:table-cell">Job</TableHead>
            ) : null}
            <TableHead className="hidden sm:table-cell">Date</TableHead>
            <TableHead className="tabular-nums">Est. fee</TableHead>
            <TableHead>Invoice</TableHead>
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
                {!isHidden("candidate") ? (
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
                ) : null}
                {!isHidden("company") ? (
                  <TableCell className="hidden md:table-cell text-muted-foreground">
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
                ) : null}
                {!isHidden("job") ? (
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
                ) : null}
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {formatDate(p.placement_date)}
                </TableCell>
                <TableCell className="tabular-nums">
                  <Link
                    href={`/placements/${p.id}`}
                    className="hover:underline"
                  >
                    {fee > 0 ? formatCurrency(fee) : "-"}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge value={p.invoice_status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
