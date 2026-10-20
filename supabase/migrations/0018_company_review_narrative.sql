-- Company-level narrative panels for the candidate review document.
--
-- The review document layout has three callout boxes that
-- sit outside the per-(candidate, job) review rows:
--
--   key_takeaways   - strategic highlights across the candidate pool
--                     ("Strongest overall: X and Y", "Z is high-upside…")
--   next_steps      - recommended workflow steps (interview sequencing,
--                     decision timeline)
--   review_notes    - broad reminders that apply to every candidate
--                     (interview themes, differentiators to probe)
--
-- These are AI-drafted from the underlying candidate reviews each time
-- "Update all" runs on the live document. Recruiter edits will be wired
-- up later; the column exists now so snapshots can carry the data.
-- Snapshots embed their own frozen copy in the payload JSONB.

alter table public.companies
  add column if not exists review_key_takeaways text[] not null default '{}',
  add column if not exists review_next_steps text[] not null default '{}',
  add column if not exists review_notes text[] not null default '{}',
  add column if not exists review_narrative_generated_at timestamptz,
  add column if not exists review_narrative_ai_model text;
