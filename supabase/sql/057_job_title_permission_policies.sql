-- ============================================================
-- 057_job_title_permission_policies.sql
-- 직책과 권한을 하나의 사용자 모델로 통합한다.
--
-- 사용자에게 보이는 기준
--   academies.job_title_permissions : 직책별 기본 권한
--   academy_staff_profiles.permissions : 직원별 예외 권한
--
-- 내부 호환 기준
--   academy_members.role : 담당 수업 중심(teacher) / 학원 전체 운영(manager)
-- ============================================================

begin;

alter table public.academies
  add column if not exists job_title_permissions jsonb not null default
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
        "canManageStudents": false,
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

alter table public.academies
  drop constraint if exists academies_job_title_permissions_object_check;
alter table public.academies
  add constraint academies_job_title_permissions_object_check
  check (jsonb_typeof(job_title_permissions) = 'object');

-- 빈 값으로 저장된 초기 개발 데이터도 사용 가능한 기본값으로 보완한다.
update public.academies
set job_title_permissions =
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
        "canManageStudents": false,
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
  }'::jsonb
where job_title_permissions = '{}'::jsonb;

-- 이미 사용 중인 사용자 정의 직책(직원/대기 초대)은 삭제하지 않고 현재 내부
-- 역할에 맞는 기본 권한으로 정책표에 자동 편입한다.
with used_titles as (
  select
    academy_id,
    btrim(job_title) as job_title,
    bool_or(role = 'manager') as is_manager
  from (
    select academy_id, job_title, role
    from public.academy_staff_profiles
    where nullif(btrim(job_title), '') is not null
    union all
    select academy_id, job_title, role
    from public.academy_invitations
    where status = 'pending'
      and nullif(btrim(job_title), '') is not null
  ) source
  group by academy_id, btrim(job_title)
),
generated_policies as (
  select
    t.academy_id,
    jsonb_object_agg(
      t.job_title,
      jsonb_build_object(
        'role', case when t.is_manager then 'manager' else 'teacher' end,
        'permissions',
          case
            when t.is_manager
              then a.job_title_permissions -> '운영 매니저' -> 'permissions'
            else a.job_title_permissions -> '선생님' -> 'permissions'
          end
      )
    ) as policies
  from used_titles t
  join public.academies a on a.id = t.academy_id
  group by t.academy_id
)
update public.academies a
set job_title_permissions = g.policies || a.job_title_permissions
from generated_policies g
where g.academy_id = a.id;

-- 역할 기본값 → 직책 기본값 → 개인 예외 순서로 덮어쓴다.
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

  -- 공유 드라이브는 모든 활성 직원의 공통 기능이다.
  if p_permission = 'canManageDrive' then
    return true;
  end if;

  v_result := case v_role
    when 'teacher' then p_permission in (
      'canViewStudents',
      'canEditLessonRecords',
      'canEditAttendance',
      'canEditClinicRecords',
      'canViewPayroll'
    )
    when 'assistant' then p_permission in (
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

-- 학원 설정에서 직책의 담당 범위를 바꾸면 기존 직원의 내부 역할도 맞춘다.
create or replace function public.sync_member_roles_from_job_title_policies()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.academy_members m
  set role = case
      when new.job_title_permissions -> asp.job_title ->> 'role' = 'manager'
        then 'manager'
      else 'teacher'
    end,
    updated_at = now()
  from public.academy_staff_profiles asp
  where asp.academy_id = new.id
    and m.academy_id = new.id
    and m.user_id = asp.user_id
    and m.role in ('teacher', 'assistant', 'manager')
    and m.status = 'active'
    and new.job_title_permissions ? asp.job_title
    and m.role is distinct from case
      when new.job_title_permissions -> asp.job_title ->> 'role' = 'manager'
        then 'manager'
      else 'teacher'
    end;

  return new;
end;
$$;

drop trigger if exists sync_member_roles_from_job_title_policies
  on public.academies;
create trigger sync_member_roles_from_job_title_policies
after update of job_title_permissions
on public.academies
for each row
when (old.job_title_permissions is distinct from new.job_title_permissions)
execute function public.sync_member_roles_from_job_title_policies();

-- 초대가 대기 중인 사이 직책 정책이 바뀌어도 수락 시점의 최신 범위를 쓴다.
create or replace function public.accept_academy_invitation(p_invitation_id uuid)
returns table (
  out_invitation_id    uuid,
  out_academy_id       uuid,
  out_role             text,
  out_accepted_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_email     text := coalesce(auth.email(), '');
  v_invite    public.academy_invitations%rowtype;
  v_member_id uuid;
  v_role      text;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  select * into v_invite
  from public.academy_invitations ai
  where ai.id = p_invitation_id
  for update;

  if not found then raise exception '초대를 찾을 수 없어요.'; end if;
  if v_invite.status <> 'pending' then raise exception '이미 처리된 초대예요.'; end if;
  if lower(v_invite.email) <> lower(v_email) then
    raise exception '초대받은 이메일과 로그인 이메일이 달라요.';
  end if;

  select case
      when a.job_title_permissions -> v_invite.job_title ->> 'role' = 'manager'
        then 'manager'
      when a.job_title_permissions ? v_invite.job_title
        then 'teacher'
      else v_invite.role
    end
  into v_role
  from public.academies a
  where a.id = v_invite.academy_id;

  if v_role not in ('teacher', 'manager') then
    raise exception '잘못된 초대 직책이에요.';
  end if;

  insert into public.academy_members as am (academy_id, user_id, role, status)
  values (v_invite.academy_id, v_uid, v_role, 'active')
  on conflict (academy_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = now()
  returning am.id into v_member_id;

  insert into public.academy_staff_profiles as asp (
    academy_id, user_id, member_id, role, job_title, subjects, wage_type,
    hourly_wage, monthly_salary, status
  )
  values (
    v_invite.academy_id,
    v_uid,
    v_member_id,
    v_role,
    coalesce(
      nullif(btrim(v_invite.job_title), ''),
      case v_role when 'manager' then '운영 매니저' else '선생님' end
    ),
    '[]'::jsonb,
    'hourly',
    0,
    0,
    'active'
  )
  on conflict (academy_id, user_id) do update
    set member_id = excluded.member_id,
        role = excluded.role,
        job_title = excluded.job_title,
        status = 'active',
        updated_at = now();

  update public.academy_invitations ai
  set status = 'accepted', accepted_user_id = v_uid, updated_at = now()
  where ai.id = p_invitation_id;

  out_invitation_id := v_invite.id;
  out_academy_id := v_invite.academy_id;
  out_role := v_role;
  out_accepted_user_id := v_uid;
  return next;
end;
$$;

revoke all on function public.accept_academy_invitation(uuid) from public;
grant execute on function public.accept_academy_invitation(uuid) to authenticated;

comment on column public.academies.job_title_permissions is
  '직책별 담당 범위(role)와 기본 기능 권한. 직원별 예외는 academy_staff_profiles.permissions에 저장한다.';
comment on column public.academy_staff_profiles.job_title is
  '직원의 직책. academies.job_title_permissions 기본 권한을 연결하는 키다.';
comment on column public.academy_staff_profiles.permissions is
  '직책 기본 권한 위에 덮어쓰는 직원별 boolean 예외값.';

notify pgrst, 'reload schema';

commit;
