\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'storage test failed: %', p_label;
  end if;
end;
$$;

select pg_temp.assert(
  exists (
    select 1 from storage.buckets
    where id = 'academy-drive'
      and name = 'academy-drive'
      and public = false
      and file_size_limit = 52428800
      and allowed_mime_types is null
  ),
  'academy drive bucket is private and capped at 50 MiB'
);
select pg_temp.assert(
  exists (
    select 1 from storage.buckets
    where id = 'feedback-attachments'
      and name = 'feedback-attachments'
      and public = false
      and file_size_limit = 5242880
      and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  'feedback bucket is private and image-only'
);

set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000094001', 'owner-a-094@example.invalid'),
  ('00000000-0000-0000-0000-000000094002', 'manager-a-094@example.invalid'),
  ('00000000-0000-0000-0000-000000094003', 'teacher-a-094@example.invalid'),
  ('00000000-0000-0000-0000-000000094004', 'invited-a-094@example.invalid'),
  ('00000000-0000-0000-0000-000000094005', 'inactive-a-094@example.invalid'),
  ('00000000-0000-0000-0000-000000094006', 'owner-b-094@example.invalid'),
  ('00000000-0000-0000-0000-000000094007', 'outsider-094@example.invalid');
insert into public.academies (id, name, owner_id) values
  ('00000000-0000-0000-0000-000000094100', 'Storage A', '00000000-0000-0000-0000-000000094001'),
  ('00000000-0000-0000-0000-000000094200', 'Storage B', '00000000-0000-0000-0000-000000094006');
insert into public.academy_members (academy_id, user_id, role, status) values
  ('00000000-0000-0000-0000-000000094100', '00000000-0000-0000-0000-000000094001', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000094100', '00000000-0000-0000-0000-000000094002', 'manager', 'active'),
  ('00000000-0000-0000-0000-000000094100', '00000000-0000-0000-0000-000000094003', 'teacher', 'active'),
  ('00000000-0000-0000-0000-000000094100', '00000000-0000-0000-0000-000000094004', 'teacher', 'invited'),
  ('00000000-0000-0000-0000-000000094100', '00000000-0000-0000-0000-000000094005', 'teacher', 'inactive'),
  ('00000000-0000-0000-0000-000000094200', '00000000-0000-0000-0000-000000094006', 'owner', 'active');
insert into public.academy_staff_profiles (
  academy_id, user_id, role, status, permissions
) values (
  '00000000-0000-0000-0000-000000094100',
  '00000000-0000-0000-0000-000000094003',
  'teacher', 'active', '{"canManageStudents":true}'::jsonb
);
set local session_replication_role = origin;

-- Cascading academy deletion must not be blocked by a new audit event that
-- points back to the parent row being removed.
insert into public.academies (id, name, owner_id) values (
  '00000000-0000-0000-0000-000000094300',
  'Storage delete test',
  '00000000-0000-0000-0000-000000094001'
);
insert into public.academy_members (academy_id, user_id, role, status) values (
  '00000000-0000-0000-0000-000000094300',
  '00000000-0000-0000-0000-000000094001',
  'owner', 'active'
);
insert into public.academy_drive_files (
  academy_id, storage_path, original_name, mime_type, size_bytes, created_by
) values (
  '00000000-0000-0000-0000-000000094300',
  '00000000-0000-0000-0000-000000094300/delete.pdf',
  'delete.pdf', 'application/pdf', 10,
  '00000000-0000-0000-0000-000000094001'
);
delete from public.academies where id = '00000000-0000-0000-0000-000000094300';
select pg_temp.assert(
  not exists (select 1 from public.academies where id = '00000000-0000-0000-0000-000000094300'),
  'academy deletion cascades across drive audit triggers'
);

set local role authenticated;

-- Owner: metadata and object upload are allowed, and direct download metadata
-- is visible only because the path belongs to the owner's academy.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000094001', true);
insert into public.academy_drive_files (
  id, academy_id, storage_path, original_name, mime_type, size_bytes, created_by
) values (
  '00000000-0000-0000-0000-000000094101',
  '00000000-0000-0000-0000-000000094100',
  '00000000-0000-0000-0000-000000094100/owner.pdf',
  'owner.pdf', 'application/pdf', 12,
  '00000000-0000-0000-0000-000000094001'
);
insert into storage.objects (bucket_id, name, owner_id, metadata) values (
  'academy-drive',
  '00000000-0000-0000-0000-000000094100/owner.pdf',
  '00000000-0000-0000-0000-000000094001',
  '{"size":12,"mimetype":"application/pdf"}'::jsonb
);
select pg_temp.assert(
  (select count(*) = 1 from storage.objects
   where bucket_id = 'academy-drive' and name like '00000000-0000-0000-0000-000000094100/%'),
  'owner can directly read own academy object'
);

-- Manager and delegated teacher can upload only a path backed by their own
-- authorized metadata row. They still cannot directly read file contents.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000094002', true);
insert into public.academy_drive_files (
  id, academy_id, storage_path, original_name, mime_type, size_bytes, created_by
) values (
  '00000000-0000-0000-0000-000000094102',
  '00000000-0000-0000-0000-000000094100',
  '00000000-0000-0000-0000-000000094100/manager.pdf',
  'manager.pdf', 'application/pdf', 13,
  '00000000-0000-0000-0000-000000094002'
);
insert into storage.objects (bucket_id, name, owner_id, metadata) values (
  'academy-drive',
  '00000000-0000-0000-0000-000000094100/manager.pdf',
  '00000000-0000-0000-0000-000000094002',
  '{"size":13,"mimetype":"application/pdf"}'::jsonb
);
select pg_temp.assert(
  (select count(*) = 0 from storage.objects where bucket_id = 'academy-drive'),
  'manager cannot directly download drive objects'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000094003', true);
insert into public.academy_drive_files (
  id, academy_id, storage_path, original_name, mime_type, size_bytes, created_by
) values (
  '00000000-0000-0000-0000-000000094103',
  '00000000-0000-0000-0000-000000094100',
  '00000000-0000-0000-0000-000000094100/teacher.pdf',
  'teacher.pdf', 'application/pdf', 14,
  '00000000-0000-0000-0000-000000094003'
);
insert into storage.objects (bucket_id, name, owner_id, metadata) values (
  'academy-drive',
  '00000000-0000-0000-0000-000000094100/teacher.pdf',
  '00000000-0000-0000-0000-000000094003',
  '{"size":14,"mimetype":"application/pdf"}'::jsonb
);
select pg_temp.assert(
  (select count(*) = 0 from storage.objects where bucket_id = 'academy-drive'),
  'delegated teacher cannot directly download drive objects'
);

-- Invited, inactive, unrelated and cross-academy callers cannot create the
-- metadata required by the upload policy or forge an object path directly.
do $$
declare
  v_user uuid;
begin
  foreach v_user in array array[
    '00000000-0000-0000-0000-000000094004'::uuid,
    '00000000-0000-0000-0000-000000094005'::uuid,
    '00000000-0000-0000-0000-000000094006'::uuid,
    '00000000-0000-0000-0000-000000094007'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    begin
      insert into public.academy_drive_files (
        academy_id, storage_path, original_name, mime_type, size_bytes, created_by
      ) values (
        '00000000-0000-0000-0000-000000094100',
        '00000000-0000-0000-0000-000000094100/denied-' || v_user::text || '.pdf',
        'denied.pdf', 'application/pdf', 10, v_user
      );
      raise exception 'unauthorized metadata insert succeeded for %', v_user;
    exception when insufficient_privilege then null; end;

    begin
      insert into storage.objects (bucket_id, name, owner_id) values (
        'academy-drive',
        '00000000-0000-0000-0000-000000094100/forged-' || v_user::text || '.pdf',
        v_user::text
      );
      raise exception 'unauthorized object insert succeeded for %', v_user;
    exception when insufficient_privilege then null; end;
  end loop;
end;
$$;

-- Feedback attachments use an immutable user-id prefix. A different user can
-- neither read nor delete them, while the reporter can do both.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000094001', true);
insert into storage.objects (bucket_id, name, owner_id, metadata) values (
  'feedback-attachments',
  '00000000-0000-0000-0000-000000094001/report.png',
  '00000000-0000-0000-0000-000000094001',
  '{"size":20,"mimetype":"image/png"}'::jsonb
);
select pg_temp.assert(
  (select count(*) = 1 from storage.objects where bucket_id = 'feedback-attachments'),
  'reporter can read own feedback attachment'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000094002', true);
select pg_temp.assert(
  (select count(*) = 0 from storage.objects where bucket_id = 'feedback-attachments'),
  'other academy member cannot read feedback attachment'
);
do $$ begin
  begin
    delete from storage.objects
    where bucket_id = 'feedback-attachments'
      and name = '00000000-0000-0000-0000-000000094001/report.png';
    if found then raise exception 'other user deleted feedback attachment'; end if;
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('feedback-attachments', 'anonymous/report.png');
    raise exception 'anonymous attachment upload succeeded';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
