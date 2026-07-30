-- Seenit — 당일 반 시간 수정의 회차 소비 화면 동기화
--
-- SQL 047은 오늘 회차에 출석/수업/클리닉 기록이 있으면 기록 보존을 위해 새
-- 반복 규칙의 effective_start_date를 다음 날로 미룬다. 회차 ID와 연결 기록은
-- 그대로 보존할 수 있으므로, 완료되지 않은 오늘 회차의 시간·담당·학생 스냅샷은
-- 새 규칙으로 갱신해 등하원/클리닉/수업 화면이 서로 다른 시간을 보지 않게 한다.

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

  -- 반 수정 RPC가 오늘 기록 때문에 적용일을 하루 미룬 경우까지만 보정한다.
  -- 실제로 먼 미래부터 시작하는 규칙은 현재 회차에 미리 적용하지 않는다.
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
     and cs.status in ('scheduled', 'rescheduled')
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
  '당일 반 규칙 수정 시 완료 전 실제 회차를 새 시간·담당·학생 구성으로 즉시 맞춘다.';

notify pgrst, 'reload schema';
