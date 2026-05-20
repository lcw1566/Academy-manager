-- ============================================================
-- 003_account_type_and_invitations.sql
-- Academy Manager — 계정 유형(account_type) + 학원 초대(academy_invitations)
--
-- 전제:
--   - 001_workspace_schema.sql 이 먼저 실행되어 있어야 한다.
--     (profiles / academies / academy_members / set_updated_at /
--      is_owner_of_academy / is_member_of_academy 존재)
--
-- 이 파일이 만드는 것:
--   1. profiles.account_type 컬럼 추가
--   2. academy_invitations 테이블 + index + updated_at trigger
--   3. academy_invitations RLS + GRANT
--
-- idempotent:
--   - alter table 은 'add column if not exists'
--   - create table 은 'create table if not exists'
--   - policy 는 'drop policy if exists' 후 'create policy'
--   - check constraint 는 add 시 'do $$ ... if not exists ... end $$' 패턴으로 처리
--
-- destructive 명령 (drop table / delete / truncate) 없음.
-- 프론트는 anon key 만 사용. service_role 키는 사용하지 않는다.
-- ============================================================


-- ============================================================
-- SECTION 1. profiles.account_type 컬럼 추가
--
-- 회원가입 직후 사용자가 선택한 큰 분류:
--   - 'tutor'  : 개인 과외 선생님 (개인 워크스페이스)
--   - 'owner'  : 학원 원장
--   - 'staff'  : 강사/보조강사 (academy_members 에서 teacher/assistant 로 결정)
--
-- 기존 default_role 컬럼은 그대로 유지한다 (앱 호환).
-- account_type 은 UX 분기용, 실제 학원 권한은 academy_members.role 이 결정.
-- ============================================================

alter table public.profiles
  add column if not exists account_type text default 'tutor';

-- check 제약 추가는 idempotent 패턴으로
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
-- SECTION 2. academy_invitations 테이블
--
-- 원장이 강사/보조강사를 학원에 초대할 때 사용하는 pending row.
--
-- 라이프사이클:
--   created(pending) → accepted (강사/보조강사가 본인 로그인 후 수락)
--                    → canceled (원장이 취소)
--
-- email 은 lowercase trim 한 값을 저장. unique 는 (academy_id, email, role) 단위.
-- ============================================================

create table if not exists public.academy_invitations (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete cascade,
  email             text not null,
  role              text not null
                    check (role in ('teacher', 'assistant')),
  status            text not null default 'pending'
                    check (status in ('pending', 'accepted', 'canceled')),
  invited_by        uuid references auth.users(id) on delete set null,
  accepted_user_id  uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (academy_id, email, role)
);


-- ============================================================
-- SECTION 3. indexes
-- ============================================================

create index if not exists academy_invitations_academy_id_idx
  on public.academy_invitations(academy_id);

create index if not exists academy_invitations_email_idx
  on public.academy_invitations(email);

create index if not exists academy_invitations_status_idx
  on public.academy_invitations(status);


-- ============================================================
-- SECTION 4. updated_at trigger
-- ============================================================

drop trigger if exists set_academy_invitations_updated_at on public.academy_invitations;
create trigger set_academy_invitations_updated_at
before update on public.academy_invitations
for each row execute function public.set_updated_at();


-- ============================================================
-- SECTION 5. RLS enable
-- ============================================================

alter table public.academy_invitations enable row level security;


-- ============================================================
-- SECTION 6. academy_invitations RLS policies
--
-- 정책 요약:
--   - select:
--       a) 해당 academy 의 owner
--       b) 본인 이메일과 일치하는 초대 (수락 전/후 모두 본인 기록 확인 가능)
--   - insert:
--       해당 academy 의 owner 만 (invited_by = auth.uid())
--   - update:
--       a) 해당 academy 의 owner (status 변경, 예: cancel)
--       b) 본인 이메일과 일치하는 pending 초대를 accepted 로 변경 가능
--   - delete:
--       정책 없음 → 차단. 취소는 status='canceled' update 로 처리.
--
-- auth.email() 은 supabase 가 jwt 에서 email 을 꺼내주는 helper 다.
-- email 비교는 lowercase 로 통일 (앱에서 email 도 lowercase 로 저장).
-- ============================================================

drop policy if exists "academy_invitations select owner or invitee" on public.academy_invitations;
create policy "academy_invitations select owner or invitee"
on public.academy_invitations
for select
using (
  public.is_owner_of_academy(academy_id)
  or lower(email) = lower(coalesce(auth.email(), ''))
);

drop policy if exists "academy_invitations insert by owner" on public.academy_invitations;
create policy "academy_invitations insert by owner"
on public.academy_invitations
for insert
with check (
  public.is_owner_of_academy(academy_id)
  and invited_by = auth.uid()
);

drop policy if exists "academy_invitations update by owner or invitee" on public.academy_invitations;
create policy "academy_invitations update by owner or invitee"
on public.academy_invitations
for update
using (
  public.is_owner_of_academy(academy_id)
  or lower(email) = lower(coalesce(auth.email(), ''))
)
with check (
  public.is_owner_of_academy(academy_id)
  or lower(email) = lower(coalesce(auth.email(), ''))
);


-- ============================================================
-- SECTION 7. GRANT
--
-- RLS 가 row 단위로 잘라내므로 GRANT 는 넓게 부여한다.
-- delete 는 일부러 부여하지 않는다 (정책도 없음).
-- ============================================================

grant select, insert, update on public.academy_invitations to authenticated;


-- ============================================================
-- SECTION 8. (참고) findProfileByEmail 보조 정책
--
-- 원장이 강사/보조강사 이메일을 검색할 때 profiles 의 email 컬럼을
-- 조회할 수 있어야 한다. 그러나 001 의 "profiles select own" 정책은
-- 본인 row 만 허용하므로, 검색 결과가 0건으로만 나온다.
--
-- 보안과 단순성을 위해 이 단계에서는 **별도 검색 정책을 만들지 않는다**:
--   - findProfileByEmail 은 결과가 0건일 수도 있음을 가정한다 (RLS 차단)
--   - 미가입 / 검색 실패 모두 동일한 UX 흐름 (초대 row 생성) 으로 처리
--   - 즉 "가입 여부 확인" 은 best-effort 이며, 실제 가입 확인은 invitation
--     수락 단계에서 일어난다.
--
-- 향후 안전한 lookup 함수 (security definer 로 email 매핑 카운트만 노출) 를
-- 추가하면 검색 UX 를 더 정교하게 만들 수 있다. 이번 단계의 범위는 아니다.
-- ============================================================


-- ============================================================
-- End of 003_account_type_and_invitations.sql
-- ============================================================
