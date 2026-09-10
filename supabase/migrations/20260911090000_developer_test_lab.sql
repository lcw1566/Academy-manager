-- ============================================================
-- Developer test lab
--
-- A developer-owned, synthetic academy for fast product testing.
-- The authenticated developer can switch their own test membership role
-- without impersonating a real customer or exposing service-role secrets.
-- Every mutation is restricted to the registered test academy and audited.
-- ============================================================

begin;

create table if not exists public.developer_test_workspaces (
  id uuid primary key default gen_random_uuid(),
  developer_user_id uuid not null unique references auth.users(id) on delete cascade,
  academy_id uuid not null unique references public.academies(id) on delete cascade,
  active_persona text not null default 'owner',
  active_scenario text not null default 'full',
  seed_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_test_workspaces_persona_chk
    check (active_persona in ('owner', 'manager', 'teacher', 'assistant', 'invited', 'inactive')),
  constraint developer_test_workspaces_scenario_chk
    check (active_scenario in ('full', 'billing', 'attendance', 'staff'))
);

drop trigger if exists set_developer_test_workspaces_updated_at
  on public.developer_test_workspaces;
create trigger set_developer_test_workspaces_updated_at
before update on public.developer_test_workspaces
for each row execute function public.set_updated_at();

alter table public.developer_test_workspaces enable row level security;
revoke all on table public.developer_test_workspaces from public, anon, authenticated;
grant select, insert, update, delete on table public.developer_test_workspaces to service_role;

create or replace function public.get_developer_test_lab()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_workspace public.developer_test_workspaces%rowtype;
  v_academy_name text;
  v_member_role text;
  v_member_status text;
begin
  if not public.is_current_app_developer() then
    raise exception '개발자 워크스페이스 접근 권한이 없어요.' using errcode = '42501';
  end if;

  select workspace.* into v_workspace
  from public.developer_test_workspaces workspace
  where workspace.developer_user_id = auth.uid();

  if not found then
    return jsonb_build_object('exists', false);
  end if;

  select academy.name into v_academy_name
  from public.academies academy
  where academy.id = v_workspace.academy_id;

  select member.role, member.status
    into v_member_role, v_member_status
  from public.academy_members member
  where member.academy_id = v_workspace.academy_id
    and member.user_id = auth.uid();

  return jsonb_build_object(
    'exists', true,
    'academy_id', v_workspace.academy_id,
    'academy_name', coalesce(v_academy_name, '씨닛 기능 테스트 학원'),
    'active_persona', v_workspace.active_persona,
    'active_scenario', v_workspace.active_scenario,
    'seed_version', v_workspace.seed_version,
    'member_role', v_member_role,
    'member_status', v_member_status,
    'can_open', coalesce(v_member_status = 'active', false),
    'student_count', (
      select count(*) from public.students student
      where student.academy_id = v_workspace.academy_id
    ),
    'class_count', (
      select count(*) from public.class_groups class_group
      where class_group.academy_id = v_workspace.academy_id
    ),
    'payment_count', (
      select count(*) from public.payments payment
      where payment.academy_id = v_workspace.academy_id
    ),
    'payroll_count', (
      select count(*) from public.payrolls payroll
      where payroll.academy_id = v_workspace.academy_id
    ),
    'updated_at', v_workspace.updated_at
  );
end;
$$;

revoke all on function public.get_developer_test_lab() from public, anon, authenticated;
grant execute on function public.get_developer_test_lab() to authenticated;

create or replace function public.get_my_developer_test_context(p_academy_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_workspace public.developer_test_workspaces%rowtype;
begin
  if auth.uid() is null or p_academy_id is null then
    return jsonb_build_object('is_test_lab', false);
  end if;

  select workspace.* into v_workspace
  from public.developer_test_workspaces workspace
  join public.app_developers developer
    on developer.user_id = workspace.developer_user_id
   and developer.is_active = true
  where workspace.developer_user_id = auth.uid()
    and workspace.academy_id = p_academy_id;

  if not found then
    return jsonb_build_object('is_test_lab', false);
  end if;

  return jsonb_build_object(
    'is_test_lab', true,
    'academy_id', v_workspace.academy_id,
    'active_persona', v_workspace.active_persona,
    'active_scenario', v_workspace.active_scenario,
    'seed_version', v_workspace.seed_version
  );
end;
$$;

revoke all on function public.get_my_developer_test_context(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_developer_test_context(uuid) to authenticated;

create or replace function public.prepare_developer_test_lab(
  p_scenario text default 'full'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.developer_test_workspaces%rowtype;
  v_academy_id uuid;
  v_member_id uuid;
  v_student_1 uuid;
  v_student_2 uuid;
  v_student_3 uuid;
  v_student_4 uuid;
  v_group_1 uuid;
  v_group_2 uuid;
  v_session_1 uuid;
  v_month text := to_char(current_date, 'YYYY-MM');
  v_month_start date := date_trunc('month', current_date)::date;
  v_teacher_id text := 'teacher_' || auth.uid()::text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.app_developers developer
    where developer.user_id = auth.uid()
      and developer.is_active = true
      and developer.role = 'developer'
  ) then
    raise exception '테스트 랩을 변경할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_scenario is null or p_scenario not in ('full', 'billing', 'attendance', 'staff') then
    raise exception '테스트 시나리오가 올바르지 않아요.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 90711));

  select workspace.* into v_workspace
  from public.developer_test_workspaces workspace
  where workspace.developer_user_id = auth.uid()
  for update;

  if found then
    v_academy_id := v_workspace.academy_id;
  else
    insert into public.academies (
      name,
      owner_id,
      salary_payment_day,
      tuition_due_day,
      staff_check_method,
      student_check_method,
      staff_manual_override_enabled,
      student_manual_override_enabled,
      attendance_onboarded_at,
      academy_type,
      clinic_required,
      academy_onboarded_at,
      academy_subjects,
      tuition_policy,
      tuition_policy_onboarded_at,
      tuition_rates
    ) values (
      '씨닛 기능 테스트 학원',
      auth.uid(),
      10,
      5,
      'manual',
      'teacher_manual',
      true,
      true,
      now(),
      'core_subjects',
      true,
      now(),
      '["korean", "english", "math"]'::jsonb,
      'grade',
      now(),
      '{"middle_1": 300000, "middle_2": 320000, "middle_3": 350000}'::jsonb
    ) returning id into v_academy_id;

    insert into public.developer_test_workspaces (
      developer_user_id,
      academy_id,
      active_persona,
      active_scenario,
      seed_version
    ) values (
      auth.uid(),
      v_academy_id,
      'owner',
      p_scenario,
      1
    );
  end if;

  -- Reassert that this is a synthetic developer-owned academy before deleting.
  if not exists (
    select 1 from public.developer_test_workspaces workspace
    where workspace.developer_user_id = auth.uid()
      and workspace.academy_id = v_academy_id
  ) then
    raise exception '등록된 테스트 학원만 초기화할 수 있어요.' using errcode = '42501';
  end if;

  -- Clear only the registered test academy. Audit records are intentionally kept.
  delete from public.academy_chat_messages where academy_id = v_academy_id;
  delete from public.academy_chat_reads read_state
  using public.academy_chat_threads thread
  where read_state.thread_id = thread.id
    and thread.academy_id = v_academy_id;
  delete from public.academy_chat_thread_members thread_member
  using public.academy_chat_threads thread
  where thread_member.thread_id = thread.id
    and thread.academy_id = v_academy_id;
  delete from public.academy_chat_threads where academy_id = v_academy_id;
  -- Drive metadata is kept because deleting only the database row would orphan
  -- the underlying Storage object. Drive cleanup must go through Storage API.
  delete from public.student_check_events where academy_id = v_academy_id;
  delete from public.attendance_records where academy_id = v_academy_id;
  delete from public.lesson_records where academy_id = v_academy_id;
  delete from public.clinic_records where academy_id = v_academy_id;
  delete from public.clinic_event_students child
  using public.clinic_events event
  where child.clinic_event_id = event.id
    and event.academy_id = v_academy_id;
  delete from public.clinic_events where academy_id = v_academy_id;
  delete from public.class_session_exceptions where academy_id = v_academy_id;
  delete from public.class_sessions where academy_id = v_academy_id;
  delete from public.class_schedule_rules where academy_id = v_academy_id;
  delete from public.payments where academy_id = v_academy_id;
  delete from public.payrolls where academy_id = v_academy_id;
  delete from public.exam_results where academy_id = v_academy_id;
  delete from public.student_events where academy_id = v_academy_id;
  delete from public.class_groups where academy_id = v_academy_id;
  delete from public.students where academy_id = v_academy_id;
  delete from public.staff_attendance_logs where academy_id = v_academy_id;
  delete from public.academy_staff_shifts where academy_id = v_academy_id;
  delete from public.academy_staff_work_exceptions where academy_id = v_academy_id;
  delete from public.academy_staff_work_rules where academy_id = v_academy_id;
  delete from public.academy_calendar_events where academy_id = v_academy_id;
  delete from public.academy_invitations where academy_id = v_academy_id;
  delete from public.academy_staff_profiles
  where academy_id = v_academy_id and user_id <> auth.uid();
  delete from public.academy_members
  where academy_id = v_academy_id and user_id <> auth.uid();

  update public.academies academy
  set name = '씨닛 기능 테스트 학원',
      owner_id = auth.uid(),
      salary_payment_day = 10,
      tuition_due_day = 5,
      attendance_onboarded_at = now(),
      academy_onboarded_at = now(),
      tuition_policy_onboarded_at = now(),
      updated_at = now()
  where academy.id = v_academy_id;

  insert into public.academy_members (academy_id, user_id, role, status)
  values (v_academy_id, auth.uid(), 'owner', 'active')
  on conflict (academy_id, user_id) do update
  set role = excluded.role,
      status = excluded.status,
      updated_at = now()
  returning id into v_member_id;

  insert into public.academy_staff_profiles (
    academy_id,
    user_id,
    member_id,
    role,
    subject,
    subjects,
    wage_type,
    hourly_wage,
    monthly_salary,
    memo,
    status,
    permissions,
    scope,
    job_title
  ) values (
    v_academy_id,
    auth.uid(),
    v_member_id,
    'teacher',
    '영어',
    '["영어"]'::jsonb,
    'hourly',
    30000,
    0,
    '개발자 테스트용 합성 직원 데이터',
    'active',
    '{}'::jsonb,
    '{"hourlyMode":"actualAttendance"}'::jsonb,
    '테스트 선생님'
  )
  on conflict (academy_id, user_id) do update
  set member_id = excluded.member_id,
      role = excluded.role,
      subject = excluded.subject,
      subjects = excluded.subjects,
      wage_type = excluded.wage_type,
      hourly_wage = excluded.hourly_wage,
      monthly_salary = excluded.monthly_salary,
      memo = excluded.memo,
      status = excluded.status,
      permissions = excluded.permissions,
      scope = excluded.scope,
      job_title = excluded.job_title,
      employment_ended_on = null,
      exit_reason = null,
      updated_at = now();

  insert into public.students (
    academy_id, user_id, mode, name, school_type, school_name, grade,
    enrollment_date, status, memo, base_tuition, tuition_subjects,
    tuition_source, tuition_effective_from
  ) values (
    v_academy_id, auth.uid(), 'academy', '테스트 김민준', 'middle', '씨닛중학교', '중1',
    current_date - 100, 'active', '합성 데이터 · 정상 납부', 300000, '["math"]'::jsonb,
    'academy_rate', v_month_start
  ) returning id into v_student_1;

  insert into public.students (
    academy_id, user_id, mode, name, school_type, school_name, grade,
    enrollment_date, status, memo, base_tuition, tuition_subjects,
    tuition_source, tuition_effective_from
  ) values (
    v_academy_id, auth.uid(), 'academy', '테스트 이서연', 'middle', '씨닛중학교', '중2',
    current_date - 80, 'active', '합성 데이터 · 미납', 320000, '["english"]'::jsonb,
    'academy_rate', v_month_start
  ) returning id into v_student_2;

  insert into public.students (
    academy_id, user_id, mode, name, school_type, school_name, grade,
    enrollment_date, status, memo, base_tuition, tuition_subjects,
    tuition_source, tuition_effective_from
  ) values (
    v_academy_id, auth.uid(), 'academy', '테스트 박도윤', 'middle', '씨닛중학교', '중2',
    current_date - 60, 'active', '합성 데이터 · 부분 납부', 320000, '["english", "math"]'::jsonb,
    'academy_rate', v_month_start
  ) returning id into v_student_3;

  insert into public.students (
    academy_id, user_id, mode, name, school_type, school_name, grade,
    enrollment_date, status, memo, base_tuition, tuition_subjects,
    tuition_source, tuition_effective_from
  ) values (
    v_academy_id, auth.uid(), 'academy', '테스트 최하은', 'high', '씨닛고등학교', '고1',
    current_date - 45, 'active', '합성 데이터 · 연체', 380000, '["korean"]'::jsonb,
    'academy_rate', v_month_start
  ) returning id into v_student_4;

  insert into public.students (
    academy_id, user_id, mode, name, school_type, school_name, grade,
    enrollment_date, status, memo, base_tuition, tuition_subjects,
    tuition_source, tuition_effective_from
  ) values (
    v_academy_id, auth.uid(), 'academy', '테스트 정시우', 'middle', '씨닛중학교', '중3',
    current_date - 30, 'inactive', '합성 데이터 · 퇴원 학생', 350000, '["math"]'::jsonb,
    'academy_rate', v_month_start
  );

  insert into public.class_groups (
    academy_id, user_id, mode, name, subject, level, teacher_id,
    teacher_type, teacher_user_id, student_ids, weekdays, start_time,
    end_time, room, start_date, billing_mode, default_billing, status,
    fee_policy
  ) values (
    v_academy_id, auth.uid(), 'academy', '중2 영어 테스트반', '영어', '중2', v_teacher_id,
    'teacher', auth.uid(), jsonb_build_array(v_student_2, v_student_3),
    '["월", "수"]'::jsonb, '18:00', '20:00', '1강의실', v_month_start,
    'same', '{"monthlyFee":320000}'::jsonb, 'active', 'included'
  ) returning id into v_group_1;

  insert into public.class_groups (
    academy_id, user_id, mode, name, subject, level, teacher_id,
    teacher_type, teacher_user_id, student_ids, weekdays, start_time,
    end_time, room, start_date, billing_mode, default_billing, status,
    fee_policy, additional_fee_type, additional_fee_amount
  ) values (
    v_academy_id, auth.uid(), 'academy', '수학 특강 테스트반', '수학', '중1~중3', v_teacher_id,
    'teacher', auth.uid(), jsonb_build_array(v_student_1, v_student_3),
    '["화", "목"]'::jsonb, '19:00', '21:00', '2강의실', v_month_start,
    'same', '{"monthlyFee":300000}'::jsonb, 'active', 'additional', 'monthly', 50000
  ) returning id into v_group_2;

  update public.students
  set class_group_ids = case id
    when v_student_1 then jsonb_build_array(v_group_2)
    when v_student_2 then jsonb_build_array(v_group_1)
    when v_student_3 then jsonb_build_array(v_group_1, v_group_2)
    else '[]'::jsonb
  end
  where id in (v_student_1, v_student_2, v_student_3);

  insert into public.class_sessions (
    academy_id, user_id, mode, class_group_id, date, start_time, end_time,
    room, teacher_id, teacher_type, teacher_user_id, student_ids, status,
    memo, activity_type, session_kind
  ) values (
    v_academy_id, auth.uid(), 'academy', v_group_1, current_date - 7, '18:00', '20:00',
    '1강의실', v_teacher_id, 'teacher', auth.uid(), jsonb_build_array(v_student_2, v_student_3),
    'completed', '완료된 수업 테스트', 'regular_class', 'regular'
  ) returning id into v_session_1;

  insert into public.class_sessions (
    academy_id, user_id, mode, class_group_id, date, start_time, end_time,
    room, teacher_id, teacher_type, teacher_user_id, student_ids, status,
    memo, activity_type, session_kind
  ) values (
    v_academy_id, auth.uid(), 'academy', v_group_1, current_date, '18:00', '20:00',
    '1강의실', v_teacher_id, 'teacher', auth.uid(), jsonb_build_array(v_student_2, v_student_3),
    'scheduled', '오늘 수업 테스트', 'regular_class', 'regular'
  );

  insert into public.class_sessions (
    academy_id, user_id, mode, class_group_id, date, start_time, end_time,
    room, teacher_id, teacher_type, teacher_user_id, student_ids, status,
    memo, activity_type, session_kind
  ) values (
    v_academy_id, auth.uid(), 'academy', v_group_2, current_date + 2, '19:00', '21:00',
    '2강의실', v_teacher_id, 'teacher', auth.uid(), jsonb_build_array(v_student_1, v_student_3),
    'scheduled', '예정 특강 테스트', 'special_lecture', 'special'
  );

  insert into public.attendance_records (
    academy_id, user_id, mode, class_group_id, class_session_id, student_id,
    date, status, memo, source, checked_at, confirmation_state, confirmed_at, confirmed_by
  ) values
    (v_academy_id, auth.uid(), 'academy', v_group_1, v_session_1, v_student_2,
      current_date - 7, 'present', '정상 출석', 'teacher_manual', now() - interval '7 days',
      'teacher_confirmed', now() - interval '7 days', auth.uid()),
    (v_academy_id, auth.uid(), 'academy', v_group_1, v_session_1, v_student_3,
      current_date - 7, 'late', '10분 지각', 'teacher_manual', now() - interval '7 days',
      'teacher_confirmed', now() - interval '7 days', auth.uid());

  insert into public.lesson_records (
    academy_id, user_id, mode, class_group_id, class_session_id, date,
    teacher_id, common_progress, common_lesson_content, common_homework,
    next_lesson_plan, teacher_memo, student_records
  ) values (
    v_academy_id, auth.uid(), 'academy', v_group_1, v_session_1, current_date - 7,
    v_teacher_id, '관계대명사 기본', '개념 설명과 문제 풀이', '워크북 10~15쪽',
    '관계대명사 심화', '합성 테스트 수업 기록',
    jsonb_build_object(
      v_student_2::text, jsonb_build_object('attitude', 4, 'focus', 5, 'understanding', 4, 'memo', '이해가 빠름'),
      v_student_3::text, jsonb_build_object('attitude', 3, 'focus', 3, 'understanding', 3, 'memo', '복습 필요')
    )
  );

  insert into public.clinic_records (
    academy_id, user_id, mode, student_id, class_group_id, class_session_id,
    date, subject, teacher_id, items, overall_memo, created_by_role,
    created_by_id, activity_type, activity_name
  ) values (
    v_academy_id, auth.uid(), 'academy', v_student_3, v_group_1, v_session_1,
    current_date - 5, '영어', v_teacher_id,
    '[{"categoryKey":"wrong_answer","title":"문법 오답","description":"관계대명사 오답 재풀이","result":"8/10"}]'::jsonb,
    '다음 수업 전 한 번 더 확인', 'teacher', v_teacher_id, 'clinic', '오답 클리닉'
  );

  insert into public.exam_results (
    academy_id, user_id, mode, student_id, exam_name, exam_type, subject,
    exam_date, score, max_score, grade, memo
  ) values (
    v_academy_id, auth.uid(), 'academy', v_student_2, '9월 테스트 모의고사',
    'mock', '영어', current_date - 10, 88, 100, '2등급', '합성 성적 데이터'
  );

  insert into public.student_events (
    academy_id, user_id, mode, student_id, title, event_type, date, memo
  ) values (
    v_academy_id, auth.uid(), 'academy', v_student_4, '중간고사 대비',
    'midterm', current_date + 14, '합성 일정 데이터'
  );

  insert into public.payments (
    academy_id, user_id, mode, student_id, class_group_id, month, amount,
    due_date, paid_date, status, payer_name, memo, payment_kind, billing_snapshot
  ) values
    (v_academy_id, auth.uid(), 'academy', v_student_1, v_group_2, v_month, 350000,
      v_month_start + 4, v_month_start + 2, 'paid', '테스트 보호자', '정상 납부 사례',
      'student_monthly', '{"source":"developer_test_lab"}'::jsonb),
    (v_academy_id, auth.uid(), 'academy', v_student_2, v_group_1, v_month, 320000,
      v_month_start + 4, null, 'unpaid', null, '미납 사례',
      'student_monthly', '{"source":"developer_test_lab"}'::jsonb),
    (v_academy_id, auth.uid(), 'academy', v_student_3, v_group_1, v_month, 320000,
      v_month_start + 4, null, 'partial', '테스트 보호자', '부분 납부 사례',
      'student_monthly', '{"source":"developer_test_lab"}'::jsonb),
    (v_academy_id, auth.uid(), 'academy', v_student_4, null, v_month, 380000,
      v_month_start + 4, null, 'overdue', null, '연체 사례',
      'manual', '{"source":"developer_test_lab"}'::jsonb);

  insert into public.staff_attendance_logs (
    academy_id, staff_user_id, staff_role, work_date, scheduled_start_time,
    scheduled_end_time, actual_start_time, actual_end_time, break_minutes,
    status, source, approved_by, approved_at, memo
  ) values
    (v_academy_id, auth.uid(), 'teacher', current_date - 7, '17:30', '21:00',
      '17:28', '21:03', 30, 'approved', 'manual', auth.uid(), now() - interval '7 days',
      '정상 근무 테스트'),
    (v_academy_id, auth.uid(), 'teacher', current_date - 5, '17:30', '21:00',
      '17:42', '21:00', 30, 'completed', 'manual', null, null,
      '승인 대기 테스트'),
    (v_academy_id, auth.uid(), 'teacher', current_date, '17:30', '21:00',
      '17:31', null, 30, 'pending', 'manual', null, null,
      '퇴근 미완료 테스트');

  insert into public.academy_staff_shifts (
    academy_id, staff_user_id, staff_role, date, scheduled_start_time,
    scheduled_end_time, break_minutes, status, memo
  ) values
    (v_academy_id, auth.uid(), 'teacher', current_date, '17:30', '21:00', 30, 'scheduled', '오늘 근무'),
    (v_academy_id, auth.uid(), 'teacher', current_date + 2, '17:30', '21:00', 30, 'scheduled', '예정 근무');

  insert into public.academy_staff_work_rules (
    academy_id, staff_user_id, staff_role, day_of_week, start_time, end_time,
    break_minutes, effective_start_date, is_active, memo
  ) values
    (v_academy_id, auth.uid(), 'teacher', 1, '17:30', '21:00', 30, v_month_start, true, '월요일 반복 근무'),
    (v_academy_id, auth.uid(), 'teacher', 3, '17:30', '21:00', 30, v_month_start, true, '수요일 반복 근무');

  insert into public.payrolls (
    academy_id, user_id, mode, staff_type, staff_id, staff_user_id, month,
    wage_type, hourly_wage, total_hours, completed_session_count,
    completed_clinic_count, amount, status, memo, calculation_snapshot
  ) values (
    v_academy_id, auth.uid(), 'academy', 'teacher', v_teacher_id, auth.uid(), v_month,
    'hourly', 30000, 6.1, 1, 1, 183000, 'scheduled', '근퇴 기준 합성 급여',
    '{"source":"developer_test_lab","approvedHours":3.1,"completedHours":3}'::jsonb
  );

  insert into public.academy_invitations (
    academy_id, email, role, status, invited_by, job_title
  ) values
    (v_academy_id, 'pending.teacher@example.test', 'teacher', 'pending', auth.uid(), '선생님'),
    (v_academy_id, 'pending.manager@example.test', 'manager', 'pending', auth.uid(), '운영 매니저');

  update public.developer_test_workspaces workspace
  set active_persona = 'owner',
      active_scenario = p_scenario,
      seed_version = workspace.seed_version + 1,
      updated_at = now()
  where workspace.developer_user_id = auth.uid();

  insert into public.developer_action_logs (
    actor_user_id, action, target_type, target_id, details
  ) values (
    auth.uid(),
    'test_lab.reset',
    'academy',
    v_academy_id::text,
    jsonb_build_object('scenario', p_scenario, 'synthetic_data_only', true)
  );

  return public.get_developer_test_lab();
end;
$$;

revoke all on function public.prepare_developer_test_lab(text)
  from public, anon, authenticated;
grant execute on function public.prepare_developer_test_lab(text) to authenticated;

create or replace function public.set_developer_test_persona(p_persona text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.developer_test_workspaces%rowtype;
  v_member_id uuid;
  v_email text;
  v_membership_role text;
  v_membership_status text;
  v_profile_role text;
  v_job_title text;
  v_permissions jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.app_developers developer
    where developer.user_id = auth.uid()
      and developer.is_active = true
      and developer.role = 'developer'
  ) then
    raise exception '테스트 역할을 변경할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_persona is null or p_persona not in ('owner', 'manager', 'teacher', 'assistant', 'invited', 'inactive') then
    raise exception '테스트 역할이 올바르지 않아요.' using errcode = '22023';
  end if;

  select workspace.* into v_workspace
  from public.developer_test_workspaces workspace
  where workspace.developer_user_id = auth.uid()
  for update;

  if not found then
    raise exception '먼저 테스트 학원을 만들어주세요.' using errcode = 'P0002';
  end if;

  select user_record.email into v_email
  from auth.users user_record
  where user_record.id = auth.uid();

  v_membership_role := case
    when p_persona = 'owner' then 'owner'
    when p_persona = 'manager' then 'manager'
    when p_persona in ('teacher', 'assistant', 'inactive') then 'teacher'
    else 'pending'
  end;
  v_membership_status := case
    when p_persona = 'invited' then 'invited'
    when p_persona = 'inactive' then 'inactive'
    else 'active'
  end;
  v_profile_role := case when p_persona = 'manager' then 'manager' else 'teacher' end;
  v_job_title := case
    when p_persona = 'manager' then '운영 매니저'
    when p_persona = 'assistant' then '보조강사'
    else '선생님'
  end;
  if p_persona = 'manager' then
    v_permissions := '{"canViewStudents":true,"canManageStudents":true,"canEditLessonRecords":true,"canEditAttendance":true,"canEditClinicRecords":true,"canViewPayroll":true,"canViewPayments":true,"canManagePayments":true,"canManageClasses":true,"canManageStaff":true,"canManageDrive":true}'::jsonb;
  elsif p_persona in ('teacher', 'assistant') then
    v_permissions := '{"canViewStudents":true,"canManageStudents":true,"canEditLessonRecords":true,"canEditAttendance":true,"canEditClinicRecords":true,"canViewPayroll":true,"canViewPayments":false,"canManagePayments":false,"canManageClasses":false,"canManageStaff":false,"canManageDrive":true}'::jsonb;
  end if;

  update public.academies academy
  set owner_id = case when p_persona = 'owner' then auth.uid() else null end,
      updated_at = now()
  where academy.id = v_workspace.academy_id;

  insert into public.academy_members (academy_id, user_id, role, status)
  values (v_workspace.academy_id, auth.uid(), v_membership_role, v_membership_status)
  on conflict (academy_id, user_id) do update
  set role = excluded.role,
      status = excluded.status,
      updated_at = now()
  returning id into v_member_id;

  update public.academy_staff_profiles profile
  set member_id = v_member_id,
      role = v_profile_role,
      job_title = v_job_title,
      permissions = v_permissions,
      status = case when p_persona in ('invited', 'inactive') then 'inactive' else 'active' end,
      employment_ended_on = case
        when p_persona = 'inactive' then (now() at time zone 'Asia/Seoul')::date
        else null
      end,
      exit_reason = case when p_persona = 'inactive' then '개발자 테스트 상태' else null end,
      updated_at = now()
  where profile.academy_id = v_workspace.academy_id
    and profile.user_id = auth.uid();

  delete from public.academy_invitations invitation
  where invitation.academy_id = v_workspace.academy_id
    and lower(invitation.email) = lower(coalesce(v_email, ''));

  if p_persona = 'invited' and v_email is not null then
    insert into public.academy_invitations (
      academy_id, email, role, status, invited_by, job_title
    ) values (
      v_workspace.academy_id, lower(v_email), 'teacher', 'pending', auth.uid(), '선생님'
    );
  end if;

  update public.developer_test_workspaces workspace
  set active_persona = p_persona,
      updated_at = now()
  where workspace.id = v_workspace.id;

  insert into public.developer_action_logs (
    actor_user_id, action, target_type, target_id, details
  ) values (
    auth.uid(),
    'test_lab.persona_changed',
    'academy',
    v_workspace.academy_id::text,
    jsonb_build_object(
      'persona', p_persona,
      'membership_role', v_membership_role,
      'membership_status', v_membership_status
    )
  );

  return public.get_developer_test_lab();
end;
$$;

revoke all on function public.set_developer_test_persona(text)
  from public, anon, authenticated;
grant execute on function public.set_developer_test_persona(text) to authenticated;

-- Test academies must not inflate customer usage metrics.
create or replace function public.get_developer_dashboard_stats()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_feedback jsonb;
  v_active_academies bigint := 0;
  v_active_members bigint := 0;
begin
  if not public.is_current_app_developer() then
    raise exception '개발자 워크스페이스 접근 권한이 없어요.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'received', count(*) filter (where feedback.status = 'received'),
    'reviewing', count(*) filter (where feedback.status = 'reviewing'),
    'planned', count(*) filter (where feedback.status = 'planned'),
    'resolved', count(*) filter (where feedback.status = 'resolved'),
    'closed', count(*) filter (where feedback.status = 'closed'),
    'bugs', count(*) filter (where feedback.category = 'bug'),
    'improvements', count(*) filter (where feedback.category = 'improvement'),
    'last_7_days', count(*) filter (where feedback.created_at >= now() - interval '7 days')
  ) into v_feedback
  from public.product_feedback feedback;

  select count(*) into v_active_academies
  from public.academies academy
  where not exists (
    select 1 from public.developer_test_workspaces workspace
    where workspace.academy_id = academy.id
  );

  select count(*) into v_active_members
  from public.academy_members member
  where member.status = 'active'
    and not exists (
      select 1 from public.developer_test_workspaces workspace
      where workspace.academy_id = member.academy_id
    );

  return coalesce(v_feedback, '{}'::jsonb) || jsonb_build_object(
    'active_academies', v_active_academies,
    'active_members', v_active_members,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_developer_dashboard_stats()
  from public, anon, authenticated;
grant execute on function public.get_developer_dashboard_stats() to authenticated;

commit;

notify pgrst, 'reload schema';
