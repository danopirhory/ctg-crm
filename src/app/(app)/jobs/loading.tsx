import { PageHeader } from "../_components/page-header";
import { TableSkeleton } from "../_components/table-skeleton";

export default function JobsLoading() {
  return (
    <>
      <PageHeader title="Jobs" description="Loading…" />
      <TableSkeleton
        headers={["Title", "Company", "Location", "Salary", "Status", "Added"]}
      />
    </>
  );
}
