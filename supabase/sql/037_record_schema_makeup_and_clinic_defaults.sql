-- Seenit — 기록 블록 조립기 / 회차별 형식 / 보강 연결 / 클리닉 기본 형식

alter table public.class_groups
  add column if not exists record_schema jsonb;

alter table public.class_groups
  drop constraint if exists class_groups_record_schema_array_chk;

alter table public.class_groups
  add constraint class_groups_record_schema_array_chk
  check (record_schema is null or jsonb_typeof(record_schema) = 'array');

alter table public.class_sessions
  add column if not exists record_schema jsonb,
  add column if not exists activity_type text,
  add column if not exists activity_name text,
  add column if not exists session_kind text not null default 'regular',
  add column if not exists origin_session_id uuid references public.class_sessions(id) on delete set null;

alter table public.class_sessions
  drop constraint if exists class_sessions_record_schema_array_chk;

alter table public.class_sessions
  add constraint class_sessions_record_schema_array_chk
  check (record_schema is null or jsonb_typeof(record_schema) = 'array');

alter table public.class_sessions
  drop constraint if exists class_sessions_kind_chk;

alter table public.class_sessions
  add constraint class_sessions_kind_chk
  check (session_kind in ('regular', 'makeup', 'special', 'assessment', 'self_study', 'other'));

create index if not exists class_sessions_origin_session_id_idx
  on public.class_sessions(origin_session_id);

alter table public.lesson_records
  add column if not exists common_custom_values jsonb not null default '{}'::jsonb;

alter table public.academies
  add column if not exists clinic_record_fields jsonb not null default
    '["materials","description","result"]'::jsonb,
  add column if not exists clinic_default_activity_type text not null default 'clinic';

alter table public.academies
  drop constraint if exists academies_clinic_record_fields_array_chk;

alter table public.academies
  add constraint academies_clinic_record_fields_array_chk
  check (jsonb_typeof(clinic_record_fields) = 'array');

-- 학원 기본값을 그대로 쓰는 학생은 null, 예외 학생만 별도 구성을 저장한다.
alter table public.students
  add column if not exists clinic_record_fields jsonb,
  add column if not exists clinic_default_activity_type text;

alter table public.students
  drop constraint if exists students_clinic_record_fields_array_chk;

alter table public.students
  add constraint students_clinic_record_fields_array_chk
  check (clinic_record_fields is null or jsonb_typeof(clinic_record_fields) = 'array');
