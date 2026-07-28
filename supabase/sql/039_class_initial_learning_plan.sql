-- Seenit — 반 생성 시 첫 회차에 보여줄 숙제와 수업 계획

alter table public.class_groups
  add column if not exists initial_homework text,
  add column if not exists initial_next_plan text;
