-- ============================================================
-- 073_product_feedback.sql
-- 로그인 사용자 공통 버그 신고 / 개선 제안 수집
-- ============================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-attachments',
  'feedback-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create table if not exists public.product_feedback (
  id                uuid primary key default gen_random_uuid(),
  reporter_user_id  uuid not null references auth.users(id) on delete cascade default auth.uid(),
  academy_id        uuid references public.academies(id) on delete set null,
  category          text not null,
  message           text not null,
  screenshot_path   text,
  page_path         text,
  app_mode          text,
  reporter_role     text,
  context           jsonb not null default '{}'::jsonb,
  status            text not null default 'received',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint product_feedback_category_chk
    check (category in ('bug', 'improvement')),
  constraint product_feedback_message_chk
    check (char_length(btrim(message)) between 10 and 4000),
  constraint product_feedback_status_chk
    check (status in ('received', 'reviewing', 'planned', 'resolved', 'closed')),
  constraint product_feedback_context_chk
    check (jsonb_typeof(context) = 'object')
);

create index if not exists product_feedback_created_idx
  on public.product_feedback (created_at desc);
create index if not exists product_feedback_status_created_idx
  on public.product_feedback (status, created_at desc);
create index if not exists product_feedback_academy_created_idx
  on public.product_feedback (academy_id, created_at desc)
  where academy_id is not null;

drop trigger if exists set_product_feedback_updated_at on public.product_feedback;
create trigger set_product_feedback_updated_at
before update on public.product_feedback
for each row execute function public.set_updated_at();

alter table public.product_feedback enable row level security;

drop policy if exists "product_feedback select own" on public.product_feedback;
create policy "product_feedback select own"
on public.product_feedback for select to authenticated
using (reporter_user_id = auth.uid());

drop policy if exists "product_feedback insert own" on public.product_feedback;
create policy "product_feedback insert own"
on public.product_feedback for insert to authenticated
with check (
  reporter_user_id = auth.uid()
  and (academy_id is null or public.is_member_of_academy(academy_id))
  and (
    screenshot_path is null
    or screenshot_path like auth.uid()::text || '/%'
  )
);

revoke all on public.product_feedback from anon, authenticated;
grant select, insert on public.product_feedback to authenticated;

drop policy if exists "feedback attachments insert own" on storage.objects;
create policy "feedback attachments insert own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'feedback-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "feedback attachments select own" on storage.objects;
create policy "feedback attachments select own"
on storage.objects for select to authenticated
using (
  bucket_id = 'feedback-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "feedback attachments delete own" on storage.objects;
create policy "feedback attachments delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'feedback-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
);

commit;

notify pgrst, 'reload schema';

-- Supabase Dashboard > Table Editor > product_feedback 에서 전체 의견을 관리한다.
-- 첨부 이미지는 Storage > feedback-attachments 에서 확인한다.
-- ============================================================
-- End of 073_product_feedback.sql
-- ============================================================
