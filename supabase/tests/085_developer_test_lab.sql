\set ON_ERROR_STOP on

begin;

set local session_replication_role = replica;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000085001', 'developer-085@example.invalid'),
  ('00000000-0000-0000-0000-000000085002', 'outsider-085@example.invalid'),
  ('00000000-0000-0000-0000-000000085003', 'viewer-085@example.invalid');

insert into public.app_developers (user_id, role)
values
  ('00000000-0000-0000-0000-000000085001', 'developer'),
  ('00000000-0000-0000-0000-000000085003', 'viewer');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000085001', true);

do $test$
declare
  v_lab jsonb;
  v_count integer;
begin
  v_lab := public.prepare_developer_test_lab('full');
  if not coalesce((v_lab ->> 'exists')::boolean, false) then
    raise exception 'developer test lab was not created';
  end if;
  if (v_lab ->> 'student_count')::integer <> 5
    or (v_lab ->> 'class_count')::integer <> 2
    or (v_lab ->> 'payment_count')::integer <> 4
    or (v_lab ->> 'payroll_count')::integer <> 1 then
    raise exception 'developer test lab seed counts are wrong: %', v_lab;
  end if;
  if not coalesce((public.get_my_developer_test_context((v_lab ->> 'academy_id')::uuid) ->> 'is_test_lab')::boolean, false) then
    raise exception 'developer test context was not recognized';
  end if;

  begin
    select count(*) into v_count from public.developer_test_workspaces;
    raise exception 'authenticated developer could select registry directly';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;

do $test$
declare
  v_lab jsonb;
  v_count integer;
begin
  v_lab := public.set_developer_test_persona('manager');
  if v_lab ->> 'member_role' <> 'manager' or v_lab ->> 'member_status' <> 'active' then
    raise exception 'manager persona did not update membership: %', v_lab;
  end if;
  select count(*) into v_count
  from public.payments
  where academy_id = (v_lab ->> 'academy_id')::uuid;
  if v_count <> 4 then raise exception 'manager could not view test payments'; end if;

  begin
    insert into public.payrolls (
      academy_id, user_id, mode, staff_type, staff_id, month
    ) values (
      (v_lab ->> 'academy_id')::uuid,
      auth.uid(),
      'academy',
      'manager',
      'forbidden-manager-write',
      to_char(current_date, 'YYYY-MM')
    );
    raise exception 'manager could insert academy payroll';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;

do $test$
declare
  v_lab jsonb;
  v_count integer;
begin
  v_lab := public.set_developer_test_persona('teacher');
  select count(*) into v_count
  from public.payments
  where academy_id = (v_lab ->> 'academy_id')::uuid;
  if v_count <> 0 then raise exception 'teacher could view academy payments'; end if;

  select count(*) into v_count
  from public.payrolls
  where academy_id = (v_lab ->> 'academy_id')::uuid;
  if v_count <> 1 then raise exception 'teacher could not view own payroll'; end if;
end;
$test$;

do $test$
declare
  v_lab jsonb;
  v_count integer;
begin
  v_lab := public.set_developer_test_persona('invited');
  if coalesce((v_lab ->> 'can_open')::boolean, true) then
    raise exception 'invited persona can open academy';
  end if;
  select count(*) into v_count
  from public.students
  where academy_id = (v_lab ->> 'academy_id')::uuid;
  if v_count <> 0 then raise exception 'invited persona could view academy students'; end if;

  v_lab := public.set_developer_test_persona('inactive');
  if coalesce((v_lab ->> 'can_open')::boolean, true) then
    raise exception 'inactive persona can open academy';
  end if;
  select count(*) into v_count
  from public.students
  where academy_id = (v_lab ->> 'academy_id')::uuid;
  if v_count <> 0 then raise exception 'inactive persona could view academy students'; end if;

  v_lab := public.set_developer_test_persona('owner');
  if v_lab ->> 'member_role' <> 'owner' or not (v_lab ->> 'can_open')::boolean then
    raise exception 'owner persona recovery failed: %', v_lab;
  end if;
end;
$test$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000085003', true);
do $test$
begin
  begin
    perform public.prepare_developer_test_lab('full');
    raise exception 'viewer could prepare a test lab';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.set_developer_test_persona('owner');
    raise exception 'viewer could change a test persona';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000085002', true);
do $test$
begin
  begin
    perform public.get_developer_test_lab();
    raise exception 'non-developer could read developer test lab';
  exception when insufficient_privilege then
    null;
  end;
  if coalesce((public.get_my_developer_test_context('00000000-0000-0000-0000-000000000001') ->> 'is_test_lab')::boolean, false) then
    raise exception 'non-developer received a test context';
  end if;
end;
$test$;

reset role;

do $test$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.developer_action_logs
  where actor_user_id = '00000000-0000-0000-0000-000000085001'
    and action in ('test_lab.reset', 'test_lab.persona_changed');
  if v_count <> 6 then
    raise exception 'expected 6 immutable test lab audit rows, got %', v_count;
  end if;
end;
$test$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $test$
begin
  begin
    perform public.get_developer_test_lab();
    raise exception 'anonymous caller could execute developer test lab RPC';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;

rollback;

\echo 'SQL 085 developer test lab role matrix: ok'
