-- Permanently retire private-mode domain data. No Auth users/profiles are deleted.
-- One atomic block: fail before deletion if academy data is linked to a target.
do $retire$
declare
  targets constant text[] := array['attendance_records','clinic_records','exam_results',
    'lesson_records','payments','payrolls','student_events','class_sessions','class_groups','students'];
  rel record;
  fk record;
  table_name text;
  join_clause text;
  child_is_private text;
  unsafe boolean;
  deleted_count bigint;
begin
  perform set_config('lock_timeout', '5s', true);
  -- Lock the targets and their direct dependents so a concurrent academy write
  -- cannot introduce a cascade after the safety check. Reads remain available.
  for rel in
    select distinct c.oid, n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where (n.nspname = 'public' and c.relname = any(targets))
      or c.oid in (
        select k.conrelid from pg_constraint k
        join pg_class p on p.oid = k.confrelid
        join pg_namespace pn on pn.oid = p.relnamespace
        where k.contype = 'f' and pn.nspname = 'public' and p.relname = any(targets)
      )
    order by c.oid
  loop
    execute format('lock table %I.%I in share row exclusive mode', rel.nspname, rel.relname);
  end loop;

  foreach table_name in array targets loop
    execute format('select exists(select 1 from public.%I where mode = ''private'' and academy_id is not null)', table_name) into unsafe;
    if unsafe then raise exception 'Private data has academy ownership in %. Aborting retirement.', table_name; end if;
  end loop;

  -- Protect both CASCADE and SET NULL relationships, including self references.
  for fk in
    select k.*, k.conrelid::regclass as child_table, k.confrelid::regclass as parent_table
    from pg_constraint k join pg_class p on p.oid = k.confrelid
    join pg_namespace pn on pn.oid = p.relnamespace
    where k.contype = 'f' and pn.nspname = 'public' and p.relname = any(targets)
  loop
    select string_agg(format('child.%I = parent.%I', ca.attname, pa.attname), ' and ' order by keys.ordinality)
    into join_clause
    from unnest(fk.conkey, fk.confkey) with ordinality as keys(child_key, parent_key, ordinality)
    join pg_attribute ca on ca.attrelid = fk.conrelid and ca.attnum = keys.child_key
    join pg_attribute pa on pa.attrelid = fk.confrelid and pa.attnum = keys.parent_key;
    child_is_private := 'false';
    if exists(select 1 from pg_attribute where attrelid = fk.conrelid and attname = 'mode' and not attisdropped)
      and exists(select 1 from pg_attribute where attrelid = fk.conrelid and attname = 'academy_id' and not attisdropped) then
      child_is_private := '(child.mode = ''private'' and child.academy_id is null)';
    end if;
    execute format('select exists(select 1 from %s child join %s parent on %s where parent.mode = ''private'' and (%s) is not true)',
      fk.child_table, fk.parent_table, join_clause, child_is_private) into unsafe;
    if unsafe then raise exception 'Non-private dependent rows in constraint %. Aborting retirement.', fk.conname; end if;
  end loop;

  foreach table_name in array targets loop
    execute format('delete from public.%I where mode = ''private'' and academy_id is null', table_name);
    get diagnostics deleted_count = row_count;
    raise notice 'Private retirement: % deleted % rows', table_name, deleted_count;
    -- Keep the shared schema and academy authorization intact. A database check
    -- also blocks old apps/direct REST from recreating private rows.
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_mode_check');
    execute format('alter table public.%I add constraint %I check (mode = ''academy'')', table_name, table_name || '_mode_check');
  end loop;
  execute 'drop function if exists public.list_my_private_students_secure()';
end;
$retire$;
