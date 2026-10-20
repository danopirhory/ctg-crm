import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../_components/page-header";

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2 h-8 w-16" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-3 w-28" />
      </CardContent>
    </Card>
  );
}

function StatGrid({ count }: { count: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function DashboardLoading() {
  return (
    <>
      <PageHeader title="Dashboard" description="Loading…" />
      <section className="mb-8">
        <Skeleton className="mb-3 h-3 w-32" />
        <StatGrid count={7} />
        <Skeleton className="mb-3 mt-6 h-3 w-20" />
        <StatGrid count={4} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <SectionSkeleton />
        <SectionSkeleton />
        <SectionSkeleton />
        <SectionSkeleton />
      </section>
    </>
  );
}
