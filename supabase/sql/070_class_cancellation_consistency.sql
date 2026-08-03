-- Seenit — 휴강 회차 상태 보존 및 중복 예외 방지
--
-- 학원 일정 휴강은 기존의 수동 휴강/시간 변경/반 규칙 취소 상태를 임시로
-- 덮어쓴다. 일정이 수정·삭제될 때 그 이전 상태를 정확히 복구하고, 휴강된
-- 회차가 완료 처리되는 것을 DB에서도 차단한다.

begin;

alter table public.class_sessions
  add column if not exists calendar_cancel_original_status text,
  add column if not exists calendar_cancel_original_by_exception boolean,
  add column if not exists calendar_cancel_original_exception_id uuid
    references public.class_session_exceptions(id) on delete set null;

-- 068 적용 뒤 이미 학원 일정에 의해 휴강된 회차도 가능한 범위에서 원래
-- 상태를 복원할 수 있게 채운다. 같은 날짜의 수동 예외가 있으면 그 상태를
-- 우선하고, 비활성화된 규칙의 과거 회차는 규칙 취소 상태로 보존한다.
update public.class_sessions cs
set calendar_cancel_original_status = coalesce(
      (
        select case other.type
          when 'cancel' then 'canceled'
          when 'reschedule' then 'rescheduled'
          else 'scheduled'
        end
        from public.class_session_exceptions other
        where other.academy_id = cs.academy_id
          and other.class_group_id = cs.class_group_id
          and other.session_date = coalesce(cs.occurrence_date, cs.date)
          and other.calendar_event_id is null
          and other.type <> 'extra'
        order by case other.type when 'cancel' then 1 when 'reschedule' then 2 else 3 end,
                 other.created_at desc
        limit 1
      ),
      case
        when cs.schedule_rule_id is not null and not exists (
          select 1
          from public.class_schedule_rules rule
          where rule.id = cs.schedule_rule_id
            and rule.is_active = true
            and (rule.effective_start_date is null or coalesce(cs.occurrence_date, cs.date) >= rule.effective_start_date)
            and (rule.effective_end_date is null or coalesce(cs.occurrence_date, cs.date) <= rule.effective_end_date)
        ) then 'canceled'
        else 'scheduled'
      end
    ),
    calendar_cancel_original_by_exception = exists (
      select 1
      from public.class_session_exceptions other
      where other.academy_id = cs.academy_id
        and other.class_group_id = cs.class_group_id
        and other.session_date = coalesce(cs.occurrence_date, cs.date)
        and other.calendar_event_id is null
        and other.type = 'cancel'
    ),
    calendar_cancel_original_exception_id = (
      select other.id
      from public.class_session_exceptions other
      where other.academy_id = cs.academy_id
        and other.class_group_id = cs.class_group_id
        and other.session_date = coalesce(cs.occurrence_date, cs.date)
        and other.calendar_event_id is null
        and other.type <> 'extra'
      order by case other.type when 'cancel' then 1 when 'reschedule' then 2 else 3 end,
               other.created_at desc
      limit 1
    )
from public.class_session_exceptions current_exception
where current_exception.id = cs.session_exception_id
  and current_exception.calendar_event_id is not null
  and current_exception.type = 'cancel'
  and cs.status = 'canceled'
  and cs.calendar_cancel_original_status is null;

create or replace function public.preserve_class_session_calendar_cancel_origin()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_new_is_calendar_cancel boolean := false;
  v_new_is_manual_cancel boolean := false;
begin
  if new.session_exception_id is not null then
    select exists (
      select 1 from public.class_session_exceptions exception
      where exception.id = new.session_exception_id
        and exception.type = 'cancel'
        and exception.calendar_event_id is not null
    ) into v_new_is_calendar_cancel;
    select exists (
      select 1 from public.class_session_exceptions exception
      where exception.id = new.session_exception_id
        and exception.type = 'cancel'
        and exception.calendar_event_id is null
    ) into v_new_is_manual_cancel;
  end if;

  -- 처음 학원 일정 휴강이 덮어쓸 때만 원래 상태를 보관한다. 여러 학원
  -- 일정이 겹쳐도 마지막 일정이 사라질 때까지 같은 원본을 유지한다.
  if v_new_is_calendar_cancel and new.status = 'canceled' then
    if old.calendar_cancel_original_status is null then
      new.calendar_cancel_original_status := old.status;
      new.calendar_cancel_original_by_exception := old.canceled_by_schedule_exception;
      new.calendar_cancel_original_exception_id := old.session_exception_id;
    end if;
    return new;
  end if;

  if old.calendar_cancel_original_status is not null then
    -- 학원 휴원 기간 중 사용자가 별도의 수동 휴강을 추가했다면 그 결정을
    -- 유지한다. 그렇지 않을 때만 휴원 이전 상태로 되돌린다.
    if not v_new_is_manual_cancel then
      new.status := old.calendar_cancel_original_status;
      new.canceled_by_schedule_exception := coalesce(
        old.calendar_cancel_original_by_exception,
        false
      );
      new.session_exception_id := old.calendar_cancel_original_exception_id;
    end if;
    new.calendar_cancel_original_status := null;
    new.calendar_cancel_original_by_exception := null;
    new.calendar_cancel_original_exception_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists a_preserve_class_session_calendar_cancel_origin
  on public.class_sessions;
create trigger a_preserve_class_session_calendar_cancel_origin
before update of status, canceled_by_schedule_exception, session_exception_id
on public.class_sessions
for each row execute function public.preserve_class_session_calendar_cancel_origin();

create or replace function public.guard_canceled_class_session_completion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'canceled' and new.status = 'completed' then
    raise exception '휴강된 수업은 완료 처리할 수 없어요.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists z_guard_canceled_class_session_completion
  on public.class_sessions;
create trigger z_guard_canceled_class_session_completion
before update of status on public.class_sessions
for each row execute function public.guard_canceled_class_session_completion();

create or replace function public.guard_canceled_class_session_record_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.class_session_id is not null and exists (
    select 1
    from public.class_sessions session
    where session.id = new.class_session_id
      and session.status = 'canceled'
  ) then
    raise exception '휴강된 수업에는 기록이나 출석을 저장할 수 없어요.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_canceled_lesson_record_write
  on public.lesson_records;
create trigger guard_canceled_lesson_record_write
before insert or update on public.lesson_records
for each row execute function public.guard_canceled_class_session_record_write();

drop trigger if exists guard_canceled_attendance_record_write
  on public.attendance_records;
create trigger guard_canceled_attendance_record_write
before insert or update on public.attendance_records
for each row execute function public.guard_canceled_class_session_record_write();

create or replace function public.guard_extra_session_on_canceled_date()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.type = 'extra' and exists (
    select 1
    from public.class_session_exceptions cancellation
    where cancellation.academy_id = new.academy_id
      and cancellation.class_group_id = new.class_group_id
      and cancellation.session_date = new.session_date
      and cancellation.type = 'cancel'
      and cancellation.id is distinct from new.id
  ) then
    raise exception '휴강된 날짜에는 같은 반의 추가 수업을 만들 수 없어요. 다른 날짜를 선택해주세요.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_extra_session_on_canceled_date
  on public.class_session_exceptions;
create trigger guard_extra_session_on_canceled_date
before insert or update on public.class_session_exceptions
for each row execute function public.guard_extra_session_on_canceled_date();

-- 종일이 아닌 일정은 현재의 반+날짜 예외 구조로 특정 시간만 안전하게
-- 휴강할 수 없다. 새 데이터부터 잘못된 전체 휴강 연결을 DB에서도 차단한다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'academy_calendar_events_timed_class_impact_chk'
      and conrelid = 'public.academy_calendar_events'::regclass
  ) then
    alter table public.academy_calendar_events
      add constraint academy_calendar_events_timed_class_impact_chk
      check (all_day or not affects_classes) not valid;
  end if;
end$$;

-- 같은 기기/여러 기기에서 저장을 연속으로 눌러도 수동 휴강·시간 변경이
-- 여러 행으로 쌓이지 않게 기존 중복을 정리하고 자연키를 보장한다.
with ranked as (
  select
    id,
    first_value(id) over (
      partition by academy_id, class_group_id, session_date, type
      order by created_at desc, id desc
    ) as keep_id,
    row_number() over (
      partition by academy_id, class_group_id, session_date, type
      order by created_at desc, id desc
    ) as row_number
  from public.class_session_exceptions
  where calendar_event_id is null
    and type in ('cancel', 'reschedule')
)
update public.class_sessions session
set session_exception_id = ranked.keep_id
from ranked
where ranked.row_number > 1
  and session.session_exception_id = ranked.id;

with ranked as (
  select
    id,
    row_number() over (
      partition by academy_id, class_group_id, session_date, type
      order by created_at desc, id desc
    ) as row_number
  from public.class_session_exceptions
  where calendar_event_id is null
    and type in ('cancel', 'reschedule')
)
delete from public.class_session_exceptions exception
using ranked
where exception.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists class_session_exceptions_manual_change_unique_idx
  on public.class_session_exceptions(academy_id, class_group_id, session_date, type)
  where calendar_event_id is null and type in ('cancel', 'reschedule');

notify pgrst, 'reload schema';

commit;
