-- ============================================================
-- 013_teacher_assignment_user_id.sql
-- Academy Manager — class_groups / class_sessions 에 teacher_user_id 추가 (Phase 44 Pilot Hotfix)
--
-- 문제:
--   - 기존 class_groups.teacher_id, class_sessions.teacher_id 는 "local 문자열 id".
--   - 학원장이 PC 에서 만든 class group 이 강사 폰에서 매칭되지 않는 사례 발생.
--   - 원인: 두 단말이 academyTeachers[i].id 를 서로 다르게 가질 수 있음
--     (Owner 가 staff 프로필 연동 이전부터 보유하던 로컬 행 vs 강사 단말의 신규 hydrate 행).
--
-- 해결:
--   - "auth.users.id (uuid)" 라는 server-stable 식별자를 함께 저장.
--   - class_groups.teacher_user_id, class_sessions.teacher_user_id 컬럼 추가.
--   - 매칭 우선순위: teacher_user_id == auth.uid()  > local teacherId 동등성 (fallback).
--   - substitute_teacher_user_id 는 이미 002/030대 마이그레이션에서 존재 → 그대로 사용.
--
-- 멱등성: add column if not exists, create index if not exists.
-- destructive 명령 없음.
-- backfill 없음 (frontend 가 다음 저장/hydrate 시 자연스럽게 채움).
-- ============================================================


-- ============================================================
-- SECTION 1. class_groups.teacher_user_id
-- ============================================================
-- 본 컬럼은 nullable. 기존 데이터는 null 로 시작 (frontend 가 점진적 backfill).

alter table public.class_groups
  add column if not exists teacher_user_id uuid references auth.users(id) on delete set null;

create index if not exists class_groups_teacher_user_id_idx
  on public.class_groups(teacher_user_id);


-- ============================================================
-- SECTION 2. class_sessions.teacher_user_id
-- ============================================================
-- 세션 생성/대체 시점에 함께 기록.

alter table public.class_sessions
  add column if not exists teacher_user_id uuid references auth.users(id) on delete set null;

create index if not exists class_sessions_teacher_user_id_idx
  on public.class_sessions(teacher_user_id);


-- ============================================================
-- 끝.
--
-- 확인 쿼리:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name in ('class_groups','class_sessions')
--      and column_name in ('teacher_user_id','substitute_teacher_user_id')
--   order by table_name, column_name;
-- ============================================================
