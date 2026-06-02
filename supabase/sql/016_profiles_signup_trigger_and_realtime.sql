-- ============================================================
-- 016_profiles_signup_trigger_and_realtime.sql
-- Academy Manager — 가입 직후 profile 인덱스 생성 + 협업 상태 Realtime 등록
--
-- 배경:
--   - 원장이 이메일로 직원을 검색할 때 public.profiles 를 기준으로 찾는다.
--   - 기존 앱은 로그인 후 syncProfile 이 실행되어야 profiles row 가 생기므로,
--     가입 직후 다른 브라우저에서 검색하면 "없는 계정"처럼 보일 수 있었다.
--   - 초대/수락도 각 브라우저가 다시 fetch 하기 전까지 stale 상태가 남았다.
--
-- 이 파일이 만드는 것:
--   1. auth.users insert 직후 public.profiles upsert trigger
--   2. 초대/멤버/직원설정 테이블을 Supabase Realtime publication 에 등록
--
-- idempotent:
--   - create or replace function
--   - drop trigger if exists 후 create trigger
--   - publication 등록은 이미 등록된 테이블을 건너뜀
--
-- destructive 명령 (drop table / delete / truncate) 없음.
-- ============================================================


-- ============================================================
-- SECTION 1. profiles 컬럼 보강
-- ============================================================

alter table public.profiles
  add column if not exists phone text;

alter table public.profiles
  add column if not exists account_type text default 'tutor';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_account_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type in ('tutor', 'owner', 'staff'));
  end if;
end $$;


-- ============================================================
-- SECTION 2. auth.users -> public.profiles 즉시 upsert
-- ============================================================

create or replace function public.handle_auth_user_profile_upsert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta jsonb;
  next_account_type text;
  next_default_role text;
begin
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  next_account_type := nullif(meta->>'account_type', '');
  if next_account_type not in ('tutor', 'owner', 'staff') then
    next_account_type := null;
  end if;

  next_default_role := nullif(meta->>'default_role', '');
  if next_default_role not in ('tutor', 'owner', 'teacher', 'assistant') then
    next_default_role := case next_account_type
      when 'owner' then 'owner'
      when 'staff' then 'teacher'
      else 'tutor'
    end;
  end if;

  insert into public.profiles (
    id,
    email,
    display_name,
    phone,
    account_type,
    default_role
  )
  values (
    new.id,
    lower(new.email),
    nullif(meta->>'display_name', ''),
    nullif(meta->>'phone', ''),
    coalesce(next_account_type, 'tutor'),
    next_default_role
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    account_type = coalesce(public.profiles.account_type, excluded.account_type),
    default_role = coalesce(public.profiles.default_role, excluded.default_role),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_auth_user_profile_upsert();


-- ============================================================
-- SECTION 3. Supabase Realtime publication 등록
-- ============================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'academy_invitations'
     ) then
    alter publication supabase_realtime add table public.academy_invitations;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'academy_staff_work_rules'
     ) then
    alter publication supabase_realtime add table public.academy_staff_work_rules;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'academy_staff_work_exceptions'
     ) then
    alter publication supabase_realtime add table public.academy_staff_work_exceptions;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'academy_members'
     ) then
    alter publication supabase_realtime add table public.academy_members;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'academy_staff_profiles'
     ) then
    alter publication supabase_realtime add table public.academy_staff_profiles;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'profiles'
     ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;


-- ============================================================
-- End of 016_profiles_signup_trigger_and_realtime.sql
-- ============================================================
