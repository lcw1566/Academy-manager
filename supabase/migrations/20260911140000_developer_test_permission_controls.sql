-- Developer test-lab permission controls.
-- Only the registered developer may change their own synthetic academy profile.
-- The allowlist deliberately excludes student contacts and staff administration.

begin;

create or replace function public.get_developer_test_permissions()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_workspace public.developer_test_workspaces%rowtype;
  v_profile public.academy_staff_profiles%rowtype;
  v_member public.academy_members%rowtype;
  v_configurable boolean := false;
begin
  if auth.uid() is null or not public.is_current_app_developer() then
    raise exception '개발자 워크스페이스 접근 권한이 없어요.' using errcode = '42501';
  end if;

  select workspace.* into v_workspace
  from public.developer_test_workspaces workspace
  where workspace.developer_user_id = auth.uid();

  if not found then
    return jsonb_build_object('exists', false, 'configurable', false);
  end if;

  select member.* into v_member
  from public.academy_members member
  where member.academy_id = v_workspace.academy_id
    and member.user_id = auth.uid();

  select profile.* into v_profile
  from public.academy_staff_profiles profile
  where profile.academy_id = v_workspace.academy_id
    and profile.user_id = auth.uid();

  v_configurable := v_workspace.active_persona in ('manager', 'teacher', 'assistant')
    and v_member.status = 'active'
    and v_profile.status = 'active';

  return jsonb_build_object(
    'exists', true,
    'configurable', v_configurable,
    'active_persona', v_workspace.active_persona,
    'canViewPayments', case
      when v_workspace.active_persona = 'owner' then true
      else coalesce((v_profile.permissions ->> 'canViewPayments')::boolean, false)
    end,
    'canManagePayments', case
      when v_workspace.active_persona = 'owner' then true
      else coalesce((v_profile.permissions ->> 'canManagePayments')::boolean, false)
    end,
    'canViewPayroll', case
      when v_workspace.active_persona = 'owner' then true
      else coalesce((v_profile.permissions ->> 'canViewPayroll')::boolean, true)
    end
  );
end;
$$;

revoke all on function public.get_developer_test_permissions()
  from public, anon, authenticated;
grant execute on function public.get_developer_test_permissions() to authenticated;

create or replace function public.set_developer_test_permissions(p_permissions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.developer_test_workspaces%rowtype;
  v_current jsonb := '{}'::jsonb;
  v_next jsonb := '{}'::jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.app_developers developer
    where developer.user_id = auth.uid()
      and developer.is_active = true
      and developer.role = 'developer'
  ) then
    raise exception '테스트 권한을 변경할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_permissions is null or jsonb_typeof(p_permissions) <> 'object' then
    raise exception '테스트 권한 값이 올바르지 않아요.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_permissions) as permission_key
    where permission_key not in ('canViewPayments', 'canManagePayments', 'canViewPayroll')
  ) or exists (
    select 1
    from jsonb_each(p_permissions) as permission_entry
    where jsonb_typeof(permission_entry.value) <> 'boolean'
  ) then
    raise exception '허용되지 않은 테스트 권한이 포함됐어요.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 90712));

  select workspace.* into v_workspace
  from public.developer_test_workspaces workspace
  where workspace.developer_user_id = auth.uid()
  for update;

  if not found then
    raise exception '먼저 테스트 학원을 만들어주세요.' using errcode = 'P0002';
  end if;
  if v_workspace.active_persona not in ('manager', 'teacher', 'assistant') then
    raise exception '선생님 또는 운영 매니저 역할에서 권한을 테스트해주세요.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.academy_members member
    where member.academy_id = v_workspace.academy_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role in ('teacher', 'assistant', 'manager')
  ) then
    raise exception '활성 직원 역할을 확인해주세요.' using errcode = '42501';
  end if;

  select coalesce(profile.permissions, '{}'::jsonb) into v_current
  from public.academy_staff_profiles profile
  where profile.academy_id = v_workspace.academy_id
    and profile.user_id = auth.uid()
    and profile.status = 'active'
  for update;

  if not found then
    raise exception '테스트 직원 정보를 찾지 못했어요.' using errcode = 'P0002';
  end if;

  v_next := v_current || p_permissions;
  if coalesce((v_next ->> 'canManagePayments')::boolean, false)
    and not coalesce((v_next ->> 'canViewPayments')::boolean, false) then
    raise exception '수납 관리 권한에는 수납 조회 권한이 필요해요.' using errcode = '22023';
  end if;

  v_before := jsonb_build_object(
    'canViewPayments', coalesce((v_current ->> 'canViewPayments')::boolean, false),
    'canManagePayments', coalesce((v_current ->> 'canManagePayments')::boolean, false),
    'canViewPayroll', coalesce((v_current ->> 'canViewPayroll')::boolean, true)
  );
  v_after := jsonb_build_object(
    'canViewPayments', coalesce((v_next ->> 'canViewPayments')::boolean, false),
    'canManagePayments', coalesce((v_next ->> 'canManagePayments')::boolean, false),
    'canViewPayroll', coalesce((v_next ->> 'canViewPayroll')::boolean, true)
  );

  update public.academy_staff_profiles profile
  set permissions = v_next,
      updated_at = now()
  where profile.academy_id = v_workspace.academy_id
    and profile.user_id = auth.uid();

  insert into public.developer_action_logs (
    actor_user_id, action, target_type, target_id, details
  ) values (
    auth.uid(),
    'test_lab.permissions_changed',
    'academy',
    v_workspace.academy_id::text,
    jsonb_build_object(
      'persona', v_workspace.active_persona,
      'before', v_before,
      'after', v_after,
      'synthetic_data_only', true
    )
  );

  return public.get_developer_test_permissions();
end;
$$;

revoke all on function public.set_developer_test_permissions(jsonb)
  from public, anon, authenticated;
grant execute on function public.set_developer_test_permissions(jsonb) to authenticated;

commit;
