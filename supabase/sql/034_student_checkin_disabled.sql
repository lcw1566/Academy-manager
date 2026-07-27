-- ============================================================
-- 034_student_checkin_disabled.sql
-- Seenit — 학생 등하원 기능 '사용하지 않음' 옵션
-- ============================================================

alter table public.academies
  drop constraint if exists academies_student_check_method_chk;

alter table public.academies
  add constraint academies_student_check_method_chk
  check (student_check_method in ('teacher_manual', 'qr', 'disabled'));
