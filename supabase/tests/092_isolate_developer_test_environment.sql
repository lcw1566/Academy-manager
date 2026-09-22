\set ON_ERROR_STOP on
begin;
insert into public.developer_test_environment_config(singleton,enabled)
values(true,false)
on conflict(singleton) do update set enabled=false;
set local session_replication_role=replica;
insert into auth.users(id,email) values
  ('00000000-0000-0000-0000-000000092001','developer-092@example.invalid'),
  ('00000000-0000-0000-0000-000000092002','outsider-092@example.invalid');
insert into public.app_developers(user_id,role) values
  ('00000000-0000-0000-0000-000000092001','developer');
set local session_replication_role=origin;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000092001',true);
do $test$
declare result jsonb;
begin
  result:=public.get_developer_test_lab();
  if coalesce((result->>'environment_disabled')::boolean,false) is not true then
    raise exception 'disabled environment exposed the test lab: %',result;
  end if;
  result:=public.get_developer_test_permissions();
  if coalesce((result->>'environment_disabled')::boolean,false) is not true then
    raise exception 'disabled environment exposed test permissions: %',result;
  end if;
  result:=public.get_my_developer_test_context(gen_random_uuid());
  if coalesce((result->>'is_test_lab')::boolean,true) is not false then
    raise exception 'disabled environment exposed test context: %',result;
  end if;
  begin perform public.prepare_developer_test_lab('full'); raise exception 'disabled reset succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.set_developer_test_persona('teacher'); raise exception 'disabled persona change succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.set_developer_test_permissions('{}'); raise exception 'disabled permission change succeeded';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','public.get_developer_test_lab_unrestricted()','EXECUTE')
    or has_function_privilege('authenticated','public.prepare_developer_test_lab_unrestricted(text)','EXECUTE') then
    raise exception 'authenticated can bypass the environment wrappers';
  end if;
  begin perform public.get_developer_test_lab_unrestricted(); raise exception 'legacy bypass executed';
  exception when insufficient_privilege then null; end;
end;$test$;

reset role;
update public.developer_test_environment_config set enabled=true where singleton=true;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000092001',true);
do $test$
declare result jsonb;
begin
  result:=public.prepare_developer_test_lab('full');
  if coalesce((result->>'exists')::boolean,false) is not true then
    raise exception 'explicit test environment could not prepare lab: %',result;
  end if;
end;$test$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000092002',true);
do $test$ begin
  begin perform public.prepare_developer_test_lab('full'); raise exception 'outsider prepared test lab';
  exception when insufficient_privilege then null; end;
end;$test$;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $test$ begin
  begin perform public.get_developer_test_lab(); raise exception 'anonymous read test lab';
  exception when insufficient_privilege then null; end;
end;$test$;
rollback;
\echo 'SQL 092 developer test environment isolation: ok'
