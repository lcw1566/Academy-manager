-- ============================================================
-- 030_academy_tuition_policy.sql
-- Seenit — 학원 수강료 기준
--
-- school_level : 초등·중등·고등 등 학교급 기준
-- grade        : 초1·중2·고3 등 학년 기준
-- class        : 반마다 개별 설정
-- ============================================================

alter table public.academies
  add column if not exists tuition_policy text not null default 'class';

alter table public.academies
  alter column tuition_policy set default 'class';

update public.academies
set tuition_policy = 'class'
where tuition_policy is null
   or tuition_policy not in ('school_level', 'grade', 'class');

alter table public.academies
  alter column tuition_policy set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'academies_tuition_policy_check'
      and conrelid = 'public.academies'::regclass
  ) then
    alter table public.academies
      add constraint academies_tuition_policy_check
      check (tuition_policy in ('school_level', 'grade', 'class'));
  end if;
end $$;
