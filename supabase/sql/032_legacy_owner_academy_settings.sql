-- ============================================================
-- 032_legacy_owner_academy_settings.sql
-- Seenit — 기존 원장 계정의 학원 설정 저장 권한 보완
--
-- 예전 데이터에서 academies.owner_id가 비어 있거나 현재 사용자와 다르더라도,
-- active academy_members.role='owner' 멤버는 학원 설정을 저장할 수 있게 한다.
-- ============================================================

create or replace function public.is_owner_member_of_academy(p_academy_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.academy_members
    where academy_id = p_academy_id
      and user_id = auth.uid()
      and role = 'owner'
      and status = 'active'
  );
$$;

revoke all on function public.is_owner_member_of_academy(uuid) from public;
grant execute on function public.is_owner_member_of_academy(uuid) to authenticated;

drop policy if exists "academies update by owner" on public.academies;
create policy "academies update by owner"
on public.academies
for update
using (
  owner_id = auth.uid()
  or public.is_owner_member_of_academy(id)
)
with check (
  owner_id = auth.uid()
  or public.is_owner_member_of_academy(id)
);
