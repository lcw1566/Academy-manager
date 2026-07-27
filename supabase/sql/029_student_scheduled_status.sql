-- 학생 재원 상태에 '재원 예정'을 추가한다.
-- 기존 active / paused / inactive 값과 기본값은 그대로 유지한다.

alter table public.students
  drop constraint if exists students_status_check;

alter table public.students
  add constraint students_status_check
  check (status in ('scheduled', 'active', 'paused', 'inactive'));
