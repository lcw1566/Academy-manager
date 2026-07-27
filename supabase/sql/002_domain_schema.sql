-- ============================================================
-- 002_domain_schema.sql
-- Seenit — 도메인 테이블 스키마
--
--   students / class_groups / class_sessions / lesson_records
--   attendance_records / clinic_records / payments / payrolls
--   exam_results / student_events
--
-- 전제 조건:
--   - 001_workspace_schema.sql 이 먼저 실행되어 있어야 한다.
--     필요한 의존성:
--       · public.academies
--       · public.academy_members
--       · public.set_updated_at()
--       · public.is_member_of_academy(uuid)
--       · public.is_owner_of_academy(uuid)
--
-- 공통 컬럼:
--   id, academy_id, user_id, mode ('academy'|'private'), created_at, updated_at
--
-- RLS 정책 패턴 (모든 도메인 테이블 공통):
--   select / insert / update :
--     (mode = 'academy' AND academy_id IS NOT NULL AND is_member_of_academy(academy_id))
--     OR (mode = 'private' AND user_id = auth.uid())
--   delete :
--     (mode = 'academy' AND academy_id IS NOT NULL AND is_owner_of_academy(academy_id))
--     OR (mode = 'private' AND user_id = auth.uid())
--
-- 실행 순서 (참조 의존성):
--   SECTION 1~10 : 테이블 생성 (FK 의존성 순서)
--   SECTION 11   : indexes
--   SECTION 12   : updated_at triggers
--   SECTION 13   : RLS enable
--   SECTION 14   : RLS policies
--   SECTION 15   : GRANTs (authenticated role)
--
-- idempotent: create if not exists / drop policy if exists / drop trigger if exists.
-- destructive 명령 (drop table / delete / truncate) 없음.
-- ============================================================


-- ============================================================
-- SECTION 1. students
-- ============================================================

create table if not exists public.students (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid references public.academies(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete cascade,
  mode             text not null default 'academy'
                   check (mode in ('academy', 'private')),
  name             text not null,
  school_type      text,
  school_name      text,
  grade            text,
  phone            text,
  parent_phone     text,
  parent_title     text
                   check (parent_title is null
                          or parent_title in ('mother', 'father', 'guardian', 'parent')),
  parent_name      text,
  enrollment_date  date,
  status           text not null default 'active'
                   check (status in ('scheduled', 'active', 'paused', 'inactive')),
  memo             text,
  class_group_ids  jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);


-- ============================================================
-- SECTION 2. class_groups
-- ============================================================

create table if not exists public.class_groups (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid references public.academies(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete cascade,
  mode              text not null default 'academy'
                    check (mode in ('academy', 'private')),
  name              text not null,
  subject           text,
  level             text,
  teacher_id        text,
  teacher_type      text not null default 'teacher'
                    check (teacher_type in ('owner', 'teacher')),
  student_ids       jsonb not null default '[]'::jsonb,
  weekdays          jsonb not null default '[]'::jsonb,
  start_time        text,
  end_time          text,
  room              text,
  start_date        date,
  end_date          date,
  billing_mode      text not null default 'same'
                    check (billing_mode in ('same', 'perStudent')),
  default_billing   jsonb not null default '{}'::jsonb,
  student_billings  jsonb not null default '{}'::jsonb,
  memo              text,
  status            text not null default 'active'
                    check (status in ('active', 'paused', 'ended')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);


-- ============================================================
-- SECTION 3. class_sessions
-- ============================================================

create table if not exists public.class_sessions (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid references public.academies(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  mode            text not null default 'academy'
                  check (mode in ('academy', 'private')),
  class_group_id  uuid references public.class_groups(id) on delete cascade,
  date            date not null,
  start_time      text,
  end_time        text,
  room            text,
  teacher_id      text,
  teacher_type    text not null default 'teacher'
                  check (teacher_type in ('owner', 'teacher')),
  student_ids     jsonb not null default '[]'::jsonb,
  status          text not null default 'scheduled'
                  check (status in ('scheduled', 'completed', 'canceled', 'rescheduled')),
  memo            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- ============================================================
-- SECTION 4. lesson_records
-- 수업 회차당 1행 (unique class_session_id)
-- 학생별 평가는 student_records jsonb 에 통합 저장
-- ============================================================

create table if not exists public.lesson_records (
  id                          uuid primary key default gen_random_uuid(),
  academy_id                  uuid references public.academies(id) on delete cascade,
  user_id                     uuid references auth.users(id) on delete cascade,
  mode                        text not null default 'academy'
                              check (mode in ('academy', 'private')),
  class_group_id              uuid references public.class_groups(id) on delete cascade,
  class_session_id            uuid references public.class_sessions(id) on delete cascade,
  date                        date,
  teacher_id                  text,
  common_progress             text,
  common_lesson_content       text,
  common_homework             text,
  next_lesson_plan            text,
  teacher_memo                text,
  student_records             jsonb not null default '{}'::jsonb,
  ai_parent_notice            text,
  ai_student_homework_notice  text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (class_session_id)
);


-- ============================================================
-- SECTION 5. attendance_records
-- (class_session_id, student_id) 조합 unique
-- ============================================================

create table if not exists public.attendance_records (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid references public.academies(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete cascade,
  mode              text not null default 'academy'
                    check (mode in ('academy', 'private')),
  class_group_id    uuid references public.class_groups(id) on delete cascade,
  class_session_id  uuid references public.class_sessions(id) on delete cascade,
  student_id        uuid references public.students(id) on delete cascade,
  date              date,
  status            text not null default 'present'
                    check (status in ('present', 'late', 'absent', 'makeup', 'excused')),
  memo              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (class_session_id, student_id)
);


-- ============================================================
-- SECTION 6. clinic_records
-- ============================================================

create table if not exists public.clinic_records (
  id                       uuid primary key default gen_random_uuid(),
  academy_id               uuid references public.academies(id) on delete cascade,
  user_id                  uuid references auth.users(id) on delete cascade,
  mode                     text not null default 'academy'
                           check (mode in ('academy', 'private')),
  student_id               uuid references public.students(id) on delete cascade,
  class_group_id           uuid references public.class_groups(id) on delete set null,
  class_session_id         uuid references public.class_sessions(id) on delete set null,
  date                     date not null,
  subject                  text,
  teacher_id               text,
  assistant_id             text,
  source_lesson_record_id  uuid references public.lesson_records(id) on delete set null,
  source_support_tags      jsonb not null default '[]'::jsonb,
  source_support_memo      text,
  items                    jsonb not null default '[]'::jsonb,
  overall_memo             text,
  created_by_role          text,
  created_by_id            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);


-- ============================================================
-- SECTION 7. payments
-- (class_group_id, student_id, month) unique
-- ⚠ class_group_id NULL 인 경우 unique 가 작동하지 않음 (PG 표준 동작).
--    개인 과외(private) 등에서 issue 가 될 수 있으니 추후 보완.
-- ============================================================

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid references public.academies(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  mode            text not null default 'academy'
                  check (mode in ('academy', 'private')),
  student_id      uuid references public.students(id) on delete cascade,
  class_group_id  uuid references public.class_groups(id) on delete set null,
  month           text not null,
  amount          integer not null default 0,
  due_date        date,
  paid_date       date,
  status          text not null default 'unpaid'
                  check (status in ('unpaid', 'paid', 'partial', 'waived', 'overdue')),
  payer_name      text,
  memo            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (class_group_id, student_id, month)
);


-- ============================================================
-- SECTION 8. payrolls
-- (academy_id, staff_type, staff_id, month) unique
-- ============================================================

create table if not exists public.payrolls (
  id                       uuid primary key default gen_random_uuid(),
  academy_id               uuid references public.academies(id) on delete cascade,
  user_id                  uuid references auth.users(id) on delete cascade,
  mode                     text not null default 'academy'
                           check (mode in ('academy', 'private')),
  staff_type               text not null
                           check (staff_type in ('owner', 'teacher', 'assistant')),
  staff_id                 text not null,
  month                    text not null,
  wage_type                text
                           check (wage_type is null or wage_type in ('hourly', 'monthly')),
  hourly_wage              integer not null default 0,
  monthly_salary           integer not null default 0,
  total_hours              numeric not null default 0,
  completed_session_count  integer not null default 0,
  completed_clinic_count   integer not null default 0,
  amount                   integer not null default 0,
  status                   text not null default 'scheduled'
                           check (status in ('scheduled', 'completed', 'hold')),
  paid_date                date,
  memo                     text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (academy_id, staff_type, staff_id, month)
);


-- ============================================================
-- SECTION 9. exam_results
-- ============================================================

create table if not exists public.exam_results (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid references public.academies(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  mode        text not null default 'academy'
              check (mode in ('academy', 'private')),
  student_id  uuid references public.students(id) on delete cascade,
  exam_name   text,
  exam_type   text
              check (exam_type is null
                     or exam_type in ('midterm', 'final', 'mock', 'sat', 'school', 'other')),
  subject     text,
  exam_date   date,
  score       numeric,
  max_score   numeric,
  grade       text,
  memo        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- ============================================================
-- SECTION 10. student_events
-- ============================================================

create table if not exists public.student_events (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid references public.academies(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  mode        text not null default 'academy'
              check (mode in ('academy', 'private')),
  student_id  uuid references public.students(id) on delete cascade,
  title       text not null,
  event_type  text
              check (event_type is null
                     or event_type in ('midterm', 'final', 'mock', 'sat',
                                       'assignment', 'school_event', 'other')),
  date        date not null,
  memo        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- ============================================================
-- SECTION 11. Indexes
-- ============================================================

-- students
create index if not exists students_academy_id_idx   on public.students(academy_id);
create index if not exists students_user_id_idx      on public.students(user_id);
create index if not exists students_mode_idx         on public.students(mode);
create index if not exists students_school_name_idx  on public.students(school_name);
create index if not exists students_status_idx       on public.students(status);

-- class_groups
create index if not exists class_groups_academy_id_idx  on public.class_groups(academy_id);
create index if not exists class_groups_user_id_idx     on public.class_groups(user_id);
create index if not exists class_groups_mode_idx        on public.class_groups(mode);
create index if not exists class_groups_teacher_id_idx  on public.class_groups(teacher_id);
create index if not exists class_groups_status_idx      on public.class_groups(status);
create index if not exists class_groups_start_date_idx  on public.class_groups(start_date);

-- class_sessions
create index if not exists class_sessions_academy_id_idx      on public.class_sessions(academy_id);
create index if not exists class_sessions_user_id_idx         on public.class_sessions(user_id);
create index if not exists class_sessions_mode_idx            on public.class_sessions(mode);
create index if not exists class_sessions_class_group_id_idx  on public.class_sessions(class_group_id);
create index if not exists class_sessions_date_idx            on public.class_sessions(date);
create index if not exists class_sessions_teacher_id_idx      on public.class_sessions(teacher_id);
create index if not exists class_sessions_status_idx          on public.class_sessions(status);

-- lesson_records
create index if not exists lesson_records_academy_id_idx        on public.lesson_records(academy_id);
create index if not exists lesson_records_user_id_idx           on public.lesson_records(user_id);
create index if not exists lesson_records_mode_idx              on public.lesson_records(mode);
create index if not exists lesson_records_class_group_id_idx    on public.lesson_records(class_group_id);
create index if not exists lesson_records_class_session_id_idx  on public.lesson_records(class_session_id);
create index if not exists lesson_records_date_idx              on public.lesson_records(date);
create index if not exists lesson_records_teacher_id_idx        on public.lesson_records(teacher_id);

-- attendance_records
create index if not exists attendance_records_academy_id_idx       on public.attendance_records(academy_id);
create index if not exists attendance_records_user_id_idx          on public.attendance_records(user_id);
create index if not exists attendance_records_mode_idx             on public.attendance_records(mode);
create index if not exists attendance_records_class_session_id_idx on public.attendance_records(class_session_id);
create index if not exists attendance_records_student_id_idx       on public.attendance_records(student_id);
create index if not exists attendance_records_date_idx             on public.attendance_records(date);
create index if not exists attendance_records_status_idx           on public.attendance_records(status);

-- clinic_records
create index if not exists clinic_records_academy_id_idx        on public.clinic_records(academy_id);
create index if not exists clinic_records_user_id_idx           on public.clinic_records(user_id);
create index if not exists clinic_records_mode_idx              on public.clinic_records(mode);
create index if not exists clinic_records_student_id_idx        on public.clinic_records(student_id);
create index if not exists clinic_records_class_group_id_idx    on public.clinic_records(class_group_id);
create index if not exists clinic_records_class_session_id_idx  on public.clinic_records(class_session_id);
create index if not exists clinic_records_date_idx              on public.clinic_records(date);
create index if not exists clinic_records_subject_idx           on public.clinic_records(subject);
create index if not exists clinic_records_assistant_id_idx      on public.clinic_records(assistant_id);

-- payments
create index if not exists payments_academy_id_idx     on public.payments(academy_id);
create index if not exists payments_user_id_idx        on public.payments(user_id);
create index if not exists payments_mode_idx           on public.payments(mode);
create index if not exists payments_student_id_idx     on public.payments(student_id);
create index if not exists payments_class_group_id_idx on public.payments(class_group_id);
create index if not exists payments_month_idx          on public.payments(month);
create index if not exists payments_status_idx         on public.payments(status);

-- payrolls
create index if not exists payrolls_academy_id_idx  on public.payrolls(academy_id);
create index if not exists payrolls_user_id_idx     on public.payrolls(user_id);
create index if not exists payrolls_mode_idx        on public.payrolls(mode);
create index if not exists payrolls_staff_type_idx  on public.payrolls(staff_type);
create index if not exists payrolls_staff_id_idx    on public.payrolls(staff_id);
create index if not exists payrolls_month_idx       on public.payrolls(month);
create index if not exists payrolls_status_idx      on public.payrolls(status);

-- exam_results
create index if not exists exam_results_academy_id_idx  on public.exam_results(academy_id);
create index if not exists exam_results_user_id_idx     on public.exam_results(user_id);
create index if not exists exam_results_mode_idx        on public.exam_results(mode);
create index if not exists exam_results_student_id_idx  on public.exam_results(student_id);
create index if not exists exam_results_exam_date_idx   on public.exam_results(exam_date);
create index if not exists exam_results_subject_idx     on public.exam_results(subject);
create index if not exists exam_results_exam_type_idx   on public.exam_results(exam_type);

-- student_events
create index if not exists student_events_academy_id_idx  on public.student_events(academy_id);
create index if not exists student_events_user_id_idx     on public.student_events(user_id);
create index if not exists student_events_mode_idx        on public.student_events(mode);
create index if not exists student_events_student_id_idx  on public.student_events(student_id);
create index if not exists student_events_date_idx        on public.student_events(date);
create index if not exists student_events_event_type_idx  on public.student_events(event_type);


-- ============================================================
-- SECTION 12. updated_at triggers
-- public.set_updated_at() 은 001_workspace_schema.sql 에서 정의됨
-- ============================================================

drop trigger if exists set_students_updated_at on public.students;
create trigger set_students_updated_at
before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists set_class_groups_updated_at on public.class_groups;
create trigger set_class_groups_updated_at
before update on public.class_groups
for each row execute function public.set_updated_at();

drop trigger if exists set_class_sessions_updated_at on public.class_sessions;
create trigger set_class_sessions_updated_at
before update on public.class_sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_lesson_records_updated_at on public.lesson_records;
create trigger set_lesson_records_updated_at
before update on public.lesson_records
for each row execute function public.set_updated_at();

drop trigger if exists set_attendance_records_updated_at on public.attendance_records;
create trigger set_attendance_records_updated_at
before update on public.attendance_records
for each row execute function public.set_updated_at();

drop trigger if exists set_clinic_records_updated_at on public.clinic_records;
create trigger set_clinic_records_updated_at
before update on public.clinic_records
for each row execute function public.set_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists set_payrolls_updated_at on public.payrolls;
create trigger set_payrolls_updated_at
before update on public.payrolls
for each row execute function public.set_updated_at();

drop trigger if exists set_exam_results_updated_at on public.exam_results;
create trigger set_exam_results_updated_at
before update on public.exam_results
for each row execute function public.set_updated_at();

drop trigger if exists set_student_events_updated_at on public.student_events;
create trigger set_student_events_updated_at
before update on public.student_events
for each row execute function public.set_updated_at();


-- ============================================================
-- SECTION 13. RLS enable
-- ============================================================

alter table public.students            enable row level security;
alter table public.class_groups        enable row level security;
alter table public.class_sessions      enable row level security;
alter table public.lesson_records      enable row level security;
alter table public.attendance_records  enable row level security;
alter table public.clinic_records      enable row level security;
alter table public.payments            enable row level security;
alter table public.payrolls            enable row level security;
alter table public.exam_results        enable row level security;
alter table public.student_events      enable row level security;


-- ============================================================
-- SECTION 14. RLS policies
--
-- 모든 도메인 테이블 공통 패턴:
--   select / insert / update :
--     (academy 멤버) OR (private 본인)
--   delete :
--     (academy owner) OR (private 본인)
-- ============================================================

-- ─── students ────────────────────────────────────────────────

drop policy if exists "students_select_own_or_academy_member" on public.students;
create policy "students_select_own_or_academy_member"
on public.students for select
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "students_insert_own_or_academy_member" on public.students;
create policy "students_insert_own_or_academy_member"
on public.students for insert
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "students_update_own_or_academy_member" on public.students;
create policy "students_update_own_or_academy_member"
on public.students for update
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "students_delete_own_or_academy_owner" on public.students;
create policy "students_delete_own_or_academy_owner"
on public.students for delete
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

-- ─── class_groups ────────────────────────────────────────────

drop policy if exists "class_groups_select_own_or_academy_member" on public.class_groups;
create policy "class_groups_select_own_or_academy_member"
on public.class_groups for select
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_groups_insert_own_or_academy_member" on public.class_groups;
create policy "class_groups_insert_own_or_academy_member"
on public.class_groups for insert
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_groups_update_own_or_academy_member" on public.class_groups;
create policy "class_groups_update_own_or_academy_member"
on public.class_groups for update
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_groups_delete_own_or_academy_owner" on public.class_groups;
create policy "class_groups_delete_own_or_academy_owner"
on public.class_groups for delete
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

-- ─── class_sessions ──────────────────────────────────────────

drop policy if exists "class_sessions_select_own_or_academy_member" on public.class_sessions;
create policy "class_sessions_select_own_or_academy_member"
on public.class_sessions for select
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_sessions_insert_own_or_academy_member" on public.class_sessions;
create policy "class_sessions_insert_own_or_academy_member"
on public.class_sessions for insert
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_sessions_update_own_or_academy_member" on public.class_sessions;
create policy "class_sessions_update_own_or_academy_member"
on public.class_sessions for update
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_sessions_delete_own_or_academy_owner" on public.class_sessions;
create policy "class_sessions_delete_own_or_academy_owner"
on public.class_sessions for delete
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

-- ─── lesson_records ──────────────────────────────────────────

drop policy if exists "lesson_records_select_own_or_academy_member" on public.lesson_records;
create policy "lesson_records_select_own_or_academy_member"
on public.lesson_records for select
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "lesson_records_insert_own_or_academy_member" on public.lesson_records;
create policy "lesson_records_insert_own_or_academy_member"
on public.lesson_records for insert
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "lesson_records_update_own_or_academy_member" on public.lesson_records;
create policy "lesson_records_update_own_or_academy_member"
on public.lesson_records for update
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "lesson_records_delete_own_or_academy_owner" on public.lesson_records;
create policy "lesson_records_delete_own_or_academy_owner"
on public.lesson_records for delete
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

-- ─── attendance_records ──────────────────────────────────────

drop policy if exists "attendance_records_select_own_or_academy_member" on public.attendance_records;
create policy "attendance_records_select_own_or_academy_member"
on public.attendance_records for select
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "attendance_records_insert_own_or_academy_member" on public.attendance_records;
create policy "attendance_records_insert_own_or_academy_member"
on public.attendance_records for insert
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "attendance_records_update_own_or_academy_member" on public.attendance_records;
create policy "attendance_records_update_own_or_academy_member"
on public.attendance_records for update
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "attendance_records_delete_own_or_academy_owner" on public.attendance_records;
create policy "attendance_records_delete_own_or_academy_owner"
on public.attendance_records for delete
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

-- ─── clinic_records ──────────────────────────────────────────

drop policy if exists "clinic_records_select_own_or_academy_member" on public.clinic_records;
create policy "clinic_records_select_own_or_academy_member"
on public.clinic_records for select
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "clinic_records_insert_own_or_academy_member" on public.clinic_records;
create policy "clinic_records_insert_own_or_academy_member"
on public.clinic_records for insert
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "clinic_records_update_own_or_academy_member" on public.clinic_records;
create policy "clinic_records_update_own_or_academy_member"
on public.clinic_records for update
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "clinic_records_delete_own_or_academy_owner" on public.clinic_records;
create policy "clinic_records_delete_own_or_academy_owner"
on public.clinic_records for delete
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

-- ─── payments ────────────────────────────────────────────────

drop policy if exists "payments_select_own_or_academy_member" on public.payments;
create policy "payments_select_own_or_academy_member"
on public.payments for select
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payments_insert_own_or_academy_member" on public.payments;
create policy "payments_insert_own_or_academy_member"
on public.payments for insert
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payments_update_own_or_academy_member" on public.payments;
create policy "payments_update_own_or_academy_member"
on public.payments for update
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payments_delete_own_or_academy_owner" on public.payments;
create policy "payments_delete_own_or_academy_owner"
on public.payments for delete
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

-- ─── payrolls ────────────────────────────────────────────────

drop policy if exists "payrolls_select_own_or_academy_member" on public.payrolls;
create policy "payrolls_select_own_or_academy_member"
on public.payrolls for select
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payrolls_insert_own_or_academy_member" on public.payrolls;
create policy "payrolls_insert_own_or_academy_member"
on public.payrolls for insert
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payrolls_update_own_or_academy_member" on public.payrolls;
create policy "payrolls_update_own_or_academy_member"
on public.payrolls for update
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payrolls_delete_own_or_academy_owner" on public.payrolls;
create policy "payrolls_delete_own_or_academy_owner"
on public.payrolls for delete
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

-- ─── exam_results ────────────────────────────────────────────

drop policy if exists "exam_results_select_own_or_academy_member" on public.exam_results;
create policy "exam_results_select_own_or_academy_member"
on public.exam_results for select
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "exam_results_insert_own_or_academy_member" on public.exam_results;
create policy "exam_results_insert_own_or_academy_member"
on public.exam_results for insert
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "exam_results_update_own_or_academy_member" on public.exam_results;
create policy "exam_results_update_own_or_academy_member"
on public.exam_results for update
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "exam_results_delete_own_or_academy_owner" on public.exam_results;
create policy "exam_results_delete_own_or_academy_owner"
on public.exam_results for delete
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

-- ─── student_events ──────────────────────────────────────────

drop policy if exists "student_events_select_own_or_academy_member" on public.student_events;
create policy "student_events_select_own_or_academy_member"
on public.student_events for select
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "student_events_insert_own_or_academy_member" on public.student_events;
create policy "student_events_insert_own_or_academy_member"
on public.student_events for insert
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "student_events_update_own_or_academy_member" on public.student_events;
create policy "student_events_update_own_or_academy_member"
on public.student_events for update
using (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null and public.is_member_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "student_events_delete_own_or_academy_owner" on public.student_events;
create policy "student_events_delete_own_or_academy_owner"
on public.student_events for delete
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);


-- ============================================================
-- SECTION 15. GRANTs
-- RLS 와 별개로, authenticated role 이 해당 테이블에 접근하려면
-- 테이블 단위 권한이 부여되어야 한다.
-- ============================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.students            to authenticated;
grant select, insert, update, delete on table public.class_groups        to authenticated;
grant select, insert, update, delete on table public.class_sessions      to authenticated;
grant select, insert, update, delete on table public.lesson_records      to authenticated;
grant select, insert, update, delete on table public.attendance_records  to authenticated;
grant select, insert, update, delete on table public.clinic_records      to authenticated;
grant select, insert, update, delete on table public.payments            to authenticated;
grant select, insert, update, delete on table public.payrolls            to authenticated;
grant select, insert, update, delete on table public.exam_results        to authenticated;
grant select, insert, update, delete on table public.student_events      to authenticated;


-- ============================================================
-- End of 002_domain_schema.sql
-- ============================================================
