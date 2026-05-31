-- ============================================================
-- 015_staff_attendance_logs_self_rls.sql
-- Academy Manager — staff_attendance_logs 강사 본인 self insert/update 허용 (Phase 44.7 / Phase C)
--
-- 배경:
--   SQL 014 의 staff_attendance_logs RLS 가 insert/update owner only 로 정의되어
--   강사가 본인 QR/수동 체크인 시 직접 row 를 만들 수 없었다. 정책을 확장해
--   본인 user 만은 self-insert/update 가능하도록 허용.
--
-- 멱등 + destructive 없음 (drop policy if exists 후 재정의).
-- ============================================================

drop policy if exists "saLog insert owner" on public.staff_attendance_logs;
create policy "saLog insert self or owner" on public.staff_attendance_logs
  for insert with check (
    public.is_owner_of_academy(academy_id)
    or (
      staff_user_id = auth.uid()
      and public.is_member_of_academy(academy_id)
    )
  );

drop policy if exists "saLog update owner" on public.staff_attendance_logs;
create policy "saLog update self or owner" on public.staff_attendance_logs
  for update
  using (
    public.is_owner_of_academy(academy_id)
    or (
      staff_user_id = auth.uid()
      and public.is_member_of_academy(academy_id)
    )
  )
  with check (
    public.is_owner_of_academy(academy_id)
    or (
      staff_user_id = auth.uid()
      and public.is_member_of_academy(academy_id)
    )
  );

-- delete 는 그대로 owner only 유지 (강사가 본인 기록을 지우는 행위는 막아야 함).
-- select 는 owner OR member 그대로.

-- ============================================================
-- 끝.
--
-- 검증 쿼리:
--   select polname, polcmd
--     from pg_policy
--    where polrelid = 'public.staff_attendance_logs'::regclass;
--   -- 기대: insert/update 정책이 "self or owner" 이름으로 존재.
-- ============================================================
