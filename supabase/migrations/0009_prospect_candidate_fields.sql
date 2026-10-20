-- Bring prospect rows up to parity with candidate rows so the prospect
-- IS the candidate-in-waiting for Candidate-kind lists. Once converted,
-- the shared fields stay in sync (via src/lib/db/prospect-sync.ts).
--
-- Idempotent: safe to re-run.

alter table public.prospects
  add column if not exists military_branch text,
  add column if not exists rank text,
  add column if not exists mos_or_specialty text,
  add column if not exists clearance text,
  add column if not exists years_of_service numeric,
  add column if not exists tags text[] not null default '{}',
  add column if not exists source text;
