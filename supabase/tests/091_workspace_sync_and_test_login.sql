\set ON_ERROR_STOP on
begin;
set local session_replication_role=replica;
insert into auth.users(id,email) select ('00000000-0000-0000-0000-00000009100'||i)::uuid,'test-091-'||i||'@example.invalid' from generate_series(1,7) i;
insert into public.app_developers(user_id,role) values('00000000-0000-0000-0000-000000091001','developer');
set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000091001',true);
select set_config('test.academy',(public.prepare_developer_test_lab('full')->>'academy_id'),true);
reset role;
insert into public.academy_members(academy_id,user_id,role,status) select current_setting('test.academy')::uuid,('00000000-0000-0000-0000-00000009100'||i)::uuid,case when i=2 then 'manager' else 'teacher' end,case when i=6 then 'inactive' else 'active' end from generate_series(2,6) i where i<>5;
insert into public.academy_staff_profiles(academy_id,user_id,role,status,permissions) values
(current_setting('test.academy')::uuid,'00000000-0000-0000-0000-000000091003','teacher','active','{"canViewStudents":false,"canManageStudents":false}'),
(current_setting('test.academy')::uuid,'00000000-0000-0000-0000-000000091004','teacher','active','{"canViewStudents":true,"canManageStaff":true}') on conflict(academy_id,user_id) do update set permissions=excluded.permissions;
insert into public.academy_invitations(academy_id,email) values(current_setting('test.academy')::uuid,'test-091-5@example.invalid');
insert into public.developer_test_login_accounts(user_id,academy_id,persona) select ('00000000-0000-0000-0000-00000009100'||i)::uuid,current_setting('test.academy')::uuid,case i when 1 then 'owner' when 2 then 'manager' when 3 then 'teacher' else 'invited' end from unnest(array[1,2,3,5]) i;
set local role authenticated;
do $test$
declare i integer; a uuid:=current_setting('test.academy')::uuid; scope jsonb; allowed boolean;
begin
  for i in 1..7 loop
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000009100'||i,true);
    if i in (5,6,7) then
      begin perform public.get_my_academy_sync_access(a); raise exception 'inactive/invitee/outsider scope accepted: %',i; exception when insufficient_privilege then null; end;
    else
      scope:=public.get_my_academy_sync_access(a);
      if (scope->>'students')::boolean <> (i<>3) then raise exception 'wrong students scope: %, %',i,scope; end if;
      -- Preflight must agree with each existing RPC, not broaden its rights.
      allowed:=true;
      begin perform public.list_academy_students_secure(a); exception when insufficient_privilege then allowed:=false; end;
      if allowed<>(scope->>'students')::boolean then raise exception 'students mismatch: %',i; end if;
      allowed:=true;
      begin perform public.list_academy_staff_access_profiles(a); exception when insufficient_privilege then allowed:=false; end;
      if allowed<>(scope->>'staffAccess')::boolean then raise exception 'staff mismatch: %',i; end if;
      allowed:=true;
      begin perform public.list_academy_invitation_accounts(a); exception when insufficient_privilege then allowed:=false; end;
      if allowed<>(scope->>'invitationAccounts')::boolean then raise exception 'invitation mismatch: %',i; end if;
    end if;
    begin perform public.get_my_academy_sync_access('00000000-0000-0000-0000-000000091999'); raise exception 'cross academy accepted'; exception when insufficient_privilege then null; end;
    begin perform public.get_test_login_context('00000000-0000-0000-0000-000000091001'); raise exception 'client spoofed actor'; exception when insufficient_privilege then null; end;
    begin perform public.authorize_test_login('00000000-0000-0000-0000-000000091001','owner'); raise exception 'client authorized switch'; exception when insufficient_privilege then null; end;
    begin perform 1 from public.developer_test_login_accounts; raise exception 'client read registry'; exception when insufficient_privilege then null; end;
    begin perform phone,parent_phone,checkin_pin from public.students; raise exception 'student secrets exposed'; exception when insufficient_privilege then null; end;
  end loop;
end;$test$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $test$ begin
  begin perform public.get_my_academy_sync_access(current_setting('test.academy')::uuid); raise exception 'anonymous scope allowed'; exception when insufficient_privilege then null; end;
  begin perform public.get_test_login_context('00000000-0000-0000-0000-000000091001'); raise exception 'anonymous switch context'; exception when insufficient_privilege then null; end;
end;$test$;
set local role service_role;
do $test$
declare ctx jsonb; target jsonb; i integer;
begin
  ctx:=public.get_test_login_context('00000000-0000-0000-0000-000000091005');
  if jsonb_array_length(ctx->'accounts')<>4 then raise exception 'invitee cannot switch back'; end if;
  begin perform public.get_test_login_context('00000000-0000-0000-0000-000000091007'); raise exception 'unregistered caller allowed'; exception when insufficient_privilege then null; end;
  begin perform public.authorize_test_login('00000000-0000-0000-0000-000000091003','inactive'); raise exception 'arbitrary target allowed'; exception when insufficient_privilege then null; end;
  for i in 1..12 loop
    target:=public.authorize_test_login('00000000-0000-0000-0000-000000091003','owner');
    if target->>'user_id'<>'00000000-0000-0000-0000-000000091001' then raise exception 'incorrect target'; end if;
  end loop;
  begin perform public.authorize_test_login('00000000-0000-0000-0000-000000091005','teacher'); raise exception 'rate limit missing'; exception when program_limit_exceeded then null; end;
  if (select count(*) from public.developer_action_logs where action='staging_test_login_requested' and actor_user_id='00000000-0000-0000-0000-000000091003')<>12 then raise exception 'audit missing'; end if;
end;$test$;
reset role;
-- Any membership outside the lab disqualifies an identity as actor AND target.
insert into public.academies(id,name,owner_id) values('00000000-0000-0000-0000-000000091999','Synthetic other academy','00000000-0000-0000-0000-000000091007');
insert into public.academy_members(academy_id,user_id,role,status) values('00000000-0000-0000-0000-000000091999','00000000-0000-0000-0000-000000091003','teacher','inactive');
set local role service_role;
do $test$ begin
  begin perform public.get_test_login_context('00000000-0000-0000-0000-000000091003'); raise exception 'cross-academy actor allowed'; exception when insufficient_privilege then null; end;
  if jsonb_array_length(public.get_test_login_context('00000000-0000-0000-0000-000000091001')->'accounts')<>3 then raise exception 'cross-academy target allowed'; end if;
end;$test$;
reset role;
update public.app_developers set is_active=false where user_id='00000000-0000-0000-0000-000000091001';
set local role service_role;
do $test$ begin
  begin perform public.get_test_login_context('00000000-0000-0000-0000-000000091001'); raise exception 'inactive developer lab allowed'; exception when insufficient_privilege then null; end;
end;$test$;
rollback;
\echo 'SQL 091 sync and test login role matrix: ok'
