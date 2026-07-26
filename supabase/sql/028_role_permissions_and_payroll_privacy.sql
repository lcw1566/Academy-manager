-- ============================================================
-- 028_role_permissions_and_payroll_privacy.sql
-- 역할/커스텀 권한을 RLS에서 강제하고 급여·근태 개인정보를 분리한다.
--
-- 001~027 적용 후 실행. 기존 도메인 row는 삭제하지 않는다.
-- ============================================================

-- ─── 역할 + academy_staff_profiles.permissions 서버 검증 ───────
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

  -- 명시적인 boolean 설정은 역할 기본값보다 우선한다.
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


-- ─── 학생 ─────────────────────────────────────────────────────
drop policy if exists "students_select_own_or_academy_member" on public.students;
drop policy if exists "students_select_by_permission" on public.students;
create policy "students_select_by_permission"
on public.students for select
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canViewStudents'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "students_insert_own_or_academy_member" on public.students;
drop policy if exists "students_insert_by_permission" on public.students;
create policy "students_insert_by_permission"
on public.students for insert
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "students_update_own_or_academy_member" on public.students;
drop policy if exists "students_update_by_permission" on public.students;
create policy "students_update_by_permission"
on public.students for update
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents'))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "students_delete_own_or_academy_owner" on public.students;
drop policy if exists "students_delete_by_permission" on public.students;
create policy "students_delete_by_permission"
on public.students for delete
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents'))
  or (mode = 'private' and user_id = auth.uid())
);


-- ─── 반 / 수업 회차 ───────────────────────────────────────────
drop policy if exists "class_groups_select_own_or_academy_member" on public.class_groups;
drop policy if exists "class_groups_select_members" on public.class_groups;
create policy "class_groups_select_members"
on public.class_groups for select
using (
  (mode = 'academy' and academy_id is not null
    and (public.is_owner_of_academy(academy_id) or public.is_member_of_academy(academy_id)))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_groups_insert_own_or_academy_member" on public.class_groups;
drop policy if exists "class_groups_insert_by_permission" on public.class_groups;
create policy "class_groups_insert_by_permission"
on public.class_groups for insert
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageClasses'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_groups_update_own_or_academy_member" on public.class_groups;
drop policy if exists "class_groups_update_by_permission" on public.class_groups;
create policy "class_groups_update_by_permission"
on public.class_groups for update
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageClasses'))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageClasses'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_groups_delete_own_or_academy_owner" on public.class_groups;
drop policy if exists "class_groups_delete_by_permission" on public.class_groups;
create policy "class_groups_delete_by_permission"
on public.class_groups for delete
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageClasses'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_sessions_select_own_or_academy_member" on public.class_sessions;
drop policy if exists "class_sessions_select_members" on public.class_sessions;
create policy "class_sessions_select_members"
on public.class_sessions for select
using (
  (mode = 'academy' and academy_id is not null
    and (public.is_owner_of_academy(academy_id) or public.is_member_of_academy(academy_id)))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_sessions_insert_own_or_academy_member" on public.class_sessions;
drop policy if exists "class_sessions_insert_by_permission" on public.class_sessions;
create policy "class_sessions_insert_by_permission"
on public.class_sessions for insert
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageClasses'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_sessions_update_own_or_academy_member" on public.class_sessions;
drop policy if exists "class_sessions_update_by_permission" on public.class_sessions;
create policy "class_sessions_update_by_permission"
on public.class_sessions for update
using (
  (mode = 'academy' and academy_id is not null
    and (
      public.has_academy_permission(academy_id, 'canManageClasses')
      or public.has_academy_permission(academy_id, 'canEditLessonRecords')
    ))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null
    and (
      public.has_academy_permission(academy_id, 'canManageClasses')
      or public.has_academy_permission(academy_id, 'canEditLessonRecords')
    ))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "class_sessions_delete_own_or_academy_owner" on public.class_sessions;
drop policy if exists "class_sessions_delete_by_permission" on public.class_sessions;
create policy "class_sessions_delete_by_permission"
on public.class_sessions for delete
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageClasses'))
  or (mode = 'private' and user_id = auth.uid())
);


-- ─── 수업 기록 / 출결 / 클리닉 ───────────────────────────────
drop policy if exists "lesson_records_select_own_or_academy_member" on public.lesson_records;
drop policy if exists "lesson_records_select_members" on public.lesson_records;
create policy "lesson_records_select_members"
on public.lesson_records for select
using (
  (mode = 'academy' and academy_id is not null
    and (public.is_owner_of_academy(academy_id) or public.is_member_of_academy(academy_id)))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "lesson_records_insert_own_or_academy_member" on public.lesson_records;
drop policy if exists "lesson_records_insert_by_permission" on public.lesson_records;
create policy "lesson_records_insert_by_permission"
on public.lesson_records for insert
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditLessonRecords'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "lesson_records_update_own_or_academy_member" on public.lesson_records;
drop policy if exists "lesson_records_update_by_permission" on public.lesson_records;
create policy "lesson_records_update_by_permission"
on public.lesson_records for update
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditLessonRecords'))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditLessonRecords'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "lesson_records_delete_own_or_academy_owner" on public.lesson_records;
drop policy if exists "lesson_records_delete_by_permission" on public.lesson_records;
create policy "lesson_records_delete_by_permission"
on public.lesson_records for delete
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditLessonRecords'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "attendance_records_select_own_or_academy_member" on public.attendance_records;
drop policy if exists "attendance_records_select_members" on public.attendance_records;
create policy "attendance_records_select_members"
on public.attendance_records for select
using (
  (mode = 'academy' and academy_id is not null
    and (public.is_owner_of_academy(academy_id) or public.is_member_of_academy(academy_id)))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "attendance_records_insert_own_or_academy_member" on public.attendance_records;
drop policy if exists "attendance_records_insert_by_permission" on public.attendance_records;
create policy "attendance_records_insert_by_permission"
on public.attendance_records for insert
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditAttendance'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "attendance_records_update_own_or_academy_member" on public.attendance_records;
drop policy if exists "attendance_records_update_by_permission" on public.attendance_records;
create policy "attendance_records_update_by_permission"
on public.attendance_records for update
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditAttendance'))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditAttendance'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "attendance_records_delete_own_or_academy_owner" on public.attendance_records;
drop policy if exists "attendance_records_delete_by_permission" on public.attendance_records;
create policy "attendance_records_delete_by_permission"
on public.attendance_records for delete
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditAttendance'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "clinic_records_select_own_or_academy_member" on public.clinic_records;
drop policy if exists "clinic_records_select_members" on public.clinic_records;
create policy "clinic_records_select_members"
on public.clinic_records for select
using (
  (mode = 'academy' and academy_id is not null
    and (public.is_owner_of_academy(academy_id) or public.is_member_of_academy(academy_id)))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "clinic_records_insert_own_or_academy_member" on public.clinic_records;
drop policy if exists "clinic_records_insert_by_permission" on public.clinic_records;
create policy "clinic_records_insert_by_permission"
on public.clinic_records for insert
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditClinicRecords'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "clinic_records_update_own_or_academy_member" on public.clinic_records;
drop policy if exists "clinic_records_update_by_permission" on public.clinic_records;
create policy "clinic_records_update_by_permission"
on public.clinic_records for update
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditClinicRecords'))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditClinicRecords'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "clinic_records_delete_own_or_academy_owner" on public.clinic_records;
drop policy if exists "clinic_records_delete_by_permission" on public.clinic_records;
create policy "clinic_records_delete_by_permission"
on public.clinic_records for delete
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canEditClinicRecords'))
  or (mode = 'private' and user_id = auth.uid())
);


-- ─── 수납 / 학생 일정·성적 ───────────────────────────────────
drop policy if exists "payments_select_own_or_academy_member" on public.payments;
drop policy if exists "payments_select_by_permission" on public.payments;
create policy "payments_select_by_permission"
on public.payments for select
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canViewPayments'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payments_insert_own_or_academy_member" on public.payments;
drop policy if exists "payments_insert_by_permission" on public.payments;
create policy "payments_insert_by_permission"
on public.payments for insert
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManagePayments'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payments_update_own_or_academy_member" on public.payments;
drop policy if exists "payments_update_by_permission" on public.payments;
create policy "payments_update_by_permission"
on public.payments for update
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManagePayments'))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManagePayments'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payments_delete_own_or_academy_owner" on public.payments;
drop policy if exists "payments_delete_by_permission" on public.payments;
create policy "payments_delete_by_permission"
on public.payments for delete
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManagePayments'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "exam_results_select_own_or_academy_member" on public.exam_results;
drop policy if exists "exam_results_select_by_permission" on public.exam_results;
create policy "exam_results_select_by_permission"
on public.exam_results for select
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canViewStudents'))
  or (mode = 'private' and user_id = auth.uid())
);
drop policy if exists "exam_results_insert_own_or_academy_member" on public.exam_results;
drop policy if exists "exam_results_update_own_or_academy_member" on public.exam_results;
drop policy if exists "exam_results_delete_own_or_academy_owner" on public.exam_results;
drop policy if exists "exam_results_write_by_permission" on public.exam_results;
create policy "exam_results_write_by_permission"
on public.exam_results for all
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents'))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents'))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "student_events_select_own_or_academy_member" on public.student_events;
drop policy if exists "student_events_select_by_permission" on public.student_events;
create policy "student_events_select_by_permission"
on public.student_events for select
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canViewStudents'))
  or (mode = 'private' and user_id = auth.uid())
);
drop policy if exists "student_events_insert_own_or_academy_member" on public.student_events;
drop policy if exists "student_events_update_own_or_academy_member" on public.student_events;
drop policy if exists "student_events_delete_own_or_academy_owner" on public.student_events;
drop policy if exists "student_events_write_by_permission" on public.student_events;
create policy "student_events_write_by_permission"
on public.student_events for all
using (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents'))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null
    and public.has_academy_permission(academy_id, 'canManageStudents'))
  or (mode = 'private' and user_id = auth.uid())
);


-- ─── 급여: 직원 user_id를 명시하고 본인 행만 조회 ──────────────
alter table public.payrolls
  add column if not exists staff_user_id uuid references auth.users(id) on delete set null;

create index if not exists payrolls_staff_user_id_idx
  on public.payrolls(staff_user_id);

-- 현재 코드의 안정 ID(teacher_<uuid> 등)로 생성된 기존 행은 자동 보강한다.
update public.payrolls
set staff_user_id = split_part(staff_id, '_', 2)::uuid
where staff_user_id is null
  and staff_id ~ '^(teacher|assistant|manager)_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

drop policy if exists "payrolls_select_own_or_academy_member" on public.payrolls;
drop policy if exists "payrolls_select_owner_or_self" on public.payrolls;
create policy "payrolls_select_owner_or_self"
on public.payrolls for select
using (
  (
    mode = 'academy'
    and academy_id is not null
    and (
      public.is_owner_of_academy(academy_id)
      or (
        staff_user_id = auth.uid()
        and public.has_academy_permission(academy_id, 'canViewPayroll')
      )
    )
  )
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payrolls_insert_own_or_academy_member" on public.payrolls;
drop policy if exists "payrolls_insert_owner" on public.payrolls;
create policy "payrolls_insert_owner"
on public.payrolls for insert
with check (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payrolls_update_own_or_academy_member" on public.payrolls;
drop policy if exists "payrolls_update_owner" on public.payrolls;
create policy "payrolls_update_owner"
on public.payrolls for update
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
)
with check (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);

drop policy if exists "payrolls_delete_own_or_academy_owner" on public.payrolls;
drop policy if exists "payrolls_delete_owner" on public.payrolls;
create policy "payrolls_delete_owner"
on public.payrolls for delete
using (
  (mode = 'academy' and academy_id is not null and public.is_owner_of_academy(academy_id))
  or (mode = 'private' and user_id = auth.uid())
);


-- ─── 근태: 운영자는 전체, 일반 직원은 본인 행만 조회 ───────────
drop policy if exists "saLog select members" on public.staff_attendance_logs;
drop policy if exists "saLog select operations or self" on public.staff_attendance_logs;
create policy "saLog select operations or self"
on public.staff_attendance_logs for select
using (
  public.is_academy_operations_manager(academy_id)
  or (
    staff_user_id = auth.uid()
    and public.is_member_of_academy(academy_id)
  )
);

-- 일반 직원이 자기 로그의 승인 상태/승인자를 조작하지 못하게 한다.
create or replace function public.guard_staff_attendance_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_academy_operations_manager(new.academy_id) then
    return new;
  end if;

  if new.staff_user_id <> auth.uid()
     or not public.is_member_of_academy(new.academy_id) then
    raise exception '본인의 근태 기록만 변경할 수 있어요.';
  end if;

  if tg_op = 'UPDATE' and old.status in ('approved', 'rejected') then
    raise exception '검토가 끝난 근태 기록은 직원이 변경할 수 없어요.';
  end if;

  if new.status not in ('pending', 'completed')
     or new.approved_by is not null
     or new.approved_at is not null then
    raise exception '근태 승인/거부는 원장 또는 운영 매니저만 할 수 있어요.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_staff_attendance_review_fields
  on public.staff_attendance_logs;
create trigger guard_staff_attendance_review_fields
before insert or update on public.staff_attendance_logs
for each row execute function public.guard_staff_attendance_review_fields();

notify pgrst, 'reload schema';

-- ============================================================
-- End of 028_role_permissions_and_payroll_privacy.sql
-- ============================================================
