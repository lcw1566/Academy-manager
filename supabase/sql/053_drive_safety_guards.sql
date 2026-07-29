-- ============================================================
-- 053_drive_safety_guards.sql
-- 공유 드라이브 안전장치: 휴지통, 감사 이력, 용량/확장자 제한
--
-- 적용 전제: 001 ~ 052 적용 완료
-- ============================================================

begin;

-- 파일은 즉시 삭제하지 않고 7일 휴지통 상태를 거친다.
alter table public.academy_drive_files
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.academy_drive_folders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists academy_drive_files_deleted_idx
  on public.academy_drive_files(academy_id, deleted_at);
create index if not exists academy_drive_folders_deleted_idx
  on public.academy_drive_folders(academy_id, deleted_at);

-- 휴지통에 있는 폴더 이름은 다시 사용할 수 있게 활성 폴더끼리만 중복을 막는다.
drop index if exists public.academy_drive_folders_unique_name_idx;
create unique index academy_drive_folders_unique_name_idx
  on public.academy_drive_folders (
    academy_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  )
  where deleted_at is null;

-- 파일럿 기본 한도: 학원당 1GB. 이후 요금제별 값으로 변경할 수 있다.
alter table public.academies
  add column if not exists drive_quota_bytes bigint not null default 1073741824;

alter table public.academies
  drop constraint if exists academies_drive_quota_bytes_chk;
alter table public.academies
  add constraint academies_drive_quota_bytes_chk
  check (drive_quota_bytes between 52428800 and 1099511627776);

-- 화면의 사용량 표시도 목록 페이지 크기에 영향받지 않도록 DB에서 합산한다.
create or replace function public.get_academy_drive_usage(p_academy_id uuid)
returns table (used_bytes bigint, quota_bytes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(f.size_bytes), 0)::bigint as used_bytes,
    a.drive_quota_bytes as quota_bytes
  from public.academies a
  left join public.academy_drive_files f on f.academy_id = a.id
  where a.id = p_academy_id
    and public.is_member_of_academy(a.id)
  group by a.id, a.drive_quota_bytes;
$$;

revoke all on function public.get_academy_drive_usage(uuid) from public;
grant execute on function public.get_academy_drive_usage(uuid) to authenticated;

-- 앱에서 사용하는 문서/이미지만 허용한다. ZIP과 실행·스크립트·웹 파일은
-- 내용 위장 위험 때문에 파일럿에서는 제외한다.
create or replace function public.guard_academy_drive_file()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_extension text;
  v_quota bigint;
  v_used bigint;
begin
  if tg_op = 'UPDATE' and (
    new.academy_id is distinct from old.academy_id
    or new.storage_path is distinct from old.storage_path
    or new.created_by is distinct from old.created_by
    or new.size_bytes is distinct from old.size_bytes
    or new.mime_type is distinct from old.mime_type
    or new.original_name is distinct from old.original_name
  ) then
    raise exception '파일의 원본 정보는 변경할 수 없어요.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and new.original_name is distinct from old.original_name)
  then
    v_extension := lower(substring(new.original_name from '\.([^.]+)$'));
    if v_extension is null or v_extension not in (
      'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'odt', 'rtf',
      'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'md',
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'
    ) then
      raise exception '지원하지 않는 파일 형식이에요.'
        using errcode = '22023';
    end if;
  end if;

  if new.deleted_at is null
    and new.folder_id is not null
    and not exists (
    select 1
    from public.academy_drive_folders f
    where f.id = new.folder_id
      and f.academy_id = new.academy_id
      and f.deleted_at is null
  ) then
    raise exception '사용할 수 없는 폴더예요.'
      using errcode = '23503';
  end if;

  -- 휴지통으로 옮길 때는 저장량이 늘지 않으므로 용량 검사를 반복하지 않는다.
  if new.deleted_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and not (old.deleted_at is not null and new.deleted_at is null)
  then
    return new;
  end if;

  -- 같은 학원에서 동시에 업로드해도 둘 다 한도를 통과하지 않게 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended('drive:' || new.academy_id::text, 0));

  select a.drive_quota_bytes
    into v_quota
  from public.academies a
  where a.id = new.academy_id;

  select coalesce(sum(f.size_bytes), 0)
    into v_used
  from public.academy_drive_files f
  where f.academy_id = new.academy_id
    and f.id is distinct from new.id;

  if v_used + new.size_bytes > coalesce(v_quota, 1073741824) then
    raise exception '드라이브 저장 용량을 초과했어요.'
      using errcode = '54000';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_academy_drive_file
  on public.academy_drive_files;
create trigger guard_academy_drive_file
before insert or update
on public.academy_drive_files
for each row execute function public.guard_academy_drive_file();

-- 내용물이 남은 폴더를 통째로 숨기거나, 삭제된 상위 폴더 아래로 복구하는 일을 막는다.
create or replace function public.guard_academy_drive_folder()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (
    new.academy_id is distinct from old.academy_id
    or new.created_by is distinct from old.created_by
  ) then
    raise exception '폴더의 소속 정보는 변경할 수 없어요.'
      using errcode = '42501';
  end if;

  if new.deleted_at is null and new.parent_id is not null and not exists (
    select 1
    from public.academy_drive_folders parent
    where parent.id = new.parent_id
      and parent.academy_id = new.academy_id
      and parent.deleted_at is null
  ) then
    raise exception '상위 폴더를 먼저 복구해주세요.'
      using errcode = '23503';
  end if;

  if tg_op = 'UPDATE'
    and old.deleted_at is null
    and new.deleted_at is not null
    and (
      exists (
        select 1
        from public.academy_drive_folders child
        where child.parent_id = old.id
          and child.deleted_at is null
      )
      or exists (
        select 1
        from public.academy_drive_files file
        where file.folder_id = old.id
          and file.deleted_at is null
      )
    )
  then
    raise exception '파일이나 하위 폴더를 먼저 비워주세요.'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_academy_drive_folder
  on public.academy_drive_folders;
create trigger guard_academy_drive_folder
before insert or update
on public.academy_drive_folders
for each row execute function public.guard_academy_drive_folder();

-- 삭제·복구·업로드 이력은 클라이언트가 임의로 만들지 못하도록 트리거로 기록한다.
create table if not exists public.academy_drive_events (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id) on delete cascade,
  actor_id     uuid references auth.users(id) on delete set null,
  target_kind  text not null check (target_kind in ('file', 'folder')),
  target_id    uuid not null,
  target_name  text not null,
  event_type   text not null check (
    event_type in ('created', 'trashed', 'restored', 'permanently_deleted')
  ),
  created_at   timestamptz not null default now()
);

create index if not exists academy_drive_events_academy_created_idx
  on public.academy_drive_events(academy_id, created_at desc);

alter table public.academy_drive_events enable row level security;

drop policy if exists "academy_drive_events select active member"
  on public.academy_drive_events;
create policy "academy_drive_events select active member"
on public.academy_drive_events for select
using (public.is_member_of_academy(academy_id));

grant select on public.academy_drive_events to authenticated;

create or replace function public.audit_academy_drive_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_kind text;
  v_name text;
  v_event text;
  v_academy_id uuid;
  v_target_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_kind := case when tg_table_name = 'academy_drive_files' then 'file' else 'folder' end;
  v_name := case
    when v_kind = 'file' then v_row ->> 'original_name'
    else v_row ->> 'name'
  end;
  v_academy_id := (v_row ->> 'academy_id')::uuid;
  v_target_id := (v_row ->> 'id')::uuid;

  if tg_op = 'INSERT' then
    v_event := 'created';
  elsif tg_op = 'DELETE' then
    v_event := 'permanently_deleted';
  elsif (v_old ->> 'deleted_at') is null and (v_row ->> 'deleted_at') is not null then
    v_event := 'trashed';
  elsif (v_old ->> 'deleted_at') is not null and (v_row ->> 'deleted_at') is null then
    v_event := 'restored';
  else
    return new;
  end if;

  insert into public.academy_drive_events (
    academy_id, actor_id, target_kind, target_id, target_name, event_type
  )
  values (
    v_academy_id,
    coalesce(
      auth.uid(),
      nullif(v_row ->> 'deleted_by', '')::uuid,
      nullif(v_row ->> 'created_by', '')::uuid
    ),
    v_kind,
    v_target_id,
    coalesce(v_name, '(이름 없음)'),
    v_event
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_academy_drive_files
  on public.academy_drive_files;
create trigger audit_academy_drive_files
after insert or update or delete on public.academy_drive_files
for each row execute function public.audit_academy_drive_change();

drop trigger if exists audit_academy_drive_folders
  on public.academy_drive_folders;
create trigger audit_academy_drive_folders
after insert or update or delete on public.academy_drive_folders
for each row execute function public.audit_academy_drive_change();

-- 폴더도 휴지통 전환/복구를 위해 UPDATE를 허용한다.
drop policy if exists "academy_drive_folders update active member"
  on public.academy_drive_folders;
create policy "academy_drive_folders update active member"
on public.academy_drive_folders for update
using (public.is_member_of_academy(academy_id))
with check (public.is_member_of_academy(academy_id));

grant update on public.academy_drive_folders to authenticated;

-- 활성 자료는 DELETE로 우회할 수 없다. 먼저 deleted_at을 기록해야 한다.
drop policy if exists "academy_drive_files delete active member"
  on public.academy_drive_files;
create policy "academy_drive_files delete trashed member"
on public.academy_drive_files for delete
using (
  public.is_member_of_academy(academy_id)
  and deleted_at is not null
);

drop policy if exists "academy_drive_folders delete active member"
  on public.academy_drive_folders;
create policy "academy_drive_folders delete trashed member"
on public.academy_drive_folders for delete
using (
  public.is_member_of_academy(academy_id)
  and deleted_at is not null
);

-- Storage 업로드는 먼저 생성된 metadata의 경로/작성자와 일치해야 한다.
create or replace function public.can_upload_academy_drive_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.academy_drive_files f
    where f.storage_path = p_object_name
      and f.created_by = auth.uid()
      and f.deleted_at is null
      and public.is_member_of_academy(f.academy_id)
  );
$$;

revoke all on function public.can_upload_academy_drive_object(text) from public;
grant execute on function public.can_upload_academy_drive_object(text) to authenticated;

drop policy if exists "academy_drive objects insert active member" on storage.objects;
create policy "academy_drive objects insert active member"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'academy-drive'
  and public.can_upload_academy_drive_object(name)
);

-- 영구 삭제는 membership과 휴지통 상태를 재검증하는 Edge Function만 수행한다.
drop policy if exists "academy_drive objects update active member" on storage.objects;
drop policy if exists "academy_drive objects delete active member" on storage.objects;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- End of 053_drive_safety_guards.sql
-- ============================================================
