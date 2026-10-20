-- Add a 'Resume Sent' candidate status so the Candidate Pipeline can
-- track a sub-bucket between "Non-Vetted" (just a lead) and "Vetted"
-- (recruiter has reviewed the resume) - the candidate has provided
-- their resume but it hasn't been reviewed yet.
--
-- Idempotent: safe to re-run.

alter table public.candidates
  drop constraint if exists candidates_status_check;

alter table public.candidates
  add constraint candidates_status_check
  check (status in (
    'New', 'Resume Sent', 'Contacted', 'Screened', 'Qualified',
    'Submitted', 'Interviewing', 'Offer', 'Placed', 'Not Fit', 'Archived'
  ));
