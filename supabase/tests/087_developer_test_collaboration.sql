\set ON_ERROR_STOP on

begin;

set local session_replication_role = replica;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000087001', 'developer-087@example.invalid'),
  ('00000000-0000-0000-0000-000000087002', 'manager-087@example.invalid'),
  ('00000000-0000-0000-0000-000000087003', 'inactive-087@example.invalid'),
  ('00000000-0000-0000-0000-000000087004', 'outsider-087@example.invalid');

insert into public.app_developers (user_id, role)
values ('00000000-0000-0000-0000-000000087001', 'developer');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000087001', true);

do $test$
declare
  v_lab jsonb;
  v_academy_id uuid;
begin
  v_lab := public.prepare_developer_test_lab('full');
  v_academy_id := (v_lab ->> 'academy_id')::uuid;
  perform set_config('test.developer_academy_id', v_academy_id::text, true);

  insert into public.academy_members (academy_id, user_id, role, status)
  values
    (v_academy_id, '00000000-0000-0000-0000-000000087002', 'manager', 'active'),
    (v_academy_id, '00000000-0000-0000-0000-000000087003', 'teacher', 'inactive');
end;
$test$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000087002', true);
do $test$
declare
  v_context jsonb;
begin
  v_context := public.get_my_developer_test_context(
    current_setting('test.developer_academy_id')::uuid
  );
  if not coalesce((v_context ->> 'is_test_lab')::boolean, false)
    or v_context ->> 'active_persona' <> 'manager' then
    raise exception 'active manager did not receive test context: %', v_context;
  end if;

  begin
    perform 1 from public.developer_test_workspaces;
    raise exception 'test collaborator could select registry directly';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000087003', true);
do $test$
begin
  if coalesce((public.get_my_developer_test_context(
    current_setting('test.developer_academy_id')::uuid
  ) ->> 'is_test_lab')::boolean, false) then
    raise exception 'inactive member received test context';
  end if;
end;
$test$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000087004', true);
do $test$
begin
  if coalesce((public.get_my_developer_test_context(
    current_setting('test.developer_academy_id')::uuid
  ) ->> 'is_test_lab')::boolean, false) then
    raise exception 'outsider received test context';
  end if;
end;
$test$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $test$
begin
  begin
    perform public.get_my_developer_test_context(
      current_setting('test.developer_academy_id')::uuid
    );
    raise exception 'anonymous caller executed test context RPC';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;

rollback;

\echo 'SQL 087 developer test collaboration role matrix: ok'
