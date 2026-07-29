-- Seenit — 등원을 수업 출석의 기본값으로 자동 반영
--
-- 학생이 당일 한 번이라도 등원하면 그날 배정된 수업은 출석으로 기록한다.
-- 수업 화면에서 선생님이 지각·결석·인정결석으로 직접 수정한 행은 이후 등원
-- 이벤트가 들어와도 덮어쓰지 않는다. 미등원 학생의 결석은 수업 기록 저장/완료
-- 시점에 프런트가 auto_inferred 행으로 확정한다.

create or replace function public.sync_student_checkin_to_class_attendance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_date date;
begin
  if new.event_type <> 'check_in' then
    return new;
  end if;

  v_event_date := (new.event_time at time zone 'Asia/Seoul')::date;

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
  select
    cs.academy_id,
    coalesce(new.created_by, cs.user_id),
    'academy',
    cs.class_group_id,
    cs.id,
    new.student_id,
    coalesce(cs.occurrence_date, cs.date),
    'present',
    case when new.source = 'qr' then 'qr' else 'teacher_manual' end,
    new.event_time,
    'auto_inferred',
    null,
    null
  from public.class_sessions cs
  where cs.academy_id = new.academy_id
    and coalesce(cs.occurrence_date, cs.date) = v_event_date
    and cs.status not in ('canceled', 'cancelled')
    and coalesce(cs.student_ids, '[]'::jsonb) @> jsonb_build_array(new.student_id::text)
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

drop trigger if exists sync_student_checkin_to_class_attendance
  on public.student_check_events;

create trigger sync_student_checkin_to_class_attendance
after insert on public.student_check_events
for each row
execute function public.sync_student_checkin_to_class_attendance();

revoke all on function public.sync_student_checkin_to_class_attendance()
  from public;

-- SQL 적용 전에 저장된 등원 기록도 같은 규칙으로 한 번 정리한다.
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
select distinct on (cs.id, event.student_id)
  cs.academy_id,
  coalesce(event.created_by, cs.user_id),
  'academy',
  cs.class_group_id,
  cs.id,
  event.student_id,
  coalesce(cs.occurrence_date, cs.date),
  'present',
  case when event.source = 'qr' then 'qr' else 'teacher_manual' end,
  event.event_time,
  'auto_inferred',
  null,
  null
from public.student_check_events event
join public.class_sessions cs
  on cs.academy_id = event.academy_id
 and coalesce(cs.occurrence_date, cs.date)
     = (event.event_time at time zone 'Asia/Seoul')::date
 and cs.status not in ('canceled', 'cancelled')
 and coalesce(cs.student_ids, '[]'::jsonb) @> jsonb_build_array(event.student_id::text)
where event.event_type = 'check_in'
order by cs.id, event.student_id, event.event_time
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

notify pgrst, 'reload schema';
