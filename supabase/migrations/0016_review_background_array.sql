-- The AI was producing essay-length paragraphs for the "Background"
-- field while every other field was already a bullet list. The
-- recruiter-facing target style is a list of resume line items, e.g.
-- "Army Officer (Logistics)", "Joint operations planning",
-- "Service: 2012 - 2022", not narrative prose.
--
-- Convert background_summary (text) → background (text[]) so the
-- shape matches strengths / areas_to_validate / interview_focus and
-- the UI can render the same bullet list component.
--
-- Existing single-paragraph rows are preserved as a one-element
-- array so nothing currently in the table is lost.
--
-- Idempotent: safe to re-run.

alter table public.candidate_job_review
  add column if not exists background text[] not null default '{}';

-- Pull any non-empty existing background_summary into the new array.
update public.candidate_job_review
   set background = array[background_summary]
 where background = '{}'
   and background_summary is not null
   and trim(background_summary) <> '';

alter table public.candidate_job_review
  drop column if exists background_summary;
