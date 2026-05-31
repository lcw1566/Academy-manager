-- ============================================================
-- 012_remove_wifi_check_method.sql
-- Academy Manager — Wi-Fi 출퇴근 방식 제거 (Phase 43)
--
-- 배경:
--   - Phase 41 에서 staff_check_method 로 'wifi' / 'qr' 두 가지를 지원했으나,
--     웹/PWA 환경에서는 브라우저가 SSID 를 읽을 방법이 없어 Wi-Fi 모드가
--     사실상 "안내 표시만 되는 명예 시스템" 으로만 작동.
--   - 네이티브 앱이 없는 현 상태에서 사용자가 오해할 여지를 없애기 위해
--     Wi-Fi 옵션을 완전 제거하고 QR 단일 옵션으로 단순화.
--
-- 이 파일이 하는 일:
--   1. 기존 'wifi' 값을 가진 academies 행을 'qr' 로 마이그레이션
--   2. staff_check_method check 제약을 'qr' 전용으로 재정의
--   3. staff_check_method default 값을 'qr' 로 변경
--   4. wifi_name, wifi_hint 컬럼 drop
--
-- 멱등성:
--   - update : 'wifi' 가 없으면 0 row 영향
--   - alter constraint : drop if exists 후 add
--   - alter default : 무해
--   - drop column if exists : 두 번 실행해도 안전
--
-- ⚠ destructive:
--   - wifi_name / wifi_hint 컬럼이 영구 삭제됨. 다시 살리려면 새 마이그레이션 필요.
-- ============================================================


-- ============================================================
-- SECTION 1. 기존 'wifi' 값 → 'qr' 로 마이그레이션
-- ============================================================
-- check 제약을 좁히기 전에 먼저 값을 마이그레이션해야 함.

update public.academies
   set staff_check_method = 'qr'
 where staff_check_method = 'wifi';


-- ============================================================
-- SECTION 2. check 제약 좁히기 ('qr' only)
-- ============================================================

alter table public.academies
  drop constraint if exists academies_staff_check_method_chk;

alter table public.academies
  add constraint academies_staff_check_method_chk
  check (staff_check_method in ('qr'));


-- ============================================================
-- SECTION 3. default 값을 'qr' 로 변경
-- ============================================================
-- 신규 학원 row 가 옛 default 'wifi' 로 들어오면 즉시 check 제약 위반이 되므로
-- default 도 함께 변경해야 함.

alter table public.academies
  alter column staff_check_method set default 'qr';


-- ============================================================
-- SECTION 4. wifi_name / wifi_hint 컬럼 drop
-- ============================================================
-- Wi-Fi 모드 자체가 사라지므로 안내용 텍스트도 더 이상 필요 없음.

alter table public.academies
  drop column if exists wifi_name;

alter table public.academies
  drop column if exists wifi_hint;


-- ============================================================
-- 끝.
--
-- 확인 쿼리:
--   select column_name, column_default, is_nullable
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name = 'academies'
--      and column_name in ('staff_check_method', 'wifi_name', 'wifi_hint');
--
--   -- 기대값:
--   --   staff_check_method : default 'qr'
--   --   wifi_name, wifi_hint : (행 없음)
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conname = 'academies_staff_check_method_chk';
--   -- 기대값: CHECK (staff_check_method IN ('qr'))
-- ============================================================
