-- Match the existing read RPC predicates; this does not grant any data access.
create or replace function public.get_my_academy_sync_access(p_academy_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner boolean;
begin
  if auth.uid() is null or not public.is_member_of_academy(p_academy_id) then
    raise exception 'Active membership required' using errcode = '42501';
  end if;
  v_owner := public.is_owner_of_academy(p_academy_id);
  return jsonb_build_object(
    'students', v_owner or public.has_academy_permission(p_academy_id, 'canViewStudents'),
    'staffAccess', v_owner or public.has_academy_permission(p_academy_id, 'canManageStaff')
      or public.has_academy_permission(p_academy_id, 'canManageStaffPermissions')
      or public.has_academy_permission(p_academy_id, 'canRemoveStaff'),
    'invitationAccounts', v_owner or public.has_academy_permission(p_academy_id, 'canManageStaff')
  );
end;
$$;
revoke all on function public.get_my_academy_sync_access(uuid) from public, anon, service_role;
grant execute on function public.get_my_academy_sync_access(uuid) to authenticated;
