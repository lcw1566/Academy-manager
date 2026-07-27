-- Seenit — 학원 설정 변경 뒤 로그인 지연 진단
-- 읽기 전용입니다. 데이터를 수정하거나 세션을 종료하지 않습니다.
--
-- Supabase SQL Editor에서 "파일명"이 아니라 아래 내용 전체를 실행한 뒤
-- 각 결과 표를 확인합니다.

-- 1) 현재 잠금을 기다리는 쿼리와 이를 막는 세션
select
  activity.pid,
  activity.usename,
  activity.application_name,
  activity.state,
  activity.wait_event_type,
  activity.wait_event,
  now() - activity.query_start as running_for,
  pg_blocking_pids(activity.pid) as blocking_pids,
  left(regexp_replace(activity.query, '\s+', ' ', 'g'), 240) as query
from pg_stat_activity as activity
where activity.datname = current_database()
  and activity.pid <> pg_backend_pid()
  and (
    activity.wait_event_type = 'Lock'
    or cardinality(pg_blocking_pids(activity.pid)) > 0
  )
order by activity.query_start;

-- 2) 로그인 필수 테이블에 걸린 relation lock
select
  locks.pid,
  locks.mode,
  locks.granted,
  locks.relation::regclass as relation,
  now() - activity.query_start as running_for,
  left(regexp_replace(activity.query, '\s+', ' ', 'g'), 240) as query
from pg_locks as locks
join pg_stat_activity as activity on activity.pid = locks.pid
where locks.relation in (
  'public.profiles'::regclass,
  'public.academy_members'::regclass,
  'public.academies'::regclass
)
order by locks.granted, activity.query_start;

-- 3) 현재 적용된 핵심 RLS 정책
select
  tablename,
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'academy_members', 'academies')
order by tablename, cmd, policyname;

-- 4) authenticated 역할의 기본 테이블 권한
select
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in ('profiles', 'academy_members', 'academies')
order by table_name, privilege_type;

-- 5) 학원 설정용 함수 소유자와 실행 권한
select
  routine.routine_name,
  routine.security_type,
  routine.external_language,
  has_function_privilege(
    'authenticated',
    format('public.%I(uuid)', routine.routine_name),
    'EXECUTE'
  ) as authenticated_can_execute
from information_schema.routines as routine
where routine.specific_schema = 'public'
  and routine.routine_name in (
    'is_owner_of_academy',
    'is_member_of_academy',
    'is_owner_member_of_academy'
  )
order by routine.routine_name;
