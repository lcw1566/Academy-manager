-- Empty by default, including production. Only a service-role staging setup can
-- register synthetic identities. This grants no developer dashboard capability.
create table if not exists public.developer_test_login_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  academy_id uuid not null references public.developer_test_workspaces(academy_id) on delete cascade,
  persona text not null check (persona in ('owner','manager','teacher','invited')),
  enabled boolean not null default true,
  unique (academy_id, persona)
);
alter table public.developer_test_login_accounts enable row level security;
revoke all on public.developer_test_login_accounts from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.developer_test_login_accounts to service_role;

create or replace function public.get_test_login_context(p_actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor public.developer_test_login_accounts%rowtype; v_accounts jsonb;
begin
  select account.* into v_actor from public.developer_test_login_accounts account
  join public.developer_test_workspaces workspace on workspace.academy_id=account.academy_id
  join public.app_developers developer on developer.user_id=workspace.developer_user_id
    and developer.is_active and developer.role='developer'
  where account.user_id=p_actor_id and account.enabled;
  if not found then raise exception 'Test login unavailable' using errcode='42501'; end if;
  -- A test identity must never gain entry to another academy or own customer data.
  if exists(select 1 from public.academy_members where user_id=p_actor_id and academy_id<>v_actor.academy_id)
    or exists(select 1 from public.academies where owner_id=p_actor_id and id<>v_actor.academy_id) then
    raise exception 'Test identity is not isolated' using errcode='42501';
  end if;
  select jsonb_agg(jsonb_build_object('persona', account.persona, 'user_id', account.user_id, 'email', u.email)
    order by array_position(array['owner','manager','teacher','invited'],account.persona))
  into v_accounts
  from public.developer_test_login_accounts account join auth.users u on u.id=account.user_id
  where account.academy_id=v_actor.academy_id and account.enabled
    and not exists(select 1 from public.academy_members m where m.user_id=account.user_id and m.academy_id<>v_actor.academy_id)
    and not exists(select 1 from public.academies a where a.owner_id=account.user_id and a.id<>v_actor.academy_id);
  return jsonb_build_object('academy_id',v_actor.academy_id,'current_persona',v_actor.persona,'accounts',coalesce(v_accounts,'[]'::jsonb));
end;
$$;
revoke all on function public.get_test_login_context(uuid) from public, anon, authenticated;
grant execute on function public.get_test_login_context(uuid) to service_role;

create or replace function public.authorize_test_login(p_actor_id uuid, p_persona text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_context jsonb; v_target jsonb;
begin
  v_context := public.get_test_login_context(p_actor_id);
  select value into v_target from jsonb_array_elements(v_context->'accounts') where value->>'persona'=p_persona;
  if v_target is null then raise exception 'Test target unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_context->>'academy_id',91260));
  if (select count(*) from public.developer_action_logs
      where action='staging_test_login_requested' and details->>'academy_id'=v_context->>'academy_id'
      and created_at>now()-interval '1 minute') >= 12 then
    raise exception 'Too many test switches' using errcode='54000';
  end if;
  insert into public.developer_action_logs(actor_user_id,action,target_type,target_id,details)
  values(p_actor_id,'staging_test_login_requested','test_account',v_target->>'user_id',
    jsonb_build_object('academy_id',v_context->>'academy_id','persona',p_persona));
  return v_target || jsonb_build_object('academy_id',v_context->>'academy_id');
end;
$$;
revoke all on function public.authorize_test_login(uuid,text) from public, anon, authenticated;
grant execute on function public.authorize_test_login(uuid,text) to service_role;
