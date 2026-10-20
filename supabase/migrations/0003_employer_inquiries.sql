-- Public-site employer inquiry inbox.
-- Backing table for the `/hire-military-talent` form on
-- the public marketing site. Submissions are written via the service-role
-- key from the public site (bypasses RLS by design). Internal employees
-- triage rows from the CRM and eventually convert them into full
-- `public.companies` records.
--
-- Run once in Supabase Dashboard → SQL Editor after 0002.
-- Idempotent: safe to re-run.

-- =====================================================================
-- 1. Table
-- =====================================================================
create table if not exists public.employer_inquiries (
  id              uuid primary key default gen_random_uuid(),

  -- Submitted by the public form
  company_name    text not null,
  contact_name    text,
  contact_email   text not null,
  contact_phone   text,
  company_website text,
  industry        text,
  location        text,
  hiring_needs    text,                       -- free-text "what roles, how many"
  timeline        text,                       -- e.g. "Immediate", "30-60 days", "Exploring"
  source          text,                       -- e.g. "hire-military-talent", "referral"

  -- Internal triage state (employees only)
  status          text not null default 'New' check (status in (
    'New','Reviewing','Contacted','Converted','Spam','Closed'
  )),
  reviewed_at     timestamptz,
  reviewed_by     uuid references public.employees(id) on delete set null,
  converted_company_id uuid references public.companies(id) on delete set null,
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists employer_inquiries_created_idx
  on public.employer_inquiries(created_at desc);

create index if not exists employer_inquiries_status_idx
  on public.employer_inquiries(status);

create index if not exists employer_inquiries_email_idx
  on public.employer_inquiries(lower(contact_email));

-- =====================================================================
-- 2. updated_at trigger (matches the pattern in 0001)
-- =====================================================================
drop trigger if exists set_updated_at on public.employer_inquiries;
create trigger set_updated_at
  before update on public.employer_inquiries
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 3. RLS
-- Reads + writes (triage) are restricted to active employees.
-- INSERTs from the public website happen via the service_role key, which
-- bypasses RLS automatically - no anonymous-insert policy needed.
-- =====================================================================
alter table public.employer_inquiries enable row level security;

drop policy if exists "employer_inquiries read"   on public.employer_inquiries;
drop policy if exists "employer_inquiries insert" on public.employer_inquiries;
drop policy if exists "employer_inquiries update" on public.employer_inquiries;
drop policy if exists "employer_inquiries delete" on public.employer_inquiries;

create policy "employer_inquiries read"
  on public.employer_inquiries for select
  to authenticated
  using (public.is_active_employee());

create policy "employer_inquiries insert"
  on public.employer_inquiries for insert
  to authenticated
  with check (
    public.is_active_employee()
    and public.current_employee_role() in ('Admin', 'Recruiter')
  );

create policy "employer_inquiries update"
  on public.employer_inquiries for update
  to authenticated
  using (
    public.is_active_employee()
    and public.current_employee_role() in ('Admin', 'Recruiter')
  )
  with check (
    public.is_active_employee()
    and public.current_employee_role() in ('Admin', 'Recruiter')
  );

create policy "employer_inquiries delete"
  on public.employer_inquiries for delete
  to authenticated
  using (
    public.is_active_employee()
    and public.current_employee_role() = 'Admin'
  );
