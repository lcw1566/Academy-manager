-- ============================================================
-- 021_academy_onboarding_settings.sql
-- Seenit — academy onboarding/profile settings
--
-- Owner signup/onboarding stores the academy operating type and whether
-- clinic/self-study records are required by default.
-- ============================================================

alter table public.academies
  add column if not exists academy_type text default 'core_subjects',
  add column if not exists academy_subjects jsonb not null default '["korean", "english", "math"]'::jsonb,
  add column if not exists clinic_required boolean not null default true,
  add column if not exists academy_onboarded_at timestamptz;

update public.academies
set academy_type = coalesce(academy_type, 'core_subjects'),
    academy_subjects = coalesce(academy_subjects, '["korean", "english", "math"]'::jsonb),
    clinic_required = coalesce(clinic_required, true);
