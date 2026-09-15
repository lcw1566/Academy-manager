-- Shared predicate: RLS and the service-only push path use identical active
-- academy / DM / custom-room membership rules. Not an exposed impersonation RPC.
create or replace function public.chat_user_can_access(p_thread_id uuid, p_user_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.academy_chat_threads t
    join public.academy_members m on m.academy_id = t.academy_id
      and m.user_id = p_user_id and m.status = 'active'
    where t.id = p_thread_id and (
      (t.kind = 'dm' and p_user_id in (t.dm_user_a, t.dm_user_b))
      or (t.kind = 'group' and t.group_scope = 'academy')
      or (t.kind = 'group' and t.group_scope = 'custom' and exists (
        select 1 from public.academy_chat_thread_members tm
        where tm.thread_id = t.id and tm.user_id = p_user_id
      ))
    )
  );
$$;
revoke all on function public.chat_user_can_access(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.can_access_chat_thread(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.chat_user_can_access(p_thread_id, auth.uid());
$$;
revoke all on function public.can_access_chat_thread(uuid) from public, anon, service_role;
grant execute on function public.can_access_chat_thread(uuid) to authenticated;

drop policy if exists chat_messages_insert on public.academy_chat_messages;
create policy chat_messages_insert on public.academy_chat_messages for insert to authenticated
with check (
  sender_id = (select auth.uid()) and public.can_access_chat_thread(thread_id)
  and exists (select 1 from public.academy_chat_threads t
    where t.id = academy_chat_messages.thread_id
      and t.academy_id = academy_chat_messages.academy_id)
);

-- A caller must not extend the push eligibility window by forging created_at.
create or replace function public.set_chat_message_server_time()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := statement_timestamp();
  return new;
end;
$$;
revoke all on function public.set_chat_message_server_time() from public, anon, authenticated, service_role;
drop trigger if exists set_chat_message_server_time on public.academy_chat_messages;
create trigger set_chat_message_server_time before insert on public.academy_chat_messages
for each row execute function public.set_chat_message_server_time();

-- One small receipt per message; no body, names or device tokens. Deleting the
-- message cascades the receipt. No automatic retry after a possibly delivered push.
create table if not exists public.chat_push_dispatches (
  message_id uuid primary key references public.academy_chat_messages(id) on delete cascade,
  claimed_at timestamptz not null default now()
);
alter table public.chat_push_dispatches enable row level security;
revoke all on table public.chat_push_dispatches from public, anon, authenticated, service_role;

create or replace function public.claim_chat_push(p_message_id uuid, p_sender_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_message public.academy_chat_messages%rowtype;
  v_count integer;
  v_devices jsonb;
begin
  -- p_sender_id comes exclusively from Edge Function auth.getUser(), never JSON.
  select m.* into v_message from public.academy_chat_messages m
  join public.academy_chat_threads t on t.id = m.thread_id and t.academy_id = m.academy_id
  where m.id = p_message_id and m.sender_id = p_sender_id
    and public.chat_user_can_access(m.thread_id, p_sender_id);
  if not found then raise exception 'Push not permitted' using errcode = '42501'; end if;
  if v_message.created_at < statement_timestamp() - interval '10 minutes' or v_message.created_at > statement_timestamp() then
    return jsonb_build_object('claimed', false, 'reason', 'expired');
  end if;
  insert into public.chat_push_dispatches(message_id) values (v_message.id)
    on conflict (message_id) do nothing;
  get diagnostics v_count = row_count;
  if v_count = 0 then return jsonb_build_object('claimed', false, 'reason', 'duplicate'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'user_id', d.user_id, 'provider', d.provider)), '[]'::jsonb)
  into v_devices from public.academy_members member
  join public.push_devices d on d.user_id = member.user_id
  where member.academy_id = v_message.academy_id and member.status = 'active'
    and d.enabled and d.user_id <> p_sender_id
    and public.chat_user_can_access(v_message.thread_id, d.user_id);
  return jsonb_build_object('claimed', true, 'threadId', v_message.thread_id,
    'academyId', v_message.academy_id, 'devices', v_devices);
end;
$$;
revoke all on function public.claim_chat_push(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_chat_push(uuid, uuid) to service_role;

-- Recheck after provider authentication, immediately before sending. A logged-out,
-- reassigned or newly inactive device owner must not receive the queued attempt.
drop function if exists public.get_chat_push_device(uuid, uuid, uuid, uuid);
create or replace function public.get_chat_push_device(
  p_message_id uuid, p_sender_id uuid, p_device_id uuid, p_recipient_id uuid
)
returns table(id uuid, token text, provider text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.token, d.provider, d.updated_at from public.push_devices d
  join public.academy_chat_messages m on m.id = p_message_id and m.sender_id = p_sender_id
  join public.academy_chat_threads t on t.id = m.thread_id and t.academy_id = m.academy_id
  join public.chat_push_dispatches receipt on receipt.message_id = m.id
  where d.id = p_device_id and d.user_id = p_recipient_id and d.enabled
    and d.user_id <> m.sender_id
    and m.created_at between statement_timestamp() - interval '10 minutes' and statement_timestamp()
    and public.chat_user_can_access(m.thread_id, p_sender_id)
    and public.chat_user_can_access(m.thread_id, d.user_id);
$$;
revoke all on function public.get_chat_push_device(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_chat_push_device(uuid, uuid, uuid, uuid) to service_role;

-- Send the token in a POST body, not in REST query strings / access-log URLs.
create or replace function public.disable_my_push_device(p_token text, p_provider text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.push_devices set enabled = false
    where user_id = auth.uid() and token = p_token and provider = p_provider;
end;
$$;
revoke all on function public.disable_my_push_device(text, text) from public, anon, service_role;
grant execute on function public.disable_my_push_device(text, text) to authenticated;

-- These privileges bypass row-level policies or are unnecessary for API users.
revoke truncate, trigger, references, maintain on public.academy_chat_messages,
  public.academy_chat_threads, public.academy_chat_thread_members,
  public.academy_chat_reads, public.push_devices from anon, authenticated;
