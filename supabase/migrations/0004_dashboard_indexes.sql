-- Optional performance indexes for the new dashboard.
-- Idempotent: safe to re-run. None of these are required to function;
-- they speed up the dashboard's status-filtered listings as data grows.

-- "Status + recent" lookups (recent leads, status counts).
create index if not exists candidates_status_created_idx
  on public.candidates(status, created_at desc);

-- "Upcoming tasks" - only tasks still in flight.
create index if not exists tasks_upcoming_idx
  on public.tasks(due_date asc nulls last, created_at desc)
  where status in ('Open', 'In Progress');

-- "Open jobs" sorted oldest-first (the staffing-need list).
create index if not exists jobs_open_created_idx
  on public.jobs(created_at asc)
  where status = 'Open';

-- "Active companies" count (everything that isn't archived).
create index if not exists companies_active_status_idx
  on public.companies(status)
  where status not in ('Inactive', 'Do Not Contact');
