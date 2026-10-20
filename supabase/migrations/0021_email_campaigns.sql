-- In-CRM email campaign engine (replaces the Mailchimp sync).
-- Delivery rides on Resend; these tables own everything else:
-- composition, recipients, per-send status from webhooks, and the
-- global suppression list that enforces unsubscribes/bounces.

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null, -- plain text with {{merge_tokens}}
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,                  -- internal label
  list_id uuid references public.prospect_lists(id) on delete set null,
  subject text not null default '',
  body text not null default '',
  from_name text not null default 'Command Talent Group',
  reply_to text,
  status text not null default 'Draft'
    check (status in ('Draft', 'Sending', 'Sent', 'Failed')),
  total_recipients int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_by uuid references public.employees(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  email text not null,
  resend_id text,
  status text not null default 'queued'
    check (status in (
      'queued','sent','delivered','opened','clicked',
      'bounced','complained','failed','unsubscribed'
    )),
  error text,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index email_sends_campaign_email_idx
  on public.email_sends (campaign_id, email);
create index email_sends_resend_idx on public.email_sends (resend_id);
create index email_sends_token_idx on public.email_sends (unsubscribe_token);
create index email_sends_prospect_idx on public.email_sends (prospect_id);

-- Global do-not-mail list. Lowercased emails. Checked before every send.
create table public.email_suppressions (
  email text primary key,
  reason text not null
    check (reason in ('unsubscribed','bounced','complained','manual')),
  source_campaign_id uuid references public.email_campaigns(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_sends enable row level security;
alter table public.email_suppressions enable row level security;

create policy "email_templates all" on public.email_templates
  for all using (is_active_employee()) with check (is_active_employee());
create policy "email_campaigns all" on public.email_campaigns
  for all using (is_active_employee()) with check (is_active_employee());
create policy "email_sends all" on public.email_sends
  for all using (is_active_employee()) with check (is_active_employee());
create policy "email_suppressions all" on public.email_suppressions
  for all using (is_active_employee()) with check (is_active_employee());
-- The unsubscribe + webhook routes write via the service role, which
-- bypasses RLS by design.
