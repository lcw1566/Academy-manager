-- ============================================================
-- 011_attendance_settings_and_qr.sql
-- Seenit — 출결·등하원 설정 + 학생 체크인 이벤트 (Phase 41)
--
-- 학원 단위로 "직원 출퇴근 방식" / "학생 등·하원 방식" 같은 정책을 저장하고,
-- QR 체크인이 활성화되면 학생 등·하원 이벤트를 별도 테이블에 누적한다.
--
-- 전제:
--   - 001 ~ 010 모두 적용됨
--   - academies (001), academy_members (001),
--     students / class_sessions / attendance_records (002)
--
-- ⚠ 테이블 이름 정정 (Phase 41 bugfix 2026-05-31):
--   - 학생 도메인 테이블은 public.students 입니다. (002_domain_schema.sql 기준)
--   - 코드/문서에서 "academy students" 라고 부르더라도 실제 테이블은 students.
--
-- 이 파일이 만드는 것:
--   1. academies 컬럼 추가
--        staff_check_method                text  default 'wifi'
--        student_check_method              text  default 'teacher_manual'
--        staff_manual_override_enabled     bool  default true
--        student_manual_override_enabled   bool  default true
--        wifi_name                         text  nullable
--        wifi_hint                         text  nullable
--        attendance_qr_token               text  nullable
--        attendance_qr_token_rotated_at    timestamptz nullable
--        attendance_onboarded_at           timestamptz nullable
--   2. check 제약 (방식 값 화이트리스트)
--   3. attendance_records.source 추가 (jsonb 가 아닌 text) — 'qr' | 'teacher_manual' | null
--   4. attendance_records.checked_at 추가 (timestamptz nullable)
--   5. student_check_events 테이블 신규 생성 (RLS = owner 또는 학원 멤버)
--
-- idempotent:
--   - alter table  : add column if not exists
--   - create table : if not exists
--   - create policy: drop policy if exists 후 create
--   - check 제약   : pg_constraint 조회 후 add
--
-- destructive 명령 없음 (drop table / delete / truncate 없음).
-- ============================================================


-- ============================================================
-- SECTION 1. academies — 출결 방식 설정 컬럼
-- ============================================================

alter table public.academies
  add column if not exists staff_check_method text not null default 'wifi';

alter table public.academies
  add column if not exists student_check_method text not null default 'teacher_manual';

alter table public.academies
  add column if not exists staff_manual_override_enabled boolean not null default true;

alter table public.academies
  add column if not exists student_manual_override_enabled boolean not null default true;

alter table public.academies
  add column if not exists wifi_name text;

alter table public.academies
  add column if not exists wifi_hint text;

alter table public.academies
  add column if not exists attendance_qr_token text;

alter table public.academies
  add column if not exists attendance_qr_token_rotated_at timestamptz;

-- onboarding 완료 시각. null 이면 owner 가 아직 출결 설정을 선택하지 않은 상태.
alter table public.academies
  add column if not exists attendance_onboarded_at timestamptz;


-- ============================================================
-- SECTION 2. 방식 값 화이트리스트
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'academies_staff_check_method_chk'
  ) then
    alter table public.academies
      add constraint academies_staff_check_method_chk
      check (staff_check_method in ('wifi','qr'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'academies_student_check_method_chk'
  ) then
    alter table public.academies
      add constraint academies_student_check_method_chk
      check (student_check_method in ('teacher_manual','qr','disabled'));
  end if;
end$$;


-- ============================================================
-- SECTION 3. attendance_records — source / checked_at
-- ============================================================
-- 기존 attendance_records 는 (session_id, student_id) 기준으로 status 만 다룬다.
-- QR 체크인이 도입되면 출처(source) 와 체크 시각(checked_at) 이 필요하다.
-- source 는 nullable text — 기존 row 의 의미를 바꾸지 않는다 ("null = legacy/teacher_manual" 로 해석).

alter table public.attendance_records
  add column if not exists source text;

alter table public.attendance_records
  add column if not exists checked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_records_source_chk'
  ) then
    alter table public.attendance_records
      add constraint attendance_records_source_chk
      check (source is null or source in ('qr','teacher_manual'));
  end if;
end$$;


-- ============================================================
-- SECTION 4. student_check_events 테이블 신규 생성
-- ============================================================
-- 학원 학생의 등·하원(체크인/체크아웃) 이벤트. 수업 단위 attendance_records 와
-- 별도로 학원 머무는 시간 자체를 추적하기 위해 분리. QR 모드일 때만 자동 생성.
--
-- 사용 예:
--   - 학생이 QR 스캔 → check_in 이벤트
--   - 학생 하원 시 다시 스캔 → check_out 이벤트
--   - 수업 출결 (attendance_records) 은 이 이벤트를 default present 의 근거로 사용
--     (단, 선생님이 항상 manual override 가능).

create table if not exists public.student_check_events (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  event_type   text not null,
  source       text not null default 'qr',
  event_time   timestamptz not null default now(),
  session_id   uuid references public.class_sessions(id) on delete set null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'student_check_events_event_type_chk'
  ) then
    alter table public.student_check_events
      add constraint student_check_events_event_type_chk
      check (event_type in ('check_in','check_out'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_check_events_source_chk'
  ) then
    alter table public.student_check_events
      add constraint student_check_events_source_chk
      check (source in ('qr','teacher_manual'));
  end if;
end$$;


-- ============================================================
-- SECTION 5. indexes
-- ============================================================

create index if not exists student_check_events_academy_id_event_time_idx
  on public.student_check_events(academy_id, event_time desc);

create index if not exists student_check_events_student_id_idx
  on public.student_check_events(student_id);

create index if not exists student_check_events_session_id_idx
  on public.student_check_events(session_id);


-- ============================================================
-- SECTION 6. RLS — student_check_events
-- ============================================================
-- 정책:
--   - select : 학원 owner 또는 학원 active 멤버 (teacher/assistant 가 본인 수업
--              학생의 체크인 상태를 확인 가능)
--   - insert : 학원 owner 또는 학원 active 멤버 (QR 스캔 직원, 또는 owner)
--   - update : 학원 owner 만 (정정 케이스)
--   - delete : 학원 owner 만

alter table public.student_check_events enable row level security;

drop policy if exists "student_check_events select members" on public.student_check_events;
create policy "student_check_events select members"
on public.student_check_events
for select
using (
  public.is_owner_of_academy(academy_id)
  or public.is_member_of_academy(academy_id)
);

drop policy if exists "student_check_events insert members" on public.student_check_events;
create policy "student_check_events insert members"
on public.student_check_events
for insert
with check (
  public.is_owner_of_academy(academy_id)
  or public.is_member_of_academy(academy_id)
);

drop policy if exists "student_check_events update owner" on public.student_check_events;
create policy "student_check_events update owner"
on public.student_check_events
for update
using (public.is_owner_of_academy(academy_id))
with check (public.is_owner_of_academy(academy_id));

drop policy if exists "student_check_events delete owner" on public.student_check_events;
create policy "student_check_events delete owner"
on public.student_check_events
for delete
using (public.is_owner_of_academy(academy_id));


-- ============================================================
-- SECTION 7. GRANT
-- ============================================================

grant select, insert, update, delete on public.student_check_events to authenticated;


-- ============================================================
-- 끝.
-- 사용 예:
--   -- 출결 설정 업데이트 (owner)
--   update public.academies
--      set staff_check_method = 'qr',
--          student_check_method = 'qr',
--          attendance_qr_token = encode(gen_random_bytes(16), 'hex'),
--          attendance_qr_token_rotated_at = now(),
--          attendance_onboarded_at = coalesce(attendance_onboarded_at, now())
--      where id = '...';
--
--   -- 학생 등원 이벤트
--   insert into public.student_check_events
--          (academy_id, student_id, event_type, source, created_by)
--   values ('...', '...', 'check_in', 'qr', auth.uid());
-- ============================================================
