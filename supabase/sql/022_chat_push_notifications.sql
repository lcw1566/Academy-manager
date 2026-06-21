-- ============================================================
-- 022_chat_push_notifications.sql
--
-- 채팅 푸시 알림용 기기 토큰. 한 사용자가 PC/휴대폰을 여러 대 사용할 수
-- 있으므로 사용자당 여러 행을 허용한다. 토큰 조회/발송은 service role 로만
-- 수행하고, 일반 사용자는 본인 토큰만 등록·갱신·삭제할 수 있다.
-- ============================================================

create table if not exists public.push_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  platform      text not null check (platform in ('android', 'ios', 'web')),
  provider      text not null check (provider in ('fcm', 'apns', 'webpush')),
  token         text not null,
  enabled       boolean not null default true,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (provider, token)
);

create index if not exists push_devices_user_id_idx
  on public.push_devices(user_id);

alter table public.push_devices enable row level security;

drop policy if exists "push_devices_select_own" on public.push_devices;
create policy "push_devices_select_own"
on public.push_devices for select
using (user_id = auth.uid());

drop policy if exists "push_devices_insert_own" on public.push_devices;
create policy "push_devices_insert_own"
on public.push_devices for insert
with check (user_id = auth.uid());

drop policy if exists "push_devices_update_own" on public.push_devices;
create policy "push_devices_update_own"
on public.push_devices for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "push_devices_delete_own" on public.push_devices;
create policy "push_devices_delete_own"
on public.push_devices for delete
using (user_id = auth.uid());

drop trigger if exists set_push_devices_updated_at on public.push_devices;
create trigger set_push_devices_updated_at
before update on public.push_devices
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.push_devices to authenticated;

-- 같은 휴대폰에서 다른 계정으로 로그인하면 OS 토큰은 그대로일 수 있다.
-- 호출자의 실제 auth.uid()로 소유권을 안전하게 옮겨 이전 계정 알림이 새
-- 사용자에게 전달되는 것을 막는다.
create or replace function public.register_push_device(
  p_token text,
  p_platform text,
  p_provider text
)
returns public.push_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.push_devices;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if p_platform not in ('android', 'ios', 'web') then
    raise exception '지원하지 않는 플랫폼이에요.';
  end if;
  if p_provider not in ('fcm', 'apns', 'webpush') then
    raise exception '지원하지 않는 푸시 제공자예요.';
  end if;

  insert into public.push_devices (user_id, token, platform, provider, enabled, last_seen_at)
  values (auth.uid(), p_token, p_platform, p_provider, true, now())
  on conflict (provider, token) do update
  set user_id = auth.uid(),
      platform = excluded.platform,
      enabled = true,
      last_seen_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.register_push_device(text, text, text) from public;
grant execute on function public.register_push_device(text, text, text) to authenticated;
