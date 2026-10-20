-- Unify the notes timeline across a prospect and its linked candidate.
-- A note row can now be tied to a prospect, a candidate, or both - so a
-- single shared notes section renders identically on either detail page.
--
-- When a prospect is converted to a candidate, the app backfills
-- candidate_id on existing prospect notes so both filters return the
-- same rows after conversion.
--
-- Idempotent: safe to re-run.

alter table public.candidate_notes
  alter column candidate_id drop not null;

alter table public.candidate_notes
  add column if not exists prospect_id uuid
    references public.prospects(id) on delete cascade;

-- Require at least one target. (Drop first so re-runs work.)
alter table public.candidate_notes
  drop constraint if exists candidate_notes_target_required;
alter table public.candidate_notes
  add constraint candidate_notes_target_required
    check (candidate_id is not null or prospect_id is not null);

create index if not exists candidate_notes_prospect_idx
  on public.candidate_notes(prospect_id)
  where prospect_id is not null;
