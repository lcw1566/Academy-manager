-- ============================================================
-- 035_student_checkin_dedup.sql
-- 학생 공용 QR의 동시·연속 제출이 등원 직후 하원으로 뒤집히는 문제 방지.
--
-- 전제: 018_student_pin_public_checkin.sql 적용 완료
-- 동작:
--   - 학생별 transaction advisory lock 으로 동시 요청 직렬화
--   - 마지막 성공 기록 후 8초 안의 요청은 새 row 없이 같은 결과 반환
-- ============================================================

create or replace function public.toggle_student_check_event(
  p_academy_id uuid,
  p_student_id uuid,
  p_source text default 'qr'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest public.student_check_events%rowtype;
  v_created public.student_check_events%rowtype;
  v_today_start timestamptz;
  v_next_type text;
begin
  if p_academy_id is null or p_student_id is null then
    raise exception 'academy_id와 student_id가 필요합니다.';
  end if;

  if p_source not in ('qr', 'teacher_manual') then
    raise exception '지원하지 않는 등하원 기록 방식입니다.';
  end if;

  if not (
    public.is_owner_of_academy(p_academy_id)
    or public.is_member_of_academy(p_academy_id)
  ) then
    raise exception '등하원을 기록할 권한이 없습니다.';
  end if;

  if not exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and s.academy_id = p_academy_id
      and s.mode = 'academy'
      and s.status = 'active'
  ) then
    raise exception '현재 학원의 재원 학생을 찾을 수 없습니다.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_academy_id::text || ':' || p_student_id::text, 0)
  );

  v_today_start := (timezone('Asia/Seoul', now()))::date::timestamp at time zone 'Asia/Seoul';

  select sce.*
    into v_latest
  from public.student_check_events sce
  where sce.academy_id = p_academy_id
    and sce.student_id = p_student_id
    and sce.event_time >= v_today_start
  order by sce.event_time desc
  limit 1;

  if v_latest.id is not null and v_latest.event_time >= now() - interval '8 seconds' then
    return jsonb_build_object(
      'event', to_jsonb(v_latest),
      'duplicate', true
    );
  end if;

  v_next_type := case when v_latest.event_type = 'check_in' then 'check_out' else 'check_in' end;

  insert into public.student_check_events (
    academy_id,
    student_id,
    event_type,
    source,
    created_by
  )
  values (
    p_academy_id,
    p_student_id,
    v_next_type,
    p_source,
    auth.uid()
  )
  returning * into v_created;

  return jsonb_build_object(
    'event', to_jsonb(v_created),
    'duplicate', false
  );
end;
$$;

revoke all on function public.toggle_student_check_event(uuid, uuid, text) from public;
grant execute on function public.toggle_student_check_event(uuid, uuid, text) to authenticated;

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
  v_latest_id uuid;
  v_latest_type text;
  v_latest_time timestamptz;
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

  -- 같은 학생의 동시 제출을 한 transaction 씩 처리한다.
  perform pg_advisory_xact_lock(
    hashtextextended(p_academy_id::text || ':' || v_student.id::text, 0)
  );

  v_today_start := (timezone('Asia/Seoul', now()))::date::timestamp at time zone 'Asia/Seoul';

  select sce.id, sce.event_type, sce.event_time
    into v_latest_id, v_latest_type, v_latest_time
  from public.student_check_events sce
  where sce.academy_id = p_academy_id
    and sce.student_id = v_student.id
    and sce.event_time >= v_today_start
  order by sce.event_time desc
  limit 1;

  -- 연타·네트워크 재시도는 같은 성공 결과를 돌려주고 새 이벤트를 만들지 않는다.
  if v_latest_id is not null and v_latest_time >= now() - interval '8 seconds' then
    return query select
      true,
      v_latest_id,
      v_latest_type,
      v_latest_time,
      v_student.id,
      v_student.name,
      'duplicate';
    return;
  end if;

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
