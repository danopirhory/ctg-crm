-- Sub-lists: a lead list can be nested under a parent list for
-- organization. Top-level lists have parent_list_id = null. On parent
-- delete, children are promoted to top-level (set null) rather than
-- cascade-deleted, so no prospects are lost by accident.
alter table public.prospect_lists
  add column if not exists parent_list_id uuid
    references public.prospect_lists(id) on delete set null;

create index if not exists prospect_lists_parent_idx
  on public.prospect_lists(parent_list_id);
