-- Covering indexes for the five foreign keys the Supabase performance
-- advisor flagged as unindexed. prospects.converted_to_candidate_id is
-- the hot one - every kanban "back to leads" drop looks a candidate up
-- by it; the rest are joined on every notes / snapshot listing.

create index if not exists candidate_job_review_edited_by_idx
  on public.candidate_job_review (edited_by);

create index if not exists candidate_notes_employee_idx
  on public.candidate_notes (employee_id);

create index if not exists candidate_review_snapshot_taken_by_idx
  on public.candidate_review_snapshot (taken_by);

create index if not exists company_notes_employee_idx
  on public.company_notes (employee_id);

create index if not exists prospects_converted_candidate_idx
  on public.prospects (converted_to_candidate_id);
