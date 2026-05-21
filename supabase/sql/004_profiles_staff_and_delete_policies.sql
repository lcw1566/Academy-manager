-- ============================================================
-- 004_profiles_staff_and_delete_policies.sql
-- Academy Manager — Phase 20
--
--   1. profiles.phone column
--   2. academy_staff_profiles table (academy-specific staff settings)
--   3. academy_staff_profiles RLS + GRANT
--   4. academies delete RLS policy (owner only)
--   5. cross-academy profile lookup helper for owners
--
-- Prerequisites:
--   - 001_workspace_schema.sql
--   - 002_domain_schema.sql
--   - 003_account_type_and_invitations.sql
--
-- idempotent. No destructive commands.
-- Front-end uses anon key only; no service_role usage.
-- ============================================================


-- ============================================================
-- SECTION 1. profiles.phone column
--
-- User-editable phone number used as a profile attribute.
-- Optional; null allowed.
-- ============================================================

alter table public.profiles
  add column if not exists phone text;


-- ============================================================
-- SECTION 2. academy_staff_profiles table
--
-- Academy-specific settings for invited teachers/assistants.
-- Owner manages academy-side fields; user's basic info (name/email/phone)
-- stays on public.profiles and is managed by the user themselves.
--
-- Lifecycle:
--   - Created when owner first configures invited member's academy-specific
--     fields (or could be created on invitation acceptance — front-end choice).
--   - Updated by owner.
--   - Read by both owner and the staff user themselves.
-- ============================================================

create table if not exists public.academy_staff_profiles (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references public.academies(id)        on delete cascade,
  user_id         uuid not null references auth.users(id)              on delete cascade,
  member_id       uuid          references public.academy_members(id)  on delete cascade,
  role            text not null check (role in ('teacher', 'assistant')),
  subject         text,
  subjects        jsonb default '[]'::jsonb,
  wage_type       text          check (wage_type in ('hourly', 'monthly')),
  hourly_wage     integer       default 0,
  monthly_salary  integer       default 0,
  memo            text,
  status          text not null default 'active'
                  check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (academy_id, user_id)
);


-- ============================================================
-- SECTION 3. indexes
-- ============================================================

create index if not exists academy_staff_profiles_academy_id_idx
  on public.academy_staff_profiles(academy_id);

create index if not exists academy_staff_profiles_user_id_idx
  on public.academy_staff_profiles(user_id);

create index if not exists academy_staff_profiles_member_id_idx
  on public.academy_staff_profiles(member_id);


-- ============================================================
-- SECTION 4. updated_at trigger
-- ============================================================

drop trigger if exists set_academy_staff_profiles_updated_at on public.academy_staff_profiles;
create trigger set_academy_staff_profiles_updated_at
before update on public.academy_staff_profiles
for each row execute function public.set_updated_at();


-- ============================================================
-- SECTION 5. RLS enable
-- ============================================================

alter table public.academy_staff_profiles enable row level security;


-- ============================================================
-- SECTION 6. academy_staff_profiles RLS policies
--
--   - select : owner of the academy OR the staff user themselves
--   - insert : owner of the academy
--   - update : owner of the academy
--   - delete : no policy → blocked. Soft-delete via status='inactive' instead.
-- ============================================================

drop policy if exists "academy_staff_profiles select owner or self"
  on public.academy_staff_profiles;
create policy "academy_staff_profiles select owner or self"
on public.academy_staff_profiles
for select
using (
  public.is_owner_of_academy(academy_id)
  or user_id = auth.uid()
);

drop policy if exists "academy_staff_profiles insert by owner"
  on public.academy_staff_profiles;
create policy "academy_staff_profiles insert by owner"
on public.academy_staff_profiles
for insert
with check (
  public.is_owner_of_academy(academy_id)
);

drop policy if exists "academy_staff_profiles update by owner"
  on public.academy_staff_profiles;
create policy "academy_staff_profiles update by owner"
on public.academy_staff_profiles
for update
using (public.is_owner_of_academy(academy_id))
with check (public.is_owner_of_academy(academy_id));


-- ============================================================
-- SECTION 7. GRANT
-- ============================================================

grant select, insert, update on public.academy_staff_profiles to authenticated;


-- ============================================================
-- SECTION 8. academies delete policy (owner only)
--
-- 001 intentionally omitted a delete policy. We now allow the owner to
-- delete their own academy. Cascade FKs on academy_members / academy_invitations
-- / domain tables will clean up children automatically.
--
-- IMPORTANT: This is a permanent destructive operation. Front-end must
-- enforce strong typed-confirmation UX.
-- ============================================================

drop policy if exists "academies delete by owner" on public.academies;
create policy "academies delete by owner"
on public.academies
for delete
using (owner_id = auth.uid());


-- ============================================================
-- SECTION 9. Cross-academy profile lookup for owners
--
-- Owners need to view name/email/phone of accepted teachers/assistants in
-- their academy. The default profiles RLS only allows own-row reads, so a
-- straight join doesn't work.
--
-- Solution: a security definer function that returns only the small set of
-- public profile fields for users that are active members of an academy
-- the caller owns. No other rows leak.
-- ============================================================

create or replace function public.list_academy_member_profiles(p_academy_id uuid)
returns table (
  user_id       uuid,
  display_name  text,
  email         text,
  phone         text,
  account_type  text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id            as user_id,
    p.display_name,
    p.email,
    p.phone,
    p.account_type
  from public.profiles p
  join public.academy_members m
    on m.user_id = p.id
  where m.academy_id = p_academy_id
    and m.status     = 'active'
    and public.is_owner_of_academy(p_academy_id);
$$;

-- Allow authenticated callers to execute (RLS-equivalent guarded by the
-- function body's is_owner_of_academy check).
grant execute on function public.list_academy_member_profiles(uuid) to authenticated;


-- ============================================================
-- End of 004_profiles_staff_and_delete_policies.sql
-- ============================================================
