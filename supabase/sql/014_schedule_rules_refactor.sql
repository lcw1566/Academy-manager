-- ============================================================
-- 014_schedule_rules_refactor.sql
-- Academy Manager — 룰 기반 스케줄 모델 도입 (Phase 44.5 / Phase A)
--
-- 배경:
--   파일럿 사용 중 발견된 "미래 row 대량 사전 생성" 문제 해결을 위해
--   룰/예외/실제로그를 분리한 새 데이터 모델을 도입한다. 이 파일은 Phase A —
--   "테이블/RLS 만 추가, 기존 동작 변경 없음" 단계.
--
-- 핵심 원칙:
--   - additive only — 기존 테이블/컬럼/RLS 전혀 손대지 않음.
--   - 모든 명령 멱등 (`if not exists`, `drop policy if exists` → `create`).
--   - destructive 명령 없음 (drop table/column/delete 없음).
--   - Phase B 에서 ClassGroupFormModal / ShiftFormModal 이 룰을 함께 저장 시작.
--   - Phase C 에서 실제 출근 로그 / 급여가 staff_attendance_logs 기반으로 전환.
--
-- 추가 테이블:
--   1. academy_staff_work_rules       — 반복 근무 규칙 (주간 패턴)
--   2. academy_staff_work_exceptions  — 일회성 변경 (추가/취소/변경)
--   3. staff_attendance_logs          — 실제 출근 로그 (Phase A 미사용, 정의만)
--   4. class_schedule_rules           — 반복 수업 규칙 (주간 패턴)
--   5. class_session_exceptions       — 수업 회차 일회성 변경
--
-- RLS 정책:
--   - select : 학원 owner 또는 active 멤버
--   - insert/update/delete : 학원 owner 만
--   (Phase B/C 에서 teacher self-update 등이 필요하면 정책 확장 예정)
-- ============================================================


-- ============================================================
-- SECTION 1. academy_staff_work_rules
-- ============================================================
-- 한 직원의 정기 주간 근무 패턴 한 줄.
-- 예: '월요일 09:00~18:00 휴게 60분', '수요일 13:00~21:00' (각각 별도 row).

create table if not exists public.academy_staff_work_rules (
  id                     uuid primary key default gen_random_uuid(),
  academy_id             uuid not null references public.academies(id) on delete cascade,
  staff_user_id          uuid not null references auth.users(id) on delete cascade,
  staff_role             text not null,
  day_of_week            smallint not null, -- 0=Sun, 1=Mon, ..., 6=Sat
  start_time             text not null,     -- 'HH:mm'
  end_time               text not null,     -- 'HH:mm'
  break_minutes          integer not null default 0,
  effective_start_date   date not null,
  effective_end_date     date,
  is_active              boolean not null default true,
  memo                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'academy_staff_work_rules_role_chk') then
    alter table public.academy_staff_work_rules
      add constraint academy_staff_work_rules_role_chk
      check (staff_role in ('teacher','assistant'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'academy_staff_work_rules_dow_chk') then
    alter table public.academy_staff_work_rules
      add constraint academy_staff_work_rules_dow_chk
      check (day_of_week between 0 and 6);
  end if;
end$$;

create index if not exists academy_staff_work_rules_academy_idx
  on public.academy_staff_work_rules(academy_id);
create index if not exists academy_staff_work_rules_user_idx
  on public.academy_staff_work_rules(staff_user_id);


-- ============================================================
-- SECTION 2. academy_staff_work_exceptions
-- ============================================================
-- 정기 패턴 위에 덮어쓰는 일회성 변경.
--   - type='extra'  : 그 날 추가 근무 (start_time/end_time 필수)
--   - type='cancel' : 그 날 정기 근무 취소 (시간 무시)
--   - type='change' : 그 날 시간/휴게만 변경 (start_time/end_time 필수)

create table if not exists public.academy_staff_work_exceptions (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references public.academies(id) on delete cascade,
  staff_user_id   uuid not null references auth.users(id) on delete cascade,
  date            date not null,
  type            text not null,
  start_time      text,
  end_time        text,
  break_minutes   integer,
  memo            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'academy_staff_work_exceptions_type_chk') then
    alter table public.academy_staff_work_exceptions
      add constraint academy_staff_work_exceptions_type_chk
      check (type in ('extra','cancel','change'));
  end if;
end$$;

create index if not exists academy_staff_work_exceptions_academy_date_idx
  on public.academy_staff_work_exceptions(academy_id, date);
create index if not exists academy_staff_work_exceptions_user_date_idx
  on public.academy_staff_work_exceptions(staff_user_id, date);


-- ============================================================
-- SECTION 3. staff_attendance_logs (Phase C 본격 사용 예정)
-- ============================================================
-- "실제 일어난" 출근 로그. Phase A 에서는 정의만, 어떤 코드도 INSERT 하지 않음.
-- Phase C 에서 academy_staff_shifts 의 actual_* 시간을 옮겨오거나,
-- QR 체크인이 직접 이 테이블에 row 를 생성하도록 전환 예정.
--
-- status:
--   pending  - QR/수동으로 체크인은 됐으나 owner 미승인
--   completed - 정상 완료
--   approved - owner 가 명시적 승인 (급여 계산 대상)
--   rejected - owner 가 거부 (급여 미반영)

create table if not exists public.staff_attendance_logs (
  id                    uuid primary key default gen_random_uuid(),
  academy_id            uuid not null references public.academies(id) on delete cascade,
  staff_user_id         uuid not null references auth.users(id) on delete cascade,
  staff_role            text not null,
  work_date             date not null,
  scheduled_start_time  text,
  scheduled_end_time    text,
  actual_start_time     text,
  actual_end_time       text,
  break_minutes         integer default 0,
  status                text not null default 'pending',
  source                text,
  approved_by           uuid references auth.users(id) on delete set null,
  approved_at           timestamptz,
  memo                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_attendance_logs_role_chk') then
    alter table public.staff_attendance_logs
      add constraint staff_attendance_logs_role_chk
      check (staff_role in ('teacher','assistant'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_attendance_logs_status_chk') then
    alter table public.staff_attendance_logs
      add constraint staff_attendance_logs_status_chk
      check (status in ('pending','completed','approved','rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_attendance_logs_source_chk') then
    alter table public.staff_attendance_logs
      add constraint staff_attendance_logs_source_chk
      check (source is null or source in ('qr','manual'));
  end if;
end$$;

create index if not exists staff_attendance_logs_academy_date_idx
  on public.staff_attendance_logs(academy_id, work_date desc);
create index if not exists staff_attendance_logs_user_date_idx
  on public.staff_attendance_logs(staff_user_id, work_date desc);


-- ============================================================
-- SECTION 4. class_schedule_rules
-- ============================================================
-- 반(class_group) 의 정기 주간 수업 패턴.

create table if not exists public.class_schedule_rules (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete cascade,
  class_group_id    uuid not null references public.class_groups(id) on delete cascade,
  day_of_week       smallint not null,
  start_time        text not null,
  end_time          text not null,
  teacher_user_id   uuid references auth.users(id) on delete set null,
  assistant_ids     jsonb not null default '[]'::jsonb,
  room              text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'class_schedule_rules_dow_chk') then
    alter table public.class_schedule_rules
      add constraint class_schedule_rules_dow_chk
      check (day_of_week between 0 and 6);
  end if;
end$$;

create index if not exists class_schedule_rules_academy_idx
  on public.class_schedule_rules(academy_id);
create index if not exists class_schedule_rules_group_idx
  on public.class_schedule_rules(class_group_id);


-- ============================================================
-- SECTION 5. class_session_exceptions
-- ============================================================
-- 특정 날짜의 수업 회차 일회성 변경.
--   - cancel       : 그 날 휴강
--   - reschedule   : 시간 변경
--   - substitute   : 대체 강사 (기존 substitute_teacher_user_id 와 별도로 룰 위에 적용)
--   - extra        : 정기 외 추가 수업

create table if not exists public.class_session_exceptions (
  id                          uuid primary key default gen_random_uuid(),
  academy_id                  uuid not null references public.academies(id) on delete cascade,
  class_group_id              uuid not null references public.class_groups(id) on delete cascade,
  session_date                date not null,
  type                        text not null,
  start_time                  text,
  end_time                    text,
  teacher_user_id             uuid references auth.users(id) on delete set null,
  assistant_ids               jsonb,
  substitute_teacher_user_id  uuid references auth.users(id) on delete set null,
  reason                      text,
  memo                        text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'class_session_exceptions_type_chk') then
    alter table public.class_session_exceptions
      add constraint class_session_exceptions_type_chk
      check (type in ('cancel','reschedule','substitute','extra'));
  end if;
end$$;

create index if not exists class_session_exceptions_academy_date_idx
  on public.class_session_exceptions(academy_id, session_date);
create index if not exists class_session_exceptions_group_date_idx
  on public.class_session_exceptions(class_group_id, session_date);


-- ============================================================
-- SECTION 6. RLS — 모든 신규 테이블 일괄 적용
-- ============================================================
-- 정책 패턴 (모든 테이블 동일):
--   select : owner OR active member
--   insert : owner only       (Phase B/C 에서 teacher/assistant self-insert 필요 시 확장)
--   update : owner only
--   delete : owner only

alter table public.academy_staff_work_rules      enable row level security;
alter table public.academy_staff_work_exceptions enable row level security;
alter table public.staff_attendance_logs         enable row level security;
alter table public.class_schedule_rules          enable row level security;
alter table public.class_session_exceptions      enable row level security;

-- academy_staff_work_rules ----------------------------------------------------
drop policy if exists "asw_rules select members" on public.academy_staff_work_rules;
create policy "asw_rules select members" on public.academy_staff_work_rules
  for select using (
    public.is_owner_of_academy(academy_id)
    or public.is_member_of_academy(academy_id)
  );
drop policy if exists "asw_rules insert owner" on public.academy_staff_work_rules;
create policy "asw_rules insert owner" on public.academy_staff_work_rules
  for insert with check (public.is_owner_of_academy(academy_id));
drop policy if exists "asw_rules update owner" on public.academy_staff_work_rules;
create policy "asw_rules update owner" on public.academy_staff_work_rules
  for update using (public.is_owner_of_academy(academy_id))
              with check (public.is_owner_of_academy(academy_id));
drop policy if exists "asw_rules delete owner" on public.academy_staff_work_rules;
create policy "asw_rules delete owner" on public.academy_staff_work_rules
  for delete using (public.is_owner_of_academy(academy_id));

-- academy_staff_work_exceptions ----------------------------------------------
drop policy if exists "asw_exc select members" on public.academy_staff_work_exceptions;
create policy "asw_exc select members" on public.academy_staff_work_exceptions
  for select using (
    public.is_owner_of_academy(academy_id)
    or public.is_member_of_academy(academy_id)
  );
drop policy if exists "asw_exc insert owner" on public.academy_staff_work_exceptions;
create policy "asw_exc insert owner" on public.academy_staff_work_exceptions
  for insert with check (public.is_owner_of_academy(academy_id));
drop policy if exists "asw_exc update owner" on public.academy_staff_work_exceptions;
create policy "asw_exc update owner" on public.academy_staff_work_exceptions
  for update using (public.is_owner_of_academy(academy_id))
              with check (public.is_owner_of_academy(academy_id));
drop policy if exists "asw_exc delete owner" on public.academy_staff_work_exceptions;
create policy "asw_exc delete owner" on public.academy_staff_work_exceptions
  for delete using (public.is_owner_of_academy(academy_id));

-- staff_attendance_logs ------------------------------------------------------
-- 본인 select 도 필요할 수 있으나, Phase A 단계에서는 보수적으로 owner+member.
drop policy if exists "saLog select members" on public.staff_attendance_logs;
create policy "saLog select members" on public.staff_attendance_logs
  for select using (
    public.is_owner_of_academy(academy_id)
    or public.is_member_of_academy(academy_id)
  );
drop policy if exists "saLog insert owner" on public.staff_attendance_logs;
create policy "saLog insert owner" on public.staff_attendance_logs
  for insert with check (public.is_owner_of_academy(academy_id));
drop policy if exists "saLog update owner" on public.staff_attendance_logs;
create policy "saLog update owner" on public.staff_attendance_logs
  for update using (public.is_owner_of_academy(academy_id))
              with check (public.is_owner_of_academy(academy_id));
drop policy if exists "saLog delete owner" on public.staff_attendance_logs;
create policy "saLog delete owner" on public.staff_attendance_logs
  for delete using (public.is_owner_of_academy(academy_id));

-- class_schedule_rules -------------------------------------------------------
drop policy if exists "csr select members" on public.class_schedule_rules;
create policy "csr select members" on public.class_schedule_rules
  for select using (
    public.is_owner_of_academy(academy_id)
    or public.is_member_of_academy(academy_id)
  );
drop policy if exists "csr insert owner" on public.class_schedule_rules;
create policy "csr insert owner" on public.class_schedule_rules
  for insert with check (public.is_owner_of_academy(academy_id));
drop policy if exists "csr update owner" on public.class_schedule_rules;
create policy "csr update owner" on public.class_schedule_rules
  for update using (public.is_owner_of_academy(academy_id))
              with check (public.is_owner_of_academy(academy_id));
drop policy if exists "csr delete owner" on public.class_schedule_rules;
create policy "csr delete owner" on public.class_schedule_rules
  for delete using (public.is_owner_of_academy(academy_id));

-- class_session_exceptions ---------------------------------------------------
drop policy if exists "cse select members" on public.class_session_exceptions;
create policy "cse select members" on public.class_session_exceptions
  for select using (
    public.is_owner_of_academy(academy_id)
    or public.is_member_of_academy(academy_id)
  );
drop policy if exists "cse insert owner" on public.class_session_exceptions;
create policy "cse insert owner" on public.class_session_exceptions
  for insert with check (public.is_owner_of_academy(academy_id));
drop policy if exists "cse update owner" on public.class_session_exceptions;
create policy "cse update owner" on public.class_session_exceptions
  for update using (public.is_owner_of_academy(academy_id))
              with check (public.is_owner_of_academy(academy_id));
drop policy if exists "cse delete owner" on public.class_session_exceptions;
create policy "cse delete owner" on public.class_session_exceptions
  for delete using (public.is_owner_of_academy(academy_id));


-- ============================================================
-- SECTION 7. GRANT
-- ============================================================

grant select, insert, update, delete on public.academy_staff_work_rules      to authenticated;
grant select, insert, update, delete on public.academy_staff_work_exceptions to authenticated;
grant select, insert, update, delete on public.staff_attendance_logs         to authenticated;
grant select, insert, update, delete on public.class_schedule_rules          to authenticated;
grant select, insert, update, delete on public.class_session_exceptions      to authenticated;


-- ============================================================
-- 끝.
--
-- Phase A 적용 후 상태:
--   - 위 5개 테이블이 존재하고 RLS 활성화. 어떤 row 도 자동 생성되지 않음.
--   - 기존 class_sessions / academy_staff_shifts 는 그대로. 동작 변경 없음.
--   - 프런트는 새 API 를 호출하지 않음 (Phase B 까지 대기).
--
-- Phase B 작업 (추후):
--   - ClassGroupFormModal 가 class_schedule_rules 함께 INSERT.
--   - ShiftFormModal (StaffPage) 가 academy_staff_work_rules 함께 INSERT.
--   - 대시보드 "이번 주 예정" 이 룰+예외 기반 렌더 (기존 row 와 머지).
--
-- Phase C 작업 (추후):
--   - QR 체크인 / 수동 출근 → staff_attendance_logs 에 직접 기록.
--   - 급여 계산 = staff_attendance_logs.status='approved' 합산.
--   - academy_staff_shifts 의 의미를 "예정 행 (legacy)" 으로 명확화.
-- ============================================================
