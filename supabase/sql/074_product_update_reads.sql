-- 씨닛 업데이트 공지 읽음 상태
-- 사용자 단위로 저장해 PC와 모바일에서 같은 공지가 반복 노출되지 않게 한다.

create table if not exists public.product_update_reads (
  user_id    uuid not null references auth.users(id) on delete cascade,
  update_id  text not null check (char_length(update_id) between 1 and 120),
  read_at    timestamptz not null default now(),
  primary key (user_id, update_id)
);

alter table public.product_update_reads enable row level security;

drop policy if exists "product_update_reads_select_own" on public.product_update_reads;
create policy "product_update_reads_select_own"
on public.product_update_reads for select
using (auth.uid() = user_id);

drop policy if exists "product_update_reads_insert_own" on public.product_update_reads;
create policy "product_update_reads_insert_own"
on public.product_update_reads for insert
with check (auth.uid() = user_id);

drop policy if exists "product_update_reads_update_own" on public.product_update_reads;
create policy "product_update_reads_update_own"
on public.product_update_reads for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.product_update_reads to authenticated;
