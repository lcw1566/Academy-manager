-- ============================================================
-- 043_unified_teacher_role.sql
-- 직원 역할을 원장(owner) / 운영 매니저(manager) / 선생님(teacher)으로 통합한다.
--
-- assistant는 이전 앱 버전에서만 사용한 역할이다. 활성 멤버십과 설정은
-- teacher로 이전하되, 과거 급여·근태·클리닉 기록의 staff_role/staff_type 값은
-- 감사 이력을 위해 변경하지 않는다.
-- ============================================================

begin;

-- 1. 현재 역할 데이터 정규화
update public.profiles
set default_role = 'teacher', updated_at = now()
where default_role = 'assistant';

update public.academy_members
set role = 'teacher', updated_at = now()
where role = 'assistant';

update public.academy_invitations
set role = 'teacher', updated_at = now()
where role = 'assistant';

update public.academy_staff_profiles
set role = 'teacher', updated_at = now()
where role = 'assistant';

-- 근무표와 출퇴근 로그는 현재 선생님 계정에서 계속 조회·수정되어야 하므로
-- 행은 그대로 두고 역할 분류만 teacher로 정규화한다.
update public.academy_staff_shifts
set staff_role = 'teacher', updated_at = now()
where staff_role = 'assistant';

update public.academy_staff_work_rules
set staff_role = 'teacher', updated_at = now()
where staff_role = 'assistant';

update public.staff_attendance_logs
set staff_role = 'teacher', updated_at = now()
where staff_role = 'assistant';

-- 2. 신규 데이터에는 세 역할 체계만 허용
alter table public.profiles drop constraint if exists profiles_default_role_check;
alter table public.profiles add constraint profiles_default_role_check
  check (default_role in ('tutor', 'owner', 'teacher', 'manager'));

alter table public.academy_members drop constraint if exists academy_members_role_check;
alter table public.academy_members add constraint academy_members_role_check
  check (role in ('owner', 'teacher', 'manager', 'pending'));

alter table public.academy_invitations drop constraint if exists academy_invitations_role_check;
alter table public.academy_invitations add constraint academy_invitations_role_check
  check (role in ('teacher', 'manager', 'pending'));

alter table public.academy_staff_profiles drop constraint if exists academy_staff_profiles_role_check;
alter table public.academy_staff_profiles add constraint academy_staff_profiles_role_check
  check (role in ('teacher', 'manager'));

alter table public.academy_staff_shifts drop constraint if exists academy_staff_shifts_staff_role_check;
alter table public.academy_staff_shifts add constraint academy_staff_shifts_staff_role_check
  check (staff_role in ('teacher', 'manager'));

alter table public.academy_staff_work_rules drop constraint if exists academy_staff_work_rules_role_chk;
alter table public.academy_staff_work_rules add constraint academy_staff_work_rules_role_chk
  check (staff_role in ('teacher', 'manager'));

alter table public.staff_attendance_logs drop constraint if exists staff_attendance_logs_role_chk;
alter table public.staff_attendance_logs add constraint staff_attendance_logs_role_chk
  check (staff_role in ('teacher', 'manager'));

-- 3. 역할 확정 시 서버 직원 프로필도 동일하게 유지
create or replace function public.sync_staff_profile_from_academy_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('teacher', 'manager') and new.status = 'active' then
    insert into public.academy_staff_profiles (
      academy_id, user_id, member_id, role, subjects, wage_type,
      hourly_wage, monthly_salary, status
    )
    values (
      new.academy_id, new.user_id, new.id, new.role, '[]'::jsonb, 'hourly',
      0, 0, 'active'
    )
    on conflict (academy_id, user_id) do update
      set member_id = excluded.member_id,
          role = excluded.role,
          status = 'active',
          updated_at = now();
  elsif new.role in ('teacher', 'manager') and new.status = 'inactive' then
    update public.academy_staff_profiles
    set status = 'inactive', updated_at = now()
    where academy_id = new.academy_id
      and user_id = new.user_id;
  end if;
  return new;
end;
$$;

-- 4. 역할 배정 RPC도 teacher/manager만 허용
create or replace function public.assign_academy_member_role(
  p_academy_id uuid,
  p_user_id uuid,
  p_role text
)
returns table (
  out_member_id uuid,
  out_role text,
  out_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.academy_members%rowtype;
begin
  if p_role not in ('teacher', 'manager') then
    raise exception '배정할 수 없는 역할이에요.';
  end if;

  if not public.is_academy_operations_manager(p_academy_id) then
    raise exception '직원 역할을 배정할 권한이 없어요.';
  end if;

  if p_role = 'manager' and not public.is_owner_of_academy(p_academy_id) then
    raise exception '운영 매니저 역할은 원장만 배정할 수 있어요.';
  end if;

  update public.academy_members m
  set role = p_role, status = 'active', updated_at = now()
  where m.academy_id = p_academy_id
    and m.user_id = p_user_id
    and m.role = 'pending'
    and m.status = 'invited'
  returning m.* into v_member;

  if not found then
    raise exception '역할 배정 대기 중인 직원을 찾을 수 없어요.';
  end if;

  out_member_id := v_member.id;
  out_role := v_member.role;
  out_status := v_member.status;
  return next;
end;
$$;

revoke all on function public.assign_academy_member_role(uuid, uuid, text) from public;
grant execute on function public.assign_academy_member_role(uuid, uuid, text) to authenticated;

-- 5. 운영 매니저는 선생님만 초대/변경할 수 있다.
drop policy if exists "academy_invitations insert by operations" on public.academy_invitations;
create policy "academy_invitations insert by operations"
on public.academy_invitations for insert
with check (
  invited_by = auth.uid()
  and (
    public.is_owner_of_academy(academy_id)
    or (
      public.is_academy_manager(academy_id)
      and role in ('teacher', 'pending')
    )
  )
);

drop policy if exists "academy_invitations update by operations or invitee" on public.academy_invitations;
create policy "academy_invitations update by operations or invitee"
on public.academy_invitations for update
using (
  public.is_academy_operations_manager(academy_id)
  or lower(email) = lower(coalesce(auth.email(), ''))
)
with check (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_manager(academy_id)
    and role in ('teacher', 'pending')
  )
  or lower(email) = lower(coalesce(auth.email(), ''))
);

drop policy if exists "academy_members update by operations" on public.academy_members;
create policy "academy_members update by operations"
on public.academy_members for update
using (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_manager(academy_id)
    and role in ('pending', 'teacher')
  )
)
with check (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_manager(academy_id)
    and role = 'teacher'
    and status = 'active'
  )
);

drop policy if exists "academy_staff_profiles insert by operations" on public.academy_staff_profiles;
create policy "academy_staff_profiles insert by operations"
on public.academy_staff_profiles for insert
with check (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_manager(academy_id)
    and role = 'teacher'
  )
);

drop policy if exists "academy_staff_profiles update by operations" on public.academy_staff_profiles;
create policy "academy_staff_profiles update by operations"
on public.academy_staff_profiles for update
using (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_manager(academy_id)
    and role = 'teacher'
  )
)
with check (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_manager(academy_id)
    and role = 'teacher'
  )
);

-- 6. RLS 권한 기본값: assistant 분기를 제거하고 teacher 권한으로 통일
create or replace function public.has_academy_permission(
  p_academy_id uuid,
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
  v_permissions jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or p_academy_id is null then
    return false;
  end if;

  if public.is_owner_of_academy(p_academy_id) then
    return true;
  end if;

  select m.role, coalesce(sp.permissions, '{}'::jsonb)
    into v_role, v_permissions
  from public.academy_members m
  left join public.academy_staff_profiles sp
    on sp.academy_id = m.academy_id
   and sp.user_id = m.user_id
   and sp.status = 'active'
  where m.academy_id = p_academy_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;

  if not found or v_role not in ('teacher', 'manager') then
    return false;
  end if;

  if jsonb_typeof(v_permissions -> p_permission) = 'boolean' then
    return (v_permissions ->> p_permission)::boolean;
  end if;

  return case v_role
    when 'teacher' then p_permission in (
      'canViewStudents',
      'canEditLessonRecords',
      'canEditAttendance',
      'canEditClinicRecords',
      'canViewPayroll'
    )
    when 'manager' then p_permission in (
      'canViewStudents',
      'canEditLessonRecords',
      'canEditAttendance',
      'canEditClinicRecords',
      'canViewPayments',
      'canManageClasses',
      'canManageStudents',
      'canManagePayments',
      'canManageStaff',
      'canManageStaffPermissions',
      'canManageDrive'
    )
    else false
  end;
end;
$$;

revoke all on function public.has_academy_permission(uuid, text) from public;
grant execute on function public.has_academy_permission(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- End of 043_unified_teacher_role.sql
-- ============================================================
