-- ============================================================
-- 006_staff_operations.sql
-- Academy Manager — 강사 운영 (근무표, 권한/범위, 대체 강사)
--
-- Phase 30 에서 도입한 학원 운영 기능을 지원하기 위한 스키마.
--
-- 전제:
--   - 001_workspace_schema.sql ~ 005_accept_invitation_rpc.sql 모두 적용됨
--   - academies / academy_members / profiles 존재
--   - class_sessions 테이블 (002) 존재
--   - academy_staff_profiles 테이블 (Phase 20) 존재
--
-- 이 파일이 만드는 것:
--   1. academy_staff_shifts 테이블 + index + updated_at + RLS + GRANT
--   2. academy_staff_profiles.permissions / scope (jsonb) 칼럼 추가
--   3. class_sessions.substitute_teacher_user_id / substitute_reason 칼럼 추가
--
-- idempotent:
--   - alter table 은 'add column if not exists'
--   - create table 은 'create table if not exists'
--   - policy 는 'drop policy if exists' 후 'create policy'
--
-- destructive 명령 (drop table / delete / truncate) 없음.
-- 프론트는 anon key 만 사용. service_role 키는 사용하지 않는다.
-- ============================================================


-- ============================================================
-- SECTION 1. academy_staff_shifts (근무표 / 타임카드)
--
-- 한 행 = 한 명의 강사·보조강사의 하루(또는 한 슬롯) 근무 기록.
--
-- 시간 모델:
--   - scheduled_start_time / scheduled_end_time: 원장이 미리 짠 일정 (TIME)
--   - actual_start_time   / actual_end_time   : 실제 출/퇴근 (TIME)
--   - break_minutes                           : 휴게 시간 (정수, 분)
--
-- 급여 계산 (Phase 30 spec):
--   시급 계산은 우선순위 — actual 우선, 없으면 scheduled (status='completed' 때만)
--   토대 hours = (end - start) / 60 - break_minutes / 60
-- ============================================================

create table if not exists public.academy_staff_shifts (
  id                     uuid primary key default gen_random_uuid(),
  academy_id             uuid not null references public.academies(id) on delete cascade,
  staff_user_id          uuid not null references auth.users(id) on delete cascade,
  staff_role             text not null check (staff_role in ('teacher','assistant')),
  -- academy_staff_profiles 의 (academy_id, user_id) 가 PK 이지만 별도 ref 키는 없으므로
  -- staff_user_id + academy_id 조합으로 join 한다. nullable id 칼럼은 생략.
  date                   date not null,
  scheduled_start_time   time,
  scheduled_end_time     time,
  actual_start_time      time,
  actual_end_time        time,
  break_minutes          integer not null default 0,
  status                 text not null default 'scheduled'
                         check (status in ('scheduled','completed','canceled')),
  memo                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);


-- ============================================================
-- SECTION 2. indexes
-- ============================================================

create index if not exists academy_staff_shifts_academy_id_date_idx
  on public.academy_staff_shifts(academy_id, date);

create index if not exists academy_staff_shifts_staff_user_id_idx
  on public.academy_staff_shifts(staff_user_id);

create index if not exists academy_staff_shifts_status_idx
  on public.academy_staff_shifts(status);


-- ============================================================
-- SECTION 3. updated_at trigger
-- ============================================================

drop trigger if exists set_academy_staff_shifts_updated_at on public.academy_staff_shifts;
create trigger set_academy_staff_shifts_updated_at
before update on public.academy_staff_shifts
for each row execute function public.set_updated_at();


-- ============================================================
-- SECTION 4. RLS enable
-- ============================================================

alter table public.academy_staff_shifts enable row level security;


-- ============================================================
-- SECTION 5. academy_staff_shifts RLS policies
--
-- 정책 요약:
--   - select : 학원 owner 또는 본인(staff_user_id = auth.uid())
--   - insert : 학원 owner 만 (원장이 일정 배정)
--   - update : 학원 owner 전체 가능 + 본인은 actual_start_time/actual_end_time/
--              break_minutes/status 만 갱신 가능. (간소화를 위해 update 정책은
--              column 제한 없이 owner 또는 본인 모두 허용, 운영상 정책 필요시 향후
--              policy 분리)
--   - delete : owner 만
-- ============================================================

drop policy if exists "academy_staff_shifts select owner or self" on public.academy_staff_shifts;
create policy "academy_staff_shifts select owner or self"
on public.academy_staff_shifts
for select
using (
  public.is_owner_of_academy(academy_id)
  or staff_user_id = auth.uid()
);

drop policy if exists "academy_staff_shifts insert by owner" on public.academy_staff_shifts;
create policy "academy_staff_shifts insert by owner"
on public.academy_staff_shifts
for insert
with check (public.is_owner_of_academy(academy_id));

drop policy if exists "academy_staff_shifts update by owner or self" on public.academy_staff_shifts;
create policy "academy_staff_shifts update by owner or self"
on public.academy_staff_shifts
for update
using (
  public.is_owner_of_academy(academy_id)
  or staff_user_id = auth.uid()
)
with check (
  public.is_owner_of_academy(academy_id)
  or staff_user_id = auth.uid()
);

drop policy if exists "academy_staff_shifts delete by owner" on public.academy_staff_shifts;
create policy "academy_staff_shifts delete by owner"
on public.academy_staff_shifts
for delete
using (public.is_owner_of_academy(academy_id));


-- ============================================================
-- SECTION 6. GRANT
-- ============================================================

grant select, insert, update, delete on public.academy_staff_shifts to authenticated;


-- ============================================================
-- SECTION 7. academy_staff_profiles 확장 — 권한 / 범위
--
-- permissions (jsonb): UI gating 용 토글
--   {
--     canViewStudents:        true,
--     canEditLessonRecords:   true,
--     canEditAttendance:      true,
--     canEditClinicRecords:   false,   // 보조강사 default true
--     canViewPayroll:         true,
--     canViewPayments:        false,
--     canManageClasses:       false,
--   }
--
-- scope (jsonb): 강사·보조강사가 다룰 수 있는 대상 제한
--   {
--     subjectIds:     [...],
--     classGroupIds:  [...],
--     studentIds:     [...],
--   }
--
-- 둘 다 default '{}' 로 두고, 빈 값은 "제한 없음 (기본 권한)" 으로 UI 가 해석.
-- RLS 수준 제한은 이번 단계에서 적용하지 않는다 (UI gating 만).
-- ============================================================

alter table public.academy_staff_profiles
  add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.academy_staff_profiles
  add column if not exists scope jsonb not null default '{}'::jsonb;


-- ============================================================
-- SECTION 8. class_sessions 확장 — 대체 강사
--
-- 한 회차의 대체 강사를 지정한다.
--   - substitute_teacher_user_id : auth.users.id (server staff)
--   - substitute_reason          : 사유 (선택)
--
-- 정책상 누가 update 가능한지는 기존 class_sessions update 정책 그대로.
-- 회차의 owner-of-academy 가 update 할 수 있어야 substitute 지정이 가능하다.
-- ============================================================

alter table public.class_sessions
  add column if not exists substitute_teacher_user_id uuid
  references auth.users(id) on delete set null;

alter table public.class_sessions
  add column if not exists substitute_reason text;

create index if not exists class_sessions_substitute_teacher_idx
  on public.class_sessions(substitute_teacher_user_id);


-- ============================================================
-- SECTION 9. (참고) 향후 작업
--
-- - shifts 의 column-level update 정책: 본인이 scheduled_start_time 등을
--   못 바꾸도록 row-level 만이 아닌 column-level 제한 (Postgres 17+ 또는
--   security definer wrapper 함수로 처리).
-- - permissions / scope 를 RLS 에서도 검증 (단계적으로).
-- - 시급 정산 함수 (security definer) 로 한 명의 한 달 시간 합계 계산.
-- ============================================================


-- ============================================================
-- End of 006_staff_operations.sql
-- ============================================================
