-- Carry resume uploads from the public site's intake form into prospects.
-- Also seed a default list so the public form has a target to write into.
-- Idempotent: safe to re-run.

-- 1. Resume URL on prospects (so public-form submissions with a resume
--    upload don't lose the file when they land here instead of candidates).
alter table public.prospects
  add column if not exists resume_url text;

-- 2. Seed the auto-populated list used by the public site's /join-talent-network
--    server action. The public form will look it up by name. We don't add a
--    UNIQUE constraint to keep the schema flexible (the user can rename the
--    list later; the public site reads by name OR auto-creates if missing).
insert into public.prospect_lists
  (name, description, source, consent_confirmed_at)
select
  'Talent Network Applications',
  'Auto-populated from /join-talent-network on the public website.',
  'Public website',
  now()
where not exists (
  select 1 from public.prospect_lists
  where name = 'Talent Network Applications'
);
