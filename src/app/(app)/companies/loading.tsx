import { PageHeader } from "../_components/page-header";
import { KanbanSkeleton } from "../_components/kanban-skeleton";

export default function CompaniesLoading() {
  return (
    <>
      <PageHeader title="Companies" description="Loading…" />
      <KanbanSkeleton columns={2} />
    </>
  );
}
