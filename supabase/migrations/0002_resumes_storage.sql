-- Resumes storage bucket + RLS.
-- Run once in Supabase Dashboard → SQL Editor after 0001_initial_schema.sql.
-- Idempotent: safe to re-run.

-- =====================================================================
-- 1. Private bucket with bucket-level size + MIME enforcement.
--    Server-enforced regardless of what the client uploads.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,           -- private bucket; no anonymous reads
  10485760,        -- 10 MB
  array[
    'application/pdf',
    'application/msword',                                                       -- .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'   -- .docx
  ]
)
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- =====================================================================
-- 2. RLS policies on storage.objects scoped to the `resumes` bucket.
--    Gated on the same is_active_employee() helper used elsewhere, so
--    deactivated employees lose access to upload + download immediately.
-- =====================================================================
drop policy if exists "resumes select" on storage.objects;
create policy "resumes select"
  on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and public.is_active_employee());

drop policy if exists "resumes insert" on storage.objects;
create policy "resumes insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and public.is_active_employee());

drop policy if exists "resumes update" on storage.objects;
create policy "resumes update"
  on storage.objects for update to authenticated
  using      (bucket_id = 'resumes' and public.is_active_employee())
  with check (bucket_id = 'resumes' and public.is_active_employee());

drop policy if exists "resumes delete" on storage.objects;
create policy "resumes delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and public.is_active_employee());
