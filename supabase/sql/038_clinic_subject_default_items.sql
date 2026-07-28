-- Seenit — 과목별 클리닉 기본 활동과 학생별 예외 구성

alter table public.academies
  add column if not exists clinic_default_items jsonb not null default '{}'::jsonb;

alter table public.academies
  drop constraint if exists academies_clinic_default_items_object_chk;

alter table public.academies
  add constraint academies_clinic_default_items_object_chk
  check (jsonb_typeof(clinic_default_items) = 'object');

alter table public.students
  add column if not exists clinic_default_items jsonb;

alter table public.students
  drop constraint if exists students_clinic_default_items_object_chk;

alter table public.students
  add constraint students_clinic_default_items_object_chk
  check (clinic_default_items is null or jsonb_typeof(clinic_default_items) = 'object');
