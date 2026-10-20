import { PageHeader } from "../_components/page-header";
import { TableSkeleton } from "../_components/table-skeleton";

export default function ReviewsLoading() {
  return (
    <>
      <PageHeader title="Review Snapshots" description="Loading…" />
      <TableSkeleton
        headers={["Company", "Label", "Model", "Candidates", "Taken"]}
      />
    </>
  );
}
