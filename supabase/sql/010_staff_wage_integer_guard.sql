-- 010_staff_wage_integer_guard.sql
--
-- Ensure staff wage fields are stored as whole won amounts.
-- This is safe to run after older/manual schemas where hourly_wage or
-- monthly_salary may have been created as a floating/numeric type.

alter table public.academy_staff_profiles
  alter column hourly_wage type integer
  using greatest(0, round(coalesce(hourly_wage, 0)))::integer;

alter table public.academy_staff_profiles
  alter column monthly_salary type integer
  using greatest(0, round(coalesce(monthly_salary, 0)))::integer;

alter table public.academy_staff_profiles
  alter column hourly_wage set default 0,
  alter column monthly_salary set default 0;

alter table public.academy_staff_profiles
  alter column hourly_wage set not null,
  alter column monthly_salary set not null;

