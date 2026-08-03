-- 067_delegated_staff_access_management.sql
-- 직원 관리 권한을 세 가지로 분리한다.
--   canManageStaff            : 초대·근무표
--   canManageStaffPermissions : 직책·일반 권한 부여/회수
--   canRemoveStaff            : 직원 내보내기
--
-- 직책/권한 변경은 academy_members와 academy_staff_profiles를 하나의 RPC에서
-- 갱신한다. 위임받은 관리자는 본인·원장·다른 접근 관리자를 변경할 수 없고,
-- 자신이 갖지 않은 일반 권한을 새로 부여할 수도 없다.

-- 특정 직원의 유효 권한을 서버 내부에서 계산한다. 호출자의 권한을 판정하는
-- has_academy_permission과 같은 우선순위(역할 → 직책 → 개인 예외)를 쓴다.
create or replace function public.academy_member_has_permission(
  p_academy_id uuid,
  p_user_id uuid,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_job_title text;
  v_title_policies jsonb := '{}'::jsonb;
  v_individual jsonb := '{}'::jsonb;
  v_value jsonb;
  v_result boolean := false;
begin
  if p_academy_id is null or p_user_id is null then return false; end if;

  if exists (
    select 1 from public.academies a
    where a.id = p_academy_id and a.owner_id = p_user_id
  ) then
    return true;
  end if;

  select m.role, asp.job_title, coalesce(asp.permissions, '{}'::jsonb),
         coalesce(a.job_title_permissions, '{}'::jsonb)
  into v_role, v_job_title, v_individual, v_title_policies
  from public.academy_members m
  join public.academies a on a.id = m.academy_id
  left join public.academy_staff_profiles asp
    on asp.academy_id = m.academy_id and asp.user_id = m.user_id
  where m.academy_id = p_academy_id
    and m.user_id = p_user_id
    and m.status = 'active'
  limit 1;

  if not found then return false; end if;
  if p_permission = 'canManageDrive' then return true; end if;

  v_result := case v_role
    when 'teacher' then p_permission in (
      'canViewStudents', 'canEditLessonRecords', 'canEditAttendance',
      'canEditClinicRecords', 'canViewPayroll', 'canManageStudents'
    )
    when 'assistant' then p_permission in (
      'canViewStudents', 'canEditLessonRecords', 'canEditAttendance',
      'canEditClinicRecords', 'canViewPayroll', 'canManageStudents'
    )
    when 'manager' then p_permission in (
      'canViewStudents', 'canEditLessonRecords', 'canEditAttendance',
      'canEditClinicRecords', 'canViewPayroll', 'canViewPayments',
      'canManageClasses', 'canManageStudents', 'canManagePayments',
      'canManageStaff'
    )
    else false
  end;

  v_value := v_title_policies
    -> coalesce(nullif(btrim(v_job_title), ''),
      case when v_role = 'manager' then '운영 매니저' else '선생님' end)
    -> 'permissions' -> p_permission;
  if jsonb_typeof(v_value) = 'boolean' then
    v_result := (v_value #>> '{}')::boolean;
  end if;

  v_value := v_individual -> p_permission;
  if jsonb_typeof(v_value) = 'boolean' then
    v_result := (v_value #>> '{}')::boolean;
  end if;

  return v_result;
end;
$$;

revoke all on function public.academy_member_has_permission(uuid, uuid, text) from public;
revoke all on function public.academy_member_has_permission(uuid, uuid, text) from authenticated;

-- 급여·계약 정보를 노출하지 않고 직책/권한 관리에 필요한 필드만 반환한다.
create or replace function public.list_academy_staff_access_profiles(p_academy_id uuid)
returns table (
  academy_id uuid,
  user_id uuid,
  member_id uuid,
  role text,
  job_title text,
  permissions jsonb,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  if not (
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStaff')
    or public.has_academy_permission(p_academy_id, 'canManageStaffPermissions')
    or public.has_academy_permission(p_academy_id, 'canRemoveStaff')
  ) then
    raise exception '직원 정보를 확인할 권한이 없어요.' using errcode = '42501';
  end if;

  return query
  select m.academy_id, m.user_id, m.id, m.role,
         coalesce(nullif(btrim(asp.job_title), ''),
           case when m.role = 'manager' then '운영 매니저' else '선생님' end),
         coalesce(asp.permissions, '{}'::jsonb),
         m.status,
         coalesce(asp.created_at, m.created_at),
         coalesce(asp.updated_at, m.updated_at)
  from public.academy_members m
  left join public.academy_staff_profiles asp
    on asp.academy_id = m.academy_id and asp.user_id = m.user_id
  where m.academy_id = p_academy_id
    and m.status = 'active'
    and m.role in ('teacher', 'assistant', 'manager')
  order by coalesce(asp.created_at, m.created_at);
end;
$$;

revoke all on function public.list_academy_staff_access_profiles(uuid) from public;
grant execute on function public.list_academy_staff_access_profiles(uuid) to authenticated;

-- 접근 권한 관리자와 내보내기 담당자도 직원 선택에 필요한 최소 신원 정보를 본다.
create or replace function public.list_academy_member_profiles_v2(p_academy_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  phone text,
  account_type text,
  membership_role text,
  membership_status text
)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.display_name, p.email, p.phone, p.account_type, m.role, m.status
  from public.profiles p
  join public.academy_members m on m.user_id = p.id
  where m.academy_id = p_academy_id
    and m.status = 'active'
    and (
      public.is_owner_of_academy(p_academy_id)
      or public.has_academy_permission(p_academy_id, 'canManageStaff')
      or public.has_academy_permission(p_academy_id, 'canManageStaffPermissions')
      or public.has_academy_permission(p_academy_id, 'canRemoveStaff')
    );
$$;

revoke all on function public.list_academy_member_profiles_v2(uuid) from public;
grant execute on function public.list_academy_member_profiles_v2(uuid) to authenticated;

create or replace function public.manage_academy_staff_access(
  p_academy_id uuid,
  p_user_id uuid,
  p_job_title text,
  p_permissions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_owner boolean := false;
  v_member public.academy_members%rowtype;
  v_existing public.academy_staff_profiles%rowtype;
  v_policies jsonb := '{}'::jsonb;
  v_policy jsonb := '{}'::jsonb;
  v_role text;
  v_title text := nullif(btrim(p_job_title), '');
  v_permissions jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
  v_enabled boolean;
  v_known_keys text[] := array[
    'canViewStudents', 'canEditLessonRecords', 'canEditAttendance',
    'canEditClinicRecords', 'canViewPayroll', 'canViewPayments',
    'canManageClasses', 'canManageStudents', 'canManagePayments',
    'canManageStaff', 'canManageStaffPermissions', 'canRemoveStaff',
    'canManageDrive'
  ];
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  if v_title is null then raise exception '직책을 선택해주세요.'; end if;
  if char_length(v_title) > 40 then raise exception '직책은 40자 이내여야 해요.'; end if;
  if jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) <> 'object' then
    raise exception '권한 형식이 올바르지 않아요.';
  end if;

  v_is_owner := public.is_owner_of_academy(p_academy_id);
  if not v_is_owner
     and not public.has_academy_permission(p_academy_id, 'canManageStaffPermissions') then
    raise exception '직책과 권한을 변경할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception '본인의 직책과 권한은 직접 변경할 수 없어요.' using errcode = '42501';
  end if;

  select * into v_member
  from public.academy_members
  where academy_id = p_academy_id and user_id = p_user_id and status = 'active'
  for update;
  if not found then raise exception '활성 상태인 직원을 찾을 수 없어요.'; end if;
  if v_member.role = 'owner' or exists (
    select 1 from public.academies a
    where a.id = p_academy_id and a.owner_id = p_user_id
  ) then
    raise exception '원장 권한은 변경할 수 없어요.' using errcode = '42501';
  end if;

  select * into v_existing
  from public.academy_staff_profiles
  where academy_id = p_academy_id and user_id = p_user_id;

  select coalesce(a.job_title_permissions, '{}'::jsonb)
  into v_policies from public.academies a where a.id = p_academy_id;
  v_policy := coalesce(v_policies -> v_title, '{}'::jsonb);
  if v_policy = '{}'::jsonb and v_title is distinct from v_existing.job_title then
    raise exception '학원 설정에 등록된 직책을 선택해주세요.';
  end if;
  v_role := case
    when v_policy ->> 'role' = 'manager' then 'manager'
    when v_policy <> '{}'::jsonb then 'teacher'
    when v_member.role = 'manager' then 'manager'
    else 'teacher'
  end;

  -- 알려진 boolean 권한만 개인 예외로 저장한다.
  foreach v_key in array v_known_keys loop
    v_value := coalesce(p_permissions, '{}'::jsonb) -> v_key;
    if jsonb_typeof(v_value) = 'boolean' then
      v_permissions := v_permissions || jsonb_build_object(v_key, v_value);
    end if;
  end loop;

  if not v_is_owner then
    -- 위임 권한 보유자가 다른 접근 관리자를 강등하거나 복제하지 못하게 한다.
    if public.academy_member_has_permission(p_academy_id, p_user_id, 'canManageStaffPermissions')
       or public.academy_member_has_permission(p_academy_id, p_user_id, 'canRemoveStaff') then
      raise exception '접근 관리 권한이 있는 직원은 원장만 변경할 수 있어요.' using errcode = '42501';
    end if;
    if coalesce((v_policy -> 'permissions' ->> 'canManageStaffPermissions')::boolean, false)
       or coalesce((v_policy -> 'permissions' ->> 'canRemoveStaff')::boolean, false) then
      raise exception '고위험 관리 권한은 원장만 부여할 수 있어요.' using errcode = '42501';
    end if;

    -- 민감 권한의 기존 개인 예외값은 그대로 보존한다.
    v_permissions := v_permissions - 'canManageStaffPermissions' - 'canRemoveStaff';
    if jsonb_typeof(coalesce(v_existing.permissions, '{}'::jsonb) -> 'canManageStaffPermissions') = 'boolean' then
      v_permissions := v_permissions || jsonb_build_object(
        'canManageStaffPermissions', v_existing.permissions -> 'canManageStaffPermissions');
    end if;
    if jsonb_typeof(coalesce(v_existing.permissions, '{}'::jsonb) -> 'canRemoveStaff') = 'boolean' then
      v_permissions := v_permissions || jsonb_build_object(
        'canRemoveStaff', v_existing.permissions -> 'canRemoveStaff');
    end if;

    -- 자신에게 없는 일반 권한을 타인에게 새로 부여하지 못하게 한다.
    foreach v_key in array v_known_keys loop
      if v_key in ('canManageStaffPermissions', 'canRemoveStaff', 'canManageDrive') then
        continue;
      end if;
      v_enabled := case v_role
        when 'teacher' then v_key in (
          'canViewStudents', 'canEditLessonRecords', 'canEditAttendance',
          'canEditClinicRecords', 'canViewPayroll', 'canManageStudents')
        when 'manager' then v_key in (
          'canViewStudents', 'canEditLessonRecords', 'canEditAttendance',
          'canEditClinicRecords', 'canViewPayroll', 'canViewPayments',
          'canManageClasses', 'canManageStudents', 'canManagePayments', 'canManageStaff')
        else false
      end;
      v_value := v_policy -> 'permissions' -> v_key;
      if jsonb_typeof(v_value) = 'boolean' then v_enabled := (v_value #>> '{}')::boolean; end if;
      v_value := v_permissions -> v_key;
      if jsonb_typeof(v_value) = 'boolean' then v_enabled := (v_value #>> '{}')::boolean; end if;
      if v_enabled and not public.has_academy_permission(p_academy_id, v_key) then
        raise exception '보유하지 않은 권한은 다른 직원에게 부여할 수 없어요.' using errcode = '42501';
      end if;
    end loop;
  end if;

  update public.academy_members
  set role = v_role, updated_at = now()
  where id = v_member.id;

  insert into public.academy_staff_profiles as asp (
    academy_id, user_id, member_id, role, job_title, permissions,
    subjects, wage_type, hourly_wage, monthly_salary, status
  ) values (
    p_academy_id, p_user_id, v_member.id, v_role, v_title, v_permissions,
    '[]'::jsonb, 'hourly', 0, 0, 'active'
  )
  on conflict (academy_id, user_id) do update set
    member_id = excluded.member_id,
    role = excluded.role,
    job_title = excluded.job_title,
    permissions = excluded.permissions,
    status = 'active',
    updated_at = now();

  return jsonb_build_object(
    'academy_id', p_academy_id,
    'user_id', p_user_id,
    'member_id', v_member.id,
    'role', v_role,
    'job_title', v_title,
    'permissions', v_permissions,
    'status', 'active'
  );
end;
$$;

revoke all on function public.manage_academy_staff_access(uuid, uuid, text, jsonb) from public;
grant execute on function public.manage_academy_staff_access(uuid, uuid, text, jsonb) to authenticated;

-- 직원 내보내기는 별도 권한으로 위임할 수 있다. 위임받은 관리자는 본인·원장·
-- 다른 접근 관리자를 내보낼 수 없다.
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
  v_is_owner boolean := false;
  v_membership public.academy_members%rowtype;
  v_class_count integer := 0;
  v_work_rule_count integer := 0;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  v_is_owner := public.is_owner_of_academy(p_academy_id);
  if not v_is_owner and not public.has_academy_permission(p_academy_id, 'canRemoveStaff') then
    raise exception '직원을 내보낼 권한이 없어요.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception '본인은 직원 내보내기로 처리할 수 없어요.' using errcode = '42501';
  end if;

  select * into v_membership
  from public.academy_members
  where academy_id = p_academy_id and user_id = p_user_id and status = 'active'
  for update;
  if not found then raise exception '활성 상태인 직원을 찾을 수 없어요.'; end if;
  if v_membership.role = 'owner' or exists (
    select 1 from public.academies a
    where a.id = p_academy_id and a.owner_id = p_user_id
  ) then
    raise exception '원장은 내보낼 수 없어요. 먼저 소유권 이전이 필요해요.';
  end if;
  if not v_is_owner and (
    public.academy_member_has_permission(p_academy_id, p_user_id, 'canManageStaffPermissions')
    or public.academy_member_has_permission(p_academy_id, p_user_id, 'canRemoveStaff')
  ) then
    raise exception '접근 관리 권한이 있는 직원은 원장만 내보낼 수 있어요.' using errcode = '42501';
  end if;

  select count(*) into v_class_count from public.class_groups g
  where g.academy_id = p_academy_id and g.teacher_user_id = p_user_id
    and coalesce(g.status, 'active') <> 'inactive';
  select count(*) into v_work_rule_count from public.academy_staff_work_rules r
  where r.academy_id = p_academy_id and r.staff_user_id = p_user_id and r.is_active = true;

  update public.academy_members set status = 'inactive', updated_at = now()
  where id = v_membership.id;
  update public.academy_staff_profiles set status = 'inactive', updated_at = now()
  where academy_id = p_academy_id and user_id = p_user_id;
  update public.academy_staff_work_rules set is_active = false, updated_at = now()
  where academy_id = p_academy_id and staff_user_id = p_user_id and is_active = true;

  return jsonb_build_object(
    'academy_id', p_academy_id, 'user_id', p_user_id,
    'membership_status', 'inactive', 'assigned_class_count', v_class_count,
    'stopped_work_rule_count', v_work_rule_count
  );
end;
$$;

revoke all on function public.remove_academy_member(uuid, uuid) from public;
grant execute on function public.remove_academy_member(uuid, uuid) to authenticated;

-- PostgREST가 security definer 함수 안에서 읽고 쓸 수 있도록 함수 소유자에게는
-- 기존 테이블 권한이 전제된다. 클라이언트의 직접 UPDATE 정책은 계속 원장 전용이다.
