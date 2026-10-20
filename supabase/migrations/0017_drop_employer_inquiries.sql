-- Employer-side public-site submissions are now ingested as Company-kind
-- leads into the seeded "Employer Inquiries" prospect_list, alongside
-- the existing "Talent Network Applications" candidate intake. The
-- standalone employer_inquiries table (and its dedicated CRM inbox)
-- have been retired.
--
-- Safe to drop: verified empty at apply time. Idempotent.

drop table if exists public.employer_inquiries cascade;
