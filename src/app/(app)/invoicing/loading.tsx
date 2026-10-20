import { PageHeader } from "../_components/page-header";
import { TableSkeleton } from "../_components/table-skeleton";

export default function InvoicingLoading() {
  return (
    <>
      <PageHeader title="Invoicing" description="Loading…" />
      <TableSkeleton
        headers={["Candidate", "Company", "Job", "Fee", "Status", "Placed"]}
      />
    </>
  );
}
