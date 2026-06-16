-- ============================================================
-- 007_profile_search_rpc.sql
-- Seenit — profile email 검색 RPC (Phase 32 Post-fix)
--
-- 배경:
--   profiles 의 RLS 정책은 본인 row 만 select 허용한다 (001). 그래서 원장이
--   강사/보조강사를 초대하려고 이메일로 검색해도 "찾을 수 없음" 으로만 보였다.
--
-- 이 파일이 만드는 것:
--   - public.search_profile_by_email(p_email text) 함수 (security definer)
--   - exact email match 한 건만 반환. 일부 필드만 노출 (전체 profile 누출 방지).
--
-- 안전 가드:
--   - security definer 라 RLS 우회. 따라서 함수 내부에서 lower(trim(email))
--     exact match 로만 검색하고 1행만 반환.
--   - 검색 결과는 id / email / display_name / phone / account_type 만 노출.
--     (다른 컬럼 추가 금지.)
--   - p_email 가 비거나 너무 짧으면 빈 결과.
--   - authenticated role 에만 execute 부여. service_role 사용 안 함.
--
-- destructive 명령 (drop table / delete / truncate) 없음.
-- ============================================================


-- ============================================================
-- SECTION 1. search_profile_by_email
-- ============================================================

create or replace function public.search_profile_by_email(p_email text)
returns table (
  id           uuid,
  email        text,
  display_name text,
  phone        text,
  account_type text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cleaned text;
begin
  -- 빈 값 / 너무 짧은 입력은 즉시 빈 결과.
  cleaned := lower(trim(coalesce(p_email, '')));
  if cleaned = '' or length(cleaned) < 3 then
    return;
  end if;

  return query
    select
      p.id,
      p.email,
      p.display_name,
      p.phone,
      p.account_type
    from public.profiles p
    where lower(p.email) = cleaned
    limit 1;
end;
$$;


-- ============================================================
-- SECTION 2. GRANT
--
-- authenticated 만 execute 가능. anon / service_role 부여 없음.
-- ============================================================

revoke all on function public.search_profile_by_email(text) from public;
grant execute on function public.search_profile_by_email(text) to authenticated;


-- ============================================================
-- End of 007_profile_search_rpc.sql
-- ============================================================
