-- Seenit — 오늘 완료 회차의 잘못 입력한 시간 정정 허용
--
-- 수업 시간이 지난 뒤 반 규칙을 고쳐도 오늘 완료 회차만 이전 시간을 유지하던
-- 동작을 보정한다. 오늘 날짜에 한해서 회차 ID, 출석, 수업/클리닉 기록과 완료
-- 상태는 그대로 두고 시간·담당·강의실 스냅샷만 최신 규칙으로 맞춘다.

create or replace function public.sync_same_day_class_session_from_new_rule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_group public.class_groups%rowtype;
begin
  if new.is_active is not true then
    return new;
  end if;

  if new.effective_start_date is not null
     and new.effective_start_date > v_today + 1 then
    return new;
  end if;

  select *
    into v_group
    from public.class_groups
   where id = new.class_group_id
     and academy_id = new.academy_id;

  if not found then
    return new;
  end if;

  update public.class_sessions cs
     set schedule_rule_id = new.id,
         occurrence_date = coalesce(cs.occurrence_date, cs.date),
         start_time = new.start_time,
         end_time = new.end_time,
         room = coalesce(new.room, v_group.room),
         teacher_id = v_group.teacher_id,
         teacher_type = v_group.teacher_type,
         teacher_user_id = coalesce(new.teacher_user_id, v_group.teacher_user_id),
         assistant_ids = coalesce(
           new.assistant_ids,
           v_group.assistant_ids,
           '[]'::jsonb
         ),
         student_ids = coalesce(v_group.student_ids, '[]'::jsonb),
         record_schema = coalesce(cs.record_schema, v_group.record_schema),
         activity_type = coalesce(cs.activity_type, v_group.activity_type),
         activity_name = coalesce(cs.activity_name, v_group.activity_name),
         updated_at = now()
   where cs.academy_id = new.academy_id
     and cs.class_group_id = new.class_group_id
     and coalesce(cs.occurrence_date, cs.date) = v_today
     and extract(dow from coalesce(cs.occurrence_date, cs.date))::smallint
       = new.day_of_week
     and cs.session_exception_id is null
     and cs.status in ('scheduled', 'rescheduled', 'completed')
     and cs.schedule_rule_id is distinct from new.id;

  return new;
end;
$$;

drop trigger if exists sync_same_day_class_session_from_new_rule
  on public.class_schedule_rules;

create trigger sync_same_day_class_session_from_new_rule
after insert on public.class_schedule_rules
for each row
execute function public.sync_same_day_class_session_from_new_rule();

revoke all on function public.sync_same_day_class_session_from_new_rule()
  from public;

comment on function public.sync_same_day_class_session_from_new_rule() is
  '당일 반 규칙 수정 시 완료 여부와 관계없이 실제 회차 시간을 최신 규칙으로 정정한다.';

-- 수업 기록 화면의 '회차 변경 > 시간 변경'으로 오늘 완료 회차를 직접 고치는
-- 경우에도 실체화 함수가 완료 시간을 보존해 되돌리지 못하도록 즉시 반영한다.
create or replace function public.sync_completed_session_time_from_exception()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.type <> 'reschedule'
     or new.session_date <> (now() at time zone 'Asia/Seoul')::date
     or new.start_time is null
     or new.end_time is null then
    return new;
  end if;

  update public.class_sessions cs
     set start_time = new.start_time,
         end_time = new.end_time,
         session_exception_id = new.id,
         updated_at = now()
   where cs.academy_id = new.academy_id
     and cs.class_group_id = new.class_group_id
     and coalesce(cs.occurrence_date, cs.date) = new.session_date
     and cs.status = 'completed'
     and (
       cs.schedule_rule_id is not null
       or cs.session_exception_id = new.id
     );

  return new;
end;
$$;

drop trigger if exists sync_completed_session_time_from_exception
  on public.class_session_exceptions;

create trigger sync_completed_session_time_from_exception
after insert or update of type, session_date, start_time, end_time
on public.class_session_exceptions
for each row
execute function public.sync_completed_session_time_from_exception();

revoke all on function public.sync_completed_session_time_from_exception()
  from public;

comment on function public.sync_completed_session_time_from_exception() is
  '오늘 완료 회차의 일회성 시간 정정을 기록 연결을 유지한 채 반영한다.';

notify pgrst, 'reload schema';
