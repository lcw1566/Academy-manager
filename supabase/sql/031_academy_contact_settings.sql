-- ============================================================
-- 031_academy_contact_settings.sql
-- Seenit — 학원 주소·대표 연락처
-- ============================================================

alter table public.academies
  add column if not exists address text,
  add column if not exists phone text;
