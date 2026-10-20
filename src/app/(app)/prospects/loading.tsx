import { PageHeader } from "../_components/page-header";
import { TableSkeleton } from "../_components/table-skeleton";

export default function LeadsLoading() {
  return (
    <>
      <PageHeader title="Leads" description="Loading…" />
      <TableSkeleton
        headers={["Name", "Type", "Source", "Count", "Created"]}
      />
    </>
  );
}
