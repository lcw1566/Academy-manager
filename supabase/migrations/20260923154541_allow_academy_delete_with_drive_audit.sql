-- Deleting an academy cascades to drive files/folders and existing audit rows.
-- During that cascade the child DELETE triggers must not create a new event for
-- a parent academy that PostgreSQL is already removing, or the event FK aborts
-- the entire academy deletion.
create or replace function public.audit_academy_drive_change()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_kind text;
  v_name text;
  v_event text;
  v_academy_id uuid;
  v_target_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_kind := case when tg_table_name = 'academy_drive_files' then 'file' else 'folder' end;
  v_name := case
    when v_kind = 'file' then v_row ->> 'original_name'
    else v_row ->> 'name'
  end;
  v_academy_id := (v_row ->> 'academy_id')::uuid;
  v_target_id := (v_row ->> 'id')::uuid;

  if tg_op = 'INSERT' then
    v_event := 'created';
  elsif tg_op = 'DELETE' then
    v_event := 'permanently_deleted';
  elsif (v_old ->> 'deleted_at') is null and (v_row ->> 'deleted_at') is not null then
    v_event := 'trashed';
  elsif (v_old ->> 'deleted_at') is not null and (v_row ->> 'deleted_at') is null then
    v_event := 'restored';
  else
    return new;
  end if;

  if not exists (
    select 1 from public.academies where id = v_academy_id
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  insert into public.academy_drive_events (
    academy_id, actor_id, target_kind, target_id, target_name, event_type
  ) values (
    v_academy_id,
    coalesce(
      auth.uid(),
      nullif(v_row ->> 'deleted_by', '')::uuid,
      nullif(v_row ->> 'created_by', '')::uuid
    ),
    v_kind,
    v_target_id,
    coalesce(v_name, '(이름 없음)'),
    v_event
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.audit_academy_drive_change() from public, anon, authenticated, service_role;
grant execute on function public.audit_academy_drive_change() to postgres;
