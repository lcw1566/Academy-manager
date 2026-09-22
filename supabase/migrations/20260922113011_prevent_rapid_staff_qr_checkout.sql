-- A nonce is valid for at most 40 seconds. A repeated staff QR request must
-- not turn an immediate check-in into a check-out after the 8-second UI retry
-- window. Keep a short minimum interval before self-service QR check-out.
create or replace function public.prevent_rapid_staff_qr_checkout()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.actual_end_time is distinct from old.actual_end_time
     and new.actual_end_time is not null
     and new.source = 'qr'
     and auth.uid() = old.staff_user_id
     and not (
       public.is_owner_of_academy(old.academy_id)
       or public.has_academy_permission(old.academy_id, 'canManageStaff')
     )
     and old.updated_at > clock_timestamp() - interval '45 seconds' then
    raise exception 'QR 출근 직후에는 퇴근을 기록할 수 없어요. 잠시 후 다시 시도해주세요.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_rapid_staff_qr_checkout()
  from public, anon, authenticated, service_role;
drop trigger if exists prevent_rapid_staff_qr_checkout on public.staff_attendance_logs;
create trigger prevent_rapid_staff_qr_checkout
  before update of actual_end_time on public.staff_attendance_logs
  for each row execute function public.prevent_rapid_staff_qr_checkout();
