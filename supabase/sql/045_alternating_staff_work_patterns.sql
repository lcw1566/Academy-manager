-- ============================================================
-- 045_alternating_staff_work_patterns.sql
-- 한 주마다 근무 일정이 달라지는 A주/B주 교대 패턴을 구분한다.
--
-- repeat_interval_weeks = 2인 규칙에서:
--   rotation_week_index = 0 → A주
--   rotation_week_index = 1 → B주
--
-- 기존 격주 규칙은 A주 규칙으로 유지되어 B주 휴무 패턴과 호환된다.
-- ============================================================

alter table public.academy_staff_work_rules
  add column if not exists rotation_week_index smallint not null default 0;

alter table public.academy_staff_work_rules
  drop constraint if exists academy_staff_work_rules_rotation_week_index_chk;

alter table public.academy_staff_work_rules
  add constraint academy_staff_work_rules_rotation_week_index_chk
  check (rotation_week_index in (0, 1));

comment on column public.academy_staff_work_rules.rotation_week_index is
  '2주 교대 근무 패턴 위치: 0=A주, 1=B주';

notify pgrst, 'reload schema';

-- ============================================================
-- End of 045_alternating_staff_work_patterns.sql
-- ============================================================
