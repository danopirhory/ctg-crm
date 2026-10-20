import { PageHeader } from "../_components/page-header";
import { TableSkeleton } from "../_components/table-skeleton";

export default function PlacementsLoading() {
  return (
    <>
      <PageHeader title="Placements" description="Loading…" />
      <TableSkeleton
        headers={["Candidate", "Company", "Job", "Date", "Est. fee", "Invoice", "Guarantee"]}
      />
    </>
  );
}
