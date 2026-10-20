-- Each company picks a compensation model that drives auto-calculated
-- invoice amounts on the Invoicing tab:
--
--   Flat    → invoice = compensation_flat_fee per placement      (default 0, set per company)
--   Percent → invoice = starting_salary × compensation_fee_percentage / 100
--                                                                 (default 0, set per company)
--
-- A placement may still override either fee on its row; the Invoicing
-- view falls back to the company's compensation only when both override
-- fields on the placement are null.
--
-- Idempotent: safe to re-run.

alter table public.companies
  add column if not exists compensation_type text not null default 'Flat'
    check (compensation_type in ('Flat', 'Percent')),
  add column if not exists compensation_flat_fee numeric(12, 2) not null default 0,
  add column if not exists compensation_fee_percentage numeric(5, 2) not null default 0;
