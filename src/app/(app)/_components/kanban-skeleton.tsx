import { Skeleton } from "@/components/ui/skeleton";

// Placeholder column shimmer used by the Candidate Pipeline / Companies
// kanban routes while their server data is loading. Matches the
// production column chrome (border + accent header + card area).
function Column({
  cards = 3,
  height = "h-28",
}: {
  cards?: number;
  height?: string;
}) {
  return (
    <section className="flex w-full min-w-0 flex-col rounded-lg border bg-card">
      <header className="border-b px-3 py-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-1 h-3 w-16" />
      </header>
      <div className="grid gap-2 p-2">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className={height} />
        ))}
      </div>
    </section>
  );
}

export function KanbanSkeleton({
  columns = 4,
  className,
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={
        className ??
        "grid gap-3 overflow-x-auto pb-4"
      }
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(260px, 1fr))`,
      }}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <Column key={i} cards={3 + (i % 2)} />
      ))}
    </div>
  );
}
