\set ON_ERROR_STOP on
begin;
-- Exercise the actual migration, with synthetic data, then roll everything back.
create function pg_temp.run_private_retirement() returns void language plpgsql as $test$
begin
  execute $migration$
-- @include-migration 20260914164501_retire_private_workspace.sql
$migration$;
end;
$test$;
set local session_replication_role = replica;
do $fixture$
declare
  t text;
  extras text;
  vals text;
begin
  foreach t in array array['attendance_records','clinic_records','exam_results','lesson_records',
    'payments','payrolls','student_events','class_sessions','class_groups','students'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_mode_check');
    extras := ''; vals := '';
    case
      when t in ('students','class_groups') then extras := ', name'; vals := ', ''Synthetic retirement fixture''';
      when t in ('class_sessions','clinic_records') then extras := ', date'; vals := ', current_date';
      when t = 'student_events' then extras := ', title, date'; vals := ', ''Synthetic event'', current_date';
      when t = 'payments' then extras := ', month'; vals := ', ''2099-01''';
      when t = 'payrolls' then extras := ', month, staff_id, staff_type'; vals := ', ''2099-01'', ''synthetic'', ''teacher''';
      else null;
    end case;
    execute format('insert into public.%I (id, mode%s) values (''00000000-0000-0000-0000-000000089001'', ''private''%s), (''00000000-0000-0000-0000-000000089002'', ''academy''%s)', t, extras, vals, vals);
  end loop;
end;
$fixture$;
-- An academy payment referencing a private student must prevent any deletion.
update public.payments set student_id = '00000000-0000-0000-0000-000000089001'
where id = '00000000-0000-0000-0000-000000089002';
set local session_replication_role = origin;
do $safety$
begin
  begin
    perform pg_temp.run_private_retirement();
    raise exception 'Expected linked academy data to prevent retirement';
  exception when raise_exception then
    if sqlerrm not like 'Non-private dependent rows in constraint %' then raise; end if;
  end;
  if not exists(select 1 from public.students where id = '00000000-0000-0000-0000-000000089001') then
    raise exception 'Safety failure deleted private fixture';
  end if;
end;
$safety$;
update public.payments set student_id = null where id = '00000000-0000-0000-0000-000000089002';
-- Connect the private records to verify dependency-safe deletion.
update public.payments set student_id = '00000000-0000-0000-0000-000000089001'
where id = '00000000-0000-0000-0000-000000089001';
select pg_temp.run_private_retirement();
select pg_temp.run_private_retirement(); -- forward migration is idempotent

do $verify$
declare t text; n bigint;
begin
  foreach t in array array['attendance_records','clinic_records','exam_results','lesson_records',
    'payments','payrolls','student_events','class_sessions','class_groups','students'] loop
    execute format('select count(*) from public.%I where mode = ''private''', t) into n;
    if n <> 0 then raise exception 'Private records remain in %', t; end if;
    execute format('select count(*) from public.%I where id = ''00000000-0000-0000-0000-000000089002''', t) into n;
    if n <> 1 then raise exception 'Academy fixture was deleted from %', t; end if;
    begin
      execute format('update public.%I set mode = ''private'' where id = ''00000000-0000-0000-0000-000000089002''', t);
      raise exception 'Private recreation allowed in %', t;
    exception when check_violation then null;
    end;
  end loop;
  if to_regprocedure('public.list_my_private_students_secure()') is not null then raise exception 'Private RPC remains'; end if;
end;
$verify$;
rollback;
\echo SQL 089 private retirement: ok
