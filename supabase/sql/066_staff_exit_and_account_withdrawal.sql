-- 066_staff_exit_and_account_withdrawal.sql
-- 직원 내보내기 / 학원 나가기 / 씨닛 탈퇴 기반
--
-- 원칙
--   * 과거 수업·클리닉·근퇴 기록은 삭제하지 않는다.
--   * academy_members.status 를 inactive 로 바꿔 모든 RLS 권한을 즉시 끊는다.
--   * 반복 근무 규칙만 중지해 탈퇴 이후의 예정 근무가 계속 생기지 않게 한다.

alter table public.profiles
  add column if not exists withdrawn_at timestamptz;

create or replace function public.remove_academy_member(
  p_academy_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.academy_members%rowtype;
  v_class_count integer := 0;
  v_work_rule_count integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;

  if not public.is_owner_of_academy(p_academy_id) then
    raise exception '원장만 직원을 내보낼 수 있어요.';
  end if;

  if p_user_id = auth.uid() then
    raise exception '본인은 직원 내보내기로 처리할 수 없어요.';
  end if;

  select * into v_membership
  from public.academy_members
  where academy_id = p_academy_id
    and user_id = p_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception '활성 상태인 직원을 찾을 수 없어요.';
  end if;

  if v_membership.role = 'owner'
     or exists (
       select 1 from public.academies a
       where a.id = p_academy_id and a.owner_id = p_user_id
     ) then
    raise exception '원장은 내보낼 수 없어요. 먼저 소유권 이전이 필요해요.';
  end if;

  select count(*) into v_class_count
  from public.class_groups g
  where g.academy_id = p_academy_id
    and g.teacher_user_id = p_user_id
    and coalesce(g.status, 'active') <> 'inactive';

  select count(*) into v_work_rule_count
  from public.academy_staff_work_rules r
  where r.academy_id = p_academy_id
    and r.staff_user_id = p_user_id
    and r.is_active = true;

  update public.academy_members
  set status = 'inactive', updated_at = now()
  where id = v_membership.id;

  update public.academy_staff_profiles
  set status = 'inactive', updated_at = now()
  where academy_id = p_academy_id
    and user_id = p_user_id;

  update public.academy_staff_work_rules
  set is_active = false, updated_at = now()
  where academy_id = p_academy_id
    and staff_user_id = p_user_id
    and is_active = true;

  return jsonb_build_object(
    'academy_id', p_academy_id,
    'user_id', p_user_id,
    'membership_status', 'inactive',
    'assigned_class_count', v_class_count,
    'stopped_work_rule_count', v_work_rule_count
  );
end;
$$;

create or replace function public.leave_academy(
  p_academy_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.academy_members%rowtype;
  v_class_count integer := 0;
begin
  if v_user_id is null then
    raise exception '로그인이 필요해요.';
  end if;

  select * into v_membership
  from public.academy_members
  where academy_id = p_academy_id
    and user_id = v_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception '현재 소속된 학원이 아니에요.';
  end if;

  if v_membership.role = 'owner'
     or exists (
       select 1 from public.academies a
       where a.id = p_academy_id and a.owner_id = v_user_id
     ) then
    raise exception '원장은 학원을 나갈 수 없어요. 먼저 소유권을 이전해주세요.';
  end if;

  select count(*) into v_class_count
  from public.class_groups g
  where g.academy_id = p_academy_id
    and g.teacher_user_id = v_user_id
    and coalesce(g.status, 'active') <> 'inactive';

  update public.academy_members
  set status = 'inactive', updated_at = now()
  where id = v_membership.id;

  update public.academy_staff_profiles
  set status = 'inactive', updated_at = now()
  where academy_id = p_academy_id
    and user_id = v_user_id;

  update public.academy_staff_work_rules
  set is_active = false, updated_at = now()
  where academy_id = p_academy_id
    and staff_user_id = v_user_id
    and is_active = true;

  return jsonb_build_object(
    'academy_id', p_academy_id,
    'user_id', v_user_id,
    'membership_status', 'inactive',
    'assigned_class_count', v_class_count
  );
end;
$$;

revoke all on function public.remove_academy_member(uuid, uuid) from public;
revoke all on function public.leave_academy(uuid) from public;
grant execute on function public.remove_academy_member(uuid, uuid) to authenticated;
grant execute on function public.leave_academy(uuid) to authenticated;

