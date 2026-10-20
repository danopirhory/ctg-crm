import { PageHeader } from "../_components/page-header";
import { KanbanSkeleton } from "../_components/kanban-skeleton";

export default function CandidatesLoading() {
  return (
    <>
      <PageHeader title="Candidate Pipeline" description="Loading…" />
      <KanbanSkeleton columns={5} />
    </>
  );
}
