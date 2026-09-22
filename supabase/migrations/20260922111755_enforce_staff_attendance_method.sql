-- The previous RPC binds QR attendance to a nonce and server time. Also deny
-- a regular staff member's manual call while their academy requires QR scans.
-- Owners and staff managers may still make explicit manual corrections.
do $$
begin
  if to_regprocedure(
    'public.record_staff_attendance_without_method_gate(uuid,uuid,text,date,text,text,text,text,integer,text,text,bigint)'
  ) is null then
    alter function public.record_staff_attendance(
      uuid, uuid, text, date, text, text, text, text, integer, text, text, bigint
    ) rename to record_staff_attendance_without_method_gate;
  end if;
end;
$$;
revoke all on function public.record_staff_attendance_without_method_gate(
  uuid, uuid, text, date, text, text, text, text, integer, text, text, bigint
) from public, anon, authenticated, service_role;

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
  p_source text default 'manual',
  p_qr_token text default null,
  p_qr_expires_at bigint default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_method text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if auth.uid() = p_staff_user_id
     and p_source = 'manual'
     and not (
       public.is_owner_of_academy(p_academy_id)
       or public.has_academy_permission(p_academy_id, 'canManageStaff')
     ) then
    select staff_check_method into v_method
      from public.academies where id = p_academy_id;
    if v_method is distinct from 'manual' then
      raise exception '이 학원은 직원 QR 출퇴근을 사용해요.' using errcode = '42501';
    end if;
  end if;
  return public.record_staff_attendance_without_method_gate(
    p_academy_id, p_staff_user_id, p_staff_role, p_work_date, p_action,
    p_time, p_scheduled_start_time, p_scheduled_end_time,
    p_break_minutes, p_source, p_qr_token, p_qr_expires_at
  );
end;
$$;
revoke all on function public.record_staff_attendance(
  uuid, uuid, text, date, text, text, text, text, integer, text, text, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.record_staff_attendance(
  uuid, uuid, text, date, text, text, text, text, integer, text, text, bigint
) to authenticated;
notify pgrst, 'reload schema';
