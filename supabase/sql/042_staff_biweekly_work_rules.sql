-- ============================================================
-- 042_staff_biweekly_work_rules.sql
-- 직원 반복 근무 규칙에 매주/격주 주기를 추가한다.
--
-- repeat_interval_weeks:
--   1 = 매주 (기존 규칙 기본값)
--   2 = 격주
--
-- effective_start_date가 포함된 주를 첫 근무 주로 계산한다.
-- 기존 규칙과 근무 기록은 변경하거나 삭제하지 않는다.
-- ============================================================

alter table public.academy_staff_work_rules
  add column if not exists repeat_interval_weeks smallint not null default 1;

alter table public.academy_staff_work_rules
  drop constraint if exists academy_staff_work_rules_repeat_interval_chk;

alter table public.academy_staff_work_rules
  add constraint academy_staff_work_rules_repeat_interval_chk
  check (repeat_interval_weeks in (1, 2));

comment on column public.academy_staff_work_rules.repeat_interval_weeks is
  '반복 주기: 1=매주, 2=격주. effective_start_date가 포함된 주가 첫 근무 주';

notify pgrst, 'reload schema';

-- ============================================================
-- End of 042_staff_biweekly_work_rules.sql
-- ============================================================
