-- ============================================================
-- 033_academy_tuition_rates.sql
-- Seenit — 학원 수강료 가격표
--
-- 예시:
-- {
--   "school_level": { "elementary": 200000, "middle": 250000 },
--   "grade": { "중1": 230000, "중2": 250000 }
-- }
-- 반별(class) 정책은 각 class_groups.default_billing에서 직접 관리한다.
-- ============================================================

alter table public.academies
  add column if not exists tuition_rates jsonb not null default '{}'::jsonb;

update public.academies
set tuition_rates = '{}'::jsonb
where tuition_rates is null
   or jsonb_typeof(tuition_rates) <> 'object';

alter table public.academies
  alter column tuition_rates set default '{}'::jsonb,
  alter column tuition_rates set not null;
