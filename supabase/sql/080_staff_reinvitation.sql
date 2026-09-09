-- 퇴사 직원 재초대와 초대 이력 분리.
--
-- 과거 accepted 초대는 기록으로 보존하고, 현재 active 멤버십만 재초대를
-- 차단한다. 동일 이메일에는 pending 초대가 하나만 존재할 수 있다.

begin;

-- 과거 unique(academy_id, email, role)는 재입사 초대 이력 생성을 막는다.
alter table public.academy_invitations
  drop constraint if exists academy_invitations_academy_id_email_role_key;

-- 이전 버전에서 역할별 pending 초대가 중복된 경우 최신 한 건만 남긴다.
with ranked_pending as (
  select
    id,
    row_number() over (
      partition by academy_id, lower(btrim(email))
      order by created_at desc, id desc
    ) as row_number
  from public.academy_invitations
  where status = 'pending'
)
update public.academy_invitations invitation
   set status = 'canceled', accepted_user_id = null, updated_at = now()
  from ranked_pending duplicate
 where invitation.id = duplicate.id
   and duplicate.row_number > 1;

create unique index if not exists academy_invitations_one_pending_email_idx
  on public.academy_invitations (academy_id, lower(btrim(email)))
  where status = 'pending';

create or replace function public.create_academy_invitation_guarded(
  p_academy_id uuid,
  p_email text,
  p_job_title text
)
returns public.academy_invitations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_email text := lower(btrim(coalesce(auth.email(), '')));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_job_title text := btrim(coalesce(p_job_title, ''));
  v_title_policies jsonb := '{}'::jsonb;
  v_role text := 'teacher';
  v_target_user_id uuid;
  v_invitation public.academy_invitations%rowtype;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if p_academy_id is null then
    raise exception '학원을 선택해주세요.' using errcode = '22023';
  end if;
  if not (
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStaff')
  ) then
    raise exception '직원을 초대할 권한이 없어요.' using errcode = '42501';
  end if;
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception '올바른 이메일을 입력해주세요.' using errcode = '22023';
  end if;
  if v_email = v_caller_email then
    raise exception '본인 계정은 초대할 수 없어요.' using errcode = '42501';
  end if;
  if v_job_title = '' or length(v_job_title) > 40 then
    raise exception '직책은 40자 이내로 입력해주세요.' using errcode = '22023';
  end if;

  select coalesce(a.job_title_permissions, '{}'::jsonb)
    into v_title_policies
    from public.academies a
   where a.id = p_academy_id;
  if not found then
    raise exception '학원을 찾을 수 없어요.' using errcode = 'P0002';
  end if;

  -- 역할은 클라이언트가 보낸 값이 아니라 학원의 서버 직책 정책에서 결정한다.
  v_role := case
    when v_title_policies -> v_job_title ->> 'role' = 'manager' then 'manager'
    when v_job_title = '운영 매니저' then 'manager'
    else 'teacher'
  end;
  if v_role = 'manager' and not public.is_owner_of_academy(p_academy_id) then
    raise exception '운영 매니저는 원장만 초대할 수 있어요.' using errcode = '42501';
  end if;

  -- 같은 학원·이메일의 초대 생성과 수락을 직렬화한다. 활성 여부를 확인한 뒤
  -- 수락이 끼어들어 active 직원에게 새 pending 초대가 생기는 경쟁을 막는다.
  perform pg_advisory_xact_lock(
    hashtextextended(p_academy_id::text || ':' || v_email, 0)
  );

  -- profiles가 아직 없는 과거 계정은 accepted_user_id 이력으로 한 번 더 찾는다.
  select p.id into v_target_user_id
    from public.profiles p
   where lower(btrim(coalesce(p.email, ''))) = v_email
   limit 1;
  if v_target_user_id is null then
    select ai.accepted_user_id into v_target_user_id
      from public.academy_invitations ai
     where ai.academy_id = p_academy_id
       and lower(btrim(ai.email)) = v_email
       and ai.accepted_user_id is not null
       and not exists (
         select 1 from public.profiles existing_profile
          where existing_profile.id = ai.accepted_user_id
       )
     order by ai.updated_at desc
     limit 1;
  end if;

  -- 과거 accepted 초대가 아니라 현재 active 멤버십만 재초대를 차단한다.
  if v_target_user_id is not null and exists (
    select 1
      from public.academy_members member
     where member.academy_id = p_academy_id
       and member.user_id = v_target_user_id
       and member.status = 'active'
  ) then
    raise exception '이미 학원에 참여 중인 직원이에요.' using errcode = '23505';
  end if;

  select invitation.* into v_invitation
    from public.academy_invitations invitation
   where invitation.academy_id = p_academy_id
     and lower(btrim(invitation.email)) = v_email
     and invitation.status = 'pending'
   order by invitation.created_at desc
   limit 1
   for update;

  if found then
    update public.academy_invitations invitation
       set role = v_role,
           job_title = v_job_title,
           invited_by = v_uid,
           accepted_user_id = null,
           updated_at = now()
     where invitation.id = v_invitation.id
     returning invitation.* into v_invitation;
  else
    insert into public.academy_invitations (
      academy_id, email, role, job_title, status, invited_by, accepted_user_id
    ) values (
      p_academy_id, v_email, v_role, v_job_title, 'pending', v_uid, null
    )
    returning * into v_invitation;
  end if;

  return v_invitation;
end;
$$;

revoke all on function public.create_academy_invitation_guarded(uuid, text, text) from public;
grant execute on function public.create_academy_invitation_guarded(uuid, text, text) to authenticated;

-- 재입사 수락 시 기존 inactive 멤버십은 복구하되 퇴사 전에 부여받은 개인별
-- 권한 예외는 승계하지 않는다. 직책 기본 권한으로 다시 시작한다.
create or replace function public.accept_academy_invitation(p_invitation_id uuid)
returns table (
  out_invitation_id uuid,
  out_academy_id uuid,
  out_role text,
  out_accepted_user_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.email(), '')));
  v_invite public.academy_invitations%rowtype;
  v_member_id uuid;
  v_role text;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  select invitation.* into v_invite
    from public.academy_invitations invitation
   where invitation.id = p_invitation_id;
  if not found then raise exception '초대를 찾을 수 없어요.' using errcode = 'P0002'; end if;

  -- 생성 함수와 같은 순서로 advisory lock을 먼저 잡은 뒤 invitation row를
  -- 잠근다. 이 순서를 지켜 재초대/수락 동시 실행의 교착과 상태 경쟁을 막는다.
  perform pg_advisory_xact_lock(
    hashtextextended(v_invite.academy_id::text || ':' || lower(btrim(v_invite.email)), 0)
  );
  select invitation.* into v_invite
    from public.academy_invitations invitation
   where invitation.id = p_invitation_id
   for update;
  if not found then raise exception '초대를 찾을 수 없어요.' using errcode = 'P0002'; end if;
  if v_invite.status <> 'pending' then raise exception '이미 처리된 초대예요.'; end if;
  if lower(btrim(v_invite.email)) <> v_email then
    raise exception '초대받은 이메일과 로그인 이메일이 달라요.' using errcode = '42501';
  end if;

  select case
      when academy.job_title_permissions -> v_invite.job_title ->> 'role' = 'manager'
        then 'manager'
      when academy.job_title_permissions ? v_invite.job_title
        then 'teacher'
      else v_invite.role
    end
    into v_role
    from public.academies academy
   where academy.id = v_invite.academy_id;
  if v_role not in ('teacher', 'manager') then
    raise exception '잘못된 초대 직책이에요.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.academy_members member
     where member.academy_id = v_invite.academy_id
       and member.user_id = v_uid
       and member.status = 'active'
  ) then
    raise exception '이미 학원에 참여 중인 직원이에요.' using errcode = '23505';
  end if;

  insert into public.academy_members as member (academy_id, user_id, role, status)
  values (v_invite.academy_id, v_uid, v_role, 'active')
  on conflict (academy_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = now()
  returning member.id into v_member_id;

  insert into public.academy_staff_profiles as profile (
    academy_id, user_id, member_id, role, job_title, subjects, wage_type,
    hourly_wage, monthly_salary, status, permissions
  ) values (
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
    'active',
    '{}'::jsonb
  )
  on conflict (academy_id, user_id) do update
    set member_id = excluded.member_id,
        role = excluded.role,
        job_title = excluded.job_title,
        status = 'active',
        subjects = '[]'::jsonb,
        wage_type = 'hourly',
        hourly_wage = 0,
        monthly_salary = 0,
        permissions = '{}'::jsonb,
        employment_started_on = (now() at time zone 'Asia/Seoul')::date,
        employment_ended_on = null,
        exit_reason = null,
        updated_at = now();

  update public.academy_invitations invitation
     set status = 'accepted', accepted_user_id = v_uid, updated_at = now()
   where invitation.id = p_invitation_id;

  out_invitation_id := v_invite.id;
  out_academy_id := v_invite.academy_id;
  out_role := v_role;
  out_accepted_user_id := v_uid;
  return next;
end;
$$;

revoke all on function public.accept_academy_invitation(uuid) from public;
grant execute on function public.accept_academy_invitation(uuid) to authenticated;

commit;
