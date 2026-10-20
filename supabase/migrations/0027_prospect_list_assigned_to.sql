-- Owner tag for lead lists: which team member is working the list.
-- Null = unassigned. Filterable on /prospects.
alter table public.prospect_lists
  add column if not exists assigned_to text
    check (assigned_to in ('Recruiter A', 'Recruiter B', 'Recruiter C', 'Team'));
