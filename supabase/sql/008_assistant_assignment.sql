-- ============================================================
-- 008_assistant_assignment.sql
-- Seenit — 보조강사 배정 영속화 (Phase 35)
--
-- 보조강사를 반(class_groups) / 회차(class_sessions) 에 배정한 정보를
-- 서버에 저장해서 다른 기기에서도 동일하게 보이도록 한다.
--
-- 전제:
--   - 001 ~ 007 모두 적용됨
--   - class_groups / class_sessions 테이블 존재 (002)
--
-- 이 파일이 만드는 것:
--   1. class_groups.assistant_ids jsonb 컬럼 추가
--   2. class_sessions.assistant_ids jsonb 컬럼 추가
--
-- idempotent:
--   - alter table 은 'add column if not exists'
--   - 기본값 '[]'::jsonb — null 안전.
--
-- destructive 명령 (drop table / delete / truncate) 없음.
-- ============================================================


-- ============================================================
-- SECTION 1. class_groups.assistant_ids
-- ============================================================
-- jsonb 배열로 보조강사 user_id (auth.users.id) 목록을 저장한다.
-- "단일 보조강사" UI 흐름도 항상 배열 1개로 저장. 추후 다중 배정을 위해 jsonb.
alter table public.class_groups
  add column if not exists assistant_ids jsonb not null default '[]'::jsonb;


-- ============================================================
-- SECTION 2. class_sessions.assistant_ids
-- ============================================================
-- 회차별로 다른 보조강사를 둘 수 있도록 같은 형태로 저장.
-- create from class_groups 시 그룹의 assistant_ids 를 그대로 복사하면 충분.
alter table public.class_sessions
  add column if not exists assistant_ids jsonb not null default '[]'::jsonb;


-- ============================================================
-- 끝.
-- 별도 RLS 변경 없음 — 기존 class_groups / class_sessions 의 RLS 가
-- 그대로 적용된다. 컬럼 추가는 같은 row 정책 안에서 read/write 된다.
-- ============================================================
