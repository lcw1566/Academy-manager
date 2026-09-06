-- ============================================================
-- 074_product_feedback_service_role_access.sql
-- 운영 도구가 접수 의견을 조회하고 처리 상태를 변경할 수 있게 한다.
-- 일반 로그인 사용자의 RLS 범위는 변경하지 않는다.
-- ============================================================

begin;

grant usage on schema public to service_role;
grant select, update on table public.product_feedback to service_role;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- End of 074_product_feedback_service_role_access.sql
-- ============================================================
