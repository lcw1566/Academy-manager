\set ON_ERROR_STOP on

-- SQL 084 changes policy evaluation shape, not authorization meaning. This
-- transaction verifies the affected exam_results/student_events policies for
-- each relevant identity and rolls every fixture back at the end.
begin;

set local session_replication_role = replica;

insert into auth.users (id, email)
values (
  '00000000-0000-0000-0000-000000001007',
  'sql-084-private@example.invalid'
);

insert into public.academies (id, name, owner_id)
values (
  '00000000-0000-0000-0000-000000000001',
  'SQL 084 local test academy',
  '00000000-0000-0000-0000-000000001001'
);

insert into public.students (id, academy_id, mode, name)
values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'academy',
  'SQL 084 test student'
);

insert into public.academy_members (academy_id, user_id, role, status)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001001', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001002', 'manager', 'active'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001003', 'teacher', 'active'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001004', 'teacher', 'active'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001006', 'teacher', 'inactive');

insert into public.academy_staff_profiles (
  academy_id,
  user_id,
  role,
  status,
  permissions
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000001004',
  'teacher',
  'active',
  '{"canManageStudents": true}'::jsonb
);

insert into public.academy_invitations (academy_id, email)
values (
  '00000000-0000-0000-0000-000000000001',
  'sql-084-invitee@example.invalid'
);

insert into public.exam_results (id, academy_id, mode, student_id, exam_name)
values (
  '00000000-0000-0000-0000-000000002001',
  '00000000-0000-0000-0000-000000000001',
  'academy',
  '00000000-0000-0000-0000-000000000101',
  'SQL 084 test exam'
);

insert into public.student_events (id, academy_id, mode, student_id, title, date)
values (
  '00000000-0000-0000-0000-000000002002',
  '00000000-0000-0000-0000-000000000001',
  'academy',
  '00000000-0000-0000-0000-000000000101',
  'SQL 084 test event',
  current_date
);

insert into public.exam_results (id, user_id, mode, exam_name)
values (
  '00000000-0000-0000-0000-000000002003',
  '00000000-0000-0000-0000-000000001007',
  'private',
  'SQL 084 private exam'
);

insert into public.student_events (id, user_id, mode, title, date)
values (
  '00000000-0000-0000-0000-000000002004',
  '00000000-0000-0000-0000-000000001007',
  'private',
  'SQL 084 private event',
  current_date
);

set local session_replication_role = origin;

create function pg_temp.assert_academy_access(p_user_id uuid, p_label text)
returns void
language plpgsql
security invoker
as $test$
declare
  v_exam_id uuid := gen_random_uuid();
  v_event_id uuid := gen_random_uuid();
  v_count integer;
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);

  select count(*) into v_count
  from public.exam_results
  where id = '00000000-0000-0000-0000-000000002001';
  if v_count <> 1 then
    raise exception '% could not select academy exam result', p_label;
  end if;

  select count(*) into v_count
  from public.student_events
  where id = '00000000-0000-0000-0000-000000002002';
  if v_count <> 1 then
    raise exception '% could not select academy student event', p_label;
  end if;

  insert into public.exam_results (id, academy_id, mode, student_id, exam_name)
  values (
    v_exam_id,
    '00000000-0000-0000-0000-000000000001',
    'academy',
    '00000000-0000-0000-0000-000000000101',
    p_label || ' write test'
  );
  update public.exam_results set memo = 'updated' where id = v_exam_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception '% could not update exam result', p_label; end if;
  delete from public.exam_results where id = v_exam_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception '% could not delete exam result', p_label; end if;

  insert into public.student_events (id, academy_id, mode, student_id, title, date)
  values (
    v_event_id,
    '00000000-0000-0000-0000-000000000001',
    'academy',
    '00000000-0000-0000-0000-000000000101',
    p_label || ' write test',
    current_date
  );
  update public.student_events set memo = 'updated' where id = v_event_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception '% could not update student event', p_label; end if;
  delete from public.student_events where id = v_event_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception '% could not delete student event', p_label; end if;
end;
$test$;

create function pg_temp.assert_academy_denied(p_user_id uuid, p_label text)
returns void
language plpgsql
security invoker
as $test$
declare
  v_count integer;
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);

  select count(*) into v_count
  from public.exam_results
  where id = '00000000-0000-0000-0000-000000002001';
  if v_count <> 0 then raise exception '% could select academy exam result', p_label; end if;

  select count(*) into v_count
  from public.student_events
  where id = '00000000-0000-0000-0000-000000002002';
  if v_count <> 0 then raise exception '% could select academy student event', p_label; end if;

  begin
    insert into public.exam_results (academy_id, mode, student_id, exam_name)
    values (
      '00000000-0000-0000-0000-000000000001',
      'academy',
      '00000000-0000-0000-0000-000000000101',
      p_label || ' forbidden write'
    );
    raise exception '% could insert academy exam result', p_label;
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.student_events (academy_id, mode, student_id, title, date)
    values (
      '00000000-0000-0000-0000-000000000001',
      'academy',
      '00000000-0000-0000-0000-000000000101',
      p_label || ' forbidden write',
      current_date
    );
    raise exception '% could insert academy student event', p_label;
  exception when insufficient_privilege then
    null;
  end;

  update public.exam_results set memo = p_label
  where id = '00000000-0000-0000-0000-000000002001';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception '% could update academy exam result', p_label; end if;

  delete from public.student_events
  where id = '00000000-0000-0000-0000-000000002002';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception '% could delete academy student event', p_label; end if;
end;
$test$;

set local role authenticated;
select pg_temp.assert_academy_access('00000000-0000-0000-0000-000000001001', 'owner');
select pg_temp.assert_academy_access('00000000-0000-0000-0000-000000001002', 'manager');
select pg_temp.assert_academy_access('00000000-0000-0000-0000-000000001003', 'teacher');
select pg_temp.assert_academy_access('00000000-0000-0000-0000-000000001004', 'delegated staff');
select pg_temp.assert_academy_denied('00000000-0000-0000-0000-000000001005', 'invitation recipient');
select pg_temp.assert_academy_denied('00000000-0000-0000-0000-000000001006', 'inactive member');

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000001007',
  true
);

do $test$
declare
  v_count integer;
  v_exam_id uuid := gen_random_uuid();
  v_event_id uuid := gen_random_uuid();
begin
  select count(*) into v_count from public.exam_results
  where id = '00000000-0000-0000-0000-000000002003';
  if v_count <> 1 then raise exception 'private owner could not select own exam result'; end if;

  select count(*) into v_count from public.student_events
  where id = '00000000-0000-0000-0000-000000002004';
  if v_count <> 1 then raise exception 'private owner could not select own student event'; end if;

  insert into public.exam_results (id, user_id, mode, exam_name)
  values (v_exam_id, auth.uid(), 'private', 'private write test');
  update public.exam_results set memo = 'updated' where id = v_exam_id;
  delete from public.exam_results where id = v_exam_id;

  insert into public.student_events (id, user_id, mode, title, date)
  values (v_event_id, auth.uid(), 'private', 'private write test', current_date);
  update public.student_events set memo = 'updated' where id = v_event_id;
  delete from public.student_events where id = v_event_id;
end;
$test$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  v_count integer;
begin
  begin
    select count(*) into v_count from public.exam_results
    where id in (
      '00000000-0000-0000-0000-000000002001',
      '00000000-0000-0000-0000-000000002003'
    );
    if v_count <> 0 then raise exception 'unauthenticated user could select exam results'; end if;
  exception when insufficient_privilege then
    null;
  end;

  begin
    select count(*) into v_count from public.student_events
    where id in (
      '00000000-0000-0000-0000-000000002002',
      '00000000-0000-0000-0000-000000002004'
    );
    if v_count <> 0 then raise exception 'unauthenticated user could select student events'; end if;
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.exam_results (mode, exam_name)
    values ('private', 'unauthenticated forbidden write');
    raise exception 'unauthenticated user could insert exam result';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.student_events (mode, title, date)
    values ('private', 'unauthenticated forbidden write', current_date);
    raise exception 'unauthenticated user could insert student event';
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
  from pg_policy as policy
  join pg_class as relation on relation.oid = policy.polrelid
  join pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in ('exam_results', 'student_events')
    and policy.polcmd = '*';
  if v_count <> 0 then raise exception 'FOR ALL policy still overlaps SELECT'; end if;
end;
$test$;

rollback;

\echo 'SQL 084 RLS role matrix: ok'
