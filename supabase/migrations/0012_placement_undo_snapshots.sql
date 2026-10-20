-- Snapshot the candidate's pipeline status and the job's posting status
-- at the moment a placement is created, so an "Undo placement" action
-- can restore them deterministically (instead of guessing).
--
-- Existing rows get NULL - the undo handler falls back to a sensible
-- default ('Open' for jobs, leave-as-is for candidates) when the
-- snapshot is missing.
--
-- Idempotent: safe to re-run.

alter table public.placements
  add column if not exists job_status_before text,
  add column if not exists candidate_status_before text;
