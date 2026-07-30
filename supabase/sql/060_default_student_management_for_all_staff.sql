-- Seenit — 모든 직원 직책의 기본 학생 관리 권한 활성화
--
-- 직책 기본값에는 canManageStudents=true를 적용한다.
-- academy_staff_profiles.permissions에 저장된 개인별 true/false 예외는 그대로
-- 유지하므로, 특정 직원만 학생 관리를 막는 설정은 계속 사용할 수 있다.

begin;

alter table public.academies
  alter column job_title_permissions set default
  '{
    "선생님": {
      "role": "teacher",
      "permissions": {
        "canViewStudents": true,
        "canEditLessonRecords": true,
        "canEditAttendance": true,
        "canEditClinicRecords": true,
        "canViewPayroll": true,
        "canViewPayments": false,
        "canManageClasses": false,
        "canManageStudents": true,
        "canManagePayments": false,
        "canManageStaff": false,
        "canManageStaffPermissions": false,
        "canManageDrive": true
      }
    },
    "운영 매니저": {
      "role": "manager",
      "permissions": {
        "canViewStudents": true,
        "canEditLessonRecords": true,
        "canEditAttendance": true,
        "canEditClinicRecords": true,
        "canViewPayroll": true,
        "canViewPayments": true,
        "canManageClasses": true,
        "canManageStudents": true,
        "canManagePayments": true,
        "canManageStaff": true,
        "canManageStaffPermissions": false,
        "canManageDrive": true
      }
    }
  }'::jsonb;

-- 기존 학원의 기본 직책뿐 아니라 사용자가 만든 모든 직책의 학생 관리 기본값을
-- true로 보정한다. 직책명, 내부 역할과 나머지 권한은 변경하지 않는다.
with patched as (
  select
    a.id,
    jsonb_object_agg(
      entry.title,
      case
        when jsonb_typeof(entry.policy) = 'object' then
          entry.policy || jsonb_build_object(
            'permissions',
            (
              case
                when jsonb_typeof(entry.policy -> 'permissions') = 'object'
                  then entry.policy -> 'permissions'
                else '{}'::jsonb
              end
            ) || jsonb_build_object('canManageStudents', true)
          )
        else jsonb_build_object(
          'role', 'teacher',
          'permissions', jsonb_build_object('canManageStudents', true)
        )
      end
    ) as policies
  from public.academies a
  cross join lateral jsonb_each(
    coalesce(a.job_title_permissions, '{}'::jsonb)
  ) as entry(title, policy)
  group by a.id
)
update public.academies a
set job_title_permissions = patched.policies
from patched
where patched.id = a.id
  and a.job_title_permissions is distinct from patched.policies;

-- 역할 기본값 → 직책 기본값 → 개인 예외 순서로 판정한다.
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
  v_job_title text;
  v_title_policies jsonb := '{}'::jsonb;
  v_individual jsonb := '{}'::jsonb;
  v_value jsonb;
  v_result boolean := false;
begin
  if auth.uid() is null or p_academy_id is null then
    return false;
  end if;

  if public.is_owner_of_academy(p_academy_id) then
    return true;
  end if;

  select
    m.role,
    asp.job_title,
    coalesce(asp.permissions, '{}'::jsonb),
    coalesce(a.job_title_permissions, '{}'::jsonb)
  into
    v_role,
    v_job_title,
    v_individual,
    v_title_policies
  from public.academy_members m
  join public.academies a on a.id = m.academy_id
  left join public.academy_staff_profiles asp
    on asp.academy_id = m.academy_id
   and asp.user_id = m.user_id
  where m.academy_id = p_academy_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;

  if not found then
    return false;
  end if;

  if p_permission = 'canManageDrive' then
    return true;
  end if;

  v_result := case v_role
    when 'teacher' then p_permission in (
      'canViewStudents',
      'canEditLessonRecords',
      'canEditAttendance',
      'canEditClinicRecords',
      'canViewPayroll',
      'canManageStudents'
    )
    when 'assistant' then p_permission in (
      'canViewStudents',
      'canEditLessonRecords',
      'canEditAttendance',
      'canEditClinicRecords',
      'canViewPayroll',
      'canManageStudents'
    )
    when 'manager' then p_permission in (
      'canViewStudents',
      'canEditLessonRecords',
      'canEditAttendance',
      'canEditClinicRecords',
      'canViewPayroll',
      'canViewPayments',
      'canManageClasses',
      'canManageStudents',
      'canManagePayments',
      'canManageStaff'
    )
    else false
  end;

  v_value := v_title_policies
    -> coalesce(
      nullif(btrim(v_job_title), ''),
      case when v_role = 'manager' then '운영 매니저' else '선생님' end
    )
    -> 'permissions'
    -> p_permission;
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

revoke all on function public.has_academy_permission(uuid, text) from public;
grant execute on function public.has_academy_permission(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
