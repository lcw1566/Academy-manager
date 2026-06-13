-- ============================================================
-- 020_academy_chat_members_rpc.sql
--
-- 채팅용 멤버 디렉터리.
--
-- 기존 list_academy_member_profiles 는 is_owner_of_academy 가드로 "원장만"
-- 멤버 프로필을 볼 수 있다. 하지만 채팅은 강사/보조강사도 같은 학원 직원의
-- 이름을 보고 1:1 DM 을 시작해야 하므로, "학원 멤버 누구나" 활성 멤버 명단을
-- 조회할 수 있는 별도 RPC 를 제공한다.
--
-- 반환은 표시에 필요한 최소 필드(user_id/display_name/email/role)뿐이고,
-- is_member_of_academy 로 호출자가 그 학원 멤버일 때만 결과를 준다.
--
-- 의존: public.is_member_of_academy(uuid)  -- 001_workspace_schema.sql
-- ============================================================

create or replace function public.list_academy_chat_members(p_academy_id uuid)
returns table (
  user_id       uuid,
  display_name  text,
  email         text,
  role          text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id           as user_id,
    p.display_name,
    p.email,
    m.role
  from public.academy_members m
  join public.profiles p
    on p.id = m.user_id
  where m.academy_id = p_academy_id
    and m.status     = 'active'
    and public.is_member_of_academy(p_academy_id);
$$;

grant execute on function public.list_academy_chat_members(uuid) to authenticated;
