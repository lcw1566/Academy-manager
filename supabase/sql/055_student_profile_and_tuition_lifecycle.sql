-- ============================================================
-- 055_student_profile_and_tuition_lifecycle.sql
-- 학부모 호칭 직접 입력 + 매년 3월 학년별 수강료 자동 전환 기준.
-- ============================================================

alter table public.students
  add column if not exists parent_title_custom text,
  add column if not exists grade_reference_year smallint;

alter table public.students
  drop constraint if exists students_parent_title_check;
alter table public.students
  add constraint students_parent_title_check
  check (
    parent_title is null
    or parent_title in ('mother', 'father', 'guardian', 'parent', 'custom')
  );

alter table public.students
  drop constraint if exists students_parent_title_custom_check;
alter table public.students
  add constraint students_parent_title_custom_check
  check (
    parent_title_custom is null
    or (
      char_length(btrim(parent_title_custom)) between 1 and 20
      and parent_title_custom = btrim(parent_title_custom)
    )
  );

alter table public.students
  drop constraint if exists students_grade_reference_year_check;
alter table public.students
  add constraint students_grade_reference_year_check
  check (
    grade_reference_year is null
    or grade_reference_year between 2000 and 2200
  );

-- 현재 저장된 학년을 이번 학년도의 기준 학년으로 본다.
update public.students
set grade_reference_year = extract(
  year from (timezone('Asia/Seoul', now()) - interval '2 months')
)::smallint
where grade_reference_year is null
  and school_type in ('elementary', 'middle', 'high')
  and grade is not null;

comment on column public.students.grade_reference_year is
  'grade 컬럼의 학년이 적용된 학년도. 매년 3월 수강료 단계 자동 계산에 사용한다.';

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'exam_results'
  ) then
    alter publication supabase_realtime add table public.exam_results;
  end if;
end $$;

notify pgrst, 'reload schema';
