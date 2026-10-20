-- Unified activity log - the spine of the "everything on the record"
-- timeline and later the outreach + analytics
-- phases (time-in-stage math reads this table).
--
-- Rows are written from server actions (not DB triggers) so each log
-- line carries the acting employee and a human-ready summary. Intake
-- routes write via the service role.

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  -- machine-readable verb, e.g. 'status_changed', 'match_added',
  -- 'note_added', 'task_created', 'task_completed', 'review_generated',
  -- 'snapshot_taken', 'intake_received', 'returned_to_leads'
  verb text not null,
  -- human-readable one-liner rendered in the timeline
  summary text not null,
  actor_employee_id uuid references public.employees(id) on delete set null,
  candidate_id uuid references public.candidates(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activities_candidate_idx
  on public.activities (candidate_id, created_at desc)
  where candidate_id is not null;
create index activities_company_idx
  on public.activities (company_id, created_at desc)
  where company_id is not null;
create index activities_prospect_idx
  on public.activities (prospect_id, created_at desc)
  where prospect_id is not null;
create index activities_actor_idx
  on public.activities (actor_employee_id);
create index activities_job_idx
  on public.activities (job_id);

alter table public.activities enable row level security;

create policy "activities read" on public.activities
  for select using (is_active_employee());
create policy "activities insert" on public.activities
  for insert with check (is_active_employee());
-- No update/delete policies: the log is append-only from the app.
