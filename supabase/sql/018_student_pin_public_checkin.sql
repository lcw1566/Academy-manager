-- Public student check-in by shared QR + 4-digit PIN.
--
-- This keeps the public page from reading students directly. Anonymous clients
-- can only call the RPC, which validates the academy QR token and PIN inside
-- the database, then writes a student_check_events row.

alter table public.students
  add column if not exists checkin_pin text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_checkin_pin_chk'
  ) then
    alter table public.students
      add constraint students_checkin_pin_chk
      check (checkin_pin is null or checkin_pin ~ '^[0-9]{4}$');
  end if;
end $$;

create index if not exists students_academy_checkin_pin_idx
  on public.students(academy_id, checkin_pin)
  where mode = 'academy'
    and status = 'active'
    and checkin_pin is not null;

with candidates as (
  select
    id,
    academy_id,
    right(
      regexp_replace(
        coalesce(nullif(phone, ''), nullif(parent_phone, ''), ''),
        '\D',
        '',
        'g'
      ),
      4
    ) as pin
  from public.students
  where mode = 'academy'
    and checkin_pin is null
),
usable as (
  select
    id,
    academy_id,
    pin,
    count(*) over (partition by academy_id, pin) as pin_count
  from candidates
  where length(pin) = 4
)
update public.students s
set checkin_pin = u.pin
from usable u
where s.id = u.id
  and u.pin_count = 1;

create or replace function public.public_student_checkin(
  p_academy_id uuid,
  p_qr_token text,
  p_pin text,
  p_expires_at bigint default null
)
returns table (
  ok boolean,
  event_id uuid,
  event_type text,
  event_time timestamptz,
  student_id uuid,
  student_name text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_student record;
  v_match_count integer;
  v_latest_type text;
  v_today_start timestamptz;
  v_next_type text;
  v_event_id uuid;
  v_event_time timestamptz;
begin
  if p_academy_id is null then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'invalid_academy';
    return;
  end if;

  if p_qr_token is null or length(trim(p_qr_token)) = 0 then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'invalid_qr';
    return;
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'invalid_pin';
    return;
  end if;

  if p_expires_at is not null and extract(epoch from now())::bigint > p_expires_at then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'expired_qr';
    return;
  end if;

  select attendance_qr_token
    into v_token
  from public.academies
  where id = p_academy_id;

  if v_token is null or v_token <> p_qr_token then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'invalid_qr';
    return;
  end if;

  select count(*)
    into v_match_count
  from public.students
  where academy_id = p_academy_id
    and mode = 'academy'
    and status = 'active'
    and checkin_pin = p_pin;

  if v_match_count = 0 then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'pin_not_found';
    return;
  end if;

  if v_match_count > 1 then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'duplicate_pin';
    return;
  end if;

  select id, name
    into v_student
  from public.students
  where academy_id = p_academy_id
    and mode = 'academy'
    and status = 'active'
    and checkin_pin = p_pin
  limit 1;

  v_today_start := (timezone('Asia/Seoul', now()))::date::timestamp at time zone 'Asia/Seoul';

  select sce.event_type
    into v_latest_type
  from public.student_check_events sce
  where sce.academy_id = p_academy_id
    and sce.student_id = v_student.id
    and sce.event_time >= v_today_start
  order by sce.event_time desc
  limit 1;

  v_next_type := case when v_latest_type = 'check_in' then 'check_out' else 'check_in' end;

  insert into public.student_check_events (
    academy_id,
    student_id,
    event_type,
    source,
    created_by
  )
  values (
    p_academy_id,
    v_student.id,
    v_next_type,
    'qr',
    null
  )
  returning student_check_events.id, student_check_events.event_time
    into v_event_id, v_event_time;

  return query select
    true,
    v_event_id,
    v_next_type,
    v_event_time,
    v_student.id,
    v_student.name,
    'ok';
end;
$$;

revoke all on function public.public_student_checkin(uuid, text, text, bigint) from public;
grant execute on function public.public_student_checkin(uuid, text, text, bigint) to anon;
grant execute on function public.public_student_checkin(uuid, text, text, bigint) to authenticated;
