-- ============================================================
-- 054_staff_job_titles.sql
-- 직원의 표시용 직책(job_title)을 기능 권한(role)과 분리한다.
--
-- 권한 source of truth:
--   academy_members.role = owner / manager / teacher
-- 표시용 조직 정보:
--   academy_invitations.job_title
--   academy_staff_profiles.job_title
-- ============================================================

alter table public.academy_invitations
  add column if not exists job_title text;

alter table public.academy_staff_profiles
  add column if not exists job_title text;

alter table public.academy_invitations
  drop constraint if exists academy_invitations_job_title_check;
alter table public.academy_invitations
  add constraint academy_invitations_job_title_check
  check (
    job_title is null
    or (
      char_length(job_title) between 1 and 40
      and job_title = btrim(job_title)
    )
  );

alter table public.academy_staff_profiles
  drop constraint if exists academy_staff_profiles_job_title_check;
alter table public.academy_staff_profiles
  add constraint academy_staff_profiles_job_title_check
  check (
    job_title is null
    or (
      char_length(job_title) between 1 and 40
      and job_title = btrim(job_title)
    )
  );

-- 기존 데이터는 현재 권한 유형에 맞는 표시값으로만 보완한다.
-- 이후 직책을 바꿔도 role은 변경되지 않는다.
update public.academy_invitations
set job_title = case role
  when 'manager' then '운영 매니저'
  else '선생님'
end
where job_title is null;

update public.academy_staff_profiles
set job_title = case role
  when 'manager' then '운영 매니저'
  else '선생님'
end
where job_title is null;

-- 멤버십이 다른 경로로 활성화되더라도 기본 직책을 가진 프로필을 만든다.
create or replace function public.sync_staff_profile_from_academy_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('teacher', 'manager') and new.status = 'active' then
    insert into public.academy_staff_profiles as asp (
      academy_id, user_id, member_id, role, job_title, subjects, wage_type,
      hourly_wage, monthly_salary, status
    )
    values (
      new.academy_id,
      new.user_id,
      new.id,
      new.role,
      case new.role when 'manager' then '운영 매니저' else '선생님' end,
      '[]'::jsonb,
      'hourly',
      0,
      0,
      'active'
    )
    on conflict (academy_id, user_id) do update
      set member_id = excluded.member_id,
          role = excluded.role,
          job_title = coalesce(asp.job_title, excluded.job_title),
          status = 'active',
          updated_at = now();
  elsif new.role in ('teacher', 'manager') and new.status = 'inactive' then
    update public.academy_staff_profiles
    set status = 'inactive', updated_at = now()
    where academy_id = new.academy_id
      and user_id = new.user_id;
  end if;
  return new;
end;
$$;

-- 초대 수락과 직책 복사를 한 트랜잭션에서 처리한다.
create or replace function public.accept_academy_invitation(p_invitation_id uuid)
returns table (
  out_invitation_id    uuid,
  out_academy_id       uuid,
  out_role             text,
  out_accepted_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_email     text := coalesce(auth.email(), '');
  v_invite    public.academy_invitations%rowtype;
  v_member_id uuid;
  v_role      text;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  select * into v_invite
  from public.academy_invitations ai
  where ai.id = p_invitation_id
  for update;

  if not found then raise exception '초대를 찾을 수 없어요.'; end if;
  if v_invite.status <> 'pending' then raise exception '이미 처리된 초대예요.'; end if;
  if lower(v_invite.email) <> lower(v_email) then
    raise exception '초대받은 이메일과 로그인 이메일이 달라요.';
  end if;
  if v_invite.role not in ('teacher', 'manager') then
    raise exception '잘못된 초대 권한이에요.';
  end if;

  v_role := v_invite.role;

  insert into public.academy_members as am (academy_id, user_id, role, status)
  values (v_invite.academy_id, v_uid, v_role, 'active')
  on conflict (academy_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = now()
  returning am.id into v_member_id;

  insert into public.academy_staff_profiles as asp (
    academy_id, user_id, member_id, role, job_title, subjects, wage_type,
    hourly_wage, monthly_salary, status
  )
  values (
    v_invite.academy_id,
    v_uid,
    v_member_id,
    v_role,
    coalesce(
      nullif(btrim(v_invite.job_title), ''),
      case v_role when 'manager' then '운영 매니저' else '선생님' end
    ),
    '[]'::jsonb,
    'hourly',
    0,
    0,
    'active'
  )
  on conflict (academy_id, user_id) do update
    set member_id = excluded.member_id,
        role = excluded.role,
        job_title = excluded.job_title,
        status = 'active',
        updated_at = now();

  update public.academy_invitations ai
  set status = 'accepted', accepted_user_id = v_uid, updated_at = now()
  where ai.id = p_invitation_id;

  out_invitation_id := v_invite.id;
  out_academy_id := v_invite.academy_id;
  out_role := v_role;
  out_accepted_user_id := v_uid;
  return next;
end;
$$;

revoke all on function public.accept_academy_invitation(uuid) from public;
grant execute on function public.accept_academy_invitation(uuid) to authenticated;

-- 초대받는 화면에서도 직책을 표시한다.
drop function if exists public.list_my_pending_academy_invitations();
create function public.list_my_pending_academy_invitations()
returns table (
  invitation_id uuid,
  academy_id uuid,
  academy_name text,
  email text,
  role text,
  job_title text,
  status text,
  invited_by uuid,
  accepted_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    i.id,
    i.academy_id,
    a.name,
    i.email,
    i.role,
    i.job_title,
    i.status,
    i.invited_by,
    i.accepted_user_id,
    i.created_at,
    i.updated_at
  from public.academy_invitations i
  join public.academies a on a.id = i.academy_id
  where i.status = 'pending'
    and lower(i.email) = lower(coalesce(auth.email(), ''))
  order by i.created_at desc;
$$;

revoke all on function public.list_my_pending_academy_invitations() from public;
grant execute on function public.list_my_pending_academy_invitations() to authenticated;

comment on column public.academy_staff_profiles.job_title is
  '표시용 직책. 기능 권한은 academy_members.role로만 판정한다.';

notify pgrst, 'reload schema';
