import Link from "next/link";
import { Calendar, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  getCurrentEmployeeId,
  listActiveEmployees,
  listAllTasks,
  type TaskHubFilter,
  type TaskHubItem,
} from "@/lib/db/queries";

import { PageHeader } from "../_components/page-header";
import { ErrorState } from "../_components/states";
import { StatusBadge } from "../_components/status-badge";
import { NewTaskDialog } from "./_components/new-task-dialog";
import { TaskRowControls } from "./_components/task-row-controls";

// Eastern-pinned YYYY-MM-DD for "today", so the Overdue / Today split
// matches the recruiter's working day rather than UTC.
function todayEastern(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

function formatDue(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const FILTER_TABS: { key: TaskHubFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "complete", label: "Completed" },
  { key: "all", label: "All" },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter: TaskHubFilter =
    sp.filter === "complete" || sp.filter === "all" ? sp.filter : "open";

  const [{ data: tasks, error }, { data: employees }, me] = await Promise.all([
    listAllTasks(filter),
    listActiveEmployees(),
    getCurrentEmployeeId(),
  ]);
  const myId = "id" in me ? me.id : null;

  const today = todayEastern();
  const overdue: TaskHubItem[] = [];
  const dueToday: TaskHubItem[] = [];
  const upcoming: TaskHubItem[] = [];
  const noDate: TaskHubItem[] = [];
  for (const t of tasks) {
    if (!t.due_date) noDate.push(t);
    else if (t.due_date < today && t.status !== "Complete") overdue.push(t);
    else if (t.due_date === today) dueToday.push(t);
    else upcoming.push(t);
  }

  const groups: { title: string; items: TaskHubItem[]; tone?: string }[] = [
    { title: "Overdue", items: overdue, tone: "text-destructive" },
    { title: "Due today", items: dueToday, tone: "text-amber-600 dark:text-amber-400" },
    { title: "Upcoming", items: upcoming },
    { title: "No due date", items: noDate },
  ];

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything open across candidates and companies, plus standalone to-dos."
        actions={<NewTaskDialog employees={employees} defaultAssigneeId={myId} />}
      />

      <div className="mb-4 flex items-center gap-1">
        {FILTER_TABS.map((tab) => (
          <Button
            key={tab.key}
            asChild
            size="sm"
            variant={filter === tab.key ? "default" : "ghost"}
            className="h-8"
          >
            <Link
              href={tab.key === "open" ? "/tasks" : `/tasks?filter=${tab.key}`}
            >
              {tab.label}
            </Link>
          </Button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === "open"
              ? "No open tasks. Enjoy it while it lasts."
              : "Nothing here."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <section key={g.title} className="grid gap-2">
                <h2
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                    g.tone,
                  )}
                >
                  {g.title} · {g.items.length}
                </h2>
                <Card>
                  <CardContent className="p-0">
                    <ul className="divide-y">
                      {g.items.map((t) => {
                        const linkedHref = t.candidate
                          ? `/candidates/${t.candidate.id}`
                          : t.company
                            ? `/companies/${t.company.id}`
                            : null;
                        const linkedLabel = t.candidate
                          ? `${t.candidate.first_name} ${t.candidate.last_name}`
                          : t.company
                            ? t.company.company_name
                            : null;
                        return (
                          <li
                            key={t.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "text-sm font-medium",
                                  t.status === "Complete" &&
                                    "text-muted-foreground line-through",
                                )}
                              >
                                {t.title}
                              </p>
                              {t.description ? (
                                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                  {t.description}
                                </p>
                              ) : null}
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {t.due_date ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="size-3.5" aria-hidden />
                                    {formatDue(t.due_date)}
                                  </span>
                                ) : null}
                                <span className="inline-flex items-center gap-1">
                                  <User className="size-3.5" aria-hidden />
                                  {t.assigned
                                    ? `${t.assigned.first_name} ${t.assigned.last_name}`
                                    : "Unassigned"}
                                </span>
                                {linkedHref && linkedLabel ? (
                                  <Link
                                    href={linkedHref}
                                    className="hover:underline"
                                  >
                                    {linkedLabel}
                                  </Link>
                                ) : null}
                                <StatusBadge value={t.status} />
                              </div>
                            </div>
                            <TaskRowControls taskId={t.id} status={t.status} />
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
