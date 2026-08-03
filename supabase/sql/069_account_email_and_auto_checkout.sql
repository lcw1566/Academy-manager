-- Seenit — 로그인 이메일 수정 동기화 + 매일 22시(KST) 자동 하원
--
-- 1) Auth 이메일이 실제로 바뀌면 public.profiles.email도 같은 트랜잭션에서 갱신한다.
-- 2) 당일 마지막 기록이 등원이고 22시까지 하원하지 않은 학생은 22:00 자동 하원한다.
--    pg_cron은 UTC 기준이므로 13:00 UTC(한국 22:00)에 시작해 5분 간격으로 재시도한다.

-- Cron 확장을 사용할 수 없는 프로젝트라면 본문 변경도 일부만 적용되지 않도록
-- transaction을 시작하기 전에 먼저 확인한다.
create extension if not exists pg_cron;

begin;

-- ─── Auth 이메일 → 공개 프로필 동기화 ──────────────────────────

create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles
       set email = lower(new.email),
           updated_at = now()
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated_profile on auth.users;
create trigger on_auth_user_email_updated_profile
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_profile_email_from_auth();

revoke all on function public.sync_profile_email_from_auth() from public;
revoke all on function public.sync_profile_email_from_auth() from authenticated;

-- ─── 22시 자동 하원 ────────────────────────────────────────────

alter table public.student_check_events
  drop constraint if exists student_check_events_source_chk;
alter table public.student_check_events
  add constraint student_check_events_source_chk
  check (source in ('qr', 'teacher_manual', 'system_auto'));

-- cron이 같은 시간대에 재시도되더라도 학생별 자동 하원은 한 번만 저장한다.
create unique index if not exists student_check_events_auto_checkout_unique_idx
  on public.student_check_events(academy_id, student_id, event_time)
  where event_type = 'check_out' and source = 'system_auto';

create or replace function public.auto_checkout_students_at_22_kst()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz;
  v_cutoff timestamptz;
  v_inserted integer := 0;
begin
  v_day_start := v_today::timestamp at time zone 'Asia/Seoul';
  v_cutoff := (v_today + time '22:00') at time zone 'Asia/Seoul';

  -- 22시 전에 수동 실행되더라도 미래 시각의 하원 기록을 만들지 않는다.
  if now() < v_cutoff then
    return 0;
  end if;

  insert into public.student_check_events (
    academy_id,
    student_id,
    event_type,
    source,
    event_time,
    session_id,
    created_by
  )
  select
    latest.academy_id,
    latest.student_id,
    'check_out',
    'system_auto',
    v_cutoff,
    latest.session_id,
    null
  from (
    select distinct on (event.academy_id, event.student_id)
      event.academy_id,
      event.student_id,
      event.event_type,
      event.event_time,
      event.session_id
    from public.student_check_events event
    where event.event_time >= v_day_start
      and event.event_time <= now()
    order by event.academy_id, event.student_id, event.event_time desc, event.created_at desc
  ) latest
  where latest.event_type = 'check_in'
    and latest.event_time <= v_cutoff
  on conflict (academy_id, student_id, event_time)
    where event_type = 'check_out' and source = 'system_auto'
  do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.auto_checkout_students_at_22_kst() from public;
revoke all on function public.auto_checkout_students_at_22_kst() from anon;
revoke all on function public.auto_checkout_students_at_22_kst() from authenticated;

comment on function public.auto_checkout_students_at_22_kst() is
  '한국 시간 22시까지 하원하지 않은 당일 등원 학생을 22:00 자동 하원 처리한다.';

-- 자동 하원이 저장된 직후 다른 단말 화면이 아직 갱신되지 않은 상태에서 체크하면
-- 다시 등원으로 뒤집히지 않도록, 당일 22시 자동 하원을 최종 상태로 취급한다.
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
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_today_start timestamptz;
  v_cutoff timestamptz;
  v_next_type text;
begin
  if p_academy_id is null or p_student_id is null then
    raise exception 'academy_id와 student_id가 필요합니다.';
  end if;

  if p_source not in ('qr', 'teacher_manual') then
    raise exception '지원하지 않는 등하원 기록 방식입니다.';
  end if;

  if not (
    public.is_member_of_academy(p_academy_id)
    and public.has_academy_permission(p_academy_id, 'canEditAttendance')
  ) then
    raise exception '등하원을 기록할 권한이 없습니다.' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.students s
     where s.id = p_student_id
       and s.academy_id = p_academy_id
       and s.mode = 'academy'
       and (
         s.status = 'active'
         or (
           s.status = 'scheduled'
           and (s.enrollment_date is null or s.enrollment_date <= v_today)
         )
       )
  ) then
    raise exception '현재 등하원 처리할 수 있는 학생을 찾지 못했어요.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_academy_id::text || ':' || p_student_id::text, 0)
  );

  v_today_start := v_today::timestamp at time zone 'Asia/Seoul';
  v_cutoff := (v_today + time '22:00') at time zone 'Asia/Seoul';

  select sce.*
    into v_latest
    from public.student_check_events sce
   where sce.academy_id = p_academy_id
     and sce.student_id = p_student_id
     and sce.event_time >= v_today_start
   order by sce.event_time desc, sce.created_at desc
   limit 1;

  if v_latest.id is not null
     and v_latest.event_time >= now() - interval '8 seconds' then
    return jsonb_build_object(
      'event', to_jsonb(v_latest),
      'duplicate', true
    );
  end if;

  if now() >= v_cutoff
     and v_latest.event_type = 'check_out'
     and v_latest.source = 'system_auto' then
    return jsonb_build_object(
      'event', to_jsonb(v_latest),
      'duplicate', true,
      'auto_checkout', true
    );
  end if;

  v_next_type := case
    when v_latest.event_type = 'check_in' then 'check_out'
    else 'check_in'
  end;

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

revoke all on function public.toggle_student_check_event(uuid, uuid, text)
  from public;
grant execute on function public.toggle_student_check_event(uuid, uuid, text)
  to authenticated;

-- 학생 QR/PIN 경로에도 같은 보호를 적용한다.
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
$$;

revoke all on function public.public_student_checkin(uuid, text, text, bigint) from public;
grant execute on function public.public_student_checkin(uuid, text, text, bigint) to anon;
grant execute on function public.public_student_checkin(uuid, text, text, bigint) to authenticated;

-- Supabase Cron은 내부적으로 pg_cron을 사용한다. 한국은 DST가 없으므로
-- 매일 13:00 UTC가 항상 22:00 KST다. 22시 정각 실행이 일시 실패해도 같은 시간대
-- 안에서 복구되도록 22:00~22:55 사이 5분마다 idempotent 함수를 호출한다.
select cron.schedule(
  'seenit-auto-student-checkout-kst',
  '*/5 13 * * *',
  $$select public.auto_checkout_students_at_22_kst();$$
);

commit;

notify pgrst, 'reload schema';
