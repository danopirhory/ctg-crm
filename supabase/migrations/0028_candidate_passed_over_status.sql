-- Add a 'Passed Over' candidate status for the new pipeline bucket
-- below "Interviewing": candidates who interviewed but were not
-- selected. Distinct from 'Not Fit' (a general earlier-stage flag).
alter table public.candidates
  drop constraint if exists candidates_status_check;

alter table public.candidates
  add constraint candidates_status_check
  check (status in (
    'New', 'Resume Sent', 'Contacted', 'Screened', 'Qualified',
    'Submitted', 'Interviewing', 'Offer', 'Placed', 'Passed Over',
    'Not Fit', 'Archived'
  ));
