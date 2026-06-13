-- ============================================================
-- 019_academy_chat.sql
--
-- 앱 내 채팅 (학원 직원 전용).
--   - 학원당 전체 단톡방 1개 (kind='group')
--   - 직원 간 1:1 DM (kind='dm', 정렬된 두 user_id 쌍으로 유일)
--   - 읽음 추적 (academy_chat_reads.last_read_at) → 안 읽은 메시지 배지
--
-- 참여 범위: academy_members 인 사용자만 (owner/teacher/assistant). 과외(tutor)
-- 는 학원 멤버십이 없으므로 자연히 제외된다.
--
-- 의존:
--   · public.is_member_of_academy(uuid)  -- 001_workspace_schema.sql
--   · public.is_owner_of_academy(uuid)   -- 001_workspace_schema.sql
-- ============================================================


-- ─── tables ──────────────────────────────────────────────────

create table if not exists public.academy_chat_threads (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  kind        text not null check (kind in ('group', 'dm')),
  -- dm 전용: 항상 dm_user_a < dm_user_b (정규화) → 중복 방 방지.
  dm_user_a   uuid references auth.users(id) on delete cascade,
  dm_user_b   uuid references auth.users(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (
    (kind = 'group' and dm_user_a is null and dm_user_b is null)
    or (kind = 'dm' and dm_user_a is not null and dm_user_b is not null and dm_user_a < dm_user_b)
  )
);

-- 학원당 group 방 1개.
create unique index if not exists academy_chat_threads_group_uniq
  on public.academy_chat_threads (academy_id)
  where kind = 'group';

-- 학원당 동일 (a,b) 쌍 DM 1개.
create unique index if not exists academy_chat_threads_dm_uniq
  on public.academy_chat_threads (academy_id, dm_user_a, dm_user_b)
  where kind = 'dm';

create index if not exists academy_chat_threads_academy_idx
  on public.academy_chat_threads (academy_id);
create index if not exists academy_chat_threads_dm_a_idx
  on public.academy_chat_threads (dm_user_a);
create index if not exists academy_chat_threads_dm_b_idx
  on public.academy_chat_threads (dm_user_b);


create table if not exists public.academy_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  thread_id   uuid not null references public.academy_chat_threads(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create index if not exists academy_chat_messages_thread_idx
  on public.academy_chat_messages (thread_id, created_at desc);
create index if not exists academy_chat_messages_academy_idx
  on public.academy_chat_messages (academy_id, created_at desc);


create table if not exists public.academy_chat_reads (
  thread_id     uuid not null references public.academy_chat_threads(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (thread_id, user_id)
);


-- ─── updated_at trigger (set_updated_at from 001) ────────────

drop trigger if exists set_academy_chat_threads_updated_at on public.academy_chat_threads;
create trigger set_academy_chat_threads_updated_at
before update on public.academy_chat_threads
for each row execute function public.set_updated_at();


-- ─── visibility helper ───────────────────────────────────────
-- 한 thread 에 접근 가능한가? (학원 멤버 && (group 이거나 dm 참여자))
create or replace function public.can_access_chat_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.academy_chat_threads t
    where t.id = p_thread_id
      and public.is_member_of_academy(t.academy_id)
      and (t.kind = 'group' or auth.uid() in (t.dm_user_a, t.dm_user_b))
  );
$$;


-- ─── RLS ─────────────────────────────────────────────────────

alter table public.academy_chat_threads  enable row level security;
alter table public.academy_chat_messages enable row level security;
alter table public.academy_chat_reads    enable row level security;

-- threads
drop policy if exists "chat_threads_select" on public.academy_chat_threads;
create policy "chat_threads_select"
on public.academy_chat_threads for select
using (
  public.is_member_of_academy(academy_id)
  and (kind = 'group' or auth.uid() in (dm_user_a, dm_user_b))
);

drop policy if exists "chat_threads_insert" on public.academy_chat_threads;
create policy "chat_threads_insert"
on public.academy_chat_threads for insert
with check (
  public.is_member_of_academy(academy_id)
  and created_by = auth.uid()
  and (kind = 'group' or auth.uid() in (dm_user_a, dm_user_b))
);

drop policy if exists "chat_threads_delete_owner" on public.academy_chat_threads;
create policy "chat_threads_delete_owner"
on public.academy_chat_threads for delete
using (public.is_owner_of_academy(academy_id));

-- messages
drop policy if exists "chat_messages_select" on public.academy_chat_messages;
create policy "chat_messages_select"
on public.academy_chat_messages for select
using (public.can_access_chat_thread(thread_id));

drop policy if exists "chat_messages_insert" on public.academy_chat_messages;
create policy "chat_messages_insert"
on public.academy_chat_messages for insert
with check (
  sender_id = auth.uid()
  and public.is_member_of_academy(academy_id)
  and public.can_access_chat_thread(thread_id)
);

-- 메시지 수정/삭제: 본인 메시지만 (선택적 — UI 미노출이어도 안전망).
drop policy if exists "chat_messages_delete_own" on public.academy_chat_messages;
create policy "chat_messages_delete_own"
on public.academy_chat_messages for delete
using (sender_id = auth.uid());

-- reads
drop policy if exists "chat_reads_all_self" on public.academy_chat_reads;
create policy "chat_reads_all_self"
on public.academy_chat_reads for all
using (user_id = auth.uid())
with check (user_id = auth.uid());


-- ─── RPC: get-or-create (race-safe, security definer) ────────
-- 클라이언트가 RLS insert 경쟁/중복 없이 방을 확보하도록 한다.

create or replace function public.get_or_create_group_thread(p_academy_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_member_of_academy(p_academy_id) then
    raise exception '권한이 없어요.';
  end if;

  select id into v_id
  from public.academy_chat_threads
  where academy_id = p_academy_id and kind = 'group'
  limit 1;

  if v_id is null then
    insert into public.academy_chat_threads (academy_id, kind, created_by)
    values (p_academy_id, 'group', auth.uid())
    on conflict (academy_id) where kind = 'group'
    do update set updated_at = now()
    returning id into v_id;
  end if;

  return v_id;
end;
$$;


create or replace function public.get_or_create_dm_thread(p_academy_id uuid, p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_a uuid;
  v_b uuid;
begin
  if not public.is_member_of_academy(p_academy_id) then
    raise exception '권한이 없어요.';
  end if;
  if p_other_user_id is null or p_other_user_id = auth.uid() then
    raise exception '상대를 선택해주세요.';
  end if;
  -- 상대도 같은 학원 멤버여야 한다.
  if not exists (
    select 1 from public.academy_members
    where academy_id = p_academy_id and user_id = p_other_user_id
  ) then
    raise exception '같은 학원의 직원만 채팅할 수 있어요.';
  end if;

  if auth.uid() < p_other_user_id then
    v_a := auth.uid(); v_b := p_other_user_id;
  else
    v_a := p_other_user_id; v_b := auth.uid();
  end if;

  select id into v_id
  from public.academy_chat_threads
  where academy_id = p_academy_id and kind = 'dm'
    and dm_user_a = v_a and dm_user_b = v_b
  limit 1;

  if v_id is null then
    insert into public.academy_chat_threads (academy_id, kind, dm_user_a, dm_user_b, created_by)
    values (p_academy_id, 'dm', v_a, v_b, auth.uid())
    on conflict (academy_id, dm_user_a, dm_user_b) where kind = 'dm'
    do update set updated_at = now()
    returning id into v_id;
  end if;

  return v_id;
end;
$$;


-- ─── realtime publication ────────────────────────────────────
do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'academy_chat_threads',
    'academy_chat_messages',
    'academy_chat_reads'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = v_table_name
    )
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table_name);
    end if;
  end loop;
end $$;
