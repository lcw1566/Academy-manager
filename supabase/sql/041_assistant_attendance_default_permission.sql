-- ============================================================
-- 041_assistant_attendance_default_permission.sql
-- 보조강사의 기본 권한에 학생 등하원·수업 출석 기록을 포함한다.
--
-- 빈 permissions({}) 또는 canEditAttendance 키가 없는 프로필에는 역할 기본값이
-- 적용된다. 원장이 canEditAttendance=false 로 명시한 경우에는 계속 차단한다.
-- 기존 데이터는 변경하거나 삭제하지 않는다.
-- ============================================================

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

  if not found or v_role not in ('teacher', 'assistant', 'manager') then
    return false;
  end if;

  -- 원장이 저장한 명시적 허용/차단은 역할 기본값보다 우선한다.
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
    when 'assistant' then p_permission in (
      'canViewStudents',
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

notify pgrst, 'reload schema';

-- ============================================================
-- End of 041_assistant_attendance_default_permission.sql
-- ============================================================
