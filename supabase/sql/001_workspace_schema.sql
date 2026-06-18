-- ============================================================
-- 001_workspace_schema.sql
-- Seenit — workspace 기본 스키마
--   profiles / academies / academy_members
--
-- 실행 순서 (참조 의존성을 따라 안전하게 정렬):
--   1. profiles / academies / academy_members 테이블
--   2. indexes / unique constraints
--   3. updated_at trigger function
--   4. updated_at triggers
--   5. security definer helper functions
--      ── 이 시점에 academies / academy_members 가 반드시 존재해야 한다.
--         'language sql' 함수는 create 시점에 본문이 검증되므로
--         테이블이 먼저 없으면 'relation does not exist' 오류가 난다.
--   6. RLS enable
--   7. RLS policies
--
-- idempotent: 여러 번 실행해도 안전.
-- destructive 명령 (drop table / delete / truncate) 없음.
-- Supabase SQL Editor 에 통째로 복사 → Run.
-- ============================================================


-- ============================================================
-- SECTION 1. profiles
-- auth.users 와 1:1로 매핑되는 사용자 프로필
-- ============================================================

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  default_role  text default 'tutor'
                check (default_role in ('tutor', 'owner', 'teacher', 'assistant')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- ============================================================
-- SECTION 2. academies
-- 학원 워크스페이스 본체
-- ============================================================

create table if not exists public.academies (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  owner_id              uuid references auth.users(id) on delete cascade,
  academy_type          text default 'core_subjects',
  academy_subjects      jsonb not null default '["korean", "english", "math"]'::jsonb,
  clinic_required       boolean not null default true,
  academy_onboarded_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);


-- ============================================================
-- SECTION 3. academy_members
-- 사용자 ↔ 학원 ↔ 역할 매핑
-- ============================================================

create table if not exists public.academy_members (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null
              check (role in ('owner', 'teacher', 'assistant')),
  status      text not null default 'active'
              check (status in ('active', 'invited', 'inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (academy_id, user_id)
);


-- ============================================================
-- SECTION 4. Indexes
-- ============================================================

create index if not exists profiles_id_idx
  on public.profiles(id);

create index if not exists academies_owner_id_idx
  on public.academies(owner_id);

create index if not exists academy_members_academy_id_idx
  on public.academy_members(academy_id);

create index if not exists academy_members_user_id_idx
  on public.academy_members(user_id);

create index if not exists academy_members_role_idx
  on public.academy_members(role);


-- ============================================================
-- SECTION 5. updated_at trigger function
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================
-- SECTION 6. updated_at triggers
-- ============================================================

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_academies_updated_at on public.academies;
create trigger set_academies_updated_at
before update on public.academies
for each row execute function public.set_updated_at();

drop trigger if exists set_academy_members_updated_at on public.academy_members;
create trigger set_academy_members_updated_at
before update on public.academy_members
for each row execute function public.set_updated_at();


-- ============================================================
-- SECTION 7. Security definer helper functions
--
-- academies ↔ academy_members 정책이 서로를 참조할 때 RLS recursion 이
-- 발생할 수 있으므로 security definer 헬퍼로 끊는다.
--
-- ⚠ 이 두 함수는 'language sql' 이라 create 시점에 본문이 검증된다.
--   반드시 SECTION 2 / 3 (테이블 생성) 이후에 실행되어야 한다.
-- ============================================================

create or replace function public.is_owner_of_academy(p_academy_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.academies
    where id = p_academy_id
      and owner_id = auth.uid()
  );
$$;

create or replace function public.is_member_of_academy(p_academy_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.academy_members
    where academy_id = p_academy_id
      and user_id    = auth.uid()
      and status     = 'active'
  );
$$;


-- ============================================================
-- SECTION 8. Row Level Security enable
-- ============================================================

alter table public.profiles         enable row level security;
alter table public.academies        enable row level security;
alter table public.academy_members  enable row level security;


-- ============================================================
-- SECTION 9. profiles RLS policies
-- "본인 프로필만" 접근 가능
-- ============================================================

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);


-- ============================================================
-- SECTION 10. academies RLS policies
-- - select: owner 본인 OR 해당 academy 의 active 멤버
-- - insert: owner_id 가 본인일 때만
-- - update: owner 본인만
-- - delete: 별도 안전 절차로 추후 구현 (정책 없음 → 차단)
-- ============================================================

drop policy if exists "academies select owner or member" on public.academies;
create policy "academies select owner or member"
on public.academies
for select
using (
  owner_id = auth.uid()
  or public.is_member_of_academy(id)
);

drop policy if exists "academies insert as owner" on public.academies;
create policy "academies insert as owner"
on public.academies
for insert
with check (owner_id = auth.uid());

drop policy if exists "academies update by owner" on public.academies;
create policy "academies update by owner"
on public.academies
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());


-- ============================================================
-- SECTION 11. academy_members RLS policies
-- - select: 본인 row OR 해당 academy 의 owner
-- - insert/update/delete: 해당 academy 의 owner
-- ============================================================

drop policy if exists "academy_members select self or owner" on public.academy_members;
create policy "academy_members select self or owner"
on public.academy_members
for select
using (
  user_id = auth.uid()
  or public.is_owner_of_academy(academy_id)
);

drop policy if exists "academy_members insert by owner" on public.academy_members;
create policy "academy_members insert by owner"
on public.academy_members
for insert
with check (
  public.is_owner_of_academy(academy_id)
);

drop policy if exists "academy_members update by owner" on public.academy_members;
create policy "academy_members update by owner"
on public.academy_members
for update
using (public.is_owner_of_academy(academy_id))
with check (public.is_owner_of_academy(academy_id));

drop policy if exists "academy_members delete by owner" on public.academy_members;
create policy "academy_members delete by owner"
on public.academy_members
for delete
using (public.is_owner_of_academy(academy_id));


-- ============================================================
-- End of 001_workspace_schema.sql
-- ============================================================
