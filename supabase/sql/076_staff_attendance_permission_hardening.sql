-- 직원 근퇴 기록은 자기 자신 또는 canManageStaff 권한으로만 저장한다.
-- 대상의 실제 역할은 클라이언트 입력이 아니라 활성 멤버십에서 결정한다.

begin;

create or replace function public.record_staff_attendance(
  p_academy_id uuid,
  p_staff_user_id uuid,
  p_staff_role text,
  p_work_date date,
  p_action text,
  p_time text,
  p_scheduled_start_time text default null,
  p_scheduled_end_time text default null,
  p_break_minutes integer default 0,
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_log public.staff_attendance_logs%rowtype;
  v_is_self boolean := auth.uid() = p_staff_user_id;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_action text := p_action;
  v_staff_role text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  select case when m.role = 'assistant' then 'teacher' else m.role end
    into v_staff_role
    from public.academy_members m
   where m.academy_id = p_academy_id
     and m.user_id = p_staff_user_id
     and m.status = 'active'
     and m.role in ('teacher', 'assistant', 'manager')
   limit 1;
  if not found then
    raise exception '이 학원의 활성 직원을 찾을 수 없어요.' using errcode = '42501';
  end if;

  if not (
    v_is_self
    or public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStaff')
  ) then
    raise exception '근퇴 기록 권한이 없어요.' using errcode = '42501';
  end if;
  if v_is_self and p_work_date is distinct from v_today then
    raise exception '본인은 오늘 근퇴만 기록할 수 있어요.' using errcode = '42501';
  end if;
  if p_action not in ('clock_in', 'clock_out', 'toggle') then
    raise exception '지원하지 않는 근퇴 동작이에요.' using errcode = '22023';
  end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '시간 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_source not in ('manual', 'qr') then
    raise exception '근퇴 기록 출처가 올바르지 않아요.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_academy_id::text || ':' || p_staff_user_id::text || ':' || p_work_date::text,
      0
    )
  );

  select * into v_log
  from public.staff_attendance_logs
  where academy_id = p_academy_id
    and staff_user_id = p_staff_user_id
    and work_date = p_work_date
    and is_void = false
  for update;

  if p_action = 'toggle' then
    if not found or v_log.actual_start_time is null then
      v_action := 'clock_in';
    elsif v_log.actual_end_time is null then
      if v_log.actual_start_time = p_time then
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
      set actual_start_time = p_time,
          scheduled_start_time = coalesce(scheduled_start_time, p_scheduled_start_time),
          scheduled_end_time = coalesce(scheduled_end_time, p_scheduled_end_time),
          break_minutes = greatest(0, coalesce(break_minutes, 0), coalesce(p_break_minutes, 0)),
          staff_role = v_staff_role,
          source = p_source,
          status = 'pending',
          approved_by = null,
          approved_at = null,
          updated_at = now()
      where id = v_log.id
      returning * into v_log;
    else
      insert into public.staff_attendance_logs (
        academy_id, staff_user_id, staff_role, work_date,
        scheduled_start_time, scheduled_end_time,
        actual_start_time, break_minutes, status, source
      ) values (
        p_academy_id, p_staff_user_id, v_staff_role, p_work_date,
        p_scheduled_start_time, p_scheduled_end_time,
        p_time, greatest(0, coalesce(p_break_minutes, 0)), 'pending', p_source
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
    set actual_end_time = p_time,
        scheduled_start_time = coalesce(scheduled_start_time, p_scheduled_start_time),
        scheduled_end_time = coalesce(scheduled_end_time, p_scheduled_end_time),
        break_minutes = greatest(0, coalesce(break_minutes, 0), coalesce(p_break_minutes, 0)),
        staff_role = v_staff_role,
        source = coalesce(source, p_source),
        status = 'completed',
        approved_by = null,
        approved_at = null,
        updated_at = now()
    where id = v_log.id
    returning * into v_log;
  end if;

  return to_jsonb(v_log) || jsonb_build_object('_attendance_action', v_action);
end;
$$;

revoke all on function public.record_staff_attendance(
  uuid, uuid, text, date, text, text, text, text, integer, text
) from public;
grant execute on function public.record_staff_attendance(
  uuid, uuid, text, date, text, text, text, text, integer, text
) to authenticated;

notify pgrst, 'reload schema';

commit;
