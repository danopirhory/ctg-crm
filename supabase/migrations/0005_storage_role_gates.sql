-- Security hardening: role-gated writes on the resumes bucket.
-- Tighten the `resumes` bucket policies to respect the role hierarchy.
-- Before this migration any active employee (including Viewer) could
-- upload, overwrite, or delete files in the resumes bucket via the
-- Storage REST API. Now write/delete require Admin or Recruiter.
--
-- Option B chosen: Recruiter can also DELETE so the "replace resume"
-- code path in updateCandidate doesn't leave orphan files. The CRM-level
-- rule "Recruiter cannot permanently delete" still applies to data rows
-- (candidates / companies / jobs / placements / employees) - file
-- attachments are operational data and follow the create/update rules.
--
-- Idempotent: safe to re-run.

drop policy if exists "resumes select" on storage.objects;
create policy "resumes select"
  on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and public.is_active_employee());

drop policy if exists "resumes insert" on storage.objects;
create policy "resumes insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resumes'
    and public.is_active_employee()
    and public.current_employee_role() in ('Admin', 'Recruiter')
  );

drop policy if exists "resumes update" on storage.objects;
create policy "resumes update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'resumes'
    and public.is_active_employee()
    and public.current_employee_role() in ('Admin', 'Recruiter')
  )
  with check (
    bucket_id = 'resumes'
    and public.is_active_employee()
    and public.current_employee_role() in ('Admin', 'Recruiter')
  );

drop policy if exists "resumes delete" on storage.objects;
create policy "resumes delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'resumes'
    and public.is_active_employee()
    and public.current_employee_role() in ('Admin', 'Recruiter')
  );
