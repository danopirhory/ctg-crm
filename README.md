# CTG CRM

Internal recruiting CRM/ATS built for Command Talent Group, a veteran job-placement firm.

> **Sanitized portfolio copy.** All real data, client information, team member names, pricing and production configuration have been removed or replaced with placeholders. This repo is shared to show architecture and code, not to run the live business.

Built by Dan Opirhory (AI-assisted development with Claude).

## Features

- **Leads**: import lead lists by paste, CSV/TSV or Excel; nested sub-lists, drag-to-reorder, assignees, per-list consent tracking, bulk move/delete/email
- **Candidate pipeline**: drag-and-drop kanban (dnd-kit, optimistic updates) with stage buckets plus one column per open job; table view; CSV export
- **Companies and jobs**: employer kanban, quick-add jobs, candidate-to-job matching with auto-stamped dates
- **Placements and invoicing**: per-company fee model (flat or percent of salary), placement overrides, invoice status, undo-placement with status snapshots
- **AI assists**: resume-grounded candidate reviews with weighted rubrics, company-level narrative, outreach drafting, call-note structuring, natural-language candidate search
- **Review documents**: live per-company review page, immutable JSON snapshots, PDF export (react-pdf), single-candidate one-pager
- **Email campaigns**: Resend batch sending, merge fields, attachments, consent and suppression filtering, one-click unsubscribe (RFC 8058), signed webhooks for delivery/open/click/bounce stats
- **Public intake API**: CORS allowlist, honeypot, per-IP rate limit, Zod validation, 24h idempotency
- **Activity timeline, tasks hub, global Ctrl+K search, role-gated settings**

## Stack

Next.js 16 (App Router, server actions) · TypeScript · Tailwind v4 · shadcn/ui · React Hook Form + Zod · Supabase (Postgres, Auth, Storage, RLS) · Vercel AI SDK + OpenAI · Resend · @react-pdf/renderer · pnpm

## Architecture

```
src/
  app/(app)/        authenticated shell: one folder per surface, each with
                    page.tsx, actions.ts (server actions), schema.ts, _components/
  app/api/          intake (public form endpoints), email (unsubscribe, webhook)
  app/login/        sign-in
  lib/db/           hand-written Database types, constants, query layer split by domain
  lib/ai/           review generator, assists, resume text extraction (PDF/DOCX + vision fallback)
  lib/email/        Resend mailer, merge fields, HTML rendering
  lib/pdf/          review and one-pager PDF templates
  lib/supabase/     server, browser, service-role and middleware clients
  proxy.ts          session refresh + auth redirect
supabase/migrations/ 0001-0029, applied in order
```

- **Data model**: employees, candidates, companies, jobs, candidate_job_matches, placements, notes, tasks, prospect_lists/prospects (leads, with pipeline-stage tracking and status snapshots), candidate_job_review + candidate_review_snapshot, activities, email_templates/campaigns/sends/suppressions.
- **Security**: RLS on every table is the source of truth. `is_active_employee()` and `current_employee_role()` are security-definer helpers; reads need an active employee, writes need Admin or Recruiter, deletes need Admin. The UI mirrors this with a role context and `<RoleGate>`, and server actions re-check before writing. The service-role client is `server-only`. Resumes live in a private bucket served through short-lived signed URLs.
- **AI**: all OpenAI calls go through `src/lib/ai`, use `generateObject` with Zod schemas, and fail soft when no key is configured.

## Local setup

Prerequisites: Node 20+, pnpm 10+, a Supabase project.

```bash
pnpm install
```

Create `.env.local` with:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth and RLS-bound reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only: employee invites, intake, webhooks |
| `OPENAI_API_KEY` | AI features (optional) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` | Campaigns (optional) |
| `NEXT_PUBLIC_APP_URL` | e.g. `https://crm.example.com`, used in unsubscribe links |
| `INTAKE_ALLOWED_ORIGINS` | Comma-separated marketing-site origins, e.g. `https://www.example.com` |

1. Run `supabase/migrations/*.sql` in order (SQL editor or Supabase CLI) and disable public sign-ups.
2. Create an auth user, then insert the first admin:
   ```sql
   insert into public.employees (auth_user_id, first_name, last_name, email, role, active)
   values ('<auth-user-uuid>', 'First', 'Last', 'admin@example.com', 'Admin', true);
   ```
3. `pnpm dev` and sign in at http://localhost:3000. Invite more employees from Settings.

Checks: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm smoke:intake` (intake contract tests against a dev server, see `docs/intake-contract.md`).
