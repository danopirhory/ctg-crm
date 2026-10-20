-- Mailchimp was decommissioned (the in-CRM campaign engine replaced the
-- sync - see 0021). Drop the leftover sync-flag columns. Nothing reads
-- them anymore. Idempotent.
alter table public.prospects  drop column if exists mailchimp_synced;
alter table public.candidates drop column if exists mailchimp_synced;
