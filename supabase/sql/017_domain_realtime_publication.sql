-- Add academy domain tables to Supabase Realtime publication.
-- This lets another web/app client refresh its local academy cache when core
-- data changes on a different device.

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'students',
    'class_groups',
    'class_sessions',
    'lesson_records',
    'attendance_records',
    'clinic_records',
    'payments',
    'payrolls',
    'academy_staff_shifts',
    'student_check_events',
    'class_schedule_rules',
    'class_session_exceptions'
  ]
  loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = v_table_name
    )
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table_name);
    end if;
  end loop;
end $$;
