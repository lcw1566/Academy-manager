\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
insert into auth.users (id,email)
select ('00000000-0000-0000-0000-'||lpad((90000+i)::text,12,'0'))::uuid,
  'push-audit-'||i||'@example.invalid' from generate_series(1,7) i;
insert into public.academies(id,name,owner_id) values
('00000000-0000-0000-0000-000000090100','Push test A','00000000-0000-0000-0000-000000090001'),
('00000000-0000-0000-0000-000000090200','Push test B','00000000-0000-0000-0000-000000090001');
insert into public.academy_members(academy_id,user_id,role,status)
select '00000000-0000-0000-0000-000000090100',
 ('00000000-0000-0000-0000-'||lpad((90000+i)::text,12,'0'))::uuid,
 case i when 1 then 'owner' when 2 then 'manager' else 'teacher' end,
 case i when 5 then 'invited' when 6 then 'inactive' else 'active' end
from generate_series(1,6) i;
insert into public.academy_members(academy_id,user_id,role,status)
values ('00000000-0000-0000-0000-000000090200','00000000-0000-0000-0000-000000090001','owner','active');
insert into public.academy_staff_profiles(academy_id,user_id,role,status,permissions)
select academy_id,user_id,'teacher','active',case when user_id='00000000-0000-0000-0000-000000090004'
 then '{"canManageStudents":true}'::jsonb else '{}'::jsonb end
from public.academy_members where academy_id='00000000-0000-0000-0000-000000090100';
insert into public.academy_chat_threads(id,academy_id,kind,group_scope,dm_user_a,dm_user_b)
values
('00000000-0000-0000-0000-000000090101','00000000-0000-0000-0000-000000090100','group','academy',null,null),
('00000000-0000-0000-0000-000000090102','00000000-0000-0000-0000-000000090100','group','custom',null,null),
('00000000-0000-0000-0000-000000090103','00000000-0000-0000-0000-000000090100','dm','academy','00000000-0000-0000-0000-000000090001','00000000-0000-0000-0000-000000090006');
insert into public.academy_chat_thread_members(thread_id,user_id)
select '00000000-0000-0000-0000-000000090102',
 ('00000000-0000-0000-0000-'||lpad((90000+i)::text,12,'0'))::uuid from unnest(array[1,2,5,6,7]) i;
insert into public.push_devices(id,user_id,token,platform,provider)
select ('00000000-0000-0000-0000-'||lpad((90400+i)::text,12,'0'))::uuid,
 ('00000000-0000-0000-0000-'||lpad((90000+i)::text,12,'0'))::uuid,
 'synthetic-token-'||i, 'android','fcm' from generate_series(1,7) i;
insert into public.academy_chat_messages(id,academy_id,thread_id,sender_id,body)
select ('00000000-0000-0000-0000-'||lpad((90300+i)::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000090100','00000000-0000-0000-0000-000000090101',
 ('00000000-0000-0000-0000-'||lpad((90000+i)::text,12,'0'))::uuid,'synthetic private body'
from generate_series(1,7) i;
set local session_replication_role = origin;

create function pg_temp.uid(i integer) returns uuid language sql immutable as $$
 select ('00000000-0000-0000-0000-'||lpad((90000+i)::text,12,'0'))::uuid;
$$;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'push test failed: %',label; end if; end;
$$;
create function pg_temp.check_role(i integer, allowed boolean) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',pg_temp.uid(i)::text,true);
 perform pg_temp.assert(public.can_access_chat_thread(pg_temp.uid(101))=allowed,'thread role '||i);
 perform pg_temp.assert(exists(select 1 from public.academy_chat_messages where id=pg_temp.uid(301))=allowed,'read role '||i);
 begin
  insert into public.academy_chat_messages(academy_id,thread_id,sender_id,body,created_at)
  values(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(i),'synthetic',now()+interval '1 year');
  perform pg_temp.assert(allowed,'insert role '||i);
 exception when insufficient_privilege then perform pg_temp.assert(not allowed,'denied insert role '||i); end;
 begin
  perform public.claim_chat_push(pg_temp.uid(301),pg_temp.uid(1));
  raise exception 'authenticated claimed service-only push';
 exception when insufficient_privilege then null; end;
 begin
  perform * from public.get_chat_push_device(pg_temp.uid(301),pg_temp.uid(1),pg_temp.uid(402),pg_temp.uid(2));
  raise exception 'authenticated read push token';
 exception when insufficient_privilege then null; end;
end;
$$;
set local role authenticated;
select pg_temp.check_role(1,true);
select pg_temp.check_role(2,true);
select pg_temp.check_role(3,true);
select pg_temp.check_role(4,true); -- delegated contact permission does not expand rooms
select pg_temp.check_role(5,false);
select pg_temp.check_role(6,false);
select pg_temp.check_role(7,false);
select set_config('request.jwt.claim.sub',pg_temp.uid(1)::text,true);
do $$ begin
 begin
  insert into public.academy_chat_messages(academy_id,thread_id,sender_id,body)
  values(pg_temp.uid(200),pg_temp.uid(101),pg_temp.uid(1),'cross academy');
  raise exception 'mismatched academy accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.academy_chat_messages(academy_id,thread_id,sender_id,body)
  values(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(2),'forged sender');
  raise exception 'forged sender accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform * from public.chat_push_dispatches;
  raise exception 'dispatch receipts exposed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.chat_user_can_access(pg_temp.uid(101),pg_temp.uid(2));
  raise exception 'internal access probe exposed';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin
  perform public.claim_chat_push(pg_temp.uid(301),pg_temp.uid(1));
  raise exception 'anon claimed push';
 exception when insufficient_privilege then null; end;
 begin
  perform * from public.get_chat_push_device(pg_temp.uid(301),pg_temp.uid(1),pg_temp.uid(402),pg_temp.uid(2));
  raise exception 'anon read device';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.assert(not exists(select 1 from public.academy_chat_messages where created_at>now()+interval '1 minute'),'server timestamp');

create function pg_temp.check_claim(i integer, allowed boolean) returns void language plpgsql as $$
declare p jsonb;
begin
 begin
  p:=public.claim_chat_push(pg_temp.uid(300+i),pg_temp.uid(i));
  perform pg_temp.assert(allowed and (p->>'claimed')::boolean,'claim role '||i);
  perform pg_temp.assert(jsonb_array_length(p->'devices')=3,'only active peers');
  perform pg_temp.assert(not (p->'devices'->0 ? 'token'),'claim excludes token');
 exception when insufficient_privilege then perform pg_temp.assert(not allowed,'denied claim role '||i); end;
end;
$$;
set local role service_role;
select pg_temp.check_claim(1,true);
select pg_temp.check_claim(2,true);
select pg_temp.check_claim(3,true);
select pg_temp.check_claim(4,true);
select pg_temp.check_claim(5,false);
select pg_temp.check_claim(6,false);
select pg_temp.check_claim(7,false);
select pg_temp.assert(public.claim_chat_push(pg_temp.uid(301),pg_temp.uid(1))->>'reason'='duplicate','duplicate claim');
select pg_temp.assert((select count(*)=1 from public.get_chat_push_device(pg_temp.uid(301),pg_temp.uid(1),pg_temp.uid(402),pg_temp.uid(2))),'active delivery');
select pg_temp.assert((select count(*)=0 from public.get_chat_push_device(pg_temp.uid(301),pg_temp.uid(1),pg_temp.uid(402),pg_temp.uid(3))),'device ownership mismatch');
do $$ begin
 begin
  perform public.claim_chat_push(pg_temp.uid(301),pg_temp.uid(2));
  raise exception 'wrong sender accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Membership and token ownership changes AFTER the claim must block delivery.
update public.academy_members set status='inactive' where academy_id=pg_temp.uid(100) and user_id=pg_temp.uid(2);
set local role service_role;
select pg_temp.assert((select count(*)=0 from public.get_chat_push_device(pg_temp.uid(301),pg_temp.uid(1),pg_temp.uid(402),pg_temp.uid(2))),'recipient exited');
reset role;
update public.academy_members set status='active' where academy_id=pg_temp.uid(100) and user_id=pg_temp.uid(2);
update public.push_devices set enabled=false where id=pg_temp.uid(402);
set local role service_role;
select pg_temp.assert((select count(*)=0 from public.get_chat_push_device(pg_temp.uid(301),pg_temp.uid(1),pg_temp.uid(402),pg_temp.uid(2))),'logged out device');
reset role;
update public.push_devices set enabled=true,user_id=pg_temp.uid(3) where id=pg_temp.uid(402);
set local role service_role;
select pg_temp.assert((select count(*)=0 from public.get_chat_push_device(pg_temp.uid(301),pg_temp.uid(1),pg_temp.uid(402),pg_temp.uid(2))),'reassigned device');
reset role;
update public.push_devices set user_id=pg_temp.uid(2) where id=pg_temp.uid(402);
update public.academy_members set status='inactive' where academy_id=pg_temp.uid(100) and user_id=pg_temp.uid(1);
set local role service_role;
select pg_temp.assert((select count(*)=0 from public.get_chat_push_device(pg_temp.uid(301),pg_temp.uid(1),pg_temp.uid(402),pg_temp.uid(2))),'sender exited');
reset role;
update public.academy_members set status='active' where academy_id=pg_temp.uid(100) and user_id=pg_temp.uid(1);

-- A stale custom membership / DM pointer must not include inactive or foreign users.
insert into public.academy_chat_messages(id,academy_id,thread_id,sender_id,body)
select pg_temp.uid(500+i),pg_temp.uid(100),pg_temp.uid(101+i),pg_temp.uid(1),'synthetic' from generate_series(1,2) i;
set local role service_role;
select pg_temp.assert(jsonb_array_length(public.claim_chat_push(pg_temp.uid(501),pg_temp.uid(1))->'devices')=1,'custom active participant only');
select pg_temp.assert(jsonb_array_length(public.claim_chat_push(pg_temp.uid(502),pg_temp.uid(1))->'devices')=0,'inactive DM recipient');
reset role;
delete from public.academy_chat_thread_members where thread_id=pg_temp.uid(102) and user_id=pg_temp.uid(2);
set local role service_role;
select pg_temp.assert((select count(*)=0 from public.get_chat_push_device(pg_temp.uid(501),pg_temp.uid(1),pg_temp.uid(402),pg_temp.uid(2))),'removed custom member');
reset role;
insert into public.academy_chat_messages(id,academy_id,thread_id,sender_id,body)
values(pg_temp.uid(503),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1),'expired');
update public.academy_chat_messages set created_at=now()-interval '11 minutes' where id=pg_temp.uid(503);
set local role service_role;
select pg_temp.assert(public.claim_chat_push(pg_temp.uid(503),pg_temp.uid(1))->>'reason'='expired','old message replay');
reset role;
update public.academy_chat_messages set created_at=now()+interval '1 day' where id=pg_temp.uid(503);
set local role service_role;
select pg_temp.assert(public.claim_chat_push(pg_temp.uid(503),pg_temp.uid(1))->>'reason'='expired','legacy future timestamp');
reset role;
update public.academy_chat_messages set created_at=now(),academy_id=pg_temp.uid(200) where id=pg_temp.uid(503);
set local role service_role;
do $$ begin
 begin
  perform public.claim_chat_push(pg_temp.uid(503),pg_temp.uid(1));
  raise exception 'legacy cross academy message dispatched';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Disabling by token must affect only the logged-in account, without URL filters.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.uid(2)::text,true);
select public.disable_my_push_device('synthetic-token-3','fcm');
reset role;
select pg_temp.assert((select enabled from public.push_devices where id=pg_temp.uid(403)),'cannot disable another user');
set local role authenticated;
select public.disable_my_push_device('synthetic-token-2','fcm');
reset role;
select pg_temp.assert((select not enabled from public.push_devices where id=pg_temp.uid(402)),'disable own device');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin
  perform public.disable_my_push_device('synthetic-token-3','fcm');
  raise exception 'anon disabled a device';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
