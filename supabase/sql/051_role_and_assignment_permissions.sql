-- ============================================================
-- 051_role_and_assignment_permissions.sql
-- 역할 기본 권한 + 담당 배정 범위를 하나의 서버 권한 모델로 통일한다.
--
-- 적용 전제: 001 ~ 050 적용 완료
--
-- 원장          : 학원 전체
-- 운영 매니저   : 학원 운영 전체(소유권/타인 급여/매니저 임명 제외)
-- 선생님        : 담당 반, 담당·대체 회차, 그 회차의 학생과 기록
--
-- academy_staff_profiles.permissions/scope 컬럼은 데이터 호환을 위해 남기지만,
-- 권한 판정에는 사용하지 않는다. 권한의 원본은 academy_members.role과
-- class_groups/class_sessions의 teacher_user_id 배정이다.
-- ============================================================

begin;

-- ─── 1. 역할 고정 권한 ──────────────────────────────────────
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
begin
  if auth.uid() is null or p_academy_id is null then
    return false;
  end if;

  if public.is_owner_of_academy(p_academy_id) then
    return true;
  end if;

  select m.role
    into v_role
  from public.academy_members m
  where m.academy_id = p_academy_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;

  if not found then
    return false;
  end if;

  return case v_role
    when 'teacher' then p_permission in (
      'canViewStudents',
      'canEditLessonRecords',
      'canEditAttendance',
      'canEditClinicRecords',
      'canViewPayroll'
    )
    -- 적용 전 남아 있는 assistant는 선생님과 동일하게 처리한다.
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
      'canManageStaff',
      'canManageDrive'
    )
    else false
  end;
end;
$$;

revoke all on function public.has_academy_permission(uuid, text) from public;
grant execute on function public.has_academy_permission(uuid, text) to authenticated;

-- SQL 013 이전 반은 teacher_user_id가 비어 있을 수 있다. 서버 안정 ID로
-- 판별 가능한 기존 행만 보강하고, 임의 로컬 ID는 잘못 연결하지 않는다.
update public.class_groups g
set teacher_user_id = a.owner_id
from public.academies a
where g.academy_id = a.id
  and g.mode = 'academy'
  and g.teacher_user_id is null
  and (g.teacher_type = 'owner' or g.teacher_id = 'owner');

update public.class_groups g
set teacher_user_id = split_part(g.teacher_id, '_', 2)::uuid
where g.mode = 'academy'
  and g.academy_id is not null
  and g.teacher_user_id is null
  and g.teacher_id ~ '^(teacher|manager)_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  and exists (
    select 1
    from public.academy_members m
    where m.academy_id = g.academy_id
      and m.user_id = split_part(g.teacher_id, '_', 2)::uuid
      and m.role in ('teacher', 'assistant', 'manager')
      and m.status = 'active'
  );

-- 회차는 현재 반의 담당자를 우선 상속한다. 반이 없는 예전 회차도 같은 안정
-- ID 형식이 있으면 멤버십을 확인한 뒤에만 보강한다.
update public.class_sessions s
set teacher_user_id = g.teacher_user_id
from public.class_groups g
where s.class_group_id = g.id
  and s.academy_id = g.academy_id
  and s.mode = 'academy'
  and s.teacher_user_id is null
  and g.teacher_user_id is not null;

update public.class_sessions s
set teacher_user_id = split_part(s.teacher_id, '_', 2)::uuid
where s.mode = 'academy'
  and s.academy_id is not null
  and s.teacher_user_id is null
  and s.teacher_id ~ '^(teacher|manager)_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  and exists (
    select 1
    from public.academy_members m
    where m.academy_id = s.academy_id
      and m.user_id = split_part(s.teacher_id, '_', 2)::uuid
      and m.role in ('teacher', 'assistant', 'manager')
      and m.status = 'active'
  );

-- ─── 2. 담당 배정 판정 ──────────────────────────────────────
create or replace function public.is_assigned_to_class_group(
  p_academy_id uuid,
  p_class_group_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_groups g
    where g.id = p_class_group_id
      and g.academy_id = p_academy_id
      and g.mode = 'academy'
      and g.teacher_user_id = auth.uid()
  );
$$;

create or replace function public.is_assigned_to_class_session(
  p_academy_id uuid,
  p_class_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_sessions s
    left join public.class_groups g on g.id = s.class_group_id
    where s.id = p_class_session_id
      and s.academy_id = p_academy_id
      and s.mode = 'academy'
      and (
        s.teacher_user_id = auth.uid()
        or s.substitute_teacher_user_id = auth.uid()
        or g.teacher_user_id = auth.uid()
      )
  );
$$;

create or replace function public.is_assigned_to_student(
  p_academy_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.class_groups g
      where g.academy_id = p_academy_id
        and g.mode = 'academy'
        and g.teacher_user_id = auth.uid()
        and coalesce(g.student_ids, '[]'::jsonb)
          @> jsonb_build_array(p_student_id::text)
    )
    or exists (
      select 1
      from public.class_sessions s
      left join public.class_groups g on g.id = s.class_group_id
      where s.academy_id = p_academy_id
        and s.mode = 'academy'
        and (
          s.teacher_user_id = auth.uid()
          or s.substitute_teacher_user_id = auth.uid()
          or g.teacher_user_id = auth.uid()
        )
        and coalesce(s.student_ids, '[]'::jsonb)
          @> jsonb_build_array(p_student_id::text)
    );
$$;

create or replace function public.can_access_academy_class_group(
  p_academy_id uuid,
  p_class_group_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageClasses')
    or (
      public.has_academy_permission(p_academy_id, 'canEditLessonRecords')
      and public.is_assigned_to_class_group(p_academy_id, p_class_group_id)
    );
$$;

create or replace function public.can_access_academy_class_session(
  p_academy_id uuid,
  p_class_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageClasses')
    or (
      public.has_academy_permission(p_academy_id, 'canEditLessonRecords')
      and public.is_assigned_to_class_session(p_academy_id, p_class_session_id)
    );
$$;

create or replace function public.can_access_academy_student(
  p_academy_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStudents')
    or (
      public.has_academy_permission(p_academy_id, 'canViewStudents')
      and public.is_assigned_to_student(p_academy_id, p_student_id)
    );
$$;

revoke all on function public.is_assigned_to_class_group(uuid, uuid) from public;
revoke all on function public.is_assigned_to_class_session(uuid, uuid) from public;
revoke all on function public.is_assigned_to_student(uuid, uuid) from public;
revoke all on function public.can_access_academy_class_group(uuid, uuid) from public;
revoke all on function public.can_access_academy_class_session(uuid, uuid) from public;
revoke all on function public.can_access_academy_student(uuid, uuid) from public;
grant execute on function public.is_assigned_to_class_group(uuid, uuid) to authenticated;
grant execute on function public.is_assigned_to_class_session(uuid, uuid) to authenticated;
grant execute on function public.is_assigned_to_student(uuid, uuid) to authenticated;
grant execute on function public.can_access_academy_class_group(uuid, uuid) to authenticated;
grant execute on function public.can_access_academy_class_session(uuid, uuid) to authenticated;
grant execute on function public.can_access_academy_student(uuid, uuid) to authenticated;

-- 활성 직원의 역할 변경은 원장만 할 수 있다. 운영 매니저의 신규 선생님
-- 초대 수락 처리는 security-definer assign_academy_member_role RPC가 별도로
-- 검증하므로 이 직접 UPDATE 정책을 넓힐 필요가 없다.
drop policy if exists "academy_members update by operations"
  on public.academy_members;
drop policy if exists "academy_members update by owner"
  on public.academy_members;
create policy "academy_members update by owner"
on public.academy_members for update
using (public.is_owner_of_academy(academy_id))
with check (public.is_owner_of_academy(academy_id));

-- ─── 3. 학생은 운영자 전체 / 선생님 담당 범위 ───────────────
drop policy if exists "students_select_by_permission" on public.students;
create policy "students_select_by_permission"
on public.students for select
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.can_access_academy_student(academy_id, id)
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "students_insert_by_permission" on public.students;
create policy "students_insert_by_permission"
on public.students for insert
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and (
      public.is_owner_of_academy(academy_id)
      or public.has_academy_permission(academy_id, 'canManageStudents')
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "students_update_by_permission" on public.students;
create policy "students_update_by_permission"
on public.students for update
using (
  (
    mode = 'academy'
    and academy_id is not null
    and (
      public.is_owner_of_academy(academy_id)
      or public.has_academy_permission(academy_id, 'canManageStudents')
    )
  )
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and (
      public.is_owner_of_academy(academy_id)
      or public.has_academy_permission(academy_id, 'canManageStudents')
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "students_delete_by_permission" on public.students;
create policy "students_delete_by_permission"
on public.students for delete
using (
  (
    mode = 'academy'
    and academy_id is not null
    and (
      public.is_owner_of_academy(academy_id)
      or public.has_academy_permission(academy_id, 'canManageStudents')
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

-- ─── 4. 반/회차 조회는 담당 범위, 일정 변경은 운영자 ────────
drop policy if exists "class_groups_select_members" on public.class_groups;
create policy "class_groups_select_members"
on public.class_groups for select
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.can_access_academy_class_group(academy_id, id)
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_sessions_select_members" on public.class_sessions;
create policy "class_sessions_select_members"
on public.class_sessions for select
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.can_access_academy_class_session(academy_id, id)
  )
  or (mode = 'private' and user_id = auth.uid())
);

-- 수업 기록 권한으로 class_sessions의 날짜·담당자·학생까지 바꿀 수 있었던
-- 정책을 제거한다. 일반 UPDATE는 반 관리 권한만 허용한다.
drop policy if exists "class_sessions_update_by_permission" on public.class_sessions;
create policy "class_sessions_update_by_permission"
on public.class_sessions for update
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageClasses')
  )
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageClasses')
  )
  or (mode = 'private' and user_id = auth.uid())
);

-- 담당 선생님의 유일한 회차 변경은 "완료" 처리로 제한한다.
create or replace function public.complete_assigned_class_session(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.class_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  select *
    into v_session
  from public.class_sessions
  where id = p_session_id
    and mode = 'academy'
  for update;

  if not found then
    raise exception '수업 회차를 찾을 수 없어요.' using errcode = 'P0002';
  end if;

  if not (
    public.is_owner_of_academy(v_session.academy_id)
    or public.has_academy_permission(v_session.academy_id, 'canManageClasses')
    or (
      public.has_academy_permission(v_session.academy_id, 'canEditLessonRecords')
      and public.is_assigned_to_class_session(v_session.academy_id, v_session.id)
    )
  ) then
    raise exception '이 수업을 완료할 권한이 없어요.' using errcode = '42501';
  end if;

  update public.class_sessions
  set status = 'completed', updated_at = now()
  where id = p_session_id
  returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

revoke all on function public.complete_assigned_class_session(uuid) from public;
grant execute on function public.complete_assigned_class_session(uuid) to authenticated;

-- ─── 5. 수업 기록 / 출석 / 클리닉 ───────────────────────────
drop policy if exists "lesson_records_select_members" on public.lesson_records;
create policy "lesson_records_select_members"
on public.lesson_records for select
using (
  (
    mode = 'academy'
    and academy_id is not null
    and (
      (class_session_id is not null and public.can_access_academy_class_session(academy_id, class_session_id))
      or (class_session_id is null and class_group_id is not null
          and public.can_access_academy_class_group(academy_id, class_group_id))
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "lesson_records_insert_by_permission" on public.lesson_records;
create policy "lesson_records_insert_by_permission"
on public.lesson_records for insert
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditLessonRecords')
    and (
      public.has_academy_permission(academy_id, 'canManageClasses')
      or (class_session_id is not null
          and public.is_assigned_to_class_session(academy_id, class_session_id))
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "lesson_records_update_by_permission" on public.lesson_records;
create policy "lesson_records_update_by_permission"
on public.lesson_records for update
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditLessonRecords')
    and (
      public.has_academy_permission(academy_id, 'canManageClasses')
      or (class_session_id is not null
          and public.is_assigned_to_class_session(academy_id, class_session_id))
    )
  )
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditLessonRecords')
    and (
      public.has_academy_permission(academy_id, 'canManageClasses')
      or (class_session_id is not null
          and public.is_assigned_to_class_session(academy_id, class_session_id))
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "lesson_records_delete_by_permission" on public.lesson_records;
create policy "lesson_records_delete_by_permission"
on public.lesson_records for delete
using (
  mode = 'private' and user_id = auth.uid()
  or (
    mode = 'academy'
    and academy_id is not null
    and (
      public.is_owner_of_academy(academy_id)
      or public.has_academy_permission(academy_id, 'canManageClasses')
    )
  )
);

drop policy if exists "attendance_records_select_members" on public.attendance_records;
create policy "attendance_records_select_members"
on public.attendance_records for select
using (
  (
    mode = 'academy'
    and academy_id is not null
    and (
      (class_session_id is not null and public.can_access_academy_class_session(academy_id, class_session_id))
      or public.can_access_academy_student(academy_id, student_id)
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "attendance_records_insert_by_permission" on public.attendance_records;
create policy "attendance_records_insert_by_permission"
on public.attendance_records for insert
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditAttendance')
    and (
      public.has_academy_permission(academy_id, 'canManageClasses')
      or (class_session_id is not null
          and public.is_assigned_to_class_session(academy_id, class_session_id))
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "attendance_records_update_by_permission" on public.attendance_records;
create policy "attendance_records_update_by_permission"
on public.attendance_records for update
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditAttendance')
    and (
      public.has_academy_permission(academy_id, 'canManageClasses')
      or (class_session_id is not null
          and public.is_assigned_to_class_session(academy_id, class_session_id))
    )
  )
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditAttendance')
    and (
      public.has_academy_permission(academy_id, 'canManageClasses')
      or (class_session_id is not null
          and public.is_assigned_to_class_session(academy_id, class_session_id))
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "attendance_records_delete_by_permission" on public.attendance_records;
create policy "attendance_records_delete_by_permission"
on public.attendance_records for delete
using (
  mode = 'private' and user_id = auth.uid()
  or (
    mode = 'academy'
    and academy_id is not null
    and (
      public.is_owner_of_academy(academy_id)
      or public.has_academy_permission(academy_id, 'canManageClasses')
    )
  )
);

drop policy if exists "clinic_records_select_members" on public.clinic_records;
create policy "clinic_records_select_members"
on public.clinic_records for select
using (
  (
    mode = 'academy'
    and academy_id is not null
    and (
      (class_session_id is not null and public.can_access_academy_class_session(academy_id, class_session_id))
      or (class_group_id is not null and public.can_access_academy_class_group(academy_id, class_group_id))
      or public.can_access_academy_student(academy_id, student_id)
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "clinic_records_insert_by_permission" on public.clinic_records;
create policy "clinic_records_insert_by_permission"
on public.clinic_records for insert
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditClinicRecords')
    and (
      public.has_academy_permission(academy_id, 'canManageStudents')
      or public.is_assigned_to_student(academy_id, student_id)
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "clinic_records_update_by_permission" on public.clinic_records;
create policy "clinic_records_update_by_permission"
on public.clinic_records for update
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditClinicRecords')
    and (
      public.has_academy_permission(academy_id, 'canManageStudents')
      or public.is_assigned_to_student(academy_id, student_id)
    )
  )
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditClinicRecords')
    and (
      public.has_academy_permission(academy_id, 'canManageStudents')
      or public.is_assigned_to_student(academy_id, student_id)
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "clinic_records_delete_by_permission" on public.clinic_records;
create policy "clinic_records_delete_by_permission"
on public.clinic_records for delete
using (
  mode = 'private' and user_id = auth.uid()
  or (
    mode = 'academy'
    and academy_id is not null
    and (
      public.is_owner_of_academy(academy_id)
      or public.has_academy_permission(academy_id, 'canManageStudents')
    )
  )
);

-- 성적과 학생 일정도 학생 본체와 같은 담당 범위를 사용한다.
drop policy if exists "exam_results_select_by_permission" on public.exam_results;
create policy "exam_results_select_by_permission"
on public.exam_results for select
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.can_access_academy_student(academy_id, student_id)
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "exam_results_write_by_permission" on public.exam_results;
create policy "exam_results_write_by_permission"
on public.exam_results for all
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "student_events_select_by_permission" on public.student_events;
create policy "student_events_select_by_permission"
on public.student_events for select
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.can_access_academy_student(academy_id, student_id)
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "student_events_write_by_permission" on public.student_events;
create policy "student_events_write_by_permission"
on public.student_events for all
using (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (
    mode = 'academy'
    and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents')
  )
  or (mode = 'private' and user_id = auth.uid())
);

-- ─── 6. 등하원 이벤트도 담당 학생 범위 ─────────────────────
drop policy if exists "student_check_events select members" on public.student_check_events;
create policy "student_check_events select members"
on public.student_check_events for select
using (
  public.can_access_academy_student(academy_id, student_id)
);

drop policy if exists "student_check_events insert members" on public.student_check_events;
create policy "student_check_events insert members"
on public.student_check_events for insert
with check (
  public.has_academy_permission(academy_id, 'canEditAttendance')
  and (
    public.has_academy_permission(academy_id, 'canManageStudents')
    or public.is_assigned_to_student(academy_id, student_id)
  )
);

drop policy if exists "student_check_events update owner" on public.student_check_events;
create policy "student_check_events update owner"
on public.student_check_events for update
using (
  public.is_owner_of_academy(academy_id)
  or public.has_academy_permission(academy_id, 'canManageStudents')
)
with check (
  public.is_owner_of_academy(academy_id)
  or public.has_academy_permission(academy_id, 'canManageStudents')
);

drop policy if exists "student_check_events delete owner" on public.student_check_events;
create policy "student_check_events delete owner"
on public.student_check_events for delete
using (
  public.is_owner_of_academy(academy_id)
  or public.has_academy_permission(academy_id, 'canManageStudents')
);

-- 직접 체크 RPC도 같은 범위 판정을 사용한다.
create or replace function public.toggle_student_check_event(
  p_academy_id uuid,
  p_student_id uuid,
  p_source text default 'qr'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest public.student_check_events%rowtype;
  v_created public.student_check_events%rowtype;
  v_today_start timestamptz;
  v_next_type text;
begin
  if p_academy_id is null or p_student_id is null then
    raise exception 'academy_id와 student_id가 필요합니다.';
  end if;

  if p_source not in ('qr', 'teacher_manual') then
    raise exception '지원하지 않는 등하원 기록 방식입니다.';
  end if;

  if not (
    public.is_owner_of_academy(p_academy_id)
    or (
      public.has_academy_permission(p_academy_id, 'canEditAttendance')
      and (
        public.has_academy_permission(p_academy_id, 'canManageStudents')
        or public.is_assigned_to_student(p_academy_id, p_student_id)
      )
    )
  ) then
    raise exception '이 학생의 등하원을 기록할 권한이 없습니다.';
  end if;

  if not exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and s.academy_id = p_academy_id
      and s.mode = 'academy'
      and s.status = 'active'
  ) then
    raise exception '현재 학원의 재원 학생을 찾을 수 없습니다.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_academy_id::text || ':' || p_student_id::text, 0)
  );

  v_today_start := (timezone('Asia/Seoul', now()))::date::timestamp
    at time zone 'Asia/Seoul';

  select sce.*
    into v_latest
  from public.student_check_events sce
  where sce.academy_id = p_academy_id
    and sce.student_id = p_student_id
    and sce.event_time >= v_today_start
  order by sce.event_time desc
  limit 1;

  if v_latest.id is not null
     and v_latest.event_time >= now() - interval '8 seconds' then
    return jsonb_build_object(
      'event', to_jsonb(v_latest),
      'duplicate', true
    );
  end if;

  v_next_type := case
    when v_latest.event_type = 'check_in' then 'check_out'
    else 'check_in'
  end;

  insert into public.student_check_events (
    academy_id, student_id, event_type, source, created_by
  )
  values (
    p_academy_id, p_student_id, v_next_type, p_source, auth.uid()
  )
  returning * into v_created;

  return jsonb_build_object(
    'event', to_jsonb(v_created),
    'duplicate', false
  );
end;
$$;

revoke all on function public.toggle_student_check_event(uuid, uuid, text) from public;
grant execute on function public.toggle_student_check_event(uuid, uuid, text) to authenticated;

-- ─── 7. 반복 규칙/예외도 담당 반만 조회 ─────────────────────
drop policy if exists "csr select members" on public.class_schedule_rules;
create policy "csr select members"
on public.class_schedule_rules for select
using (
  public.can_access_academy_class_group(academy_id, class_group_id)
);

drop policy if exists "cse select members" on public.class_session_exceptions;
create policy "cse select members"
on public.class_session_exceptions for select
using (
  public.can_access_academy_class_group(academy_id, class_group_id)
);

drop policy if exists "csr insert operations" on public.class_schedule_rules;
create policy "csr insert operations"
on public.class_schedule_rules for insert
with check (public.has_academy_permission(academy_id, 'canManageClasses'));
drop policy if exists "csr update operations" on public.class_schedule_rules;
create policy "csr update operations"
on public.class_schedule_rules for update
using (public.has_academy_permission(academy_id, 'canManageClasses'))
with check (public.has_academy_permission(academy_id, 'canManageClasses'));
drop policy if exists "csr delete operations" on public.class_schedule_rules;
create policy "csr delete operations"
on public.class_schedule_rules for delete
using (public.has_academy_permission(academy_id, 'canManageClasses'));

drop policy if exists "cse insert operations" on public.class_session_exceptions;
create policy "cse insert operations"
on public.class_session_exceptions for insert
with check (public.has_academy_permission(academy_id, 'canManageClasses'));
drop policy if exists "cse update operations" on public.class_session_exceptions;
create policy "cse update operations"
on public.class_session_exceptions for update
using (public.has_academy_permission(academy_id, 'canManageClasses'))
with check (public.has_academy_permission(academy_id, 'canManageClasses'));
drop policy if exists "cse delete operations" on public.class_session_exceptions;
create policy "cse delete operations"
on public.class_session_exceptions for delete
using (public.has_academy_permission(academy_id, 'canManageClasses'));

-- ─── 8. 직원 개인정보와 관리 권한 분리 ───────────────────────
-- 운영 매니저가 직원 목록/근무표는 관리하되 academy_staff_profiles의
-- 시급·월급 컬럼까지 직접 조회하지 못하도록 원장 또는 본인 행만 허용한다.
drop policy if exists "academy_staff_profiles select operations or self"
  on public.academy_staff_profiles;
drop policy if exists "academy_staff_profiles select owner or self"
  on public.academy_staff_profiles;
create policy "academy_staff_profiles select owner or self"
on public.academy_staff_profiles for select
using (
  public.is_owner_of_academy(academy_id)
  or user_id = auth.uid()
);

drop policy if exists "academy_staff_profiles insert by operations"
  on public.academy_staff_profiles;
drop policy if exists "academy_staff_profiles insert by owner"
  on public.academy_staff_profiles;
create policy "academy_staff_profiles insert by owner"
on public.academy_staff_profiles for insert
with check (public.is_owner_of_academy(academy_id));

drop policy if exists "academy_staff_profiles update by operations"
  on public.academy_staff_profiles;
drop policy if exists "academy_staff_profiles update by owner"
  on public.academy_staff_profiles;
create policy "academy_staff_profiles update by owner"
on public.academy_staff_profiles for update
using (public.is_owner_of_academy(academy_id))
with check (public.is_owner_of_academy(academy_id));

-- 최소 프로필 목록 RPC는 직원 관리 역할까지만 허용한다.
create or replace function public.list_academy_member_profiles_v2(
  p_academy_id uuid
)
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
  select
    p.id,
    p.display_name,
    p.email,
    p.phone,
    p.account_type,
    m.role,
    m.status
  from public.profiles p
  join public.academy_members m on m.user_id = p.id
  where m.academy_id = p_academy_id
    and m.status = 'active'
    and (
      public.is_owner_of_academy(p_academy_id)
      or public.has_academy_permission(p_academy_id, 'canManageStaff')
    );
$$;

revoke all on function public.list_academy_member_profiles_v2(uuid) from public;
grant execute on function public.list_academy_member_profiles_v2(uuid) to authenticated;

-- 반복 근무 규칙/예외도 타 직원에게 노출되지 않도록 운영자 또는 본인만
-- 조회한다. 쓰기 정책은 SQL 025의 운영자 전용 정책을 그대로 사용한다.
drop policy if exists "asw_rules select members"
  on public.academy_staff_work_rules;
create policy "asw_rules select manager or self"
on public.academy_staff_work_rules for select
using (
  public.has_academy_permission(academy_id, 'canManageStaff')
  or staff_user_id = auth.uid()
);

drop policy if exists "asw_exc select members"
  on public.academy_staff_work_exceptions;
create policy "asw_exc select manager or self"
on public.academy_staff_work_exceptions for select
using (
  public.has_academy_permission(academy_id, 'canManageStaff')
  or staff_user_id = auth.uid()
);

-- 구체적인 근무표도 운영 매니저 또는 본인만 조회하고, 일정 관리는
-- 운영 매니저가 한다.
drop policy if exists "academy_staff_shifts select operations or self"
  on public.academy_staff_shifts;
drop policy if exists "academy_staff_shifts select owner or self"
  on public.academy_staff_shifts;
create policy "academy_staff_shifts select manager or self"
on public.academy_staff_shifts for select
using (
  public.has_academy_permission(academy_id, 'canManageStaff')
  or staff_user_id = auth.uid()
);

drop policy if exists "academy_staff_shifts insert by operations"
  on public.academy_staff_shifts;
drop policy if exists "academy_staff_shifts insert by owner"
  on public.academy_staff_shifts;
create policy "academy_staff_shifts insert by manager"
on public.academy_staff_shifts for insert
with check (public.has_academy_permission(academy_id, 'canManageStaff'));

drop policy if exists "academy_staff_shifts delete by operations"
  on public.academy_staff_shifts;
drop policy if exists "academy_staff_shifts delete by owner"
  on public.academy_staff_shifts;
create policy "academy_staff_shifts delete by manager"
on public.academy_staff_shifts for delete
using (public.has_academy_permission(academy_id, 'canManageStaff'));

-- 본인 출퇴근 UPDATE는 기존 정책을 유지하고, 운영자 판정만 고정 권한으로 교체한다.
drop policy if exists "academy_staff_shifts update by operations or self"
  on public.academy_staff_shifts;
drop policy if exists "academy_staff_shifts update by owner or self"
  on public.academy_staff_shifts;
create policy "academy_staff_shifts update by manager or self"
on public.academy_staff_shifts for update
using (
  public.has_academy_permission(academy_id, 'canManageStaff')
  or staff_user_id = auth.uid()
)
with check (
  public.has_academy_permission(academy_id, 'canManageStaff')
  or staff_user_id = auth.uid()
);

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- End of 051_role_and_assignment_permissions.sql
