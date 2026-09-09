-- ============================================================
-- 078_developer_workspace.sql
-- 앱 개발자 전용 워크스페이스와 제품 의견 관리 RPC
--
-- 원칙:
--   - 개발자 여부는 이메일/프론트엔드 플래그가 아니라 auth.users.id로 판정한다.
--   - 일반 학원 멤버십과 분리하고, 모든 조회/변경은 서버에서 다시 검증한다.
--   - 학생/보호자 연락처 등 학원 원본 데이터는 이 워크스페이스에 제공하지 않는다.
-- ============================================================

begin;

create table if not exists public.app_developers (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  role          text not null default 'developer',
  capabilities  jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint app_developers_role_chk
    check (role in ('developer', 'support', 'viewer')),
  constraint app_developers_capabilities_chk
    check (jsonb_typeof(capabilities) = 'object')
);

drop trigger if exists set_app_developers_updated_at on public.app_developers;
create trigger set_app_developers_updated_at
before update on public.app_developers
for each row execute function public.set_updated_at();

alter table public.app_developers enable row level security;
revoke all on table public.app_developers from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.app_developers to service_role;

create table if not exists public.developer_action_logs (
  id             bigint generated always as identity primary key,
  actor_user_id  uuid not null references auth.users(id) on delete restrict,
  action         text not null,
  target_type    text,
  target_id      text,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint developer_action_logs_details_chk
    check (jsonb_typeof(details) = 'object')
);

create index if not exists developer_action_logs_created_idx
  on public.developer_action_logs (created_at desc);

alter table public.developer_action_logs enable row level security;
revoke all on table public.developer_action_logs from public, anon, authenticated;
grant select, insert on table public.developer_action_logs to service_role;

create or replace function public.is_current_app_developer()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.app_developers developer
    where developer.user_id = auth.uid()
      and developer.is_active = true
  );
$$;

revoke all on function public.is_current_app_developer() from public, anon, authenticated;
grant execute on function public.is_current_app_developer() to authenticated, service_role;

create or replace function public.get_my_developer_access()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_developer public.app_developers%rowtype;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  select * into v_developer
  from public.app_developers developer
  where developer.user_id = auth.uid()
    and developer.is_active = true;

  if not found then
    return jsonb_build_object('has_access', false);
  end if;

  return jsonb_build_object(
    'has_access', true,
    'role', v_developer.role,
    'capabilities', v_developer.capabilities
  );
end;
$$;

revoke all on function public.get_my_developer_access() from public, anon, authenticated;
grant execute on function public.get_my_developer_access() to authenticated;

create or replace function public.get_developer_dashboard_stats()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_feedback jsonb;
  v_active_academies bigint := 0;
  v_active_members bigint := 0;
begin
  if not public.is_current_app_developer() then
    raise exception '개발자 워크스페이스 접근 권한이 없어요.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'received', count(*) filter (where feedback.status = 'received'),
    'reviewing', count(*) filter (where feedback.status = 'reviewing'),
    'planned', count(*) filter (where feedback.status = 'planned'),
    'resolved', count(*) filter (where feedback.status = 'resolved'),
    'closed', count(*) filter (where feedback.status = 'closed'),
    'bugs', count(*) filter (where feedback.category = 'bug'),
    'improvements', count(*) filter (where feedback.category = 'improvement'),
    'last_7_days', count(*) filter (where feedback.created_at >= now() - interval '7 days')
  ) into v_feedback
  from public.product_feedback feedback;

  select count(*) into v_active_academies
  from public.academies;

  select count(*) into v_active_members
  from public.academy_members member
  where member.status = 'active';

  return coalesce(v_feedback, '{}'::jsonb) || jsonb_build_object(
    'active_academies', v_active_academies,
    'active_members', v_active_members,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_developer_dashboard_stats() from public, anon, authenticated;
grant execute on function public.get_developer_dashboard_stats() to authenticated;

create or replace function public.list_product_feedback_for_developer(
  p_status text default null,
  p_category text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  academy_name text,
  category text,
  message text,
  screenshot_path text,
  page_path text,
  app_mode text,
  reporter_role text,
  context jsonb,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not public.is_current_app_developer() then
    raise exception '개발자 워크스페이스 접근 권한이 없어요.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('received', 'reviewing', 'planned', 'resolved', 'closed') then
    raise exception '의견 상태가 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_category is not null and p_category not in ('bug', 'improvement') then
    raise exception '의견 종류가 올바르지 않아요.' using errcode = '22023';
  end if;

  return query
  select
    feedback.id,
    academy.name,
    feedback.category,
    feedback.message,
    feedback.screenshot_path,
    feedback.page_path,
    feedback.app_mode,
    feedback.reporter_role,
    feedback.context,
    feedback.status,
    feedback.created_at,
    feedback.updated_at,
    count(*) over() as total_count
  from public.product_feedback feedback
  left join public.academies academy on academy.id = feedback.academy_id
  where (p_status is null or feedback.status = p_status)
    and (p_category is null or feedback.category = p_category)
  order by feedback.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_product_feedback_for_developer(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_product_feedback_for_developer(text, text, integer, integer)
  to authenticated;

create or replace function public.update_product_feedback_status_for_developer(
  p_feedback_id uuid,
  p_status text
)
returns table (
  id uuid,
  status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous_status text;
begin
  if not public.is_current_app_developer() then
    raise exception '개발자 워크스페이스 접근 권한이 없어요.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.app_developers developer
    where developer.user_id = auth.uid()
      and developer.is_active = true
      and developer.role in ('developer', 'support')
  ) then
    raise exception '의견 상태를 변경할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_feedback_id is null then
    raise exception '의견 ID가 필요해요.' using errcode = '22023';
  end if;
  if p_status not in ('received', 'reviewing', 'planned', 'resolved', 'closed') then
    raise exception '의견 상태가 올바르지 않아요.' using errcode = '22023';
  end if;

  select feedback.status into v_previous_status
  from public.product_feedback feedback
  where feedback.id = p_feedback_id
  for update;

  if not found then
    raise exception '대상 의견을 찾을 수 없어요.' using errcode = 'P0002';
  end if;

  update public.product_feedback feedback
  set status = p_status,
      updated_at = now()
  where feedback.id = p_feedback_id;

  insert into public.developer_action_logs (
    actor_user_id,
    action,
    target_type,
    target_id,
    details
  ) values (
    auth.uid(),
    'feedback.status_changed',
    'product_feedback',
    p_feedback_id::text,
    jsonb_build_object('from', v_previous_status, 'to', p_status)
  );

  return query
  select feedback.id, feedback.status, feedback.updated_at
  from public.product_feedback feedback
  where feedback.id = p_feedback_id;
end;
$$;

revoke all on function public.update_product_feedback_status_for_developer(uuid, text)
  from public, anon, authenticated;
grant execute on function public.update_product_feedback_status_for_developer(uuid, text)
  to authenticated;

drop policy if exists "feedback attachments select developer" on storage.objects;
create policy "feedback attachments select developer"
on storage.objects for select to authenticated
using (
  bucket_id = 'feedback-attachments'
  and public.is_current_app_developer()
);

commit;

notify pgrst, 'reload schema';

-- 최초 개발자 등록은 비밀번호 공유 없이 service_role 또는 Supabase SQL Editor에서
-- 아래 형태로 1회 수행한다. 사용자 UUID는 Authentication > Users에서 확인한다.
-- insert into public.app_developers (user_id, role) values ('USER_UUID', 'developer');

-- ============================================================
-- End of 078_developer_workspace.sql
-- ============================================================
