-- Seenit — 계정·기기 간 데이터 불일치 읽기 전용 진단
-- Supabase SQL Editor에서 실행해도 데이터를 변경하지 않는다.

-- 1) 현재 프런트가 의존하는 핵심 함수·트리거 설치 여부
select *
from (
  values
    (
      '등하원 원자 저장 RPC',
      to_regprocedure('public.toggle_student_check_event(uuid,uuid,text)') is not null
    ),
    (
      '등원→수업 출석 트리거',
      exists (
        select 1
          from pg_trigger
         where tgname = 'sync_student_checkin_to_class_attendance'
           and not tgisinternal
      )
    ),
    (
      '늦게 생성된 회차 출석 보완 트리거',
      exists (
        select 1
          from pg_trigger
         where tgname = 'sync_existing_checkins_to_class_session'
           and not tgisinternal
      )
    ),
    (
      '당일 수업 시간 동기화 트리거',
      exists (
        select 1
          from pg_trigger
         where tgname = 'sync_same_day_class_session_from_new_rule'
           and not tgisinternal
      )
    )
) as checks(item, installed)
order by item;

-- 2) 실시간 발행 대상 확인
select
  expected.table_name,
  exists (
    select 1
      from pg_publication_tables published
     where published.pubname = 'supabase_realtime'
       and published.schemaname = 'public'
       and published.tablename = expected.table_name
  ) as realtime_enabled
from (
  values
    ('academies'),
    ('students'),
    ('student_check_events'),
    ('class_groups'),
    ('class_sessions'),
    ('attendance_records'),
    ('clinic_records'),
    ('staff_attendance_logs')
) as expected(table_name)
order by expected.table_name;

-- 3) 직원별 원본 역할·직책·개인 예외 권한
select
  a.name as academy_name,
  m.user_id,
  coalesce(p.display_name, p.email, m.user_id::text) as staff_name,
  m.role,
  m.status as membership_status,
  asp.job_title,
  coalesce(
    asp.permissions -> 'canViewStudents',
    a.job_title_permissions
      -> coalesce(nullif(btrim(asp.job_title), ''), case when m.role = 'manager' then '운영 매니저' else '선생님' end)
      -> 'permissions' -> 'canViewStudents'
  ) as can_view_students_setting,
  coalesce(
    asp.permissions -> 'canEditAttendance',
    a.job_title_permissions
      -> coalesce(nullif(btrim(asp.job_title), ''), case when m.role = 'manager' then '운영 매니저' else '선생님' end)
      -> 'permissions' -> 'canEditAttendance'
  ) as can_edit_attendance_setting,
  coalesce(
    asp.permissions -> 'canManageStudents',
    a.job_title_permissions
      -> coalesce(nullif(btrim(asp.job_title), ''), case when m.role = 'manager' then '운영 매니저' else '선생님' end)
      -> 'permissions' -> 'canManageStudents'
  ) as can_manage_students_setting
from public.academy_members m
join public.academies a on a.id = m.academy_id
left join public.profiles p on p.id = m.user_id
left join public.academy_staff_profiles asp
  on asp.academy_id = m.academy_id
 and asp.user_id = m.user_id
order by a.name, m.role, staff_name;

-- 4) 학생 상태별 수와 재원 예정 시작일 점검
select
  a.name as academy_name,
  s.status,
  count(*) as student_count,
  count(*) filter (
    where s.status = 'scheduled'
      and (s.enrollment_date is null or s.enrollment_date <= (now() at time zone 'Asia/Seoul')::date)
  ) as scheduled_but_already_started
from public.students s
join public.academies a on a.id = s.academy_id
where s.mode = 'academy'
group by a.name, s.status
order by a.name, s.status;

-- 5) 최근 48시간 등하원 이벤트가 실제 서버에 존재하는지 확인
select
  a.name as academy_name,
  s.name as student_name,
  event.event_type,
  event.source,
  event.event_time at time zone 'Asia/Seoul' as event_time_kst,
  coalesce(creator.display_name, creator.email, event.created_by::text) as created_by
from public.student_check_events event
join public.academies a on a.id = event.academy_id
join public.students s on s.id = event.student_id
left join public.profiles creator on creator.id = event.created_by
where event.event_time >= now() - interval '48 hours'
order by event.event_time desc;

-- 6) 현재 등하원 RLS 정책 본문
select
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'student_check_events'
order by policyname;
