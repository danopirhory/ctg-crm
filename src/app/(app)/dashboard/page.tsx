import Link from "next/link";
import { ArrowUpRight, Calendar, User, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { createClient } from "@/lib/supabase/server";
import {
  estimateFee,
  getDashboardOverview,
  listOpenJobsToStaff,
  listRecentCandidates,
  listRecentPlacements,
  listUpcomingTasks,
} from "@/lib/db/queries";

import { PageHeader } from "../_components/page-header";
import { StatusBadge } from "../_components/status-badge";
import { ErrorState } from "../_components/states";

function formatCurrency(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function relativeFromNow(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {subtitle ? (
        <CardContent className="text-xs text-muted-foreground">
          {subtitle}
        </CardContent>
      ) : null}
    </Card>
  );
}

function SectionCard({
  title,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {hrefLabel ?? "View all"}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: o, error: oError },
    { data: candidates, error: candidatesError },
    { data: tasks, error: tasksError },
    { data: placements, error: placementsError },
    { data: openJobs, error: openJobsError },
    candidateProspectsCount,
    clientProspectsCount,
  ] = await Promise.all([
    getDashboardOverview(),
    listRecentCandidates(6),
    listUpcomingTasks(6),
    listRecentPlacements(5),
    listOpenJobsToStaff(6),
    // Inline counts for the two prospect buckets - they don't live in
    // getDashboardOverview because the dashboard predates pipeline_stage.
    supabase
      .from("prospects")
      .select("id, list:prospect_lists!inner(kind)", {
        count: "exact",
        head: true,
      })
      .eq("pipeline_stage", "Prospect")
      .eq("list.kind", "Candidate"),
    supabase
      .from("prospects")
      .select("id, list:prospect_lists!inner(kind)", {
        count: "exact",
        head: true,
      })
      .eq("pipeline_stage", "Prospect")
      .eq("list.kind", "Company"),
  ]);

  const candidateProspects = candidateProspectsCount.count ?? 0;
  const clientProspects = clientProspectsCount.count ?? 0;

  const dash = (n: number) => (oError ? "-" : n.toLocaleString());
  const dashMoney = (n: number) => (oError ? "-" : formatCurrency(n));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome back${user?.email ? `, ${user.email}` : ""}.`}
      />

      {oError ? (
        <div className="mb-6">
          <ErrorState message={oError} />
        </div>
      ) : null}

      {/* === Overview cards: mirrors the kanban columns === */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pipeline snapshot
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Candidate prospects"
            value={dash(candidateProspects)}
            subtitle="Awaiting promotion"
          />
          <StatCard
            label="Pipeline"
            value={dash(o.totalCandidates)}
            subtitle="Active candidates"
          />
          <StatCard
            label="Placements"
            value={dash(o.placements)}
            subtitle="Closed deals on file"
          />
          <StatCard
            label="Client prospects"
            value={dash(clientProspects)}
            subtitle="Awaiting qualification"
          />
          <StatCard
            label="Companies"
            value={dash(o.activeCompanies)}
            subtitle="Active clients"
          />
          <StatCard
            label="Active jobs"
            value={dash(o.openJobs)}
            subtitle="Open + paused"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          <StatCard
            label="New this week"
            value={dash(o.newCandidatesThisWeek)}
            subtitle="Candidates added since Monday"
          />
          <StatCard
            label="Est. placement revenue"
            value={dashMoney(o.estimatedRevenue)}
            subtitle="Flat fee, else salary × fee %"
          />
        </div>
      </section>

      {/* === Activity sections === */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Recent candidate leads */}
        <SectionCard
          title="Recent candidate leads"
          href="/candidates"
          hrefLabel="All candidates"
        >
          {candidatesError ? (
            <ErrorState message={candidatesError} />
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No candidates yet.</p>
          ) : (
            <ul className="divide-y">
              {candidates.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/candidates/${c.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {c.first_name} {c.last_name}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.email ?? "-"}
                      {c.source ? ` · ${c.source}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge value={c.status} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {relativeFromNow(c.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Upcoming tasks */}
        <SectionCard title="Upcoming tasks" href="/tasks" hrefLabel="All tasks">
          {tasksError ? (
            <ErrorState message={tasksError} />
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tasks open or in progress.
            </p>
          ) : (
            <ul className="divide-y">
              {tasks.map((t) => {
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
                  <li key={t.id} className="grid gap-1 py-2 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{t.title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3.5" aria-hidden />
                        {formatDate(t.due_date) ?? "No due date"}
                      </span>
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
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        {/* Recent placements */}
        <SectionCard
          title="Recent placements"
          href="/placements"
          hrefLabel="All placements"
        >
          {placementsError ? (
            <ErrorState message={placementsError} />
          ) : placements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No placements yet.</p>
          ) : (
            <ul className="divide-y">
              {placements.map((p) => {
                const fee = estimateFee({
                  flat_fee: p.flat_fee,
                  starting_salary: p.starting_salary,
                  fee_percentage: p.fee_percentage,
                });
                return (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/placements/${p.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {p.candidate
                          ? `${p.candidate.first_name} ${p.candidate.last_name}`
                          : "-"}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.company?.company_name ?? "-"}
                        {p.job ? ` · ${p.job.title}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums">
                        {fee > 0 ? formatCurrency(fee) : "-"}
                      </span>
                      <StatusBadge value={p.invoice_status} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        {/* Open jobs needing candidates */}
        <SectionCard
          title="Open jobs needing candidates"
          href="/jobs?status=Open"
          hrefLabel="All open jobs"
        >
          {openJobsError ? (
            <ErrorState message={openJobsError} />
          ) : openJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open jobs.</p>
          ) : (
            <ul className="divide-y">
              {openJobs.map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/jobs/${j.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {j.title}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">
                      {j.company?.company_name ?? "-"}
                      {j.location ? ` · ${j.location}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3.5" aria-hidden />
                      {j.match_count}{" "}
                      {j.match_count === 1 ? "match" : "matches"}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      open {relativeFromNow(j.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>
    </>
  );
}
