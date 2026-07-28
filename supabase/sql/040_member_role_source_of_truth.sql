-- 040_member_role_source_of_truth.sql
-- 직원 목록의 역할을 academy_members.role 기준으로 동기화한다.
--
-- 기존 list_academy_member_profiles 함수의 반환형은 유지해야 하므로,
-- membership_role/status를 함께 반환하는 v2 함수를 별도로 추가한다.

create or replace function public.list_academy_member_profiles_v2(p_academy_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  phone text,
  account_type text,
  membership_role text,
  membership_status text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id as user_id,
    p.display_name,
    p.email,
    p.phone,
    p.account_type,
    m.role as membership_role,
    m.status as membership_status
  from public.profiles p
  join public.academy_members m
    on m.user_id = p.id
  where m.academy_id = p_academy_id
    and m.status = 'active'
    and public.is_academy_operations_manager(p_academy_id);
$$;

revoke all on function public.list_academy_member_profiles_v2(uuid) from public;
grant execute on function public.list_academy_member_profiles_v2(uuid) to authenticated;

-- End of 040_member_role_source_of_truth.sql
