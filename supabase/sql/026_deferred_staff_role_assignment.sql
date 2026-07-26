-- ============================================================
-- 026_deferred_staff_role_assignment.sql
-- 직원 초대 후 역할 배정
--
-- 가입 단계에서는 원장 / 직원만 선택한다. 직원 초대는 역할 없이 발송되고,
-- 초대 수락자는 pending 멤버십 상태에서 원장 또는 운영 매니저의 역할 배정을
-- 기다린다. 배정이 완료되어야 active 멤버가 되어 학원 데이터에 접근할 수 있다.
--
-- 001~025 적용 후 실행. 기존 강사/보조강사/운영 매니저 초대는 호환을 위해
-- 수락 즉시 활성화하는 기존 흐름을 유지한다.
-- ============================================================

-- ─── pending 역할은 "직원 역할 배정 대기"에만 사용한다 ─────────
alter table public.academy_members drop constraint if exists academy_members_role_check;
alter table public.academy_members add constraint academy_members_role_check
  check (role in ('owner', 'teacher', 'assistant', 'manager', 'pending'));

alter table public.academy_invitations drop constraint if exists academy_invitations_role_check;
alter table public.academy_invitations add constraint academy_invitations_role_check
  check (role in ('teacher', 'assistant', 'manager', 'pending'));

alter table public.academy_invitations alter column role set default 'pending';


-- ─── 초대 수락: pending 초대는 아직 활성 멤버로 만들지 않는다 ─────
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
  v_status    text;
  v_member_role text;
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
  if v_invite.role not in ('teacher', 'assistant', 'manager', 'pending') then
    raise exception '잘못된 초대 역할이에요.';
  end if;

  -- 새 직원 초대(pending)는 역할 배정 전까지 active 권한을 얻지 않는다.
  v_status := case when v_invite.role = 'pending' then 'invited' else 'active' end;

  insert into public.academy_members as am (academy_id, user_id, role, status)
  values (v_invite.academy_id, v_uid, v_invite.role, v_status)
  on conflict (academy_id, user_id) do update
    -- 이미 active인 사람에게 같은 이메일의 역할 없는 초대를 다시 보냈더라도
    -- 기존 권한을 pending으로 되돌리지 않는다.
    set role = case
          when v_invite.role = 'pending' and am.status = 'active' then am.role
          else excluded.role
        end,
        status = case
          when v_invite.role = 'pending' and am.status = 'active' then am.status
          else excluded.status
        end,
        updated_at = now()
  returning am.role into v_member_role;

  update public.academy_invitations ai
  set status = 'accepted', accepted_user_id = v_uid, updated_at = now()
  where ai.id = p_invitation_id;

  out_invitation_id := v_invite.id;
  out_academy_id := v_invite.academy_id;
  out_role := v_member_role;
  out_accepted_user_id := v_uid;
  return next;
end;
$$;


-- ─── 역할 없는 초대는 원장/운영 매니저 모두 발송 가능 ───────────
-- 운영 매니저는 강사·보조강사만 배정할 수 있으므로 manager 초대/배정은 여전히
-- 원장에게만 남긴다.
drop policy if exists "academy_invitations insert by operations" on public.academy_invitations;
create policy "academy_invitations insert by operations"
on public.academy_invitations for insert
with check (
  invited_by = auth.uid()
  and (
    public.is_owner_of_academy(academy_id)
    or (
      public.is_academy_manager(academy_id)
      and role in ('teacher', 'assistant', 'pending')
    )
  )
);

drop policy if exists "academy_invitations update by operations or invitee" on public.academy_invitations;
create policy "academy_invitations update by operations or invitee"
on public.academy_invitations for update
using (
  public.is_academy_operations_manager(academy_id)
  or lower(email) = lower(coalesce(auth.email(), ''))
)
with check (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_manager(academy_id)
    and role in ('teacher', 'assistant', 'pending')
  )
  or lower(email) = lower(coalesce(auth.email(), ''))
);


-- ─── 멤버십 역할 활성화 권한 ──────────────────────────────────
-- owner: 모든 역할을 배정/변경할 수 있다.
-- manager: pending 직원을 강사/보조강사로 활성화하거나 그 두 역할만 변경한다.
drop policy if exists "academy_members update by owner" on public.academy_members;
drop policy if exists "academy_members update by operations" on public.academy_members;
create policy "academy_members update by operations"
on public.academy_members for update
using (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_manager(academy_id)
    and role in ('pending', 'teacher', 'assistant')
  )
)
with check (
  public.is_owner_of_academy(academy_id)
  or (
    public.is_academy_manager(academy_id)
    and role in ('teacher', 'assistant')
    and status = 'active'
  )
);


-- ─── 역할 배정 대기자 목록 ───────────────────────────────────
-- profiles 기본 RLS를 넓히지 않고, 운영 권한이 있는 사람에게만 최소 정보만
-- 반환한다. pending/invited 조합만 반환하므로 이미 활성화된 직원은 제외된다.
create or replace function public.list_academy_role_assignment_candidates(p_academy_id uuid)
returns table (
  member_id         uuid,
  user_id           uuid,
  display_name      text,
  email             text,
  phone             text,
  membership_status text,
  membership_role   text,
  accepted_at       timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.id,
    m.user_id,
    p.display_name,
    p.email,
    p.phone,
    m.status,
    m.role,
    i.updated_at
  from public.academy_members m
  left join public.profiles p on p.id = m.user_id
  left join public.academy_invitations i
    on i.academy_id = m.academy_id
   and i.accepted_user_id = m.user_id
   and i.role = 'pending'
   and i.status = 'accepted'
  where m.academy_id = p_academy_id
    and m.role = 'pending'
    and m.status = 'invited'
    and public.is_academy_operations_manager(p_academy_id)
  order by i.updated_at desc nulls last, m.created_at asc;
$$;

grant execute on function public.list_academy_role_assignment_candidates(uuid) to authenticated;

-- 역할 배정은 후보 목록과 같은 서버 검증 경로를 사용한다. RLS 정책도 별도로
-- 유지하지만, 이 RPC는 권한 부족/대상 없음 오류를 명확히 반환한다.
create or replace function public.assign_academy_member_role(
  p_academy_id uuid,
  p_user_id uuid,
  p_role text
)
returns table (
  out_member_id uuid,
  out_role text,
  out_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.academy_members%rowtype;
begin
  if p_role not in ('teacher', 'assistant', 'manager') then
    raise exception '배정할 수 없는 역할이에요.';
  end if;

  if not public.is_academy_operations_manager(p_academy_id) then
    raise exception '직원 역할을 배정할 권한이 없어요.';
  end if;

  if p_role = 'manager' and not public.is_owner_of_academy(p_academy_id) then
    raise exception '운영 매니저 역할은 원장만 배정할 수 있어요.';
  end if;

  update public.academy_members m
  set role = p_role, status = 'active', updated_at = now()
  where m.academy_id = p_academy_id
    and m.user_id = p_user_id
    and m.role = 'pending'
    and m.status = 'invited'
  returning m.* into v_member;

  if not found then
    raise exception '역할 배정 대기 중인 직원을 찾을 수 없어요.';
  end if;

  out_member_id := v_member.id;
  out_role := v_member.role;
  out_status := v_member.status;
  return next;
end;
$$;

grant execute on function public.assign_academy_member_role(uuid, uuid, text) to authenticated;

-- ============================================================
-- End of 026_deferred_staff_role_assignment.sql
-- ============================================================
