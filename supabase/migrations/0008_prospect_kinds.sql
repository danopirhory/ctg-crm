-- Each prospect list now carries a `kind` so we can capture different
-- field sets per list: Candidate-kind = individuals (people),
-- Company-kind = businesses (with contact info embedded).
--
-- Schema changes:
--   prospect_lists: + kind text (default 'Candidate', check Candidate|Company)
--   prospects:
--     - first_name/last_name relaxed to nullable (Company-kind rows may
--       have no contact yet)
--     - + industry text         (Company-kind: the company's industry;
--                                Candidate-kind: optional target industry)
--     - + hiring_needs text     (Company-kind only)
--     - + converted_to_company_id uuid (mirror of converted_to_candidate_id)
--
-- Idempotent: safe to re-run.

-- 1. Kind on lists.
alter table public.prospect_lists
  add column if not exists kind text not null
    default 'Candidate'
    check (kind in ('Candidate', 'Company'));

create index if not exists prospect_lists_kind_idx
  on public.prospect_lists(kind);

-- Make sure the seeded "Talent Network Applications" list is explicitly
-- Candidate-kind (defaults already do this, but pin it for clarity).
update public.prospect_lists
  set kind = 'Candidate'
  where name = 'Talent Network Applications'
    and kind is distinct from 'Candidate';

-- 2. Relax first/last NOT NULL - Company-kind rows may have no contact.
alter table public.prospects
  alter column first_name drop not null,
  alter column last_name  drop not null;

-- 3. Company-side columns on prospects.
alter table public.prospects
  add column if not exists industry text,
  add column if not exists hiring_needs text;

-- 4. Second conversion FK for Company-kind prospects → companies table.
alter table public.prospects
  add column if not exists converted_to_company_id uuid
    references public.companies(id) on delete set null;

create index if not exists prospects_converted_company_idx
  on public.prospects(converted_to_company_id)
  where converted_to_company_id is not null;
