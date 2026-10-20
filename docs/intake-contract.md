# Public Intake Contract

The public marketing site depends on these two
endpoints. Treat this file as the source of truth.

## Rules

1. Fields may be ADDED only as **optional**. Never rename a field,
   never make a new field required, never change a field's type.
2. The destination list names are load-bearing (routes find-or-create
   by name): **"Talent Network Applications"** (Candidate kind) and
   **"Employer Inquiries"** (Company kind). Never rename these lists.
3. Database migrations touching `prospects` / `prospect_lists` are
   additive-only: new nullable/defaulted columns OK; no renames, no
   drops, no constraint tightening on columns these routes write.
4. Responses keep shape `{ ok: boolean, error?, deduped? }` with the
   same status codes (200 success/dedupe/honeypot, 400 validation,
   429 rate limit, 500 server).
5. Run `npm run smoke:intake` against a dev server before deploying
   anything that touched intake code, middleware, or the prospects
   schema.

## POST /api/intake/talent

Content-Type: application/json. CORS-allowed origins:
the marketing-site origins in `INTAKE_ALLOWED_ORIGINS`, plus
localhost:3000/3001.

| Field | Type | Required |
| --- | --- | --- |
| first_name | string ≤200 | yes |
| last_name | string ≤200 | yes |
| email | valid email ≤320 | yes |
| phone | string ≤50 | no |
| military_branch | string ≤100 | no |
| rank | string ≤200 | no |
| mos_or_specialty | string ≤500 | no |
| clearance | string ≤100 | no |
| years_of_service | number 0-60 \| null | no |
| target_industry | string ≤200 | no |
| location | string ≤200 | no |
| notes | string ≤5000 | no |
| marketing_consent | boolean (default false) | no |
| website | honeypot - must be empty in real form | no |

## POST /api/intake/employer

| Field | Type | Required |
| --- | --- | --- |
| company_name | string ≤300 | yes |
| contact_name | string ≤300 | no |
| contact_email | valid email ≤320 | yes |
| contact_phone | string ≤50 | no |
| company_website | string ≤500 | no |
| industry | string ≤200 | no |
| location | string ≤200 | no |
| hiring_needs | string ≤5000 | no |
| timeline | string ≤500 | no |
| notes | string ≤5000 | no |
| website | honeypot - must be empty in real form | no |

## Behavior contract

- Honeypot (`website` non-empty) → `200 { ok: true }`, no row inserted.
- Same email into the same list within 24h → `200 { ok: true, deduped: true }`, no second row.
- Validation failure → `400 { ok: false, error }`.
- More than 5 requests / 10 min / IP / endpoint → `429`.
- OPTIONS preflight → 204 with CORS headers.
