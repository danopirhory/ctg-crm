-- Command Talent Group CRM/ATS - initial schema
-- Run once in Supabase Dashboard → SQL Editor.
-- This file SUPERSEDES the earlier 0001_employees.sql.

create extension if not exists pgcrypto;

-- =====================================================================
-- Shared trigger function: keep updated_at fresh on every UPDATE.
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =====================================================================
-- 1. employees
-- =====================================================================
create table public.employees (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  email         text not null unique,
  role          text not null check (role in ('Admin', 'Recruiter', 'Viewer')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index employees_role_active_idx on public.employees(role, active);
create index employees_email_idx        on public.employees(lower(email));

-- =====================================================================
-- 2. candidates
-- =====================================================================
create table public.candidates (
  id                 uuid primary key default gen_random_uuid(),
  first_name         text not null,
  last_name          text not null,
  email              text,
  phone              text,
  military_branch    text,
  rank               text,
  mos_or_specialty   text,
  clearance          text,
  years_of_service   numeric(4,1),
  target_industry    text,
  target_location    text,
  resume_url         text,
  status             text not null default 'New' check (status in (
    'New','Contacted','Screened','Qualified','Submitted',
    'Interviewing','Offer','Placed','Not Fit','Archived'
  )),
  source             text,
  tags               text[] not null default '{}',
  marketing_consent  boolean not null default false,
  mailchimp_synced   boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index candidates_email_idx       on public.candidates(lower(email));
create index candidates_last_first_idx  on public.candidates(last_name, first_name);
create index candidates_status_idx      on public.candidates(status);
create index candidates_tags_idx        on public.candidates using gin (tags);
create index candidates_created_idx     on public.candidates(created_at desc);

-- =====================================================================
-- 3. companies
-- =====================================================================
create table public.companies (
  id             uuid primary key default gen_random_uuid(),
  company_name   text not null,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  industry       text,
  location       text,
  hiring_needs   text,
  status         text not null default 'Prospect' check (status in (
    'Prospect','Contacted','Discovery Call','Agreement Sent',
    'Active Client','Inactive','Do Not Contact'
  )),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index companies_name_idx    on public.companies(lower(company_name));
create index companies_status_idx  on public.companies(status);

-- =====================================================================
-- 4. jobs
-- =====================================================================
create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete restrict,
  title        text not null,
  location     text,
  salary_min   numeric(12,2),
  salary_max   numeric(12,2),
  job_type     text,
  description  text,
  requirements text,
  status       text not null default 'Open' check (status in (
    'Open','Paused','Filled','Closed'
  )),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

create index jobs_company_idx  on public.jobs(company_id);
create index jobs_status_idx   on public.jobs(status);
create index jobs_title_idx    on public.jobs(lower(title));

-- =====================================================================
-- 5. candidate_notes
-- =====================================================================
create table public.candidate_notes (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  employee_id  uuid references public.employees(id) on delete set null,
  note         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index candidate_notes_candidate_idx on public.candidate_notes(candidate_id, created_at desc);

-- =====================================================================
-- 6. company_notes
-- =====================================================================
create table public.company_notes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  note        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index company_notes_company_idx on public.company_notes(company_id, created_at desc);

-- =====================================================================
-- 7. tasks
-- =====================================================================
create table public.tasks (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text,
  due_date              date,
  status                text not null default 'Open' check (status in (
    'Open','In Progress','Complete','Archived'
  )),
  related_candidate_id  uuid references public.candidates(id) on delete set null,
  related_company_id    uuid references public.companies(id) on delete set null,
  assigned_to           uuid references public.employees(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index tasks_status_idx     on public.tasks(status);
create index tasks_assigned_idx   on public.tasks(assigned_to, status);
create index tasks_due_idx        on public.tasks(due_date);
create index tasks_candidate_idx  on public.tasks(related_candidate_id);
create index tasks_company_idx    on public.tasks(related_company_id);

-- =====================================================================
-- 8. candidate_job_matches
-- =====================================================================
create table public.candidate_job_matches (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid not null references public.candidates(id) on delete cascade,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  match_status    text not null default 'Potential Match' check (match_status in (
    'Potential Match','Submitted','Interview Requested','Interviewing',
    'Offer','Placed','Rejected','Withdrawn'
  )),
  submitted_at    timestamptz,
  interview_date  timestamptz,
  offer_date      timestamptz,
  placement_date  timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (candidate_id, job_id)
);

create index cjm_candidate_idx on public.candidate_job_matches(candidate_id);
create index cjm_job_idx       on public.candidate_job_matches(job_id);
create index cjm_status_idx    on public.candidate_job_matches(match_status);

-- =====================================================================
-- 9. placements
-- =====================================================================
create table public.placements (
  id                  uuid primary key default gen_random_uuid(),
  candidate_id        uuid not null references public.candidates(id) on delete restrict,
  company_id          uuid not null references public.companies(id) on delete restrict,
  job_id              uuid not null references public.jobs(id) on delete restrict,
  placement_date      date not null,
  starting_salary     numeric(12,2),
  fee_percentage      numeric(5,2),
  flat_fee            numeric(12,2),
  invoice_status      text not null default 'Not Invoiced' check (invoice_status in (
    'Not Invoiced','Invoiced','Paid','Past Due','Refunded'
  )),
  guarantee_end_date  date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index placements_candidate_idx on public.placements(candidate_id);
create index placements_company_idx   on public.placements(company_id);
create index placements_job_idx       on public.placements(job_id);
create index placements_invoice_idx   on public.placements(invoice_status);
create index placements_date_idx      on public.placements(placement_date desc);

-- =====================================================================
-- updated_at triggers on every table
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'employees','candidates','companies','jobs',
    'candidate_notes','company_notes','tasks',
    'candidate_job_matches','placements'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t
    );
  end loop;
end $$;

-- =====================================================================
-- RLS helpers
-- security definer so they bypass employees-table RLS (otherwise the
-- policies that READ employees to authorize a query would recurse).
-- =====================================================================
create or replace function public.is_active_employee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employees
    where auth_user_id = auth.uid() and active = true
  );
$$;

create or replace function public.current_employee_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.employees
  where auth_user_id = auth.uid() and active = true
  limit 1;
$$;

revoke all on function public.is_active_employee()     from public;
revoke all on function public.current_employee_role()  from public;
revoke execute on function public.is_active_employee()    from anon;
revoke execute on function public.current_employee_role() from anon;
grant execute on function public.is_active_employee()     to authenticated;
grant execute on function public.current_employee_role()  to authenticated;

-- =====================================================================
-- Row Level Security
-- Rules:
--   - Any active employee (Admin / Recruiter / Viewer) can SELECT.
--   - Admin + Recruiter can INSERT and UPDATE.
--   - Only Admin can DELETE.
--   - The employees table itself is Admin-only for INSERT/UPDATE/DELETE
--     (everyone can still SELECT it so the app can list teammates).
--   - service_role bypasses RLS automatically (Supabase default) - that's
--     how we bootstrap the very first Admin row below.
-- =====================================================================
alter table public.employees             enable row level security;
alter table public.candidates            enable row level security;
alter table public.companies             enable row level security;
alter table public.jobs                  enable row level security;
alter table public.candidate_notes       enable row level security;
alter table public.company_notes         enable row level security;
alter table public.tasks                 enable row level security;
alter table public.candidate_job_matches enable row level security;
alter table public.placements            enable row level security;

-- employees: read = any active employee, write = Admin only
create policy "employees read"
  on public.employees for select
  to authenticated
  using (public.is_active_employee());

create policy "employees admin insert"
  on public.employees for insert
  to authenticated
  with check (public.current_employee_role() = 'Admin');

create policy "employees admin update"
  on public.employees for update
  to authenticated
  using      (public.current_employee_role() = 'Admin')
  with check (public.current_employee_role() = 'Admin');

create policy "employees admin delete"
  on public.employees for delete
  to authenticated
  using (public.current_employee_role() = 'Admin');

-- Standard read/write/delete policies for every other table.
do $$
declare
  t text;
  tables text[] := array[
    'candidates','companies','jobs',
    'candidate_notes','company_notes','tasks',
    'candidate_job_matches','placements'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy "%1$s read"   on public.%1$I for select to authenticated using (public.is_active_employee())',
      t
    );
    execute format(
      'create policy "%1$s insert" on public.%1$I for insert to authenticated with check (public.is_active_employee() and public.current_employee_role() in (''Admin'',''Recruiter''))',
      t
    );
    execute format(
      'create policy "%1$s update" on public.%1$I for update to authenticated
         using      (public.is_active_employee() and public.current_employee_role() in (''Admin'',''Recruiter''))
         with check (public.is_active_employee() and public.current_employee_role() in (''Admin'',''Recruiter''))',
      t
    );
    execute format(
      'create policy "%1$s delete" on public.%1$I for delete to authenticated using (public.is_active_employee() and public.current_employee_role() = ''Admin'')',
      t
    );
  end loop;
end $$;
