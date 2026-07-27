-- ============================================================
-- 033_academy_tuition_rates.sql
-- Seenit — 학원 수강료 가격표
--
-- 예시:
-- {
--   "subject_mode": true,
--   "school_level": { "elementary": 200000, "middle": 250000 },
--   "grade": { "중3": 270000 },
--   "subject_rates": {
--     "school_level": {
--       "english": { "middle": 280000 },
--       "math": { "middle": 300000 }
--     },
--     "grade": {
--       "english": { "중3": 310000 }
--     }
--   }
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

-- 새 학원은 가장 흔한 학교급별 기준으로 시작한다.
-- 기존 학원이 이미 선택한 수강료 기준은 변경하지 않는다.
alter table public.academies
  alter column tuition_policy set default 'school_level';
