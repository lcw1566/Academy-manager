-- ============================================================
-- 005_accept_invitation_rpc.sql
-- Academy Manager — Phase 21 (hotfix)
--
-- Why this file exists:
--   The "academy_members insert by owner" policy from 001 means that an
--   invited user CANNOT directly insert their own academy_members row
--   when they accept an invitation. Trying that from the client raises:
--     "new row violates row-level security policy for table 'academy_members'"
--
-- Fix:
--   A security definer RPC that runs as the function owner (bypassing RLS)
--   but performs explicit validation inside the function body. The function
--   only ever:
--     - verifies the invitation belongs to the caller (by email match)
--     - verifies the invitation is still pending
--     - inserts/updates a single academy_members row for the caller
--     - marks the invitation as accepted
--
-- NOTE — naming collision fix:
--   An earlier draft used returns table (academy_id, role, …). Those OUT
--   parameter names are in scope inside the function body, so any reference
--   to academy_id or role in the body (e.g. on conflict (academy_id, ...))
--   raised: "column reference 'academy_id' is ambiguous".
--   This version prefixes the OUT parameters with out_ to remove the clash.
--
-- Prerequisites: 001 / 003 already applied.
-- Idempotent: drop function if exists + create function.
-- No destructive commands on data. No service_role usage.
-- ============================================================

-- create or replace cannot change a function's return signature, so drop
-- any prior version (with either return shape) before creating.
drop function if exists public.accept_academy_invitation(uuid);

create function public.accept_academy_invitation(p_invitation_id uuid)
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
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;

  -- Lock the invitation row so concurrent double-acceptance can't race.
  select *
    into v_invite
  from public.academy_invitations ai
  where ai.id = p_invitation_id
  for update;

  if not found then
    raise exception '초대를 찾을 수 없어요.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception '이미 처리된 초대예요.';
  end if;

  if lower(v_invite.email) <> lower(v_email) then
    raise exception '초대받은 이메일과 로그인 이메일이 달라요.';
  end if;

  if v_invite.role not in ('teacher', 'assistant') then
    raise exception '잘못된 초대 역할이에요.';
  end if;

  -- Upsert the academy_members row for the caller. Bypasses RLS because
  -- we are inside a security definer function. We do NOT touch any other
  -- user's membership.
  insert into public.academy_members as am
    (academy_id, user_id, role, status)
  values
    (v_invite.academy_id, v_uid, v_invite.role, 'active')
  on conflict (academy_id, user_id) do update
    set role       = excluded.role,
        status     = 'active',
        updated_at = now();

  -- Mark the invitation accepted.
  update public.academy_invitations ai
     set status           = 'accepted',
         accepted_user_id = v_uid,
         updated_at       = now()
   where ai.id = p_invitation_id;

  out_invitation_id    := v_invite.id;
  out_academy_id       := v_invite.academy_id;
  out_role             := v_invite.role;
  out_accepted_user_id := v_uid;
  return next;
end;
$$;

grant execute on function public.accept_academy_invitation(uuid) to authenticated;


-- ============================================================
-- End of 005_accept_invitation_rpc.sql
-- ============================================================
