-- Hand-picked recipient support for campaigns. When non-null, the send
-- targets exactly these prospect ids (still consent + suppression
-- filtered) instead of the whole list; list_id is kept as the source
-- list for display. Powers "Email selected" from the lead-table bulk
-- bar. Additive only.

alter table public.email_campaigns
  add column if not exists recipient_prospect_ids uuid[];
