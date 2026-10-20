-- Quick sends: one-off emails fired straight from a lead selection
-- without the draft/composer ceremony. They reuse the entire campaign
-- delivery pipeline (consent, suppression, unsubscribe tokens, webhook
-- stats), so they're stored as email_campaigns rows tagged kind='quick'
-- and named "Quick: <subject>".

alter table public.email_campaigns
  add column if not exists kind text not null default 'campaign'
    check (kind in ('campaign', 'quick'));
