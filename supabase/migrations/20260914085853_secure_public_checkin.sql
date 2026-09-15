-- Public check-in accepts only short-lived, server-issued QR nonces.
-- Deploy before the matching app; old static QRs deliberately fail closed.
begin;

create table if not exists public.academy_checkin_nonces (
  academy_id uuid not null references public.academies(id) on delete cascade,
  issued_at bigint not null,
  expires_at bigint not null,
  token text not null unique,
  generation_token text not null,
  primary key (academy_id, issued_at)
);
alter table public.academy_checkin_nonces enable row level security;
revoke all on public.academy_checkin_nonces from public, anon, authenticated, service_role;

create table if not exists public.academy_checkin_limits (
  academy_id uuid primary key references public.academies(id) on delete cascade,
  window_start timestamptz not null,
  failures integer not null default 0 check (failures >= 0)
);
alter table public.academy_checkin_limits enable row level security;
revoke all on public.academy_checkin_limits from public, anon, authenticated, service_role;

create or replace function public.issue_academy_checkin_qr(p_academy_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_generation text;
  v_slot bigint := floor(extract(epoch from clock_timestamp()) / 20)::bigint * 20;
  v_nonce public.academy_checkin_nonces%rowtype;
begin
  if auth.uid() is null or not public.is_member_of_academy(p_academy_id)
    or not (public.is_owner_of_academy(p_academy_id)
      or public.has_academy_permission(p_academy_id, 'canEditAttendance')) then
    raise exception '공용 QR을 발급할 권한이 없어요.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 90888));
  select attendance_qr_token into v_generation from public.academies
  where id = p_academy_id and (student_check_method = 'qr' or staff_check_method = 'qr');
  if v_generation is null then
    raise exception '학원의 QR 출결 설정을 확인해주세요.' using errcode = '22023';
  end if;
  delete from public.academy_checkin_nonces
  where academy_id = p_academy_id
    and (expires_at <= extract(epoch from clock_timestamp()) or generation_token <> v_generation);
  insert into public.academy_checkin_nonces (academy_id, issued_at, expires_at, token, generation_token)
  values (p_academy_id, v_slot, v_slot + 40,
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), v_generation)
  on conflict (academy_id, issued_at) do nothing;
  select * into strict v_nonce from public.academy_checkin_nonces
  where academy_id = p_academy_id and issued_at = v_slot;
  return jsonb_build_object('v', 2, 'type', 'academy_checkin', 'purpose', 'shared',
    'academyId', p_academy_id, 'token', v_nonce.token,
    'issuedAt', v_nonce.issued_at, 'expiresAt', v_nonce.expires_at);
end;
$$;
revoke all on function public.issue_academy_checkin_qr(uuid) from public, anon, authenticated;
grant execute on function public.issue_academy_checkin_qr(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.public_student_checkin (
  p_academy_id uuid,
  p_qr_token   text,
  p_pin        text,
  p_expires_at bigint DEFAULT NULL::bigint
)
  RETURNS TABLE (
    ok           boolean,
    event_id     uuid,
    event_type   text,
    event_time   timestamp with time zone,
    student_id   uuid,
    student_name text,
    message      text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_expires_at bigint;
  v_failures integer;
  v_now timestamptz := clock_timestamp();
  v_student record;
  v_match_count integer;
  v_latest_id uuid;
  v_latest_type text;
  v_latest_time timestamptz;
  v_latest_source text;
  v_today_start timestamptz;
  v_cutoff timestamptz;
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

  -- Expiry comes from the server-issued nonce. Caller input cannot extend it.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 90888));
  v_now := clock_timestamp();
  select nonce.expires_at into v_expires_at
  from public.academy_checkin_nonces nonce
  join public.academies academy on academy.id = nonce.academy_id
  where nonce.academy_id = p_academy_id
    and nonce.token = p_qr_token
    and nonce.generation_token = academy.attendance_qr_token
    and academy.student_check_method = 'qr';

  if not found then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'invalid_qr';
    return;
  end if;
  if p_expires_at is null or p_expires_at <> v_expires_at
    or extract(epoch from v_now) >= v_expires_at then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'expired_qr';
    return;
  end if;

  -- Academy-wide failed PIN budget, shared across QR refreshes. Never store a
  -- PIN, student identity, IP address or caller-supplied client identifier here.
  insert into public.academy_checkin_limits (academy_id, window_start, failures)
  values (p_academy_id, v_now, 0)
  on conflict (academy_id) do update
    set window_start = case when academy_checkin_limits.window_start <= v_now - interval '5 minutes'
          then v_now else academy_checkin_limits.window_start end,
        failures = case when academy_checkin_limits.window_start <= v_now - interval '5 minutes'
          then 0 else academy_checkin_limits.failures end
  returning failures into v_failures;
  if v_failures >= 30 then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'rate_limited';
    return;
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    update public.academy_checkin_limits set failures = failures + 1 where academy_id = p_academy_id;
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'invalid_pin';
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
    update public.academy_checkin_limits set failures = failures + 1 where academy_id = p_academy_id;
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

  perform pg_advisory_xact_lock(
    hashtextextended(p_academy_id::text || ':' || v_student.id::text, 0)
  );

  v_today_start := (timezone('Asia/Seoul', now()))::date::timestamp at time zone 'Asia/Seoul';
  v_cutoff := ((timezone('Asia/Seoul', now()))::date + time '22:00') at time zone 'Asia/Seoul';

  select sce.id, sce.event_type, sce.event_time, sce.source
    into v_latest_id, v_latest_type, v_latest_time, v_latest_source
  from public.student_check_events sce
  where sce.academy_id = p_academy_id
    and sce.student_id = v_student.id
    and sce.event_time >= v_today_start
  order by sce.event_time desc, sce.created_at desc
  limit 1;

  if v_latest_id is not null and v_latest_time >= now() - interval '8 seconds' then
    return query select
      true, v_latest_id, v_latest_type, v_latest_time,
      v_student.id, v_student.name, 'duplicate';
    return;
  end if;

  if now() >= v_cutoff
     and v_latest_type = 'check_out'
     and v_latest_source = 'system_auto' then
    return query select
      true, v_latest_id, v_latest_type, v_latest_time,
      v_student.id, v_student.name, 'auto_checkout';
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
    true, v_event_id, v_next_type, v_event_time,
    v_student.id, v_student.name, 'ok';
end;
$function$;


revoke all on function public.public_student_checkin(uuid, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.public_student_checkin(uuid, text, text, bigint) to anon, authenticated;
commit;
notify pgrst, 'reload schema';
