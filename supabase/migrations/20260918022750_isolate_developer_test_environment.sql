-- Empty means disabled. Local/CI and the designated staging setup enable this
-- explicitly with service_role. Production receives the empty table and the
-- public test-lab RPC names become fail-closed wrappers.
create table if not exists public.developer_test_environment_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.developer_test_environment_config enable row level security;
revoke all on public.developer_test_environment_config from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.developer_test_environment_config to service_role;

do $$
begin
  if to_regprocedure('public.get_developer_test_lab_unrestricted()') is null then
    alter function public.get_developer_test_lab() rename to get_developer_test_lab_unrestricted;
  end if;
  if to_regprocedure('public.get_my_developer_test_context_unrestricted(uuid)') is null then
    alter function public.get_my_developer_test_context(uuid) rename to get_my_developer_test_context_unrestricted;
  end if;
  if to_regprocedure('public.prepare_developer_test_lab_unrestricted(text)') is null then
    alter function public.prepare_developer_test_lab(text) rename to prepare_developer_test_lab_unrestricted;
  end if;
  if to_regprocedure('public.set_developer_test_persona_unrestricted(text)') is null then
    alter function public.set_developer_test_persona(text) rename to set_developer_test_persona_unrestricted;
  end if;
  if to_regprocedure('public.get_developer_test_permissions_unrestricted()') is null then
    alter function public.get_developer_test_permissions() rename to get_developer_test_permissions_unrestricted;
  end if;
  if to_regprocedure('public.set_developer_test_permissions_unrestricted(jsonb)') is null then
    alter function public.set_developer_test_permissions(jsonb) rename to set_developer_test_permissions_unrestricted;
  end if;
end;
$$;

revoke all on function public.get_developer_test_lab_unrestricted() from public, anon, authenticated, service_role;
revoke all on function public.get_my_developer_test_context_unrestricted(uuid) from public, anon, authenticated, service_role;
revoke all on function public.prepare_developer_test_lab_unrestricted(text) from public, anon, authenticated, service_role;
revoke all on function public.set_developer_test_persona_unrestricted(text) from public, anon, authenticated, service_role;
revoke all on function public.get_developer_test_permissions_unrestricted() from public, anon, authenticated, service_role;
revoke all on function public.set_developer_test_permissions_unrestricted(jsonb) from public, anon, authenticated, service_role;

create or replace function public.developer_test_environment_is_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.developer_test_environment_config
    where singleton = true and enabled = true
  );
$$;
revoke all on function public.developer_test_environment_is_enabled() from public, anon, authenticated, service_role;

create or replace function public.get_developer_test_lab()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Login required' using errcode='42501'; end if;
  if not public.developer_test_environment_is_enabled() then
    return jsonb_build_object('exists',false,'environment_disabled',true);
  end if;
  return public.get_developer_test_lab_unrestricted();
end;
$$;

create or replace function public.get_my_developer_test_context(p_academy_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Login required' using errcode='42501'; end if;
  if not public.developer_test_environment_is_enabled() then
    return jsonb_build_object('is_test_lab',false,'environment_disabled',true);
  end if;
  return public.get_my_developer_test_context_unrestricted(p_academy_id);
end;
$$;

create or replace function public.prepare_developer_test_lab(p_scenario text default 'full')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.developer_test_environment_is_enabled() then
    raise exception 'Test environment unavailable' using errcode='42501';
  end if;
  return public.prepare_developer_test_lab_unrestricted(p_scenario);
end;
$$;

create or replace function public.set_developer_test_persona(p_persona text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.developer_test_environment_is_enabled() then
    raise exception 'Test environment unavailable' using errcode='42501';
  end if;
  return public.set_developer_test_persona_unrestricted(p_persona);
end;
$$;

create or replace function public.get_developer_test_permissions()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Login required' using errcode='42501'; end if;
  if not public.developer_test_environment_is_enabled() then
    return jsonb_build_object('exists',false,'configurable',false,'environment_disabled',true);
  end if;
  return public.get_developer_test_permissions_unrestricted();
end;
$$;

create or replace function public.set_developer_test_permissions(p_permissions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.developer_test_environment_is_enabled() then
    raise exception 'Test environment unavailable' using errcode='42501';
  end if;
  return public.set_developer_test_permissions_unrestricted(p_permissions);
end;
$$;

revoke all on function public.get_developer_test_lab() from public, anon, authenticated, service_role;
revoke all on function public.get_my_developer_test_context(uuid) from public, anon, authenticated, service_role;
revoke all on function public.prepare_developer_test_lab(text) from public, anon, authenticated, service_role;
revoke all on function public.set_developer_test_persona(text) from public, anon, authenticated, service_role;
revoke all on function public.get_developer_test_permissions() from public, anon, authenticated, service_role;
revoke all on function public.set_developer_test_permissions(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.get_developer_test_lab() to authenticated;
grant execute on function public.get_my_developer_test_context(uuid) to authenticated;
grant execute on function public.prepare_developer_test_lab(text) to authenticated;
grant execute on function public.set_developer_test_persona(text) to authenticated;
grant execute on function public.get_developer_test_permissions() to authenticated;
grant execute on function public.set_developer_test_permissions(jsonb) to authenticated;
