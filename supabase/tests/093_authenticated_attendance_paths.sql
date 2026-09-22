\set ON_ERROR_STOP on
begin;

set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000093001', 'owner-093@example.invalid'),
  ('00000000-0000-0000-0000-000000093002', 'manager-093@example.invalid'),
  ('00000000-0000-0000-0000-000000093003', 'teacher-093@example.invalid'),
  ('00000000-0000-0000-0000-000000093004', 'qr-093@example.invalid'),
  ('00000000-0000-0000-0000-000000093005', 'invited-093@example.invalid'),
  ('00000000-0000-0000-0000-000000093006', 'inactive-093@example.invalid'),
  ('00000000-0000-0000-0000-000000093007', 'outsider-093@example.invalid');
insert into public.academies (
  id, name, owner_id, staff_check_method, attendance_qr_token
) values
  ('00000000-0000-0000-0000-000000093100', 'Attendance A',
   '00000000-0000-0000-0000-000000093001', 'manual', 'generation-093'),
  ('00000000-0000-0000-0000-000000093200', 'Attendance B',
   '00000000-0000-0000-0000-000000093007', 'qr', 'generation-093-b');
insert into public.academy_members (academy_id, user_id, role, status) values
  ('00000000-0000-0000-0000-000000093100', '00000000-0000-0000-0000-000000093001', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000093100', '00000000-0000-0000-0000-000000093002', 'manager', 'active'),
  ('00000000-0000-0000-0000-000000093100', '00000000-0000-0000-0000-000000093003', 'teacher', 'active'),
  ('00000000-0000-0000-0000-000000093100', '00000000-0000-0000-0000-000000093004', 'teacher', 'active'),
  ('00000000-0000-0000-0000-000000093100', '00000000-0000-0000-0000-000000093005', 'teacher', 'invited'),
  ('00000000-0000-0000-0000-000000093100', '00000000-0000-0000-0000-000000093006', 'teacher', 'inactive'),
  ('00000000-0000-0000-0000-000000093200', '00000000-0000-0000-0000-000000093007', 'owner', 'active');
insert into public.students (id, academy_id, mode, name, status) values
  ('00000000-0000-0000-0000-000000093101', '00000000-0000-0000-0000-000000093100', 'academy', 'Active A', 'active'),
  ('00000000-0000-0000-0000-000000093102', '00000000-0000-0000-0000-000000093100', 'academy', 'Inactive A', 'inactive'),
  ('00000000-0000-0000-0000-000000093201', '00000000-0000-0000-0000-000000093200', 'academy', 'Active B', 'active');
insert into public.academy_checkin_nonces (
  academy_id, issued_at, expires_at, token, generation_token
) values (
  '00000000-0000-0000-0000-000000093100',
  extract(epoch from clock_timestamp())::bigint,
  extract(epoch from clock_timestamp())::bigint + 120,
  'valid-staff-qr-093', 'generation-093'
);
set local session_replication_role = origin;
select set_config(
  'test.staff_qr_expiry',
  (select expires_at::text from public.academy_checkin_nonces where token = 'valid-staff-qr-093'),
  true
);

create function pg_temp.assert(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'attendance test failed: %', p_label; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000093003', true);

do $$ begin
  begin
    insert into public.student_check_events (academy_id, student_id, event_type, source, created_by)
    values ('00000000-0000-0000-0000-000000093100', '00000000-0000-0000-0000-000000093101',
      'check_in', 'teacher_manual', auth.uid());
    raise exception 'direct student event insert succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.staff_attendance_logs (
      academy_id, staff_user_id, staff_role, work_date, actual_start_time, source
    ) values (
      '00000000-0000-0000-0000-000000093100', auth.uid(), 'teacher', current_date - 10, '00:01', 'manual'
    );
    raise exception 'direct staff attendance insert succeeded';
  exception when insufficient_privilege then null; end;
end $$;

select pg_temp.assert(
  (public.record_student_manual_check_event(
    '00000000-0000-0000-0000-000000093100',
    '00000000-0000-0000-0000-000000093101',
    'check_in', clock_timestamp(), null
  )).created_by = auth.uid(),
  'authorized manual student event'
);

do $$ begin
  begin
    perform public.record_student_manual_check_event(
      '00000000-0000-0000-0000-000000093100',
      '00000000-0000-0000-0000-000000093201',
      'check_in', clock_timestamp(), null
    );
    raise exception 'cross-academy student event succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_student_manual_check_event(
      '00000000-0000-0000-0000-000000093100',
      '00000000-0000-0000-0000-000000093102',
      'check_in', clock_timestamp(), null
    );
    raise exception 'inactive student event succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_student_manual_check_event(
      '00000000-0000-0000-0000-000000093100',
      '00000000-0000-0000-0000-000000093101',
      'check_in', clock_timestamp() + interval '1 day', null
    );
    raise exception 'future student event succeeded';
  exception when invalid_parameter_value then null; end;
end $$;

-- A regular staff member cannot backdate their own payable attendance through
-- the manual source; the server replaces both date and time.
select pg_temp.assert(
  (public.record_staff_attendance(
    '00000000-0000-0000-0000-000000093100',
    '00000000-0000-0000-0000-000000093003',
    'manager', current_date - 10, 'clock_in', '00:01', null, null, 999,
    'manual', null, null
  )->>'work_date')::date = (clock_timestamp() at time zone 'Asia/Seoul')::date,
  'self attendance uses server date'
);
select pg_temp.assert(
  (select actual_start_time <> '00:01' and staff_role = 'teacher' and break_minutes = 0
   from public.staff_attendance_logs
   where academy_id = '00000000-0000-0000-0000-000000093100'
     and staff_user_id = '00000000-0000-0000-0000-000000093003'),
  'self attendance ignores caller time role and break'
);

reset role;
update public.academies set staff_check_method = 'qr'
where id = '00000000-0000-0000-0000-000000093100';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000093003', true);
do $$ begin
  begin
    perform public.record_staff_attendance(
      '00000000-0000-0000-0000-000000093100', auth.uid(), 'teacher', current_date,
      'clock_out', '23:59', null, null, 0, 'manual', null, null
    );
    raise exception 'staff bypassed QR mode with a manual call';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000093004', true);
do $$
declare
  v_expiry bigint;
  v_first jsonb;
  v_replay jsonb;
begin
  v_expiry := current_setting('test.staff_qr_expiry')::bigint;
  begin
    perform public.record_staff_attendance(
      '00000000-0000-0000-0000-000000093100', auth.uid(), 'teacher', current_date,
      'toggle', 'forged', null, null, 0, 'qr', 'invalid', v_expiry
    );
    raise exception 'invalid QR recorded staff attendance';
  exception when insufficient_privilege then null; end;
  v_first := public.record_staff_attendance(
    '00000000-0000-0000-0000-000000093100', auth.uid(), 'manager', current_date - 2,
    'toggle', 'forged', null, null, 0, 'qr', 'valid-staff-qr-093', v_expiry
  );
  perform pg_temp.assert(v_first->>'_attendance_action' = 'clock_in', 'valid QR clock in');
  perform pg_temp.assert((v_first->>'work_date')::date = (clock_timestamp() at time zone 'Asia/Seoul')::date,
    'QR uses server date');
  perform pg_temp.assert(v_first->>'staff_role' = 'teacher', 'QR ignores caller role');
  v_replay := public.record_staff_attendance(
    '00000000-0000-0000-0000-000000093100', auth.uid(), 'teacher', current_date,
    'toggle', '23:59', null, null, 0, 'qr', 'valid-staff-qr-093', v_expiry
  );
  perform pg_temp.assert(v_replay->>'_attendance_action' = 'already_clocked_in', 'immediate QR replay');
end $$;

reset role;
update public.staff_attendance_logs
set updated_at = clock_timestamp() - interval '9 seconds',
    actual_start_time = to_char(clock_timestamp() at time zone 'Asia/Seoul' - interval '1 minute', 'HH24:MI')
where academy_id = '00000000-0000-0000-0000-000000093100'
  and staff_user_id = '00000000-0000-0000-0000-000000093004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000093004', true);
do $$ begin
  begin
    perform public.record_staff_attendance(
      '00000000-0000-0000-0000-000000093100', auth.uid(), 'teacher', current_date,
      'toggle', '23:59', null, null, 0, 'qr',
      'valid-staff-qr-093', current_setting('test.staff_qr_expiry')::bigint
    );
    raise exception 'QR replay after 8 seconds clocked out';
  exception when insufficient_privilege then null; end;
end $$;

-- An operations manager may explicitly correct another active staff member,
-- but may not label the correction as a QR scan.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000093002', true);
select pg_temp.assert(
  (public.record_staff_attendance(
    '00000000-0000-0000-0000-000000093100',
    '00000000-0000-0000-0000-000000093004',
    'teacher', current_date - 3, 'clock_in', '09:10', null, null, 0,
    'manual', null, null
  )->>'actual_start_time') = '09:10',
  'manager manual correction'
);
do $$ begin
  begin
    perform public.record_staff_attendance(
      '00000000-0000-0000-0000-000000093100',
      '00000000-0000-0000-0000-000000093003',
      'teacher', current_date, 'toggle', '09:00', null, null, 0,
      'qr', 'valid-staff-qr-093', extract(epoch from clock_timestamp())::bigint + 120
    );
    raise exception 'manager forged another staff QR';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_staff_attendance(
      '00000000-0000-0000-0000-000000093100',
      '00000000-0000-0000-0000-000000093007',
      'teacher', current_date, 'clock_in', '09:00', null, null, 0,
      'manual', null, null
    );
    raise exception 'cross-academy staff attendance succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_staff_attendance(
      '00000000-0000-0000-0000-000000093100',
      '00000000-0000-0000-0000-000000093006',
      'teacher', current_date, 'clock_in', '09:00', null, null, 0,
      'manual', null, null
    );
    raise exception 'inactive staff attendance succeeded';
  exception when insufficient_privilege then null; end;
end $$;

-- Invited, inactive and unrelated users cannot use either attendance RPC.
do $$
declare v_user uuid;
begin
  foreach v_user in array array[
    '00000000-0000-0000-0000-000000093005'::uuid,
    '00000000-0000-0000-0000-000000093006'::uuid,
    '00000000-0000-0000-0000-000000093007'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    begin
      perform public.record_student_manual_check_event(
        '00000000-0000-0000-0000-000000093100',
        '00000000-0000-0000-0000-000000093101',
        'check_in', clock_timestamp(), null
      );
      raise exception 'unauthorized manual student event: %', v_user;
    exception when insufficient_privilege then null; end;
    begin
      perform public.record_staff_attendance(
        '00000000-0000-0000-0000-000000093100', v_user, 'teacher', current_date,
        'clock_in', '09:00', null, null, 0, 'manual', null, null
      );
      raise exception 'unauthorized staff attendance: %', v_user;
    exception when insufficient_privilege then null; end;
  end loop;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform public.record_student_manual_check_event(
      '00000000-0000-0000-0000-000000093100',
      '00000000-0000-0000-0000-000000093101',
      'check_in', clock_timestamp(), null
    );
    raise exception 'anonymous student attendance succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_staff_attendance(
      '00000000-0000-0000-0000-000000093100',
      '00000000-0000-0000-0000-000000093003',
      'teacher', current_date, 'clock_in', '09:00', null, null, 0, 'manual', null, null
    );
    raise exception 'anonymous staff attendance succeeded';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
\echo 'SQL 093 authenticated attendance paths: ok'
