-- 계정 탈퇴의 DB 변경을 하나의 트랜잭션으로 처리한다.
-- Auth 계정 장기 차단은 Edge Function이 이 RPC 성공 후 별도로 처리한다.

begin;

create or replace function public.withdraw_account_data(
  p_user_id uuid,
  p_withdrawn_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_memberships integer := 0;
  v_profiles integer := 0;
  v_rules integer := 0;
  v_devices integer := 0;
begin
  if p_user_id is null
     or p_withdrawn_email is null
     or p_withdrawn_email !~ '^withdrawn-[0-9a-f-]+@invalid[.]seenit[.]local$' then
    raise exception '탈퇴 대상 정보가 올바르지 않아요.' using errcode = '22023';
  end if;
  if exists (select 1 from public.academies a where a.owner_id = p_user_id) then
    raise exception '학원 소유권 이전 또는 학원 삭제가 먼저 필요해요.' using errcode = '42501';
  end if;

  update public.academy_members
     set status = 'inactive', updated_at = now()
   where user_id = p_user_id and status <> 'inactive';
  get diagnostics v_memberships = row_count;

  update public.academy_staff_profiles
     set status = 'inactive', updated_at = now()
   where user_id = p_user_id and status <> 'inactive';
  get diagnostics v_profiles = row_count;

  update public.academy_staff_work_rules
     set is_active = false, updated_at = now()
   where staff_user_id = p_user_id and is_active = true;
  get diagnostics v_rules = row_count;

  update public.push_devices
     set enabled = false, updated_at = now()
   where user_id = p_user_id and enabled = true;
  get diagnostics v_devices = row_count;

  update public.profiles
     set email = p_withdrawn_email,
         display_name = '탈퇴한 사용자',
         phone = null,
         withdrawn_at = now(),
         updated_at = now()
   where id = p_user_id;
  if not found then raise exception '탈퇴할 프로필을 찾을 수 없어요.'; end if;

  return jsonb_build_object(
    'memberships_deactivated', v_memberships,
    'staff_profiles_deactivated', v_profiles,
    'work_rules_stopped', v_rules,
    'push_devices_disabled', v_devices
  );
end;
$$;

revoke all on function public.withdraw_account_data(uuid, text) from public, anon, authenticated;
grant execute on function public.withdraw_account_data(uuid, text) to service_role;

notify pgrst, 'reload schema';

commit;
