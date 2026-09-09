-- Seenit — 권한 우회 차단과 학생 연락처 최소 공개
--
-- 핵심 원칙
--   1) 학생/보호자 연락처와 등하원 PIN은 원장 또는 원장이 개별 위임한 직원만 본다.
--   2) 학생 관리 권한과 학생 연락처 권한은 독립적이다.
--   3) 초대받은 사용자는 초대 원본을 직접 수정할 수 없다.
--   4) SECURITY DEFINER 조회 함수도 일반 RLS와 같은 담당 범위를 지킨다.

begin;

-- 과거 화면 버그로 학생 관리 권한이 켜진 모든 직책이 manager로 저장될 수
-- 있었다. 내부 manager 역할은 기본 '운영 매니저'에만 남기고, 실제 기능은
-- 직책/개인 권한으로 판단한다. academy 설정 UPDATE 트리거가 멤버 역할도 맞춘다.
with normalized as (
  select a.id,
         jsonb_object_agg(
           entry.key,
           case
             when jsonb_typeof(entry.value) = 'object' then
               entry.value || jsonb_build_object(
                 'role', case when entry.key = '운영 매니저' then 'manager' else 'teacher' end)
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

-- ─── 학생 연락처 권한 ────────────────────────────────────────────

create or replace function public.can_view_student_contacts(p_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canViewStudentContacts')
    or public.has_academy_permission(p_academy_id, 'canManageStudentContacts');
$$;

revoke all on function public.can_view_student_contacts(uuid) from public;
revoke all on function public.can_view_student_contacts(uuid) from authenticated;

create or replace function public.can_manage_student_contacts(p_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStudentContacts');
$$;

revoke all on function public.can_manage_student_contacts(uuid) from public;
revoke all on function public.can_manage_student_contacts(uuid) from authenticated;

-- 테이블 직접 조회에서는 민감 컬럼 권한 자체를 제거한다. RLS만으로는 컬럼별
-- 마스킹을 할 수 없으므로, 앱은 아래 secure RPC로 학생을 읽는다.
revoke select on table public.students from public, anon, authenticated;

do $$
declare
  v_columns text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into v_columns
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'students'
     and column_name not in (
       'phone', 'parent_phone', 'parent_name', 'parent_title',
       'parent_title_custom', 'checkin_pin'
     );
  if v_columns is not null then
    execute format('grant select (%s) on table public.students to authenticated', v_columns);
  end if;
end $$;

create or replace function public.list_academy_students_secure(p_academy_id uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_can_view_contacts boolean := false;
  v_can_manage_contacts boolean := false;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if not public.has_academy_permission(p_academy_id, 'canViewStudents')
     and not public.is_owner_of_academy(p_academy_id) then
    raise exception '학생 정보를 확인할 권한이 없어요.' using errcode = '42501';
  end if;

  v_can_view_contacts := public.can_view_student_contacts(p_academy_id);
  v_can_manage_contacts := public.can_manage_student_contacts(p_academy_id);

  return query
  select to_jsonb(s)
    || jsonb_build_object(
      'phone', case when v_can_view_contacts then s.phone else null end,
      'parent_phone', case when v_can_view_contacts then s.parent_phone else null end,
      'parent_name', case when v_can_view_contacts then s.parent_name else null end,
      'parent_title', case when v_can_view_contacts then s.parent_title else null end,
      'parent_title_custom', case when v_can_view_contacts then s.parent_title_custom else null end,
      'checkin_pin', case when v_can_manage_contacts then s.checkin_pin else null end
    )
  from public.students s
  where s.academy_id = p_academy_id
    and s.mode = 'academy'
  order by s.name, s.id;
end;
$$;

revoke all on function public.list_academy_students_secure(uuid) from public;
grant execute on function public.list_academy_students_secure(uuid) to authenticated;

create or replace function public.list_my_private_students_secure()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(s)
  from public.students s
  where s.mode = 'private' and s.user_id = auth.uid()
  order by s.name, s.id;
$$;

revoke all on function public.list_my_private_students_secure() from public;
grant execute on function public.list_my_private_students_secure() to authenticated;

create or replace function public.get_student_secure(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_can_view_contacts boolean := false;
  v_can_manage_contacts boolean := false;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then return null; end if;

  if v_student.mode = 'private' then
    if v_student.user_id is distinct from auth.uid() then
      raise exception '학생 정보를 확인할 권한이 없어요.' using errcode = '42501';
    end if;
    return to_jsonb(v_student);
  end if;

  if not public.is_owner_of_academy(v_student.academy_id)
     and not public.has_academy_permission(v_student.academy_id, 'canViewStudents') then
    raise exception '학생 정보를 확인할 권한이 없어요.' using errcode = '42501';
  end if;

  v_can_view_contacts := public.can_view_student_contacts(v_student.academy_id);
  v_can_manage_contacts := public.can_manage_student_contacts(v_student.academy_id);
  return to_jsonb(v_student)
    || jsonb_build_object(
      'phone', case when v_can_view_contacts then v_student.phone else null end,
      'parent_phone', case when v_can_view_contacts then v_student.parent_phone else null end,
      'parent_name', case when v_can_view_contacts then v_student.parent_name else null end,
      'parent_title', case when v_can_view_contacts then v_student.parent_title else null end,
      'parent_title_custom', case when v_can_view_contacts then v_student.parent_title_custom else null end,
      'checkin_pin', case when v_can_manage_contacts then v_student.checkin_pin else null end
    );
end;
$$;

revoke all on function public.get_student_secure(uuid) from public;
grant execute on function public.get_student_secure(uuid) to authenticated;

-- 직접 API UPDATE/INSERT로 연락처를 쓰는 경우도 권한을 검증한다.
create or replace function public.enforce_student_contact_write_permission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contacts_changed boolean;
begin
  if new.mode = 'private' then
    if new.user_id is distinct from auth.uid() then
      raise exception '개인 학생 연락처를 변경할 권한이 없어요.' using errcode = '42501';
    end if;
    return new;
  end if;

  v_contacts_changed := tg_op = 'INSERT'
    and num_nonnulls(new.phone, new.parent_phone, new.parent_name, new.parent_title,
      new.parent_title_custom, new.checkin_pin) > 0;
  if tg_op = 'UPDATE' then
    v_contacts_changed := row(
      new.phone, new.parent_phone, new.parent_name, new.parent_title,
      new.parent_title_custom, new.checkin_pin
    ) is distinct from row(
      old.phone, old.parent_phone, old.parent_name, old.parent_title,
      old.parent_title_custom, old.checkin_pin
    );
  end if;

  if v_contacts_changed and not public.can_manage_student_contacts(new.academy_id) then
    raise exception '학생·보호자 연락처를 변경할 권한이 없어요.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_student_contact_write_permission on public.students;
create trigger enforce_student_contact_write_permission
before insert or update of phone, parent_phone, parent_name, parent_title, parent_title_custom, checkin_pin
on public.students
for each row execute function public.enforce_student_contact_write_permission();

-- 새 PIN은 전화번호에서 파생하지 않는다. 학원 안에서 중복되지 않는 임의의
-- 4자리 값을 발급하며, 기존 PIN은 현장 사용 중일 수 있어 자동 회전하지 않는다.
create or replace function public.assign_random_student_checkin_pin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pin text;
  v_attempt integer := 0;
begin
  if new.mode <> 'academy' or new.checkin_pin is not null then return new; end if;
  loop
    v_attempt := v_attempt + 1;
    v_pin := lpad(floor(random() * 10000)::integer::text, 4, '0');
    exit when not exists (
      select 1 from public.students s
      where s.academy_id = new.academy_id and s.checkin_pin = v_pin
        and s.id is distinct from new.id
    );
    if v_attempt >= 100 then
      raise exception '사용 가능한 등하원 PIN을 발급하지 못했어요. 다시 시도해주세요.';
    end if;
  end loop;
  new.checkin_pin := v_pin;
  return new;
end;
$$;

drop trigger if exists assign_random_student_checkin_pin on public.students;
drop trigger if exists zz_assign_random_student_checkin_pin on public.students;
-- PostgreSQL은 같은 시점의 트리거를 이름순으로 실행한다. 권한 검사가 먼저
-- 사용자가 보낸 값을 확인하고, 그 뒤 서버 기본 PIN을 채우도록 zz 접두어를 쓴다.
create trigger zz_assign_random_student_checkin_pin
before insert on public.students
for each row execute function public.assign_random_student_checkin_pin();

-- 연락처 권한은 직책 전체가 아닌 직원별로만, 원장이 직접 관리한다.
create or replace function public.protect_student_contact_permission_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_owner_of_academy(new.academy_id) then return new; end if;

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

  update public.academy_staff_profiles
     set permissions = v_permissions, updated_at = now()
   where academy_id = p_academy_id and user_id = p_user_id;
  return v_permissions;
end;
$$;

revoke all on function public.set_student_contact_permissions(uuid, uuid, boolean, boolean) from public;
grant execute on function public.set_student_contact_permissions(uuid, uuid, boolean, boolean) to authenticated;

-- ─── 초대 권한 상승 차단 ─────────────────────────────────────────

drop policy if exists "academy_invitations insert by operations" on public.academy_invitations;
create policy "academy_invitations insert by operations"
on public.academy_invitations for insert
with check (
  invited_by = auth.uid()
  and (
    public.is_owner_of_academy(academy_id)
    or (
      public.has_academy_permission(academy_id, 'canManageStaff')
      and role in ('teacher', 'pending')
    )
  )
);

drop policy if exists "academy_invitations update by operations or invitee" on public.academy_invitations;
drop policy if exists "academy_invitations update by owner or invitee" on public.academy_invitations;
drop policy if exists "academy_invitations update by operations" on public.academy_invitations;
create policy "academy_invitations update by operations"
on public.academy_invitations for update
using (
  public.is_owner_of_academy(academy_id)
  or public.has_academy_permission(academy_id, 'canManageStaff')
)
with check (
  public.is_owner_of_academy(academy_id)
  or (
    public.has_academy_permission(academy_id, 'canManageStaff')
    and role in ('teacher', 'pending')
  )
);

-- 프로필 검색은 학원 직원 관리 권한이 있는 경우에만 허용한다.
revoke all on function public.search_profile_by_email(text) from authenticated;

create or replace function public.search_profile_by_email(p_academy_id uuid, p_email text)
returns table (id uuid, email text, display_name text, phone text, account_type text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cleaned text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.uid() is null or not (
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStaff')
  ) then
    raise exception '직원을 검색할 권한이 없어요.' using errcode = '42501';
  end if;
  if v_cleaned = '' or length(v_cleaned) < 3 then return; end if;
  return query
  select p.id, p.email, p.display_name, p.phone, p.account_type
  from public.profiles p where lower(p.email) = v_cleaned limit 1;
end;
$$;

revoke all on function public.search_profile_by_email(uuid, text) from public;
grant execute on function public.search_profile_by_email(uuid, text) to authenticated;

-- ─── 클리닉 조회 정책을 화면 권한과 일치시킨다 ────────────────────

drop policy if exists "clinic_events_select_members" on public.clinic_events;
drop policy if exists "clinic_events_select_by_permission" on public.clinic_events;
create policy "clinic_events_select_by_permission"
on public.clinic_events for select
using (public.has_academy_permission(academy_id, 'canEditClinicRecords'));

drop policy if exists "clinic_event_students_select_members" on public.clinic_event_students;
drop policy if exists "clinic_event_students_select_by_permission" on public.clinic_event_students;
create policy "clinic_event_students_select_by_permission"
on public.clinic_event_students for select
using (
  exists (
    select 1 from public.clinic_events event
    where event.id = clinic_event_id
      and public.has_academy_permission(event.academy_id, 'canEditClinicRecords')
  )
);

-- ─── 수업 회차 SECURITY DEFINER 반환 범위 제한 ───────────────────

do $$
begin
  if to_regprocedure('public.ensure_class_sessions_for_range_internal(uuid,date,date,uuid)') is null
     and to_regprocedure('public.ensure_class_sessions_for_range(uuid,date,date,uuid)') is not null then
    alter function public.ensure_class_sessions_for_range(uuid, date, date, uuid)
      rename to ensure_class_sessions_for_range_internal;
  end if;
end $$;

revoke all on function public.ensure_class_sessions_for_range_internal(uuid, date, date, uuid) from public;
revoke all on function public.ensure_class_sessions_for_range_internal(uuid, date, date, uuid) from authenticated;

create or replace function public.ensure_class_sessions_for_range(
  p_academy_id uuid,
  p_from_date date,
  p_to_date date,
  p_class_group_id uuid default null
)
returns setof public.class_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group record;
  v_can_manage boolean;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  if p_academy_id is null or p_from_date is null or p_to_date is null
     or p_from_date > p_to_date or (p_to_date - p_from_date) > 93 then
    raise exception '학원과 최대 94일의 올바른 날짜 범위가 필요해요.' using errcode = '22023';
  end if;
  if not public.is_member_of_academy(p_academy_id) then
    raise exception '이 학원의 수업을 확인할 권한이 없어요.' using errcode = '42501';
  end if;

  v_can_manage := public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageClasses');

  if p_class_group_id is not null then
    if not v_can_manage
       and not public.can_access_academy_class_group(p_academy_id, p_class_group_id) then
      raise exception '담당하지 않은 반의 수업을 확인할 수 없어요.' using errcode = '42501';
    end if;
    perform public.ensure_class_sessions_for_range_internal(
      p_academy_id, p_from_date, p_to_date, p_class_group_id);
  elsif v_can_manage then
    perform public.ensure_class_sessions_for_range_internal(
      p_academy_id, p_from_date, p_to_date, null);
  else
    for v_group in
      select g.id from public.class_groups g
      where g.academy_id = p_academy_id
        and public.can_access_academy_class_group(p_academy_id, g.id)
    loop
      perform public.ensure_class_sessions_for_range_internal(
        p_academy_id, p_from_date, p_to_date, v_group.id);
    end loop;
  end if;

  return query
  select cs.* from public.class_sessions cs
  where cs.academy_id = p_academy_id
    and cs.date between p_from_date and p_to_date
    and (p_class_group_id is null or cs.class_group_id = p_class_group_id)
    and (
      v_can_manage
      or public.can_access_academy_class_session(p_academy_id, cs.id)
    )
  order by cs.date, cs.start_time, cs.id;
end;
$$;

revoke all on function public.ensure_class_sessions_for_range(uuid, date, date, uuid) from public;
grant execute on function public.ensure_class_sessions_for_range(uuid, date, date, uuid) to authenticated;

-- 멤버십이 종료되면 이미 만들어진 미래 근무도 취소한다. 과거 근무는 보존한다.
create or replace function public.cancel_future_shifts_for_inactive_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'active' and new.status <> 'active' then
    update public.academy_staff_work_rules
       set is_active = false, updated_at = now()
     where academy_id = new.academy_id and staff_user_id = new.user_id and is_active = true;
    update public.academy_staff_shifts
       set status = 'canceled', updated_at = now()
     where academy_id = new.academy_id and staff_user_id = new.user_id
       and date > (now() at time zone 'Asia/Seoul')::date
       and status = 'scheduled';
  end if;
  return new;
end;
$$;

drop trigger if exists cancel_future_shifts_for_inactive_member on public.academy_members;
create trigger cancel_future_shifts_for_inactive_member
after update of status on public.academy_members
for each row execute function public.cancel_future_shifts_for_inactive_member();

notify pgrst, 'reload schema';

commit;
