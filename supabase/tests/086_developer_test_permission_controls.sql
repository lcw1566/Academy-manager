\set ON_ERROR_STOP on

begin;

set local session_replication_role = replica;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000086001', 'developer-086@example.invalid'),
  ('00000000-0000-0000-0000-000000086002', 'outsider-086@example.invalid');

insert into public.app_developers (user_id, role)
values ('00000000-0000-0000-0000-000000086001', 'developer');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000086001', true);

do $test$
declare
  v_lab jsonb;
  v_permissions jsonb;
  v_count integer;
  v_affected integer;
begin
  v_lab := public.prepare_developer_test_lab('full');
  perform public.set_developer_test_persona('teacher');

  v_permissions := public.get_developer_test_permissions();
  if not coalesce((v_permissions ->> 'configurable')::boolean, false)
    or coalesce((v_permissions ->> 'canViewPayments')::boolean, true)
    or not coalesce((v_permissions ->> 'canViewPayroll')::boolean, false) then
    raise exception 'teacher permission defaults are wrong: %', v_permissions;
  end if;

  v_permissions := public.set_developer_test_permissions(
    '{"canViewPayments":true,"canManagePayments":false,"canViewPayroll":false}'::jsonb
  );
  if not (v_permissions ->> 'canViewPayments')::boolean
    or (v_permissions ->> 'canManagePayments')::boolean
    or (v_permissions ->> 'canViewPayroll')::boolean then
    raise exception 'view-only permission preset was not saved: %', v_permissions;
  end if;

  select count(*) into v_count
  from public.payments
  where academy_id = (v_lab ->> 'academy_id')::uuid;
  if v_count <> 4 then raise exception 'payment viewer could not read test payments'; end if;

  select count(*) into v_count
  from public.payrolls
  where academy_id = (v_lab ->> 'academy_id')::uuid;
  if v_count <> 0 then raise exception 'payroll-hidden teacher could read payroll'; end if;

  update public.payments
  set memo = 'forbidden-viewer-update'
  where academy_id = (v_lab ->> 'academy_id')::uuid;
  get diagnostics v_affected = row_count;
  if v_affected <> 0 then raise exception 'payment viewer could update payments'; end if;

  v_permissions := public.set_developer_test_permissions(
    '{"canViewPayments":true,"canManagePayments":true,"canViewPayroll":true}'::jsonb
  );
  update public.payments
  set memo = 'allowed-manager-update'
  where id = (
    select id from public.payments
    where academy_id = (v_lab ->> 'academy_id')::uuid
    order by id
    limit 1
  );
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'payment manager could not update a payment'; end if;

  begin
    perform public.set_developer_test_permissions('{"canViewStudentContacts":true}'::jsonb);
    raise exception 'sensitive permission key was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.set_developer_test_permissions(
      '{"canViewPayments":false,"canManagePayments":true,"canViewPayroll":true}'::jsonb
    );
    raise exception 'payment management without view permission was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  perform public.set_developer_test_persona('owner');
  begin
    perform public.set_developer_test_permissions(
      '{"canViewPayments":false,"canManagePayments":false,"canViewPayroll":false}'::jsonb
    );
    raise exception 'owner permissions were configurable';
  exception when invalid_parameter_value then
    null;
  end;
end;
$test$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000086002', true);
do $test$
begin
  begin
    perform public.get_developer_test_permissions();
    raise exception 'outsider could read test permissions';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.set_developer_test_permissions(
      '{"canViewPayments":true,"canManagePayments":false,"canViewPayroll":true}'::jsonb
    );
    raise exception 'outsider could change test permissions';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;

reset role;

do $test$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.developer_action_logs
  where actor_user_id = '00000000-0000-0000-0000-000000086001'
    and action = 'test_lab.permissions_changed';
  if v_count <> 2 then
    raise exception 'expected 2 immutable permission audit rows, got %', v_count;
  end if;
end;
$test$;

rollback;

\echo 'SQL 086 developer test permission controls: ok'
