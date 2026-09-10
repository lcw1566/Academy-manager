-- Supabase Database Advisor 성능 경고를 권한 의미 변경 없이 정리한다.
--
-- 1. 외래키 조인/삭제 검사에 필요한 인덱스를 추가한다.
-- 2. RLS 정책의 auth.* 호출을 initPlan으로 한 번만 계산하게 한다.
-- 3. exam_results / student_events의 FOR ALL 정책을 쓰기 동작별로 분리해
--    SELECT 정책과 겹치지 않게 한다.
--
-- 사용량이 적다는 이유만으로 "unused index"는 삭제하지 않는다. 해당 지표는
-- 통계 초기화 시점과 트래픽 양에 크게 영향을 받으므로 운영 기간을 더 지켜본다.

begin;

-- 외래키 열은 PostgreSQL이 자동으로 인덱싱하지 않는다. Advisor가 확인한
-- 26개 열에만 인덱스를 만들며, 재실행해도 중복 생성되지 않는다.
create index if not exists academy_calendar_events_created_by_idx
  on public.academy_calendar_events (created_by);
create index if not exists academy_calendar_events_updated_by_idx
  on public.academy_calendar_events (updated_by);
create index if not exists academy_chat_messages_sender_id_idx
  on public.academy_chat_messages (sender_id);
create index if not exists academy_chat_reads_user_id_idx
  on public.academy_chat_reads (user_id);
create index if not exists academy_chat_threads_created_by_idx
  on public.academy_chat_threads (created_by);
create index if not exists academy_drive_events_actor_id_idx
  on public.academy_drive_events (actor_id);
create index if not exists academy_drive_files_created_by_idx
  on public.academy_drive_files (created_by);
create index if not exists academy_drive_files_deleted_by_idx
  on public.academy_drive_files (deleted_by);
create index if not exists academy_drive_folders_created_by_idx
  on public.academy_drive_folders (created_by);
create index if not exists academy_drive_folders_deleted_by_idx
  on public.academy_drive_folders (deleted_by);
create index if not exists academy_invitations_accepted_user_id_idx
  on public.academy_invitations (accepted_user_id);
create index if not exists academy_invitations_invited_by_idx
  on public.academy_invitations (invited_by);
create index if not exists app_developers_created_by_idx
  on public.app_developers (created_by);
create index if not exists attendance_records_class_group_id_idx
  on public.attendance_records (class_group_id);
create index if not exists attendance_records_confirmed_by_idx
  on public.attendance_records (confirmed_by);
create index if not exists class_schedule_rules_teacher_user_id_idx
  on public.class_schedule_rules (teacher_user_id);
create index if not exists class_session_exceptions_substitute_teacher_id_idx
  on public.class_session_exceptions (substitute_teacher_user_id);
create index if not exists class_session_exceptions_teacher_user_id_idx
  on public.class_session_exceptions (teacher_user_id);
create index if not exists class_sessions_cancel_original_exception_id_idx
  on public.class_sessions (calendar_cancel_original_exception_id);
create index if not exists clinic_events_class_group_id_idx
  on public.clinic_events (class_group_id);
create index if not exists clinic_events_created_by_idx
  on public.clinic_events (created_by);
create index if not exists clinic_records_source_lesson_record_id_idx
  on public.clinic_records (source_lesson_record_id);
create index if not exists developer_action_logs_actor_user_id_idx
  on public.developer_action_logs (actor_user_id);
create index if not exists product_feedback_reporter_user_id_idx
  on public.product_feedback (reporter_user_id);
create index if not exists staff_attendance_logs_approved_by_idx
  on public.staff_attendance_logs (approved_by);
create index if not exists student_check_events_created_by_idx
  on public.student_check_events (created_by);

-- auth.uid() 등을 행마다 다시 계산하지 않고 쿼리마다 한 번만 평가하도록
-- `(select auth.uid())` 형태로 바꾼다. ALTER POLICY는 정책의 이름, 명령,
-- 대상 역할과 permissive/restrictive 속성을 그대로 보존한다.
do $migration$
declare
  v_policy record;
  v_using text;
  v_check text;
  v_original_using text;
  v_original_check text;
  v_function_name text;
begin
  for v_policy in
    select
      policy.polname,
      namespace.nspname as schema_name,
      relation.relname as table_name,
      pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
      pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression
    from pg_policy as policy
    join pg_class as relation on relation.oid = policy.polrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and (
        coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ~
          'auth\.(uid|email|jwt|role)\(\)'
        or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ~
          'auth\.(uid|email|jwt|role)\(\)'
      )
  loop
    v_using := v_policy.using_expression;
    v_check := v_policy.check_expression;
    v_original_using := v_using;
    v_original_check := v_check;

    foreach v_function_name in array array['uid', 'email', 'jwt', 'role']
    loop
      -- 재실행 시 이미 initPlan 형태인 함수는 다시 감싸지 않는다.
      if v_using is not null
         and position(format('auth.%s()', v_function_name) in v_using) > 0
         and v_using !~* format('select\s+auth\.%s\(\)', v_function_name) then
        v_using := replace(
          v_using,
          format('auth.%s()', v_function_name),
          format('(select auth.%s())', v_function_name)
        );
      end if;

      if v_check is not null
         and position(format('auth.%s()', v_function_name) in v_check) > 0
         and v_check !~* format('select\s+auth\.%s\(\)', v_function_name) then
        v_check := replace(
          v_check,
          format('auth.%s()', v_function_name),
          format('(select auth.%s())', v_function_name)
        );
      end if;
    end loop;

    if v_using is distinct from v_original_using
       or v_check is distinct from v_original_check then
      execute format(
        'alter policy %I on %I.%I%s%s',
        v_policy.polname,
        v_policy.schema_name,
        v_policy.table_name,
        case
          when v_using is null then ''
          else format(' using (%s)', v_using)
        end,
        case
          when v_check is null then ''
          else format(' with check (%s)', v_check)
        end
      );
    end if;
  end loop;
end;
$migration$;

-- FOR ALL에는 SELECT도 포함되므로 별도 SELECT 정책과 겹친다. 쓰기 권한식은
-- 그대로 유지하면서 INSERT / UPDATE / DELETE로 나눈다.
drop policy if exists "exam_results_write_by_permission" on public.exam_results;
drop policy if exists "exam_results_insert_by_permission" on public.exam_results;
drop policy if exists "exam_results_update_by_permission" on public.exam_results;
drop policy if exists "exam_results_delete_by_permission" on public.exam_results;

create policy "exam_results_insert_by_permission"
on public.exam_results for insert
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = (select auth.uid()))
);

create policy "exam_results_update_by_permission"
on public.exam_results for update
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = (select auth.uid()))
)
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = (select auth.uid()))
);

create policy "exam_results_delete_by_permission"
on public.exam_results for delete
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = (select auth.uid()))
);

drop policy if exists "student_events_write_by_permission" on public.student_events;
drop policy if exists "student_events_insert_by_permission" on public.student_events;
drop policy if exists "student_events_update_by_permission" on public.student_events;
drop policy if exists "student_events_delete_by_permission" on public.student_events;

create policy "student_events_insert_by_permission"
on public.student_events for insert
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = (select auth.uid()))
);

create policy "student_events_update_by_permission"
on public.student_events for update
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = (select auth.uid()))
)
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = (select auth.uid()))
);

create policy "student_events_delete_by_permission"
on public.student_events for delete
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = (select auth.uid()))
);

-- 중복 SELECT를 만들던 FOR ALL 정책이 남아 있으면 배포를 실패시킨다.
do $migration$
begin
  if exists (
    select 1
    from pg_policy as policy
    join pg_class as relation on relation.oid = policy.polrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and (
        (relation.relname = 'exam_results'
          and policy.polname = 'exam_results_write_by_permission')
        or (relation.relname = 'student_events'
          and policy.polname = 'student_events_write_by_permission')
      )
  ) then
    raise exception 'overlapping FOR ALL policies still exist';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
