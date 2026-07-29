-- ============================================================
-- 052_shared_drive_folders_and_member_access.sql
-- 공유 드라이브 잠금 해제: 전체 활성 직원 접근 + 가상 폴더
--
-- 적용 전제: 001 ~ 051, 특히 024/025 적용 완료
--
-- 보안/데이터 원칙
--   1) 실제 Storage object는 비공개 bucket에 유지한다.
--   2) active academy member만 조회·업로드·삭제할 수 있다.
--   3) 폴더는 metadata 계층으로 관리해 폴더 이동/이름 변경 시 object를
--      복사하지 않는다.
--   4) 파일이나 하위 폴더가 남은 폴더는 FK가 삭제를 차단한다.
-- ============================================================

begin;

-- SQL 051의 역할 권한 표기와도 맞춘다. 드라이브만 모든 active 역할의
-- 공통 권한으로 추가하고 다른 역할 권한은 그대로 유지한다.
create or replace function public.has_academy_permission(
  p_academy_id uuid,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null or p_academy_id is null then
    return false;
  end if;

  if public.is_owner_of_academy(p_academy_id) then
    return true;
  end if;

  select m.role
    into v_role
  from public.academy_members m
  where m.academy_id = p_academy_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;

  if not found then
    return false;
  end if;

  return case v_role
    when 'teacher' then p_permission in (
      'canViewStudents',
      'canEditLessonRecords',
      'canEditAttendance',
      'canEditClinicRecords',
      'canViewPayroll',
      'canManageDrive'
    )
    when 'assistant' then p_permission in (
      'canViewStudents',
      'canEditLessonRecords',
      'canEditAttendance',
      'canEditClinicRecords',
      'canViewPayroll',
      'canManageDrive'
    )
    when 'manager' then p_permission in (
      'canViewStudents',
      'canEditLessonRecords',
      'canEditAttendance',
      'canEditClinicRecords',
      'canViewPayroll',
      'canViewPayments',
      'canManageClasses',
      'canManageStudents',
      'canManagePayments',
      'canManageStaff',
      'canManageDrive'
    )
    else false
  end;
end;
$$;

revoke all on function public.has_academy_permission(uuid, text) from public;
grant execute on function public.has_academy_permission(uuid, text) to authenticated;

create table if not exists public.academy_drive_folders (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  parent_id   uuid,
  name        text not null
              check (
                char_length(btrim(name)) between 1 and 80
                and position('/' in name) = 0
              ),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (parent_id is null or parent_id <> id),
  unique (academy_id, id),
  foreign key (academy_id, parent_id)
    references public.academy_drive_folders(academy_id, id)
    on delete restrict
);

create unique index if not exists academy_drive_folders_unique_name_idx
  on public.academy_drive_folders (
    academy_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  );

create index if not exists academy_drive_folders_parent_idx
  on public.academy_drive_folders(academy_id, parent_id, created_at);

drop trigger if exists set_academy_drive_folders_updated_at
  on public.academy_drive_folders;
create trigger set_academy_drive_folders_updated_at
before update on public.academy_drive_folders
for each row execute function public.set_updated_at();

alter table public.academy_drive_folders enable row level security;

drop policy if exists "academy_drive_folders select active member"
  on public.academy_drive_folders;
create policy "academy_drive_folders select active member"
on public.academy_drive_folders for select
using (public.is_member_of_academy(academy_id));

drop policy if exists "academy_drive_folders insert active member"
  on public.academy_drive_folders;
create policy "academy_drive_folders insert active member"
on public.academy_drive_folders for insert
with check (
  public.is_member_of_academy(academy_id)
  and created_by = auth.uid()
);

drop policy if exists "academy_drive_folders delete active member"
  on public.academy_drive_folders;
create policy "academy_drive_folders delete active member"
on public.academy_drive_folders for delete
using (public.is_member_of_academy(academy_id));

grant select, insert, delete on public.academy_drive_folders to authenticated;

-- 파일을 가상 폴더에 연결한다. 기존 파일은 루트(folder_id=null)에 남는다.
alter table public.academy_drive_files
  add column if not exists folder_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'academy_drive_files_academy_folder_fk'
      and conrelid = 'public.academy_drive_files'::regclass
  ) then
    alter table public.academy_drive_files
      add constraint academy_drive_files_academy_folder_fk
      foreign key (academy_id, folder_id)
      references public.academy_drive_folders(academy_id, id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists academy_drive_files_folder_idx
  on public.academy_drive_files(academy_id, folder_id, created_at desc);

-- 드라이브 작업은 모든 active member에게 동일하게 허용한다.
drop policy if exists "academy_drive_files insert owner" on public.academy_drive_files;
drop policy if exists "academy_drive_files insert operations" on public.academy_drive_files;
drop policy if exists "academy_drive_files insert active member" on public.academy_drive_files;
create policy "academy_drive_files insert active member"
on public.academy_drive_files for insert
with check (
  public.is_member_of_academy(academy_id)
  and created_by = auth.uid()
  and storage_path like academy_id::text || '/%'
);

drop policy if exists "academy_drive_files update owner" on public.academy_drive_files;
drop policy if exists "academy_drive_files update operations" on public.academy_drive_files;
drop policy if exists "academy_drive_files update active member" on public.academy_drive_files;
create policy "academy_drive_files update active member"
on public.academy_drive_files for update
using (public.is_member_of_academy(academy_id))
with check (
  public.is_member_of_academy(academy_id)
  and storage_path like academy_id::text || '/%'
);

drop policy if exists "academy_drive_files delete owner" on public.academy_drive_files;
drop policy if exists "academy_drive_files delete operations" on public.academy_drive_files;
drop policy if exists "academy_drive_files delete active member" on public.academy_drive_files;
create policy "academy_drive_files delete active member"
on public.academy_drive_files for delete
using (public.is_member_of_academy(academy_id));

-- 모든 직원이 내려받을 수 있도록 기존 자료도 함께 전환한다. Edge Function은
-- download_allowed=true를 확인한 뒤에만 일반 직원용 signed URL을 발급한다.
update public.academy_drive_files
set download_allowed = true
where download_allowed is distinct from true;

-- Storage object의 첫 path segment에 있는 academy UUID로 active membership을
-- 확인한다. 형식이 잘못된 path는 academies와 매칭되지 않아 false가 된다.
create or replace function public.is_member_of_academy_drive_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.academies a
    where a.id::text = split_part(p_object_name, '/', 1)
      and public.is_member_of_academy(a.id)
  );
$$;

revoke all on function public.is_member_of_academy_drive_object(text) from public;
grant execute on function public.is_member_of_academy_drive_object(text) to authenticated;

drop policy if exists "academy_drive objects insert owner" on storage.objects;
drop policy if exists "academy_drive objects insert operations" on storage.objects;
drop policy if exists "academy_drive objects insert active member" on storage.objects;
create policy "academy_drive objects insert active member"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'academy-drive'
  and public.is_member_of_academy_drive_object(name)
);

drop policy if exists "academy_drive objects update owner" on storage.objects;
drop policy if exists "academy_drive objects update operations" on storage.objects;
drop policy if exists "academy_drive objects update active member" on storage.objects;
create policy "academy_drive objects update active member"
on storage.objects for update to authenticated
using (
  bucket_id = 'academy-drive'
  and public.is_member_of_academy_drive_object(name)
)
with check (
  bucket_id = 'academy-drive'
  and public.is_member_of_academy_drive_object(name)
);

drop policy if exists "academy_drive objects delete owner" on storage.objects;
drop policy if exists "academy_drive objects delete operations" on storage.objects;
drop policy if exists "academy_drive objects delete active member" on storage.objects;
create policy "academy_drive objects delete active member"
on storage.objects for delete to authenticated
using (
  bucket_id = 'academy-drive'
  and public.is_member_of_academy_drive_object(name)
);

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- End of 052_shared_drive_folders_and_member_access.sql
-- ============================================================
