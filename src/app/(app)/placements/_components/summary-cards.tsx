import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PlacementSummary } from "@/lib/db/queries";

function formatCurrency(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function PlacementSummaryCards({
  summary,
}: {
  summary: PlacementSummary;
}) {
  const cards = [
    {
      label: "Total placements",
      value: summary.total.toLocaleString(),
      description: "All-time count",
    },
    {
      label: "Est. placement revenue",
      value: formatCurrency(summary.estimatedRevenue),
      description: "Flat fee, else salary × fee %",
    },
    {
      label: "Unpaid invoices",
      value: summary.unpaidInvoices.toLocaleString(),
      description: "Not Paid or Refunded",
    },
    {
      label: "Guarantees active",
      value: summary.activeGuarantees.toLocaleString(),
      description: "Guarantee end date today or later",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-2">
            <CardDescription>{c.label}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{c.value}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {c.description}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
