-- Track which pipeline an individual is currently active in, so the same
-- record never appears in two rosters at once. The previous stage is
-- remembered so "Move back to previous category" works reliably, and a
-- snapshot of the candidate / company status is kept so re-moving
-- forward picks up where we left off (e.g. "Contacted" stays "Contacted"
-- across a move-back / move-forward cycle).
--
-- Pipeline stages:
--   Prospect  - active in the prospect list it belongs to
--   Candidate - active in /candidates; the prospect row is hidden
--   Company   - active in /companies; the prospect row is hidden
--
-- Idempotent: safe to re-run.

alter table public.prospects
  add column if not exists pipeline_stage text not null default 'Prospect'
    check (pipeline_stage in ('Prospect', 'Candidate', 'Company')),
  add column if not exists previous_pipeline_stage text
    check (previous_pipeline_stage in ('Prospect', 'Candidate', 'Company')),
  add column if not exists snapshot_candidate_status text,
  add column if not exists snapshot_company_status text;

-- Backfill: any prospect that was already converted should be in the
-- corresponding downstream stage, not Prospect. Otherwise the same
-- person would show up in both /prospects/[id] and /candidates after
-- the new filter ships.
update public.prospects
   set pipeline_stage = 'Candidate',
       previous_pipeline_stage = 'Prospect'
 where converted_to_candidate_id is not null
   and pipeline_stage = 'Prospect';

update public.prospects
   set pipeline_stage = 'Company',
       previous_pipeline_stage = 'Prospect'
 where converted_to_company_id is not null
   and pipeline_stage = 'Prospect';

create index if not exists prospects_pipeline_stage_idx
  on public.prospects(pipeline_stage);
