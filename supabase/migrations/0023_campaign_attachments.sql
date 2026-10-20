-- File attachments for campaign emails.
--
-- email_campaigns.attachments holds [{ path, filename, size }] where
-- path points into the private 'email-attachments' storage bucket.
-- Files are uploaded/downloaded through the service-role client from
-- server actions, so no storage RLS policies are required.
--
-- Resend's batch endpoint doesn't support attachments, so campaigns
-- with attachments send per-recipient (throttled) - enforced in code.

alter table public.email_campaigns
  add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', false)
on conflict (id) do nothing;
