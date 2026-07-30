-- Seenit — 늦게 생성된 수업 회차에도 기존 등원 기록 연결
--
-- QR/직접 등원이 class_sessions 실체화보다 먼저 저장되어도, 해당 회차가
-- 나중에 생성되거나 학생 배정이 갱신되는 순간 당일 등원을 출석으로 보완한다.
-- 선생님이 이미 확정한 지각·결석·인정결석은 덮어쓰지 않는다.

begin;

create or replace function public.sync_existing_checkins_to_class_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_date date;
begin
  if new.academy_id is null
     or new.id is null
     or new.status in ('canceled', 'cancelled') then
    return new;
  end if;

  v_session_date := coalesce(new.occurrence_date, new.date);
  if v_session_date is null then
    return new;
  end if;

  insert into public.attendance_records (
    academy_id,
    user_id,
    mode,
    class_group_id,
    class_session_id,
    student_id,
    date,
    status,
    source,
    checked_at,
    confirmation_state,
    confirmed_at,
    confirmed_by
  )
  select distinct on (event.student_id)
    new.academy_id,
    coalesce(event.created_by, new.user_id),
    'academy',
    new.class_group_id,
    new.id,
    event.student_id,
    v_session_date,
    'present',
    case when event.source = 'qr' then 'qr' else 'teacher_manual' end,
    event.event_time,
    'auto_inferred',
    null,
    null
  from public.student_check_events event
  where event.academy_id = new.academy_id
    and event.event_type = 'check_in'
    and (event.event_time at time zone 'Asia/Seoul')::date = v_session_date
    and coalesce(new.student_ids, '[]'::jsonb)
      @> jsonb_build_array(event.student_id::text)
  order by event.student_id, event.event_time
  on conflict (class_session_id, student_id)
  do update
     set status = 'present',
         source = excluded.source,
         checked_at = case
           when attendance_records.checked_at is null then excluded.checked_at
           else least(attendance_records.checked_at, excluded.checked_at)
         end,
         confirmation_state = 'auto_inferred',
         confirmed_at = null,
         confirmed_by = null,
         updated_at = now()
   where attendance_records.confirmation_state = 'auto_inferred';

  return new;
end;
$$;

drop trigger if exists sync_existing_checkins_to_class_session
  on public.class_sessions;

create trigger sync_existing_checkins_to_class_session
after insert or update of student_ids, date, occurrence_date, status
on public.class_sessions
for each row
execute function public.sync_existing_checkins_to_class_session();

revoke all on function public.sync_existing_checkins_to_class_session()
  from public;

comment on function public.sync_existing_checkins_to_class_session() is
  '수업 회차보다 먼저 저장된 당일 등원을 늦게 생성·갱신된 회차의 자동 출석으로 보완한다.';

notify pgrst, 'reload schema';

commit;
