-- Seenit — 반별 수업 기록 구성 + 클리닉 활동 유형
--
-- 기존 반은 현재 화면과 동일한 기록 항목을 기본값으로 사용한다.
-- record_blocks 는 UI 구성을 저장하며, 기존 lesson_records 데이터는 삭제하지 않는다.

alter table public.class_groups
  add column if not exists activity_type text not null default 'regular_class',
  add column if not exists activity_name text,
  add column if not exists record_blocks jsonb not null default
    '["progress","content","homework","next_plan","teacher_memo","student_evaluation","student_memo","support"]'::jsonb;

alter table public.class_groups
  drop constraint if exists class_groups_activity_type_chk;

alter table public.class_groups
  add constraint class_groups_activity_type_chk
  check (activity_type in (
    'regular_class',
    'one_on_one',
    'special_lecture',
    'makeup',
    'assessment',
    'self_study',
    'coaching',
    'other'
  ));

alter table public.class_groups
  drop constraint if exists class_groups_record_blocks_array_chk;

alter table public.class_groups
  add constraint class_groups_record_blocks_array_chk
  check (jsonb_typeof(record_blocks) = 'array');

alter table public.clinic_records
  add column if not exists activity_type text not null default 'clinic',
  add column if not exists activity_name text;

alter table public.clinic_records
  drop constraint if exists clinic_records_activity_type_chk;

alter table public.clinic_records
  add constraint clinic_records_activity_type_chk
  check (activity_type in (
    'clinic',
    'makeup',
    'self_study',
    'assessment',
    'consulting',
    'assignment_check',
    'other'
  ));
