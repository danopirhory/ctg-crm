import Link from "next/link";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { listInvoices, type InvoiceFilters } from "@/lib/db/queries";
import { INVOICE_STATUSES } from "@/lib/db/constants";
import type { InvoiceStatus } from "@/lib/db/types";

import { PageHeader } from "../_components/page-header";
import { StatusBadge } from "../_components/status-badge";
import { ErrorState } from "../_components/states";
import { InvoiceFilters as FiltersBar } from "./_components/filters";
import { InvoiceStatusSelect } from "../placements/_components/invoice-status-select";

function formatCurrency(n: number | null) {
  if (n == null || Number.isNaN(n)) return "-";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

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

type SearchParams = Promise<{ q?: string; status?: string }>;

export default async function InvoicingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const status =
    sp.status && (INVOICE_STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as InvoiceStatus)
      : "all";
  const filters: InvoiceFilters = { q: sp.q, status };
  const { data: rows, error } = await listInvoices(filters);

  const totalAll = rows.reduce((acc, r) => acc + r.invoice_amount, 0);
  const totalUnpaid = rows
    .filter((r) => r.invoice_status === "Not Invoiced" || r.invoice_status === "Invoiced" || r.invoice_status === "Past Due")
    .reduce((acc, r) => acc + r.invoice_amount, 0);
  const totalPaid = rows
    .filter((r) => r.invoice_status === "Paid")
    .reduce((acc, r) => acc + r.invoice_amount, 0);

  return (
    <>
      <PageHeader
        title="Invoicing"
        description="Placements with auto-calculated fees from each company's compensation model."
        actions={
          <Button variant="outline" asChild>
            <a href="/invoicing/export">
              <Download className="size-4" aria-hidden />
              Export CSV
            </a>
          </Button>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total billable</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {formatCurrency(totalAll)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {rows.length} placement{rows.length === 1 ? "" : "s"} on file
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {formatCurrency(totalUnpaid)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Not Invoiced + Invoiced + Past Due
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paid</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {formatCurrency(totalPaid)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Placements marked Paid
          </CardContent>
        </Card>
      </section>

      <FiltersBar />

      {error ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No placements yet. When a placement is recorded for a company,
            the invoice line shows up here with the fee auto-calculated
            from that company&apos;s compensation model.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placement</TableHead>
                <TableHead className="hidden md:table-cell">Company</TableHead>
                <TableHead className="hidden lg:table-cell">Job</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead>Compensation</TableHead>
                <TableHead className="text-right">Invoice amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const candidateName = r.candidate
                  ? `${r.candidate.first_name} ${r.candidate.last_name}`
                  : "-";
                const compLabel =
                  r.effective_compensation_type === "Flat"
                    ? `Flat ${formatCurrency(r.effective_flat_fee)}`
                    : `${r.effective_fee_percentage}% of salary`;
                const salaryLabel =
                  r.effective_compensation_type === "Percent" &&
                  r.starting_salary != null
                    ? ` (${formatCurrency(r.starting_salary)} base)`
                    : "";
                return (
                  <TableRow key={r.placement_id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/placements/${r.placement_id}`}
                        className="hover:underline"
                      >
                        {candidateName}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {r.company ? (
                        <Link
                          href={`/companies/${r.company.id}`}
                          className="hover:underline"
                        >
                          {r.company.company_name}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {r.job ? (
                        <Link
                          href={`/jobs/${r.job.id}`}
                          className="hover:underline"
                        >
                          {r.job.title}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground tabular-nums">
                      {formatDate(r.placement_date)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {compLabel}
                      <span className="block text-[10px]">
                        {salaryLabel.trim() || ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {r.invoice_amount > 0
                        ? formatCurrency(r.invoice_amount)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusBadge value={r.invoice_status} />
                        <InvoiceStatusSelect
                          placementId={r.placement_id}
                          initial={r.invoice_status}
                        />
                      </div>
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
