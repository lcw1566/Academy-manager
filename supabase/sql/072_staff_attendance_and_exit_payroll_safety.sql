-- Seenit — 근퇴·급여·퇴사 정산 안전 기반
--
-- 급여 화면은 아직 열지 않는다. 이 SQL은 다음 데이터 안전성만 보장한다.
--   1) 직원 1명/1일의 활성 근퇴 로그를 한 행으로 제한하고 출퇴근을 원자 저장한다.
--   2) 기존 중복 로그는 삭제하지 않고 is_void=true 로 보존한다.
--   3) completed/approved 로그만 급여 시간으로 인정할 수 있게 상태를 명확히 한다.
--   4) 퇴사 마지막 근무일과 검토 대기 상태의 최종 급여 초안을 보존한다.

alter table public.staff_attendance_logs
  add column if not exists is_void boolean not null default false,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

-- 현재 앱은 하루 한 번의 출근/퇴근을 전제로 한다. 기존 중복 중 퇴근까지 있는
-- 정상 행을 우선 남기고 나머지는 복구 가능한 무효 행으로 표시한다.
with ranked as (
  select
    id,
    row_number() over (
      partition by academy_id, staff_user_id, work_date
      order by
        (actual_start_time is not null and actual_end_time is not null) desc,
        (status in ('completed', 'approved')) desc,
        updated_at desc nulls last,
        created_at desc,
        id desc
    ) as row_rank
  from public.staff_attendance_logs
  where is_void = false
)
update public.staff_attendance_logs as target
set is_void = true,
    voided_at = now(),
    void_reason = '072 적용 전 중복 근퇴 기록'
from ranked
where target.id = ranked.id
  and ranked.row_rank > 1;

create unique index if not exists staff_attendance_logs_one_active_day_uidx
  on public.staff_attendance_logs(academy_id, staff_user_id, work_date)
  where is_void = false;

alter table public.academy_staff_profiles
  add column if not exists employment_started_on date,
  add column if not exists employment_ended_on date,
  add column if not exists exit_reason text;

update public.academy_staff_profiles
set employment_started_on = (created_at at time zone 'Asia/Seoul')::date
where employment_started_on is null;

alter table public.academy_staff_profiles
  alter column employment_started_on set default ((now() at time zone 'Asia/Seoul')::date);

alter table public.academy_staff_profiles
  drop constraint if exists academy_staff_profiles_employment_dates_chk;
alter table public.academy_staff_profiles
  add constraint academy_staff_profiles_employment_dates_chk
  check (
    employment_ended_on is null
    or employment_started_on is null
    or employment_ended_on >= employment_started_on
  );

alter table public.payrolls
  add column if not exists is_exit_settlement boolean not null default false,
  add column if not exists requires_review boolean not null default false,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists calculation_snapshot jsonb not null default '{}'::jsonb;

-- 동일 직원/날짜의 출퇴근을 하나의 트랜잭션으로 처리한다. 정상 기록은 별도
-- 승인 클릭 없이 completed 상태가 되며, 미퇴근 pending 행은 급여에서 제외한다.
create or replace function public.record_staff_attendance(
  p_academy_id uuid,
  p_staff_user_id uuid,
  p_staff_role text,
  p_work_date date,
  p_action text,
  p_time text,
  p_scheduled_start_time text default null,
  p_scheduled_end_time text default null,
  p_break_minutes integer default 0,
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_log public.staff_attendance_logs%rowtype;
  v_is_self boolean := auth.uid() = p_staff_user_id;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_action text := p_action;
  v_staff_role text := case when p_staff_role = 'assistant' then 'teacher' else p_staff_role end;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if not (
    (v_is_self and public.is_member_of_academy(p_academy_id))
    or public.is_academy_operations_manager(p_academy_id)
  ) then
    raise exception '근퇴 기록 권한이 없어요.' using errcode = '42501';
  end if;
  if v_is_self and p_work_date is distinct from v_today then
    raise exception '본인은 오늘 근퇴만 기록할 수 있어요.' using errcode = '42501';
  end if;
  if p_action not in ('clock_in', 'clock_out', 'toggle') then
    raise exception '지원하지 않는 근퇴 동작이에요.' using errcode = '22023';
  end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '시간 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_staff_role not in ('teacher', 'assistant', 'manager') then
    raise exception '직원 역할이 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_source not in ('manual', 'qr') then
    raise exception '근퇴 기록 출처가 올바르지 않아요.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_academy_id::text || ':' || p_staff_user_id::text || ':' || p_work_date::text,
      0
    )
  );

  select * into v_log
  from public.staff_attendance_logs
  where academy_id = p_academy_id
    and staff_user_id = p_staff_user_id
    and work_date = p_work_date
    and is_void = false
  for update;

  -- QR은 기기별 화면 캐시가 아니라 잠긴 서버 행을 보고 출근/퇴근을 정한다.
  if p_action = 'toggle' then
    if not found or v_log.actual_start_time is null then
      v_action := 'clock_in';
    elsif v_log.actual_end_time is null then
      if v_log.actual_start_time = p_time then
        return to_jsonb(v_log) || jsonb_build_object('_attendance_action', 'already_clocked_in');
      end if;
      v_action := 'clock_out';
    else
      return to_jsonb(v_log) || jsonb_build_object('_attendance_action', 'none');
    end if;
  end if;

  if v_action = 'clock_in' then
    if found and v_log.actual_start_time is not null then
      return to_jsonb(v_log) || jsonb_build_object('_attendance_action', 'none');
    end if;
    if found then
      update public.staff_attendance_logs
      set actual_start_time = p_time,
          scheduled_start_time = coalesce(scheduled_start_time, p_scheduled_start_time),
          scheduled_end_time = coalesce(scheduled_end_time, p_scheduled_end_time),
          break_minutes = greatest(0, coalesce(break_minutes, 0), coalesce(p_break_minutes, 0)),
          staff_role = v_staff_role,
          source = p_source,
          status = 'pending',
          approved_by = null,
          approved_at = null,
          updated_at = now()
      where id = v_log.id
      returning * into v_log;
    else
      insert into public.staff_attendance_logs (
        academy_id, staff_user_id, staff_role, work_date,
        scheduled_start_time, scheduled_end_time,
        actual_start_time, break_minutes, status, source
      ) values (
        p_academy_id, p_staff_user_id, v_staff_role, p_work_date,
        p_scheduled_start_time, p_scheduled_end_time,
        p_time, greatest(0, coalesce(p_break_minutes, 0)), 'pending', p_source
      ) returning * into v_log;
    end if;
  else
    if not found or v_log.actual_start_time is null then
      raise exception '먼저 출근을 기록해주세요.' using errcode = '22023';
    end if;
    if v_log.actual_end_time is not null then
      return to_jsonb(v_log) || jsonb_build_object('_attendance_action', 'none');
    end if;
    update public.staff_attendance_logs
    set actual_end_time = p_time,
        scheduled_start_time = coalesce(scheduled_start_time, p_scheduled_start_time),
        scheduled_end_time = coalesce(scheduled_end_time, p_scheduled_end_time),
        break_minutes = greatest(0, coalesce(break_minutes, 0), coalesce(p_break_minutes, 0)),
        staff_role = v_staff_role,
        source = coalesce(source, p_source),
        status = 'completed',
        approved_by = null,
        approved_at = null,
        updated_at = now()
    where id = v_log.id
    returning * into v_log;
  end if;

  return to_jsonb(v_log) || jsonb_build_object('_attendance_action', v_action);
end;
$$;

revoke all on function public.record_staff_attendance(
  uuid, uuid, text, date, text, text, text, text, integer, text
) from public;
grant execute on function public.record_staff_attendance(
  uuid, uuid, text, date, text, text, text, text, integer, text
) to authenticated;

-- 퇴사 월 명세를 삭제되거나 재계산에서 누락되지 않는 hold 상태로 보존한다.
-- 월급 일할 계산 정책은 아직 확정하지 않았으므로 월급 스냅샷을 넣되 반드시
-- 원장이 검토하도록 requires_review=true 로 둔다.
create or replace function public.prepare_staff_exit_payroll(
  p_academy_id uuid,
  p_user_id uuid,
  p_last_work_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.academy_staff_profiles%rowtype;
  v_month text := to_char(p_last_work_date, 'YYYY-MM');
  v_period_start date := date_trunc('month', p_last_work_date)::date;
  v_total_minutes numeric := 0;
  v_total_hours numeric := 0;
  v_open_count integer := 0;
  v_staff_type text;
  v_staff_id text;
  v_amount integer := 0;
  v_payroll public.payrolls%rowtype;
begin
  select * into v_profile
  from public.academy_staff_profiles
  where academy_id = p_academy_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('created', false, 'reason', 'staff_profile_missing');
  end if;

  v_period_start := greatest(
    v_period_start,
    coalesce(v_profile.employment_started_on, v_period_start)
  );
  v_staff_type := case
    when v_profile.role in ('teacher', 'assistant', 'manager') then v_profile.role
    else 'teacher'
  end;
  v_staff_id := v_staff_type || '_' || p_user_id::text;

  -- 예전 로컬 ID로 같은 달 명세가 이미 있으면 그 식별자를 보존한다.
  -- 퇴사 정산 때문에 같은 직원의 명세가 두 건 생기는 것을 막는다.
  select p.staff_type, p.staff_id
  into v_staff_type, v_staff_id
  from public.payrolls p
  where p.academy_id = p_academy_id
    and p.staff_user_id = p_user_id
    and p.month = v_month
  order by (p.status = 'completed') desc, p.updated_at desc nulls last, p.created_at desc
  limit 1;

  if not found then
    v_staff_type := case
      when v_profile.role in ('teacher', 'assistant', 'manager') then v_profile.role
      else 'teacher'
    end;
    v_staff_id := v_staff_type || '_' || p_user_id::text;
  end if;

  with parsed as (
    select
      (split_part(actual_start_time, ':', 1)::integer * 60
        + split_part(actual_start_time, ':', 2)::integer) as start_minute,
      (split_part(actual_end_time, ':', 1)::integer * 60
        + split_part(actual_end_time, ':', 2)::integer) as end_minute,
      greatest(0, coalesce(break_minutes, 0)) as break_minute
    from public.staff_attendance_logs
    where academy_id = p_academy_id
      and staff_user_id = p_user_id
      and work_date between v_period_start and p_last_work_date
      and is_void = false
      and status in ('completed', 'approved')
      and actual_start_time ~ '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
      and actual_end_time ~ '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
  )
  select coalesce(sum(greatest(
    0,
    (case
      when end_minute >= start_minute then end_minute - start_minute
      else (24 * 60) - start_minute + end_minute
    end) - break_minute
  )), 0)
  into v_total_minutes
  from parsed;

  select count(*) into v_open_count
  from public.staff_attendance_logs
  where academy_id = p_academy_id
    and staff_user_id = p_user_id
    and work_date between v_period_start and p_last_work_date
    and is_void = false
    and actual_start_time is not null
    and actual_end_time is null
    and status <> 'rejected';

  v_total_hours := round((v_total_minutes / 60.0)::numeric, 2);
  v_amount := case
    when coalesce(v_profile.wage_type, 'hourly') = 'hourly'
      then round(v_total_hours * coalesce(v_profile.hourly_wage, 0))::integer
    else coalesce(v_profile.monthly_salary, 0)
  end;

  insert into public.payrolls as existing (
    academy_id, user_id, mode, staff_type, staff_id, staff_user_id, month,
    wage_type, hourly_wage, monthly_salary, total_hours, amount, status, memo,
    is_exit_settlement, requires_review, period_start, period_end,
    calculation_snapshot
  ) values (
    p_academy_id, auth.uid(), 'academy', v_staff_type, v_staff_id, p_user_id, v_month,
    coalesce(v_profile.wage_type, 'hourly'), coalesce(v_profile.hourly_wage, 0),
    coalesce(v_profile.monthly_salary, 0), v_total_hours, v_amount, 'hold',
    '퇴사 월 최종 급여 확인 필요', true, true, v_period_start, p_last_work_date,
    jsonb_build_object(
      'source', 'staff_attendance_logs',
      'payable_statuses', jsonb_build_array('completed', 'approved'),
      'open_log_count', v_open_count,
      'calculated_at', now(),
      'wage_type', coalesce(v_profile.wage_type, 'hourly'),
      'hourly_wage', coalesce(v_profile.hourly_wage, 0),
      'monthly_salary', coalesce(v_profile.monthly_salary, 0)
    )
  )
  on conflict (academy_id, staff_type, staff_id, month) do update set
    staff_user_id = excluded.staff_user_id,
    is_exit_settlement = true,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    calculation_snapshot = excluded.calculation_snapshot,
    requires_review = case when existing.status = 'completed' then false else true end,
    wage_type = case when existing.status = 'completed' then existing.wage_type else excluded.wage_type end,
    hourly_wage = case when existing.status = 'completed' then existing.hourly_wage else excluded.hourly_wage end,
    monthly_salary = case when existing.status = 'completed' then existing.monthly_salary else excluded.monthly_salary end,
    total_hours = case when existing.status = 'completed' then existing.total_hours else excluded.total_hours end,
    amount = case when existing.status = 'completed' then existing.amount else excluded.amount end,
    status = case when existing.status = 'completed' then existing.status else 'hold' end,
    memo = case when existing.status = 'completed' then existing.memo else excluded.memo end,
    updated_at = now()
  returning * into v_payroll;

  return jsonb_build_object(
    'created', true,
    'payroll_id', v_payroll.id,
    'month', v_month,
    'status', v_payroll.status,
    'total_hours', v_payroll.total_hours,
    'amount', v_payroll.amount,
    'open_log_count', v_open_count,
    'requires_review', v_payroll.requires_review
  );
end;
$$;

revoke all on function public.prepare_staff_exit_payroll(uuid, uuid, date) from public;

-- SQL 067의 위임 권한 제한을 유지하면서 마지막 근무일과 최종 급여 초안을 추가한다.
create or replace function public.remove_academy_member(
  p_academy_id uuid,
  p_user_id uuid,
  p_last_work_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_owner boolean := false;
  v_membership public.academy_members%rowtype;
  v_profile public.academy_staff_profiles%rowtype;
  v_class_count integer := 0;
  v_work_rule_count integer := 0;
  v_payroll jsonb := '{}'::jsonb;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  if p_last_work_date is null or p_last_work_date > v_today then
    raise exception '마지막 근무일을 오늘 또는 이전 날짜로 선택해주세요.' using errcode = '22023';
  end if;
  v_is_owner := public.is_owner_of_academy(p_academy_id);
  if not v_is_owner and not public.has_academy_permission(p_academy_id, 'canRemoveStaff') then
    raise exception '직원을 내보낼 권한이 없어요.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception '본인은 직원 내보내기로 처리할 수 없어요.' using errcode = '42501';
  end if;

  select * into v_membership
  from public.academy_members
  where academy_id = p_academy_id and user_id = p_user_id and status = 'active'
  for update;
  if not found then raise exception '활성 상태인 직원을 찾을 수 없어요.'; end if;
  if v_membership.role = 'owner' or exists (
    select 1 from public.academies a where a.id = p_academy_id and a.owner_id = p_user_id
  ) then
    raise exception '원장은 내보낼 수 없어요. 먼저 소유권 이전이 필요해요.';
  end if;
  if not v_is_owner and (
    public.academy_member_has_permission(p_academy_id, p_user_id, 'canManageStaffPermissions')
    or public.academy_member_has_permission(p_academy_id, p_user_id, 'canRemoveStaff')
  ) then
    raise exception '접근 관리 권한이 있는 직원은 원장만 내보낼 수 있어요.' using errcode = '42501';
  end if;

  select * into v_profile from public.academy_staff_profiles
  where academy_id = p_academy_id and user_id = p_user_id;
  if found and v_profile.employment_started_on is not null
      and p_last_work_date < v_profile.employment_started_on then
    raise exception '마지막 근무일이 입사일보다 빠를 수 없어요.' using errcode = '22023';
  end if;

  select count(*) into v_class_count from public.class_groups g
  where g.academy_id = p_academy_id and g.teacher_user_id = p_user_id
    and coalesce(g.status, 'active') <> 'inactive';
  select count(*) into v_work_rule_count from public.academy_staff_work_rules r
  where r.academy_id = p_academy_id and r.staff_user_id = p_user_id and r.is_active = true;

  v_payroll := public.prepare_staff_exit_payroll(p_academy_id, p_user_id, p_last_work_date);

  update public.academy_members set status = 'inactive', updated_at = now()
  where id = v_membership.id;
  update public.academy_staff_profiles
  set status = 'inactive', employment_ended_on = p_last_work_date,
      exit_reason = 'removed', updated_at = now()
  where academy_id = p_academy_id and user_id = p_user_id;
  update public.academy_staff_work_rules set is_active = false, updated_at = now()
  where academy_id = p_academy_id and staff_user_id = p_user_id and is_active = true;

  return jsonb_build_object(
    'academy_id', p_academy_id, 'user_id', p_user_id,
    'membership_status', 'inactive', 'last_work_date', p_last_work_date,
    'assigned_class_count', v_class_count, 'stopped_work_rule_count', v_work_rule_count,
    'exit_payroll', v_payroll
  );
end;
$$;

create or replace function public.remove_academy_member(p_academy_id uuid, p_user_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$
  select public.remove_academy_member(
    p_academy_id,
    p_user_id,
    (now() at time zone 'Asia/Seoul')::date
  );
$$;

revoke all on function public.remove_academy_member(uuid, uuid, date) from public;
revoke all on function public.remove_academy_member(uuid, uuid) from public;
grant execute on function public.remove_academy_member(uuid, uuid, date) to authenticated;
grant execute on function public.remove_academy_member(uuid, uuid) to authenticated;

create or replace function public.leave_academy(p_academy_id uuid, p_last_work_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.academy_members%rowtype;
  v_profile public.academy_staff_profiles%rowtype;
  v_class_count integer := 0;
  v_payroll jsonb := '{}'::jsonb;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if v_user_id is null then raise exception '로그인이 필요해요.'; end if;
  if p_last_work_date is null or p_last_work_date > v_today then
    raise exception '마지막 근무일을 오늘 또는 이전 날짜로 선택해주세요.' using errcode = '22023';
  end if;
  select * into v_membership from public.academy_members
  where academy_id = p_academy_id and user_id = v_user_id and status = 'active'
  for update;
  if not found then raise exception '현재 소속된 학원이 아니에요.'; end if;
  if v_membership.role = 'owner' or exists (
    select 1 from public.academies a where a.id = p_academy_id and a.owner_id = v_user_id
  ) then
    raise exception '원장은 학원을 나갈 수 없어요. 먼저 소유권을 이전해주세요.';
  end if;
  select * into v_profile from public.academy_staff_profiles
  where academy_id = p_academy_id and user_id = v_user_id;
  if found and v_profile.employment_started_on is not null
      and p_last_work_date < v_profile.employment_started_on then
    raise exception '마지막 근무일이 입사일보다 빠를 수 없어요.' using errcode = '22023';
  end if;
  select count(*) into v_class_count from public.class_groups g
  where g.academy_id = p_academy_id and g.teacher_user_id = v_user_id
    and coalesce(g.status, 'active') <> 'inactive';

  v_payroll := public.prepare_staff_exit_payroll(p_academy_id, v_user_id, p_last_work_date);

  update public.academy_members set status = 'inactive', updated_at = now()
  where id = v_membership.id;
  update public.academy_staff_profiles
  set status = 'inactive', employment_ended_on = p_last_work_date,
      exit_reason = 'left', updated_at = now()
  where academy_id = p_academy_id and user_id = v_user_id;
  update public.academy_staff_work_rules set is_active = false, updated_at = now()
  where academy_id = p_academy_id and staff_user_id = v_user_id and is_active = true;

  return jsonb_build_object(
    'academy_id', p_academy_id, 'user_id', v_user_id,
    'membership_status', 'inactive', 'last_work_date', p_last_work_date,
    'assigned_class_count', v_class_count, 'exit_payroll', v_payroll
  );
end;
$$;

create or replace function public.leave_academy(p_academy_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$
  select public.leave_academy(
    p_academy_id,
    (now() at time zone 'Asia/Seoul')::date
  );
$$;

revoke all on function public.leave_academy(uuid, date) from public;
revoke all on function public.leave_academy(uuid) from public;
grant execute on function public.leave_academy(uuid, date) to authenticated;
grant execute on function public.leave_academy(uuid) to authenticated;

notify pgrst, 'reload schema';
