-- ============================================================
-- 009_academy_billing_settings.sql
-- Academy Manager — 학원별 급여/수강료 일자 설정 (Phase 39)
--
-- 학원 단위로 "매월 N일 급여 지급" / "매월 M일 수강료 납부 예정" 같은
-- 정책 값을 저장한다. 모든 정산/급여/수납 화면이 이 값을 참고할 수 있다.
--
-- 전제:
--   - 001 ~ 008 모두 적용됨
--   - academies 테이블 존재 (001)
--
-- 이 파일이 만드는 것:
--   1. academies.salary_payment_day  smallint (1~31)  default 10
--   2. academies.tuition_due_day     smallint (1~31)  default 1
--   3. 값 범위 check 제약 (1~31)
--
-- idempotent:
--   - alter table 은 'add column if not exists'
--   - check 제약은 'do $$ ... if not exists' 로 안전하게 추가
--
-- destructive 명령 (drop table / delete / truncate) 없음.
-- 기존 academies RLS 가 그대로 적용된다 (소속 멤버만 select, owner 만 update).
-- ============================================================


-- ============================================================
-- SECTION 1. academies.salary_payment_day
-- ============================================================
-- 매월 N일에 강사/보조강사 급여를 지급하는 정책. 1~31.
alter table public.academies
  add column if not exists salary_payment_day smallint not null default 10;


-- ============================================================
-- SECTION 2. academies.tuition_due_day
-- ============================================================
-- 매월 M일에 수강료 납부 예정일을 잡는 정책. 1~31.
alter table public.academies
  add column if not exists tuition_due_day smallint not null default 1;


-- ============================================================
-- SECTION 3. 1~31 범위 check 제약
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'academies_salary_payment_day_range'
  ) then
    alter table public.academies
      add constraint academies_salary_payment_day_range
      check (salary_payment_day between 1 and 31);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'academies_tuition_due_day_range'
  ) then
    alter table public.academies
      add constraint academies_tuition_due_day_range
      check (tuition_due_day between 1 and 31);
  end if;
end$$;


-- ============================================================
-- 끝.
-- 사용 예:
--   select id, name, salary_payment_day, tuition_due_day
--     from public.academies where id = '...';
--
--   update public.academies
--      set salary_payment_day = 25, tuition_due_day = 5
--      where id = '...';
-- ============================================================
