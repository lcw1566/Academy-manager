-- One-time compatibility step for a fresh hosted project created with
-- "Enable automatic RLS". The baseline recreates this same event trigger.
do $bootstrap$
declare
  v_has_migrations boolean := false;
  v_function_schema text;
  v_function_name text;
  v_event text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select exists (select 1 from supabase_migrations.schema_migrations)'
      into v_has_migrations;
  end if;
  if v_has_migrations then
    raise exception 'staging bootstrap is allowed only before the first app migration';
  end if;

  select namespace.nspname, procedure.proname, trigger.evtevent
    into v_function_schema, v_function_name, v_event
  from pg_event_trigger trigger
  join pg_proc procedure on procedure.oid = trigger.evtfoid
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where trigger.evtname = 'ensure_rls';

  if not found then
    raise notice 'ensure_rls is not present; no compatibility cleanup needed';
    return;
  end if;

  if v_function_schema <> 'public'
     or v_function_name <> 'rls_auto_enable'
     or v_event <> 'ddl_command_end' then
    raise exception 'unexpected ensure_rls event trigger; refusing to drop it';
  end if;

  execute 'drop event trigger ensure_rls';
  raise notice 'removed the platform-created ensure_rls trigger; baseline will recreate it';
end;
$bootstrap$;
