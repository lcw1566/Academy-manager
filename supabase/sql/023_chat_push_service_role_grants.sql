-- ============================================================
-- 023_chat_push_service_role_grants.sql
--
-- chat-push Edge Function은 service_role로 메시지/방/수신자/기기 토큰을
-- 조회한다. RLS 우회 권한과 별개로 테이블 자체 privilege가 필요하므로
-- 함수가 사용하는 최소 권한만 명시적으로 부여한다.
-- ============================================================

grant usage on schema public to service_role;
grant select on table public.academy_chat_messages to service_role;
grant select on table public.academy_chat_threads to service_role;
grant select on table public.academy_chat_thread_members to service_role;
grant select on table public.academy_members to service_role;
grant select on table public.profiles to service_role;
grant select, update on table public.push_devices to service_role;
