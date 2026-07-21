-- ============================================================
-- 025_operations_manager_role.sql
-- 운영 매니저(manager): 데스크 실무 관리 역할 + 보안 경계
--
-- 역할 원칙
--   - manager: 학생·수납·직원(강사/보조)·근무표·공유자료 운영
--   - owner: 학원 삭제, 최종 설정, 운영 매니저 부여/변경, 급여 관리
--
-- 001~024 적용 후 실행. 기존 row를 삭제하지 않으며 재실행 가능하다.
-- ============================================================

-- ─── 역할 제약 확장 ─────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_default_role_check;
alter table public.profiles add constraint profiles_default_role_check
  check (default_role in ('tutor', 'owner', 'teacher', 'assistant', 'manager'));

alter table public.academy_members drop constraint if exists academy_members_role_check;
alter table public.academy_members add constraint academy_members_role_check
  check (role in ('owner', 'teacher', 'assistant', 'manager'));

alter table public.academy_invitations drop constraint if exists academy_invitations_role_check;
alter table public.academy_invitations add constraint academy_invitations_role_check
  check (role in ('teacher', 'assistant', 'manager'));

alter table public.academy_staff_profiles drop constraint if exists academy_staff_profiles_role_check;
alter table public.academy_staff_profiles add constraint academy_staff_profiles_role_check
  check (role in ('teacher', 'assistant', 'manager'));

alter table public.academy_staff_shifts drop constraint if exists academy_staff_shifts_staff_role_check;
alter table public.academy_staff_shifts add constraint academy_staff_shifts_staff_role_check
  check (staff_role in ('teacher', 'assistant', 'manager'));

alter table public.academy_staff_work_rules drop constraint if exists academy_staff_work_rules_role_chk;
alter table public.academy_staff_work_rules add constraint academy_staff_work_rules_role_chk
  check (staff_role in ('teacher', 'assistant', 'manager'));

alter table public.staff_attendance_logs drop constraint if exists staff_attendance_logs_role_chk;
alter table public.staff_attendance_logs add constraint staff_attendance_logs_role_chk
  check (staff_role in ('teacher', 'assistant', 'manager'));

alter table public.payrolls drop constraint if exists payrolls_staff_type_check;
alter table public.payrolls add constraint payrolls_staff_type_check
  check (staff_type in ('owner', 'teacher', 'assistant', 'manager'));


-- ─── 운영 권한 helper ─────────────────────────────────────────
-- owner는 항상 true, manager는 active membership일 때만 true.
create or replace function public.is_academy_operations_manager(p_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner_of_academy(p_academy_id)
    or exists (
      select 1
      from public.academy_members m
      where m.academy_id = p_academy_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role = 'manager'
    );
$$;

grant execute on function public.is_academy_operations_manager(uuid) to authenticated;

-- 급여와 같이 운영 매니저에게 보이지 않아야 하는 데이터에서 사용한다.
create or replace function public.is_academy_manager(p_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.academy_members m
    where m.academy_id = p_academy_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'manager'
  );
$$;

grant execute on function public.is_academy_manager(uuid) to authenticated;


-- ─── 초대 수락: manager 역할도 허용 ─────────────────────────────
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
  if v_invite.role not in ('teacher', 'assistant', 'manager') then
    raise exception '잘못된 초대 역할이에요.';
  end if;

  insert into public.academy_members as am (academy_id, user_id, role, status)
  values (v_invite.academy_id, v_uid, v_invite.role, 'active')
  on conflict (academy_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = now();

  update public.academy_invitations ai
  set status = 'accepted', accepted_user_id = v_uid, updated_at = now()
  where ai.id = p_invitation_id;

  out_invitation_id := v_invite.id;
  out_academy_id := v_invite.academy_id;
  out_role := v_invite.role;
  out_accepted_user_id := v_uid;
  return next;
end;
$$;


-- ─── 초대 / 직원 프로필 RLS ────────────────────────────────────
-- 운영 매니저는 강사·보조강사만 초대/변경할 수 있다. manager 역할은 원장만 부여한다.
drop policy if exists "academy_invitations select owner or invitee" on public.academy_invitations;
drop policy if exists "academy_invitations select operations or invitee" on public.academy_invitations;
create policy "academy_invitations select operations or invitee"
on public.academy_invitations for select
using (
  public.is_academy_operations_manager(academy_id)
  or lower(email) = lower(coalesce(auth.email(), ''))
);

drop policy if exists "academy_invitations insert by owner" on public.academy_invitations;
drop policy if exists "academy_invitations insert by operations" on public.academy_invitations;
create policy "academy_invitations insert by operations"
on public.academy_invitations for insert
with check (
  invited_by = auth.uid()
  and (
    public.is_owner_of_academy(academy_id)
    or (
      public.is_academy_operations_manager(academy_id)
      and role in ('teacher', 'assistant')
    )
  )
);

drop policy if exists "academy_invitations update by owner or invitee" on public.academy_invitations;
drop policy if exists "academy_invitations update by operations or invitee" on public.academy_invitations;
create policy "academy_invitations update by operations or invitee"
on public.academy_invitations for update
using (
  public.is_academy_operations_manager(academy_id)
  or lower(email) = lower(coalesce(auth.email(), ''))
)
with check (
  (
    public.is_owner_of_academy(academy_id)
    or (
      public.is_academy_operations_manager(academy_id)
      and role in ('teacher', 'assistant')
    )
  )
  or lower(email) = lower(coalesce(auth.email(), ''))
);

drop policy if exists "academy_staff_profiles select owner or self" on public.academy_staff_profiles;
drop policy if exists "academy_staff_profiles select operations or self" on public.academy_staff_profiles;
create policy "academy_staff_profiles select operations or self"
on public.academy_staff_profiles for select
using (public.is_academy_operations_manager(academy_id) or user_id = auth.uid());

drop policy if exists "academy_staff_profiles insert by owner" on public.academy_staff_profiles;
drop policy if exists "academy_staff_profiles insert by operations" on public.academy_staff_profiles;
create policy "academy_staff_profiles insert by operations"
on public.academy_staff_profiles for insert
with check (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_operations_manager(academy_id)
    and role in ('teacher', 'assistant')
  )
);

drop policy if exists "academy_staff_profiles update by owner" on public.academy_staff_profiles;
drop policy if exists "academy_staff_profiles update by operations" on public.academy_staff_profiles;
create policy "academy_staff_profiles update by operations"
on public.academy_staff_profiles for update
using (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_operations_manager(academy_id)
    and role in ('teacher', 'assistant')
  )
)
with check (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_operations_manager(academy_id)
    and role in ('teacher', 'assistant')
  )
);

-- 직원 목록 RPC는 운영 매니저도 필요한 최소 프로필만 조회한다.
create or replace function public.list_academy_member_profiles(p_academy_id uuid)
returns table (
  user_id uuid, display_name text, email text, phone text, account_type text
)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.display_name, p.email, p.phone, p.account_type
  from public.profiles p
  join public.academy_members m on m.user_id = p.id
  where m.academy_id = p_academy_id
    and m.status = 'active'
    and public.is_academy_operations_manager(p_academy_id);
$$;


-- ─── 근무표 / 스케줄 / 근태 RLS ─────────────────────────────────
drop policy if exists "academy_staff_shifts select owner or self" on public.academy_staff_shifts;
drop policy if exists "academy_staff_shifts select operations or self" on public.academy_staff_shifts;
create policy "academy_staff_shifts select operations or self"
on public.academy_staff_shifts for select
using (public.is_academy_operations_manager(academy_id) or staff_user_id = auth.uid());
drop policy if exists "academy_staff_shifts insert by owner" on public.academy_staff_shifts;
drop policy if exists "academy_staff_shifts insert by operations" on public.academy_staff_shifts;
create policy "academy_staff_shifts insert by operations"
on public.academy_staff_shifts for insert
with check (public.is_academy_operations_manager(academy_id));
drop policy if exists "academy_staff_shifts update by owner or self" on public.academy_staff_shifts;
drop policy if exists "academy_staff_shifts update by operations or self" on public.academy_staff_shifts;
create policy "academy_staff_shifts update by operations or self"
on public.academy_staff_shifts for update
using (public.is_academy_operations_manager(academy_id) or staff_user_id = auth.uid())
with check (public.is_academy_operations_manager(academy_id) or staff_user_id = auth.uid());
drop policy if exists "academy_staff_shifts delete by owner" on public.academy_staff_shifts;
drop policy if exists "academy_staff_shifts delete by operations" on public.academy_staff_shifts;
create policy "academy_staff_shifts delete by operations"
on public.academy_staff_shifts for delete
using (public.is_academy_operations_manager(academy_id));

-- 반복 근무·수업 규칙과 예외는 운영 매니저가 관리한다.
drop policy if exists "asw_rules insert owner" on public.academy_staff_work_rules;
drop policy if exists "asw_rules insert operations" on public.academy_staff_work_rules;
drop policy if exists "asw_rules update owner" on public.academy_staff_work_rules;
drop policy if exists "asw_rules update operations" on public.academy_staff_work_rules;
drop policy if exists "asw_rules delete owner" on public.academy_staff_work_rules;
drop policy if exists "asw_rules delete operations" on public.academy_staff_work_rules;
create policy "asw_rules insert operations" on public.academy_staff_work_rules for insert
  with check (public.is_academy_operations_manager(academy_id));
create policy "asw_rules update operations" on public.academy_staff_work_rules for update
  using (public.is_academy_operations_manager(academy_id)) with check (public.is_academy_operations_manager(academy_id));
create policy "asw_rules delete operations" on public.academy_staff_work_rules for delete
  using (public.is_academy_operations_manager(academy_id));

drop policy if exists "asw_exc insert owner" on public.academy_staff_work_exceptions;
drop policy if exists "asw_exc insert operations" on public.academy_staff_work_exceptions;
drop policy if exists "asw_exc update owner" on public.academy_staff_work_exceptions;
drop policy if exists "asw_exc update operations" on public.academy_staff_work_exceptions;
drop policy if exists "asw_exc delete owner" on public.academy_staff_work_exceptions;
drop policy if exists "asw_exc delete operations" on public.academy_staff_work_exceptions;
create policy "asw_exc insert operations" on public.academy_staff_work_exceptions for insert
  with check (public.is_academy_operations_manager(academy_id));
create policy "asw_exc update operations" on public.academy_staff_work_exceptions for update
  using (public.is_academy_operations_manager(academy_id)) with check (public.is_academy_operations_manager(academy_id));
create policy "asw_exc delete operations" on public.academy_staff_work_exceptions for delete
  using (public.is_academy_operations_manager(academy_id));

drop policy if exists "csr insert owner" on public.class_schedule_rules;
drop policy if exists "csr insert operations" on public.class_schedule_rules;
drop policy if exists "csr update owner" on public.class_schedule_rules;
drop policy if exists "csr update operations" on public.class_schedule_rules;
drop policy if exists "csr delete owner" on public.class_schedule_rules;
drop policy if exists "csr delete operations" on public.class_schedule_rules;
create policy "csr insert operations" on public.class_schedule_rules for insert
  with check (public.is_academy_operations_manager(academy_id));
create policy "csr update operations" on public.class_schedule_rules for update
  using (public.is_academy_operations_manager(academy_id)) with check (public.is_academy_operations_manager(academy_id));
create policy "csr delete operations" on public.class_schedule_rules for delete
  using (public.is_academy_operations_manager(academy_id));

drop policy if exists "cse insert owner" on public.class_session_exceptions;
drop policy if exists "cse insert operations" on public.class_session_exceptions;
drop policy if exists "cse update owner" on public.class_session_exceptions;
drop policy if exists "cse update operations" on public.class_session_exceptions;
drop policy if exists "cse delete owner" on public.class_session_exceptions;
drop policy if exists "cse delete operations" on public.class_session_exceptions;
create policy "cse insert operations" on public.class_session_exceptions for insert
  with check (public.is_academy_operations_manager(academy_id));
create policy "cse update operations" on public.class_session_exceptions for update
  using (public.is_academy_operations_manager(academy_id)) with check (public.is_academy_operations_manager(academy_id));
create policy "cse delete operations" on public.class_session_exceptions for delete
  using (public.is_academy_operations_manager(academy_id));

drop policy if exists "saLog insert owner" on public.staff_attendance_logs;
drop policy if exists "saLog insert self or owner" on public.staff_attendance_logs;
drop policy if exists "saLog insert self or operations" on public.staff_attendance_logs;
create policy "saLog insert self or operations"
on public.staff_attendance_logs for insert
with check (
  public.is_academy_operations_manager(academy_id)
  or (staff_user_id = auth.uid() and public.is_member_of_academy(academy_id))
);
drop policy if exists "saLog update owner" on public.staff_attendance_logs;
drop policy if exists "saLog update self or owner" on public.staff_attendance_logs;
drop policy if exists "saLog update self or operations" on public.staff_attendance_logs;
create policy "saLog update self or operations"
on public.staff_attendance_logs for update
using (
  public.is_academy_operations_manager(academy_id)
  or (staff_user_id = auth.uid() and public.is_member_of_academy(academy_id))
)
with check (
  public.is_academy_operations_manager(academy_id)
  or (staff_user_id = auth.uid() and public.is_member_of_academy(academy_id))
);
drop policy if exists "saLog delete owner" on public.staff_attendance_logs;
drop policy if exists "saLog delete operations" on public.staff_attendance_logs;
create policy "saLog delete operations"
on public.staff_attendance_logs for delete
using (public.is_academy_operations_manager(academy_id));

-- 학생·수업·수납 등 일상 운영 데이터의 삭제도 운영 매니저에게 허용한다.
-- payrolls 는 급여 확정/정산 성격이므로 이 목록에서 의도적으로 제외한다.
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('students', 'students_delete_own_or_academy_owner'),
      ('class_groups', 'class_groups_delete_own_or_academy_owner'),
      ('class_sessions', 'class_sessions_delete_own_or_academy_owner'),
      ('lesson_records', 'lesson_records_delete_own_or_academy_owner'),
      ('attendance_records', 'attendance_records_delete_own_or_academy_owner'),
      ('clinic_records', 'clinic_records_delete_own_or_academy_owner'),
      ('payments', 'payments_delete_own_or_academy_owner'),
      ('exam_results', 'exam_results_delete_own_or_academy_owner'),
      ('student_events', 'student_events_delete_own_or_academy_owner')
    ) as rows(table_name, policy_name)
  loop
    execute format('drop policy if exists %I on public.%I', item.policy_name, item.table_name);
    execute format(
      'create policy %I on public.%I for delete using ((mode = ''academy'' and academy_id is not null and public.is_academy_operations_manager(academy_id)) or (mode = ''private'' and user_id = auth.uid()))',
      item.policy_name,
      item.table_name
    );
  end loop;
end $$;

-- 급여는 원장이 최종 관리한다. 기존 강사/보조강사 흐름은 유지하되 운영 매니저는
-- payroll 행을 조회·생성·수정할 수 없도록 명시적으로 제외한다.
drop policy if exists "payrolls_select_own_or_academy_member" on public.payrolls;
create policy "payrolls_select_own_or_academy_member"
on public.payrolls for select
using (
  (mode = 'academy' and academy_id is not null
    and public.is_member_of_academy(academy_id)
    and not public.is_academy_manager(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);
drop policy if exists "payrolls_insert_own_or_academy_member" on public.payrolls;
create policy "payrolls_insert_own_or_academy_member"
on public.payrolls for insert
with check (
  (mode = 'academy' and academy_id is not null
    and public.is_member_of_academy(academy_id)
    and not public.is_academy_manager(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);
drop policy if exists "payrolls_update_own_or_academy_member" on public.payrolls;
create policy "payrolls_update_own_or_academy_member"
on public.payrolls for update
using (
  (mode = 'academy' and academy_id is not null
    and public.is_member_of_academy(academy_id)
    and not public.is_academy_manager(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null
    and public.is_member_of_academy(academy_id)
    and not public.is_academy_manager(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);


-- ─── 공유 드라이브 RLS ─────────────────────────────────────────
-- manager는 등록/삭제/다운로드 정책을 관리하지만, download_allowed=false인
-- 자료의 파일 다운로드는 owner만 가능하다(Edge Function의 기존 검사 유지).
drop policy if exists "academy_drive_files insert owner" on public.academy_drive_files;
drop policy if exists "academy_drive_files insert operations" on public.academy_drive_files;
create policy "academy_drive_files insert operations"
on public.academy_drive_files for insert
with check (
  public.is_academy_operations_manager(academy_id)
  and created_by = auth.uid()
  and storage_path like academy_id::text || '/%'
);
drop policy if exists "academy_drive_files update owner" on public.academy_drive_files;
drop policy if exists "academy_drive_files update operations" on public.academy_drive_files;
create policy "academy_drive_files update operations"
on public.academy_drive_files for update
using (public.is_academy_operations_manager(academy_id))
with check (
  public.is_academy_operations_manager(academy_id)
  and storage_path like academy_id::text || '/%'
);
drop policy if exists "academy_drive_files delete owner" on public.academy_drive_files;
drop policy if exists "academy_drive_files delete operations" on public.academy_drive_files;
create policy "academy_drive_files delete operations"
on public.academy_drive_files for delete
using (public.is_academy_operations_manager(academy_id));

create or replace function public.is_operations_manager_of_academy_drive_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_academy_operations_manager(a.id)
  from public.academies a
  where a.id::text = split_part(p_object_name, '/', 1);
$$;

grant execute on function public.is_operations_manager_of_academy_drive_object(text) to authenticated;

drop policy if exists "academy_drive objects insert owner" on storage.objects;
drop policy if exists "academy_drive objects insert operations" on storage.objects;
create policy "academy_drive objects insert operations"
on storage.objects for insert to authenticated
with check (bucket_id = 'academy-drive' and public.is_operations_manager_of_academy_drive_object(name));
drop policy if exists "academy_drive objects update owner" on storage.objects;
drop policy if exists "academy_drive objects update operations" on storage.objects;
create policy "academy_drive objects update operations"
on storage.objects for update to authenticated
using (bucket_id = 'academy-drive' and public.is_operations_manager_of_academy_drive_object(name))
with check (bucket_id = 'academy-drive' and public.is_operations_manager_of_academy_drive_object(name));
drop policy if exists "academy_drive objects delete owner" on storage.objects;
drop policy if exists "academy_drive objects delete operations" on storage.objects;
create policy "academy_drive objects delete operations"
on storage.objects for delete to authenticated
using (bucket_id = 'academy-drive' and public.is_operations_manager_of_academy_drive_object(name));


-- ─── 가입 트리거의 default_role 허용 범위 확장 ──────────────────
create or replace function public.handle_auth_user_profile_upsert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta jsonb;
  next_account_type text;
  next_default_role text;
begin
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  next_account_type := nullif(meta->>'account_type', '');
  if next_account_type not in ('tutor', 'owner', 'staff') then next_account_type := null; end if;
  next_default_role := nullif(meta->>'default_role', '');
  if next_default_role not in ('tutor', 'owner', 'teacher', 'assistant', 'manager') then
    next_default_role := case next_account_type
      when 'owner' then 'owner' when 'staff' then 'teacher' else 'tutor' end;
  end if;
  insert into public.profiles (id, email, display_name, phone, account_type, default_role)
  values (new.id, lower(new.email), nullif(meta->>'display_name', ''), nullif(meta->>'phone', ''), coalesce(next_account_type, 'tutor'), next_default_role)
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    account_type = coalesce(public.profiles.account_type, excluded.account_type),
    default_role = coalesce(public.profiles.default_role, excluded.default_role),
    updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- End of 025_operations_manager_role.sql
-- ============================================================
