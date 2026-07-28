-- ============================================================
-- 044_student_centered_billing.sql
-- 학생 기본 수강료 + 별도 비용 수업의 월별 합산 모델.
--
-- 기존 class_groups.default_billing 값은 보존하지만 fee_policy 기본값을
-- included로 두어 마이그레이션 직후 중복 청구되지 않게 한다.
-- ============================================================

begin;

alter table public.students
  add column if not exists base_tuition integer not null default 0,
  add column if not exists tuition_subjects jsonb not null default '[]'::jsonb,
  add column if not exists tuition_source text not null default 'academy_rate',
  add column if not exists tuition_effective_from date,
  add column if not exists tuition_effective_to date;

alter table public.students drop constraint if exists students_base_tuition_nonnegative_chk;
alter table public.students add constraint students_base_tuition_nonnegative_chk
  check (base_tuition >= 0);

alter table public.students drop constraint if exists students_tuition_source_chk;
alter table public.students add constraint students_tuition_source_chk
  check (tuition_source in ('academy_rate', 'custom'));

alter table public.students drop constraint if exists students_tuition_period_chk;
alter table public.students add constraint students_tuition_period_chk
  check (
    tuition_effective_to is null
    or tuition_effective_from is null
    or tuition_effective_to >= tuition_effective_from
  );

update public.students
set tuition_effective_from = coalesce(tuition_effective_from, enrollment_date)
where tuition_effective_from is null;

alter table public.class_groups
  add column if not exists fee_policy text not null default 'included',
  add column if not exists additional_fee_type text not null default 'monthly',
  add column if not exists additional_fee_amount integer not null default 0;

alter table public.class_groups drop constraint if exists class_groups_fee_policy_chk;
alter table public.class_groups add constraint class_groups_fee_policy_chk
  check (fee_policy in ('included', 'additional'));

alter table public.class_groups drop constraint if exists class_groups_additional_fee_type_chk;
alter table public.class_groups add constraint class_groups_additional_fee_type_chk
  check (additional_fee_type in ('monthly', 'one_time', 'per_session'));

alter table public.class_groups drop constraint if exists class_groups_additional_fee_amount_chk;
alter table public.class_groups add constraint class_groups_additional_fee_amount_chk
  check (additional_fee_amount >= 0);

alter table public.payments
  add column if not exists payment_kind text not null default 'legacy_class',
  add column if not exists billing_snapshot jsonb not null default '{}'::jsonb;

alter table public.payments drop constraint if exists payments_payment_kind_chk;
alter table public.payments add constraint payments_payment_kind_chk
  check (payment_kind in ('student_monthly', 'legacy_class', 'manual'));

create unique index if not exists payments_student_monthly_unique_idx
  on public.payments (academy_id, student_id, month)
  where payment_kind = 'student_monthly';

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- End of 044_student_centered_billing.sql
-- ============================================================
