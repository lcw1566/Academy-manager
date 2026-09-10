-- Supabase Database Advisor가 지적한 함수 실행 권한을 최소 권한으로 정리한다.
--
-- public_student_checkin은 비로그인 QR 등하원에 필요한 유일한 익명 RPC다.
-- 나머지 SECURITY DEFINER 함수는 익명 실행을 금지하고, 트리거/이벤트 트리거
-- 함수는 로그인 사용자의 직접 RPC 실행도 금지한다.

begin;

-- updated_at 트리거는 객체 이름을 조회하지 않으므로 pg_catalog만 허용한다.
-- 함수가 없는 부분 설치 환경에서도 마이그레이션을 재실행할 수 있게 조건부로 처리한다.
do $migration$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    alter function public.set_updated_at() set search_path = pg_catalog;
    revoke execute on function public.set_updated_at() from public, anon, authenticated;
  end if;
end;
$migration$;

-- 이 함수들은 RLS helper 또는 로그인 사용자용 RPC다. PUBLIC/anon 상속은 끊되
-- authenticated에는 명시적으로 실행 권한을 남긴다.
do $migration$
declare
  v_function record;
begin
  for v_function in
    select format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure.proname,
      pg_get_function_identity_arguments(procedure.oid)
    ) as signature
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and procedure.proname = any (array[
        'can_access_chat_thread',
        'create_group_chat_thread',
        'get_or_create_dm_thread',
        'get_or_create_group_thread',
        'is_academy_manager',
        'is_academy_operations_manager',
        'is_member_of_academy',
        'is_operations_manager_of_academy_drive_object',
        'is_owner_of_academy',
        'is_owner_of_academy_drive_object',
        'list_academy_chat_members',
        'list_academy_member_profiles',
        'list_academy_role_assignment_candidates'
      ])
  loop
    execute format(
      'revoke execute on function %s from public, anon',
      v_function.signature
    );
    execute format(
      'grant execute on function %s to authenticated',
      v_function.signature
    );
  end loop;
end;
$migration$;

-- 트리거와 이벤트 트리거는 PostgREST RPC가 아니다. 모든 API 역할에서 직접
-- 실행할 수 없게 한다. 데이터베이스가 이미 연결한 트리거와 함수 소유자 권한은 유지된다.
-- rls_auto_enable은 과거 SQL Editor에서 생성됐을 수 있어 존재할 때만 정리된다.
do $migration$
declare
  v_function record;
begin
  for v_function in
    select format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure.proname,
      pg_get_function_identity_arguments(procedure.oid)
    ) as signature
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and procedure.prorettype = any (array[
        'pg_catalog.trigger'::regtype,
        'pg_catalog.event_trigger'::regtype
      ])
      and procedure.proname = any (array[
        'assign_random_student_checkin_pin',
        'audit_academy_drive_change',
        'cancel_future_shifts_for_inactive_member',
        'enforce_student_contact_write_permission',
        'guard_academy_drive_file',
        'guard_academy_drive_folder',
        'guard_staff_attendance_review_fields',
        'handle_auth_user_profile_upsert',
        'rls_auto_enable',
        'sync_member_roles_from_job_title_policies',
        'sync_staff_profile_from_academy_member',
        'touch_chat_thread_on_message'
      ])
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      v_function.signature
    );
  end loop;
end;
$migration$;

-- public_student_checkin은 QR 화면에서 로그인 없이 호출되므로 anon만 명시적으로
-- 허용한다. PUBLIC 권한은 제거해 허용 범위가 우연히 넓어지지 않게 한다.
do $migration$
begin
  if to_regprocedure('public.public_student_checkin(uuid,text,text,bigint)') is not null then
    revoke execute on function public.public_student_checkin(uuid, text, text, bigint)
      from public;
    grant execute on function public.public_student_checkin(uuid, text, text, bigint)
      to anon, authenticated;
  end if;
end;
$migration$;

-- 이후 이 마이그레이션 실행 역할이 만드는 함수는 기본 공개하지 않는다.
-- 새 사용자용 RPC는 각 마이그레이션에서 필요한 역할에 명시적으로 GRANT한다.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- 현재 Advisor 대상에 익명 권한이 다시 남으면 배포 자체를 실패시킨다.
do $migration$
declare
  v_violations text;
begin
  select string_agg(procedure.oid::regprocedure::text, ', ' order by procedure.oid::regprocedure::text)
  into v_violations
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.prosecdef
    and procedure.proname <> 'public_student_checkin'
    and has_function_privilege('anon', procedure.oid, 'execute');

  if v_violations is not null then
    raise exception 'anon can still execute SECURITY DEFINER functions: %', v_violations;
  end if;
end;
$migration$;

-- 내부 함수는 authenticated에서도 닫혀 있고, RLS/RPC 함수는 authenticated에서
-- 계속 동작하는지 같은 트랜잭션에서 검증한다.
do $migration$
declare
  v_violations text;
begin
  select string_agg(procedure.oid::regprocedure::text, ', ' order by procedure.oid::regprocedure::text)
  into v_violations
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.prosecdef
    and procedure.prorettype = any (array[
      'pg_catalog.trigger'::regtype,
      'pg_catalog.event_trigger'::regtype
    ])
    and procedure.proname = any (array[
      'assign_random_student_checkin_pin',
      'audit_academy_drive_change',
      'cancel_future_shifts_for_inactive_member',
      'enforce_student_contact_write_permission',
      'guard_academy_drive_file',
      'guard_academy_drive_folder',
      'guard_staff_attendance_review_fields',
      'handle_auth_user_profile_upsert',
      'rls_auto_enable',
      'sync_member_roles_from_job_title_policies',
      'sync_staff_profile_from_academy_member',
      'touch_chat_thread_on_message'
    ])
    and has_function_privilege('authenticated', procedure.oid, 'execute');

  if v_violations is not null then
    raise exception 'authenticated can still execute internal trigger functions: %', v_violations;
  end if;

  select string_agg(procedure.oid::regprocedure::text, ', ' order by procedure.oid::regprocedure::text)
  into v_violations
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.prosecdef
    and procedure.proname = any (array[
      'can_access_chat_thread',
      'create_group_chat_thread',
      'get_or_create_dm_thread',
      'get_or_create_group_thread',
      'is_academy_manager',
      'is_academy_operations_manager',
      'is_member_of_academy',
      'is_operations_manager_of_academy_drive_object',
      'is_owner_of_academy',
      'is_owner_of_academy_drive_object',
      'list_academy_chat_members',
      'list_academy_member_profiles',
      'list_academy_role_assignment_candidates'
    ])
    and not has_function_privilege('authenticated', procedure.oid, 'execute');

  if v_violations is not null then
    raise exception 'authenticated lost required RLS/RPC function access: %', v_violations;
  end if;

  if to_regprocedure('public.public_student_checkin(uuid,text,text,bigint)') is not null
     and not has_function_privilege(
       'anon',
       'public.public_student_checkin(uuid,text,text,bigint)',
       'execute'
     ) then
    raise exception 'anon lost required public_student_checkin access';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
