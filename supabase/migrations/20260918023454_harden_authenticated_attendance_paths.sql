-- Authenticated attendance writes must go through RPCs that bind the target
-- academy, student/staff identity, source and time to server-side checks.

revoke insert, update, delete on public.student_check_events from authenticated;
revoke insert, update, delete on public.staff_attendance_logs from authenticated;

create or replace function public.record_student_manual_check_event(
  p_academy_id uuid,
  p_student_id uuid,
  p_event_type text,
  p_event_time timestamptz,
  p_session_id uuid default null
)
returns public.student_check_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_created public.student_check_events%rowtype;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if not (
    public.is_member_of_academy(p_academy_id)
    and public.has_academy_permission(p_academy_id, 'canEditAttendance')
  ) then
    raise exception '등하원을 기록할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_event_type not in ('check_in', 'check_out') then
    raise exception '지원하지 않는 등하원 상태예요.' using errcode = '22023';
  end if;
  if p_event_time is null
     or p_event_time > clock_timestamp() + interval '5 minutes'
     or p_event_time < clock_timestamp() - interval '366 days' then
    raise exception '등하원 기록 시각을 확인해주세요.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.students student
    where student.id = p_student_id
      and student.academy_id = p_academy_id
      and student.mode = 'academy'
      and (
        student.status = 'active'
        or (
          student.status = 'scheduled'
          and (student.enrollment_date is null or student.enrollment_date <= v_today)
        )
      )
  ) then
    raise exception '현재 등하원 처리할 수 있는 학생을 찾지 못했어요.' using errcode = '42501';
  end if;
  if p_session_id is not null and not exists (
    select 1 from public.class_sessions session
    where session.id = p_session_id
      and session.academy_id = p_academy_id
      and session.mode = 'academy'
  ) then
    raise exception '다른 학원의 수업 회차는 연결할 수 없어요.' using errcode = '42501';
  end if;

  insert into public.student_check_events (
    academy_id, student_id, event_type, source, event_time, session_id, created_by
  ) values (
    p_academy_id, p_student_id, p_event_type, 'teacher_manual',
    p_event_time, p_session_id, auth.uid()
  ) returning * into v_created;

  return v_created;
end;
$$;
revoke all on function public.record_student_manual_check_event(uuid, uuid, text, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_student_manual_check_event(uuid, uuid, text, timestamptz, uuid)
  to authenticated;

drop function if exists public.record_staff_attendance(
  uuid, uuid, text, date, text, text, text, text, integer, text
);

create function public.record_staff_attendance(
  p_academy_id uuid,
  p_staff_user_id uuid,
  p_staff_role text,
  p_work_date date,
  p_action text,
  p_time text,
  p_scheduled_start_time text default null,
  p_scheduled_end_time text default null,
  p_break_minutes integer default 0,
  p_source text default 'manual',
  p_qr_token text default null,
  p_qr_expires_at bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_log public.staff_attendance_logs%rowtype;
  v_is_self boolean := auth.uid() = p_staff_user_id;
  v_is_operations boolean;
  v_now timestamptz := clock_timestamp();
  v_today date;
  v_work_date date := p_work_date;
  v_time text := p_time;
  v_action text := p_action;
  v_source text := p_source;
  v_scheduled_start text := p_scheduled_start_time;
  v_scheduled_end text := p_scheduled_end_time;
  v_break_minutes integer := p_break_minutes;
  v_staff_role text;
  v_nonce_expires_at bigint;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  v_today := (v_now at time zone 'Asia/Seoul')::date;
  v_is_operations := public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStaff');

  select case when member.role = 'assistant' then 'teacher' else member.role end
    into v_staff_role
    from public.academy_members member
   where member.academy_id = p_academy_id
     and member.user_id = p_staff_user_id
     and member.status = 'active'
     and member.role in ('teacher', 'assistant', 'manager')
   limit 1;
  if not found then
    raise exception '이 학원의 활성 직원을 찾을 수 없어요.' using errcode = '42501';
  end if;
  if not (v_is_self or v_is_operations) then
    raise exception '근퇴 기록 권한이 없어요.' using errcode = '42501';
  end if;
  if p_action not in ('clock_in', 'clock_out', 'toggle') then
    raise exception '지원하지 않는 근퇴 동작이에요.' using errcode = '22023';
  end if;
  if p_source not in ('manual', 'qr') then
    raise exception '근퇴 기록 출처가 올바르지 않아요.' using errcode = '22023';
  end if;

  if p_source = 'qr' then
    if not v_is_self then
      raise exception 'QR 근퇴는 본인만 기록할 수 있어요.' using errcode = '42501';
    end if;
    select nonce.expires_at into v_nonce_expires_at
      from public.academy_checkin_nonces nonce
      join public.academies academy on academy.id = nonce.academy_id
     where nonce.academy_id = p_academy_id
       and nonce.token = p_qr_token
       and nonce.generation_token = academy.attendance_qr_token
       and academy.staff_check_method = 'qr';
    if not found
       or p_qr_expires_at is null
       or p_qr_expires_at <> v_nonce_expires_at
       or extract(epoch from v_now) >= v_nonce_expires_at then
      raise exception '유효한 직원 출퇴근 QR이 아니에요.' using errcode = '42501';
    end if;
    v_work_date := v_today;
    v_time := to_char(v_now at time zone 'Asia/Seoul', 'HH24:MI');
    v_scheduled_start := null;
    v_scheduled_end := null;
    v_break_minutes := 0;
  elsif v_is_self and not v_is_operations then
    -- A regular staff member cannot use the manual source to backdate their
    -- own payable attendance. Owners/managers retain explicit correction use.
    v_work_date := v_today;
    v_time := to_char(v_now at time zone 'Asia/Seoul', 'HH24:MI');
    v_scheduled_start := null;
    v_scheduled_end := null;
    v_break_minutes := 0;
  end if;

  if v_work_date is null then
    raise exception '근무일을 확인해주세요.' using errcode = '22023';
  end if;
  if v_time is null or v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '시간 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_academy_id::text || ':' || p_staff_user_id::text || ':' || v_work_date::text, 0)
  );
  select * into v_log from public.staff_attendance_logs
   where academy_id = p_academy_id
     and staff_user_id = p_staff_user_id
     and work_date = v_work_date
     and is_void = false
   for update;

  if p_action = 'toggle' then
    if not found or v_log.actual_start_time is null then
      v_action := 'clock_in';
    elsif v_log.actual_end_time is null then
      if v_log.actual_start_time = v_time
         or (v_source = 'qr' and v_log.updated_at >= v_now - interval '8 seconds') then
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
         set actual_start_time = v_time,
             scheduled_start_time = coalesce(scheduled_start_time, v_scheduled_start),
             scheduled_end_time = coalesce(scheduled_end_time, v_scheduled_end),
             break_minutes = greatest(0, coalesce(break_minutes, 0), coalesce(v_break_minutes, 0)),
             staff_role = v_staff_role, source = v_source, status = 'pending',
             approved_by = null, approved_at = null, updated_at = v_now
       where id = v_log.id returning * into v_log;
    else
      insert into public.staff_attendance_logs (
        academy_id, staff_user_id, staff_role, work_date,
        scheduled_start_time, scheduled_end_time, actual_start_time,
        break_minutes, status, source
      ) values (
        p_academy_id, p_staff_user_id, v_staff_role, v_work_date,
        v_scheduled_start, v_scheduled_end, v_time,
        greatest(0, coalesce(v_break_minutes, 0)), 'pending', v_source
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
       set actual_end_time = v_time,
           scheduled_start_time = coalesce(scheduled_start_time, v_scheduled_start),
           scheduled_end_time = coalesce(scheduled_end_time, v_scheduled_end),
           break_minutes = greatest(0, coalesce(break_minutes, 0), coalesce(v_break_minutes, 0)),
           staff_role = v_staff_role, source = coalesce(source, v_source),
           status = 'completed', approved_by = null, approved_at = null, updated_at = v_now
     where id = v_log.id returning * into v_log;
  end if;

  return to_jsonb(v_log) || jsonb_build_object('_attendance_action', v_action);
end;
$$;
revoke all on function public.record_staff_attendance(
  uuid, uuid, text, date, text, text, text, text, integer, text, text, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.record_staff_attendance(
  uuid, uuid, text, date, text, text, text, text, integer, text, text, bigint
) to authenticated;

notify pgrst, 'reload schema';
