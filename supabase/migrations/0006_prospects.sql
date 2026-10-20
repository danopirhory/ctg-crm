-- Prospects: bulk-imported leads grouped into named lists, intended for
-- mass email campaigns via Mailchimp. Distinct from `candidates` - a
-- prospect is a name on a list; a candidate is an active person in the
-- pipeline. Prospects can later be converted to candidates.
-- Run after 0001-0005 in Supabase Dashboard → SQL Editor. Idempotent.

-- =====================================================================
-- Lists (one row = one named import, e.g. "LinkedIn Cybersecurity Q1")
-- =====================================================================
create table if not exists public.prospect_lists (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  description           text,
  source                text,
  -- When the importing employee confirmed they have a lawful basis to
  -- contact these people. NULL means consent wasn't confirmed at import.
  consent_confirmed_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists prospect_lists_created_idx
  on public.prospect_lists(created_at desc);
create index if not exists prospect_lists_name_idx
  on public.prospect_lists(lower(name));

-- =====================================================================
-- Prospects (individuals)
-- =====================================================================
create table if not exists public.prospects (
  id                         uuid primary key default gen_random_uuid(),
  list_id                    uuid not null references public.prospect_lists(id) on delete cascade,
  first_name                 text not null,
  last_name                  text not null,
  email                      text,
  phone                      text,
  title                      text,
  company_name               text,
  location                   text,
  notes                      text,
  -- Default true on the assumption that the list owner confirmed
  -- lawful-basis at list-creation time. Per-prospect overrides are
  -- possible (e.g. flip to false after an unsubscribe webhook).
  marketing_consent          boolean not null default true,
  mailchimp_synced           boolean not null default false,
  converted_to_candidate_id  uuid references public.candidates(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists prospects_list_idx
  on public.prospects(list_id);
create index if not exists prospects_email_idx
  on public.prospects(lower(email));
-- Speeds the (list_id, email) duplicate check at import time.
create index if not exists prospects_list_email_idx
  on public.prospects(list_id, lower(email));

-- =====================================================================
-- updated_at triggers (reuses public.set_updated_at from 0001)
-- =====================================================================
drop trigger if exists set_updated_at on public.prospect_lists;
create trigger set_updated_at
  before update on public.prospect_lists
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.prospects;
create trigger set_updated_at
  before update on public.prospects
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Row Level Security - same shape as every other table:
--   read   = any active employee
--   write  = Admin + Recruiter
--   delete = Admin only
-- =====================================================================
alter table public.prospect_lists enable row level security;
alter table public.prospects      enable row level security;

drop policy if exists "prospect_lists read"   on public.prospect_lists;
create policy "prospect_lists read"
  on public.prospect_lists for select to authenticated
  using (public.is_active_employee());

drop policy if exists "prospect_lists insert" on public.prospect_lists;
create policy "prospect_lists insert"
  on public.prospect_lists for insert to authenticated
  with check (
    public.is_active_employee()
    and public.current_employee_role() in ('Admin', 'Recruiter')
  );

drop policy if exists "prospect_lists update" on public.prospect_lists;
create policy "prospect_lists update"
  on public.prospect_lists for update to authenticated
  using      (public.is_active_employee() and public.current_employee_role() in ('Admin','Recruiter'))
  with check (public.is_active_employee() and public.current_employee_role() in ('Admin','Recruiter'));

drop policy if exists "prospect_lists delete" on public.prospect_lists;
create policy "prospect_lists delete"
  on public.prospect_lists for delete to authenticated
  using (
    public.is_active_employee()
    and public.current_employee_role() = 'Admin'
  );

drop policy if exists "prospects read"   on public.prospects;
create policy "prospects read"
  on public.prospects for select to authenticated
  using (public.is_active_employee());

drop policy if exists "prospects insert" on public.prospects;
create policy "prospects insert"
  on public.prospects for insert to authenticated
  with check (
    public.is_active_employee()
    and public.current_employee_role() in ('Admin', 'Recruiter')
  );

drop policy if exists "prospects update" on public.prospects;
create policy "prospects update"
  on public.prospects for update to authenticated
  using      (public.is_active_employee() and public.current_employee_role() in ('Admin','Recruiter'))
  with check (public.is_active_employee() and public.current_employee_role() in ('Admin','Recruiter'));

drop policy if exists "prospects delete" on public.prospects;
create policy "prospects delete"
  on public.prospects for delete to authenticated
  using (
    public.is_active_employee()
    and public.current_employee_role() = 'Admin'
  );
