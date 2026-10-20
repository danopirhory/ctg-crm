import { PageHeader } from "../_components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <>
      <PageHeader title="Tasks" description="Loading…" />
      <div className="grid gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </>
  );
}
