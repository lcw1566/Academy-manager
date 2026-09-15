\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-' || lpad((88000 + i)::text, 12, '0'))::uuid,
  'qr-audit-' || i || '@example.invalid' from generate_series(1, 7) i;
insert into public.academies (id, name, owner_id, attendance_qr_token, student_check_method)
values ('00000000-0000-0000-0000-000000088100', 'QR test academy', '00000000-0000-0000-0000-000000088001', 'synthetic-generation', 'qr');
insert into public.academy_members (academy_id, user_id, role, status)
select '00000000-0000-0000-0000-000000088100', ('00000000-0000-0000-0000-' || lpad((88000+i)::text,12,'0'))::uuid,
  case i when 1 then 'owner' when 2 then 'manager' else 'teacher' end,
  case i when 5 then 'invited' when 6 then 'inactive' else 'active' end
from generate_series(1,6) i;
insert into public.academy_staff_profiles (academy_id,user_id,role,status,permissions)
select '00000000-0000-0000-0000-000000088100', user_id,
 case role when 'owner' then 'teacher' else role end, 'active',
 case when user_id = '00000000-0000-0000-0000-000000088003' then '{"canEditAttendance":false}'::jsonb
 else '{"canEditAttendance":true}'::jsonb end
from public.academy_members where academy_id='00000000-0000-0000-0000-000000088100';
insert into public.students (id,academy_id,mode,name,checkin_pin,phone,parent_phone,parent_name)
values ('00000000-0000-0000-0000-000000088101','00000000-0000-0000-0000-000000088100','academy','Synthetic QR student','9182','synthetic-phone','synthetic-parent-phone','Synthetic guardian');
set local session_replication_role = origin;

create function pg_temp.check_issuer(i integer, allowed boolean) returns void language plpgsql as $$
declare result jsonb;
begin
 perform set_config('request.jwt.claim.sub', ('00000000-0000-0000-0000-' || lpad((88000+i)::text,12,'0')), true);
 begin
  result := public.issue_academy_checkin_qr('00000000-0000-0000-0000-000000088100');
  if not allowed then raise exception 'unauthorized role issued QR: %', i; end if;
 exception when insufficient_privilege then
  if allowed then raise exception 'authorized role could not issue QR: %', i; end if;
 end;
end;
$$;
set local role authenticated;
select pg_temp.check_issuer(1,true); -- owner
select pg_temp.check_issuer(2,true); -- manager
select pg_temp.check_issuer(3,false); -- teacher without attendance editing
select pg_temp.check_issuer(4,true); -- delegated staff
select pg_temp.check_issuer(5,false); -- invitation recipient
select pg_temp.check_issuer(6,false); -- inactive
select pg_temp.check_issuer(7,false); -- outsider
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000088001',true);
select set_config('test.qr',public.issue_academy_checkin_qr('00000000-0000-0000-0000-000000088100')::text,true) is not null;
do $$ begin
 begin
  perform public.issue_academy_checkin_qr('00000000-0000-0000-0000-000000088999');
  raise exception 'cross-academy issuance allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform token from public.academy_checkin_nonces;
  raise exception 'direct nonce read allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$
declare q jsonb := current_setting('test.qr')::jsonb; r record; n integer;
begin
 begin
  perform public.issue_academy_checkin_qr((q->>'academyId')::uuid);
  raise exception 'anonymous issuance allowed';
 exception when insufficient_privilege then null; end;
 select * into r from public.public_student_checkin((q->>'academyId')::uuid,q->>'token','9182',null);
 if r.ok then raise exception 'omitted expiry allowed'; end if;
 select * into r from public.public_student_checkin((q->>'academyId')::uuid,q->>'token','9182',(q->>'expiresAt')::bigint+3600);
 if r.ok then raise exception 'forged expiry allowed'; end if;
 select * into r from public.public_student_checkin((q->>'academyId')::uuid,'synthetic-generation','9182',(q->>'expiresAt')::bigint);
 if r.ok then raise exception 'legacy static QR allowed'; end if;
 select * into r from public.public_student_checkin('00000000-0000-0000-0000-000000088999',q->>'token','9182',(q->>'expiresAt')::bigint);
 if r.ok then raise exception 'cross-academy QR allowed'; end if;
 select * into r from public.public_student_checkin((q->>'academyId')::uuid,q->>'token','9182',(q->>'expiresAt')::bigint);
 if not r.ok then raise exception 'valid QR failed: %', r.message; end if;
 select * into r from public.public_student_checkin((q->>'academyId')::uuid,q->>'token','9182',(q->>'expiresAt')::bigint);
 if r.message <> 'duplicate' then raise exception 'duplicate protection lost'; end if;
 for n in 1..30 loop
  select * into r from public.public_student_checkin((q->>'academyId')::uuid,q->>'token','0000',(q->>'expiresAt')::bigint);
  if r.message <> 'pin_not_found' then raise exception 'unexpected PIN result'; end if;
 end loop;
 select * into r from public.public_student_checkin((q->>'academyId')::uuid,q->>'token','9182',(q->>'expiresAt')::bigint);
 if r.message <> 'rate_limited' then raise exception 'PIN budget not enforced'; end if;
end $$;
reset role;
-- Refreshing the QR must not reset the academy-wide failed PIN budget.
delete from public.academy_checkin_nonces where academy_id='00000000-0000-0000-0000-000000088100';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000088001',true);
select set_config('test.qr',public.issue_academy_checkin_qr('00000000-0000-0000-0000-000000088100')::text,true) is not null;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare q jsonb := current_setting('test.qr')::jsonb; r record;
begin
 select * into r from public.public_student_checkin((q->>'academyId')::uuid,q->>'token','9182',(q->>'expiresAt')::bigint);
 if r.message <> 'rate_limited' then raise exception 'QR refresh reset PIN budget'; end if;
end $$;
reset role;
update public.academy_checkin_limits set window_start=now()-interval '6 minutes' where academy_id='00000000-0000-0000-0000-000000088100';
set local role anon;
do $$ declare q jsonb := current_setting('test.qr')::jsonb; r record;
begin
 select * into r from public.public_student_checkin((q->>'academyId')::uuid,q->>'token','9182',(q->>'expiresAt')::bigint);
 if not r.ok then raise exception 'PIN budget did not recover'; end if;
end $$;
reset role;
update public.academy_checkin_nonces set expires_at=1 where academy_id='00000000-0000-0000-0000-000000088100';
set local role anon;
do $$ declare q jsonb := current_setting('test.qr')::jsonb; r record;
begin
 select * into r from public.public_student_checkin((q->>'academyId')::uuid,q->>'token','9182',1);
 if r.message <> 'expired_qr' then raise exception 'server expiry ignored'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000088001',true);
select set_config('test.qr',public.issue_academy_checkin_qr('00000000-0000-0000-0000-000000088100')::text,true) is not null;
reset role;
update public.academies set student_check_method='disabled' where id='00000000-0000-0000-0000-000000088100';
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare q jsonb := current_setting('test.qr')::jsonb; r record;
begin
 select * into r from public.public_student_checkin((q->>'academyId')::uuid,q->>'token','9182',(q->>'expiresAt')::bigint);
 if r.ok then raise exception 'disabled QR accepted'; end if;
end $$;
reset role;
update public.academies set student_check_method='qr',attendance_qr_token='rotated-generation' where id='00000000-0000-0000-0000-000000088100';
set local role anon;
do $$ declare q jsonb := current_setting('test.qr')::jsonb; r record;
begin
 select * into r from public.public_student_checkin((q->>'academyId')::uuid,q->>'token','9182',(q->>'expiresAt')::bigint);
 if r.ok then raise exception 'revoked QR accepted'; end if;
end $$;
reset role;
rollback;
\echo SQL 088 secure public check-in: ok
