-- Seenit — 학생 권한 계층 일관성 및 연락처 권한 저장 안전성
--
-- 권한 의미:
--   canViewStudents          : 학생 기본 정보 조회
--   canManageStudents        : 기본 정보 조회 + 등록/수정/삭제
--   canViewStudentContacts   : 학생/보호자 연락처 조회
--   canManageStudentContacts : 연락처 조회 + 수정
--
-- 연락처 권한은 계속 원장만 set_student_contact_permissions RPC로 변경한다.

begin;

-- 기존 개인 설정 중 학생 관리가 켜졌지만 조회가 명시적으로 꺼진 모순을 정리한다.
-- 연락처 권한은 전용 RPC/트리거 보호 대상이므로 여기에서 직접 갱신하지 않는다.
update public.academy_staff_profiles
set permissions = permissions || jsonb_build_object('canViewStudents', true),
    updated_at = now()
where jsonb_typeof(coalesce(permissions, '{}'::jsonb) -> 'canManageStudents') = 'boolean'
  and ((permissions -> 'canManageStudents') #>> '{}')::boolean
  and coalesce(((permissions -> 'canViewStudents') #>> '{}')::boolean, false) = false;

-- 직책 기본 권한도 같은 계층으로 정규화한다.
with normalized as (
  select
    a.id,
    jsonb_object_agg(
      entry.key,
      case
        when jsonb_typeof(entry.value) = 'object'
         and jsonb_typeof(entry.value -> 'permissions') = 'object'
         and jsonb_typeof(entry.value -> 'permissions' -> 'canManageStudents') = 'boolean'
         and ((entry.value -> 'permissions' -> 'canManageStudents') #>> '{}')::boolean
          then entry.value || jsonb_build_object(
            'permissions',
            (entry.value -> 'permissions') || jsonb_build_object('canViewStudents', true)
          )
        else entry.value
      end
    ) as policies
  from public.academies a
  cross join lateral jsonb_each(coalesce(a.job_title_permissions, '{}'::jsonb)) entry
  group by a.id
)
update public.academies a
set job_title_permissions = normalized.policies
from normalized
where normalized.id = a.id
  and a.job_title_permissions is distinct from normalized.policies;

-- 역할 → 직책 → 개인 예외 순서로 계산한 뒤, 관리 권한이 대응 조회 권한을
-- 포함하도록 서버의 단일 판정 함수를 정리한다. 이 함수는 외부 직접 호출을 막고
-- RLS/RPC 내부에서만 사용한다.
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
  v_effective jsonb := '{}'::jsonb;
  v_value jsonb;
  v_result boolean := false;
begin
  if p_academy_id is null or p_user_id is null or p_permission is null then
    return false;
  end if;

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

  v_effective := case v_role
    when 'teacher' then jsonb_build_object(
      'canViewStudents', true,
      'canEditLessonRecords', true,
      'canEditAttendance', true,
      'canEditClinicRecords', true,
      'canViewPayroll', true,
      'canManageStudents', true
    )
    when 'assistant' then jsonb_build_object(
      'canViewStudents', true,
      'canEditLessonRecords', true,
      'canEditAttendance', true,
      'canEditClinicRecords', true,
      'canViewPayroll', true,
      'canManageStudents', true
    )
    when 'manager' then jsonb_build_object(
      'canViewStudents', true,
      'canEditLessonRecords', true,
      'canEditAttendance', true,
      'canEditClinicRecords', true,
      'canViewPayroll', true,
      'canViewPayments', true,
      'canManageClasses', true,
      'canManageStudents', true,
      'canManagePayments', true,
      'canManageStaff', true
    )
    else '{}'::jsonb
  end;

  v_value := v_title_policies
    -> coalesce(
      nullif(btrim(v_job_title), ''),
      case when v_role = 'manager' then '운영 매니저' else '선생님' end
    )
    -> 'permissions';
  if jsonb_typeof(v_value) = 'object' then v_effective := v_effective || v_value; end if;
  if jsonb_typeof(v_individual) = 'object' then v_effective := v_effective || v_individual; end if;

  v_value := v_effective -> p_permission;
  if jsonb_typeof(v_value) = 'boolean' then
    v_result := (v_value #>> '{}')::boolean;
  end if;

  if not v_result and p_permission = 'canViewStudents' then
    v_value := v_effective -> 'canManageStudents';
    if jsonb_typeof(v_value) = 'boolean' then
      v_result := (v_value #>> '{}')::boolean;
    end if;
  end if;

  if not v_result and p_permission = 'canViewStudentContacts' then
    v_value := v_effective -> 'canManageStudentContacts';
    if jsonb_typeof(v_value) = 'boolean' then
      v_result := (v_value #>> '{}')::boolean;
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.academy_member_has_permission(uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.has_academy_permission(
  p_academy_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.academy_member_has_permission(p_academy_id, auth.uid(), p_permission);
$$;

revoke all on function public.has_academy_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function public.has_academy_permission(uuid, text) to authenticated;

-- 일반 직원 권한 저장 RPC가 연락처 권한을 누락한 채 프로필 전체를 갱신해도
-- 기존 연락처 권한을 지우지 않는다. 전용 RPC가 세션 로컬 플래그를 설정한 경우에만
-- 원장의 연락처 권한 변경을 허용한다.
create or replace function public.protect_student_contact_permission_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dedicated_write boolean :=
    current_setting('seenit.allow_student_contact_permission_write', true) = 'on';
begin
  if v_dedicated_write and public.is_owner_of_academy(new.academy_id) then
    if coalesce((new.permissions ->> 'canManageStudentContacts')::boolean, false) then
      new.permissions := coalesce(new.permissions, '{}'::jsonb)
        || jsonb_build_object('canViewStudentContacts', true);
    end if;
    return new;
  end if;

  new.permissions := coalesce(new.permissions, '{}'::jsonb)
    - 'canViewStudentContacts' - 'canManageStudentContacts';
  if tg_op = 'UPDATE' then
    if jsonb_typeof(coalesce(old.permissions, '{}'::jsonb) -> 'canViewStudentContacts') = 'boolean' then
      new.permissions := new.permissions || jsonb_build_object(
        'canViewStudentContacts', old.permissions -> 'canViewStudentContacts');
    end if;
    if jsonb_typeof(coalesce(old.permissions, '{}'::jsonb) -> 'canManageStudentContacts') = 'boolean' then
      new.permissions := new.permissions || jsonb_build_object(
        'canManageStudentContacts', old.permissions -> 'canManageStudentContacts');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_student_contact_permission_assignment
  on public.academy_staff_profiles;
create trigger protect_student_contact_permission_assignment
before insert or update of permissions on public.academy_staff_profiles
for each row execute function public.protect_student_contact_permission_assignment();

revoke all on function public.protect_student_contact_permission_assignment()
  from public, anon, authenticated;

create or replace function public.set_student_contact_permissions(
  p_academy_id uuid,
  p_user_id uuid,
  p_can_view boolean default null,
  p_can_manage boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_permissions jsonb;
begin
  if auth.uid() is null or not public.is_owner_of_academy(p_academy_id) then
    raise exception '학생 연락처 권한은 원장만 변경할 수 있어요.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.academy_members m
    where m.academy_id = p_academy_id and m.user_id = p_user_id
      and m.status = 'active' and m.role <> 'owner'
  ) then
    raise exception '활성 상태인 직원을 찾을 수 없어요.';
  end if;

  select coalesce(permissions, '{}'::jsonb) into v_permissions
  from public.academy_staff_profiles
  where academy_id = p_academy_id and user_id = p_user_id
  for update;
  if not found then raise exception '직원 프로필을 찾을 수 없어요.'; end if;

  if p_can_view is null then
    v_permissions := v_permissions - 'canViewStudentContacts';
  else
    v_permissions := v_permissions || jsonb_build_object('canViewStudentContacts', p_can_view);
  end if;
  if p_can_manage is null then
    v_permissions := v_permissions - 'canManageStudentContacts';
  else
    v_permissions := v_permissions || jsonb_build_object('canManageStudentContacts', p_can_manage);
  end if;
  if p_can_manage is true then
    v_permissions := v_permissions || jsonb_build_object('canViewStudentContacts', true);
  end if;
  if p_can_view is false then
    v_permissions := v_permissions || jsonb_build_object('canManageStudentContacts', false);
  end if;

  perform set_config('seenit.allow_student_contact_permission_write', 'on', true);
  update public.academy_staff_profiles
     set permissions = v_permissions, updated_at = now()
   where academy_id = p_academy_id and user_id = p_user_id;
  perform set_config('seenit.allow_student_contact_permission_write', 'off', true);
  return v_permissions;
end;
$$;

revoke all on function public.set_student_contact_permissions(uuid, uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.set_student_contact_permissions(uuid, uuid, boolean, boolean) to authenticated;

comment on function public.has_academy_permission(uuid, text) is
  '활성 학원 멤버의 유효 권한. 학생/연락처 관리 권한은 각각 대응 조회 권한을 포함한다.';
comment on function public.set_student_contact_permissions(uuid, uuid, boolean, boolean) is
  '원장 전용 학생/보호자 연락처 권한 변경 경로. 일반 프로필 저장과 분리한다.';

notify pgrst, 'reload schema';

commit;
