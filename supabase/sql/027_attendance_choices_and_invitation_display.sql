-- ============================================================
-- 027_attendance_choices_and_invitation_display.sql
-- 출결 온보딩 선택 + 초대받은 학원 이름 표시
--
-- 001~026 적용 후 실행. 기존 QR 설정과 초대 데이터는 보존한다.
-- ============================================================

-- ─── 직원 출퇴근 방식: 직접 기록 또는 QR ───────────────────────
-- SQL 012에서 QR 단일 값으로 좁혔던 제약을 온보딩 선택에 맞게 확장한다.
alter table public.academies
  drop constraint if exists academies_staff_check_method_chk;

alter table public.academies
  add constraint academies_staff_check_method_chk
  check (staff_check_method in ('manual', 'qr'));

-- 신규 학원이 출결 온보딩을 완료하기 전에는 더 안전한 직접 기록을 기본값으로 둔다.
alter table public.academies
  alter column staff_check_method set default 'manual';


-- ─── 역할 확정 시 직원 프로필 자동 준비 ─────────────────────────
-- 역할을 정해 보낸 초대는 수락 즉시 active 멤버가 된다. 대시보드와 담당자 선택이
-- 첫 로그인부터 동작하도록 최소 staff profile을 같은 트랜잭션에서 준비한다.
create or replace function public.sync_staff_profile_from_academy_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('teacher', 'assistant', 'manager') and new.status = 'active' then
    insert into public.academy_staff_profiles (
      academy_id,
      user_id,
      member_id,
      role,
      subjects,
      wage_type,
      hourly_wage,
      monthly_salary,
      status
    )
    values (
      new.academy_id,
      new.user_id,
      new.id,
      new.role,
      '[]'::jsonb,
      'hourly',
      0,
      0,
      'active'
    )
    on conflict (academy_id, user_id) do update
      set member_id = excluded.member_id,
          role = excluded.role,
          status = 'active',
          updated_at = now();
  elsif new.role in ('teacher', 'assistant', 'manager') and new.status = 'inactive' then
    update public.academy_staff_profiles
    set status = 'inactive', updated_at = now()
    where academy_id = new.academy_id
      and user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_staff_profile_from_academy_member
  on public.academy_members;
create trigger sync_staff_profile_from_academy_member
after insert or update of role, status
on public.academy_members
for each row execute function public.sync_staff_profile_from_academy_member();

-- 이미 활성화됐지만 직원 프로필이 없는 멤버도 동일한 최소값으로 보강한다.
insert into public.academy_staff_profiles (
  academy_id,
  user_id,
  member_id,
  role,
  subjects,
  wage_type,
  hourly_wage,
  monthly_salary,
  status
)
select
  m.academy_id,
  m.user_id,
  m.id,
  m.role,
  '[]'::jsonb,
  'hourly',
  0,
  0,
  'active'
from public.academy_members m
where m.status = 'active'
  and m.role in ('teacher', 'assistant', 'manager')
on conflict (academy_id, user_id) do update
  set member_id = excluded.member_id,
      role = excluded.role,
      status = 'active',
      updated_at = now();


-- ─── 초대받은 사용자에게 최소 학원 정보만 반환 ──────────────────
-- academies RLS를 넓히지 않고 초대 카드에 필요한 id/name만 invitation과 함께
-- 반환한다. 호출자의 인증 이메일과 일치하는 pending 초대만 볼 수 있다.
create or replace function public.list_my_pending_academy_invitations()
returns table (
  invitation_id uuid,
  academy_id uuid,
  academy_name text,
  email text,
  role text,
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

notify pgrst, 'reload schema';

-- ============================================================
-- End of 027_attendance_choices_and_invitation_display.sql
-- ============================================================
