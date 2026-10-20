-- Manual ordering for lead lists on /prospects. Null = never manually
-- positioned; those sort after ordered lists, newest first. The first
-- drag writes 0..n across all lists.
alter table public.prospect_lists
  add column if not exists sort_order integer;
