-- ============================================================
-- 024_academy_drive.sql
-- 학원 공유 드라이브: 비공개 Storage + 파일 메타데이터 + RLS
--
-- 의존: 001_workspace_schema.sql
--   public.set_updated_at / public.is_member_of_academy / public.is_owner_of_academy
--
-- 보안 원칙
--   1) 파일 object는 public bucket에 두지 않는다.
--   2) 일반 직원은 metadata만 조회한다. 실제 열람 URL은 Edge Function
--      academy-drive-file 이 active membership / download_allowed를 확인해 발급한다.
--   3) 원장만 파일 등록, 삭제, 다운로드 정책 변경 및 Storage object 직접 관리가 가능하다.
-- ============================================================

-- ─── private Storage bucket ──────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('academy-drive', 'academy-drive', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800;


-- ─── metadata table ──────────────────────────────────────────
create table if not exists public.academy_drive_files (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete cascade,
  storage_path      text not null unique,
  original_name     text not null check (char_length(original_name) between 1 and 255),
  mime_type         text not null default 'application/octet-stream',
  size_bytes        bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  download_allowed  boolean not null default false,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (storage_path like academy_id::text || '/%')
);

create index if not exists academy_drive_files_academy_created_idx
  on public.academy_drive_files (academy_id, created_at desc);

drop trigger if exists set_academy_drive_files_updated_at on public.academy_drive_files;
create trigger set_academy_drive_files_updated_at
before update on public.academy_drive_files
for each row execute function public.set_updated_at();

alter table public.academy_drive_files enable row level security;

drop policy if exists "academy_drive_files select active member" on public.academy_drive_files;
create policy "academy_drive_files select active member"
on public.academy_drive_files for select
using (public.is_member_of_academy(academy_id));

drop policy if exists "academy_drive_files insert owner" on public.academy_drive_files;
create policy "academy_drive_files insert owner"
on public.academy_drive_files for insert
with check (
  public.is_owner_of_academy(academy_id)
  and created_by = auth.uid()
  and storage_path like academy_id::text || '/%'
);

drop policy if exists "academy_drive_files update owner" on public.academy_drive_files;
create policy "academy_drive_files update owner"
on public.academy_drive_files for update
using (public.is_owner_of_academy(academy_id))
with check (
  public.is_owner_of_academy(academy_id)
  and storage_path like academy_id::text || '/%'
);

drop policy if exists "academy_drive_files delete owner" on public.academy_drive_files;
create policy "academy_drive_files delete owner"
on public.academy_drive_files for delete
using (public.is_owner_of_academy(academy_id));

grant select, insert, update, delete on public.academy_drive_files to authenticated;


-- ─── Storage RLS ─────────────────────────────────────────────
-- storage.object name의 첫 path segment는 academy UUID이다.
-- uuid cast 대신 academies.id::text를 비교해 악의적인 형식의 object name도 안전하게 false 처리한다.
create or replace function public.is_owner_of_academy_drive_object(p_object_name text)
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
      and a.owner_id = auth.uid()
  );
$$;

grant execute on function public.is_owner_of_academy_drive_object(text) to authenticated;

drop policy if exists "academy_drive objects select owner" on storage.objects;
create policy "academy_drive objects select owner"
on storage.objects for select to authenticated
using (
  bucket_id = 'academy-drive'
  and public.is_owner_of_academy_drive_object(name)
);

drop policy if exists "academy_drive objects insert owner" on storage.objects;
create policy "academy_drive objects insert owner"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'academy-drive'
  and public.is_owner_of_academy_drive_object(name)
);

drop policy if exists "academy_drive objects update owner" on storage.objects;
create policy "academy_drive objects update owner"
on storage.objects for update to authenticated
using (
  bucket_id = 'academy-drive'
  and public.is_owner_of_academy_drive_object(name)
)
with check (
  bucket_id = 'academy-drive'
  and public.is_owner_of_academy_drive_object(name)
);

drop policy if exists "academy_drive objects delete owner" on storage.objects;
create policy "academy_drive objects delete owner"
on storage.objects for delete to authenticated
using (
  bucket_id = 'academy-drive'
  and public.is_owner_of_academy_drive_object(name)
);

-- ============================================================
-- End of 024_academy_drive.sql
-- ============================================================
