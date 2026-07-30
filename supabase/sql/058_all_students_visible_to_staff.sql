-- ============================================================
-- 058_all_students_visible_to_staff.sql
-- 학생 정보 조회 권한이 있는 직원은 학생 탭에서 학원 전체 학생을 조회한다.
--
-- 중요:
--   - 학생 기본 row의 SELECT만 전체로 연다.
--   - 학생 생성/수정/삭제는 canManageStudents 권한을 그대로 요구한다.
--   - 수업·출결·클리닉·수업 기록은 기존 담당 배정 RLS를 유지한다.
-- ============================================================

begin;

drop policy if exists "students_select_by_permission"
  on public.students;
create policy "students_select_by_permission"
on public.students for select
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canViewStudents')
  )
  or (
    mode = 'private'
    and user_id = auth.uid()
  )
);

comment on policy "students_select_by_permission" on public.students is
  'canViewStudents 권한이 있는 활성 직원은 학원 전체 학생 기본 정보를 조회한다. 수정 권한과 학생별 기록 RLS는 별도다.';

notify pgrst, 'reload schema';

commit;
