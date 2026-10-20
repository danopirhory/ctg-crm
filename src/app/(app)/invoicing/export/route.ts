import { csvDateStamp, csvResponse, toCsv } from "@/lib/csv";
import { listInvoices, type InvoiceRow } from "@/lib/db/queries";

// CSV of the invoicing table - one row per placement with the effective
// fee math already applied (placement override, else company default).
export async function GET() {
  const { data, error } = await listInvoices();
  if (error) {
    return Response.json({ error }, { status: 500 });
  }

  const csv = toCsv<InvoiceRow>(
    [
      {
        label: "Candidate",
        value: (r) =>
          r.candidate
            ? `${r.candidate.first_name} ${r.candidate.last_name}`
            : "",
      },
      { label: "Company", value: (r) => r.company?.company_name },
      { label: "Job", value: (r) => r.job?.title },
      { label: "Placement date", value: (r) => r.placement_date },
      { label: "Starting salary", value: (r) => r.starting_salary },
      { label: "Fee type", value: (r) => r.effective_compensation_type },
      { label: "Flat fee", value: (r) => r.effective_flat_fee },
      { label: "Fee %", value: (r) => r.effective_fee_percentage },
      { label: "Invoice amount", value: (r) => r.invoice_amount },
      { label: "Invoice status", value: (r) => r.invoice_status },
    ],
    data,
  );

  return csvResponse(csv, `invoicing-${csvDateStamp()}.csv`);
}
