-- 초대 기록을 이벤트 행이 아닌 계정 목록으로 안전하게 조회한다.
-- 연락처는 반환하지 않으며, 이름/이메일/현재 멤버십 상태만 직원 초대 권한자에게 제공한다.

begin;

create or replace function public.list_academy_invitation_accounts(p_academy_id uuid)
returns table (
  email text,
  display_name text,
  accepted_user_id uuid,
  membership_status text,
  last_role text,
  last_job_title text,
  last_invited_at timestamptz,
  last_accepted_at timestamptz,
  has_pending_invitation boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if p_academy_id is null or not (
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStaff')
  ) then
    raise exception '초대 기록을 확인할 권한이 없어요.' using errcode = '42501';
  end if;

  return query
  with ranked_accepted as (
    select
      invitation.*,
      row_number() over (
        partition by lower(btrim(invitation.email))
        order by invitation.updated_at desc, invitation.created_at desc, invitation.id desc
      ) as row_number
    from public.academy_invitations invitation
    where invitation.academy_id = p_academy_id
      and invitation.status = 'accepted'
  ),
  latest_accepted as (
    select * from ranked_accepted where row_number = 1
  )
  select
    accepted.email,
    nullif(btrim(profile.display_name), '') as display_name,
    accepted.accepted_user_id,
    member.status as membership_status,
    accepted.role as last_role,
    accepted.job_title as last_job_title,
    accepted.created_at as last_invited_at,
    accepted.updated_at as last_accepted_at,
    exists (
      select 1
      from public.academy_invitations pending
      where pending.academy_id = p_academy_id
        and lower(btrim(pending.email)) = lower(btrim(accepted.email))
        and pending.status = 'pending'
    ) as has_pending_invitation
  from latest_accepted accepted
  left join public.profiles profile on profile.id = accepted.accepted_user_id
  left join public.academy_members member
    on member.academy_id = p_academy_id
   and member.user_id = accepted.accepted_user_id
  order by accepted.updated_at desc, accepted.email;
end;
$$;

revoke all on function public.list_academy_invitation_accounts(uuid) from public;
grant execute on function public.list_academy_invitation_accounts(uuid) to authenticated;

commit;
