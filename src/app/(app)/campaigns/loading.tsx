import { PageHeader } from "../_components/page-header";
import { TableSkeleton } from "../_components/table-skeleton";

export default function CampaignsLoading() {
  return (
    <>
      <PageHeader title="Campaigns" description="Loading…" />
      <TableSkeleton
        headers={["Campaign", "List", "Status", "Recipients", "Sent", "When"]}
      />
    </>
  );
}
