-- 등록된 합성 테스트 학원의 활성 구성원도 테스트 전용 기능을 사용할 수 있게 한다.
-- 개발자 본인뿐 아니라 역할별 독립 E2E 계정으로 실제 협업 흐름을 검증하기 위함이다.

create or replace function public.get_my_developer_test_context(p_academy_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_workspace public.developer_test_workspaces%rowtype;
  v_caller_role text;
begin
  if auth.uid() is null or p_academy_id is null then
    return jsonb_build_object('is_test_lab', false);
  end if;

  select workspace.* into v_workspace
  from public.developer_test_workspaces workspace
  join public.app_developers developer
    on developer.user_id = workspace.developer_user_id
   and developer.is_active = true
   and developer.role = 'developer'
  join public.academy_members member
    on member.academy_id = workspace.academy_id
   and member.user_id = auth.uid()
   and member.status = 'active'
  where workspace.academy_id = p_academy_id;

  if not found then
    return jsonb_build_object('is_test_lab', false);
  end if;

  select member.role into v_caller_role
  from public.academy_members member
  where member.academy_id = v_workspace.academy_id
    and member.user_id = auth.uid()
    and member.status = 'active';

  return jsonb_build_object(
    'is_test_lab', true,
    'academy_id', v_workspace.academy_id,
    'active_persona', v_caller_role,
    'active_scenario', v_workspace.active_scenario,
    'seed_version', v_workspace.seed_version
  );
end;
$$;

revoke all on function public.get_my_developer_test_context(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_developer_test_context(uuid) to authenticated;

comment on function public.get_my_developer_test_context(uuid) is
  '활성 개발자가 등록한 합성 테스트 학원의 활성 구성원에게만 테스트 UI 문맥을 제공한다.';
