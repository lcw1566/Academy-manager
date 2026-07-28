-- Seenit — 등원 기반 자동 추론과 선생님 확정 출석 분리
--
-- 기존 attendance_records.source='qr' 행과, 직접 등원 방식에서 체크 이벤트
-- 시각을 그대로 복사해 자동 생성한 행은 수업 화면의 추론값이다. 삭제하지 않고
-- auto_inferred로 표시해 과거 데이터는 보존한다. 앞으로 선생님이 출석 버튼을
-- 누른 행만 teacher_confirmed가 되며, 등원 시간(checked_at)과 출석 확정
-- 시각(confirmed_at)을 별도로 기록한다.

alter table public.attendance_records
  add column if not exists confirmation_state text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null;

update public.attendance_records ar
   set confirmation_state = case
         when ar.source = 'qr'
           or exists (
             select 1
               from public.student_check_events sce
              where sce.academy_id = ar.academy_id
                and sce.student_id = ar.student_id
                and sce.event_type = 'check_in'
                and ar.checked_at is not null
                and abs(extract(epoch from (sce.event_time - ar.checked_at))) <= 1
           )
           then 'auto_inferred'
         when ar.source = 'teacher_manual' then 'teacher_confirmed'
         else 'legacy_confirmed'
       end
 where confirmation_state is null;

update public.attendance_records
   set confirmed_at = coalesce(confirmed_at, updated_at, created_at),
       confirmed_by = coalesce(confirmed_by, user_id)
 where confirmation_state in ('teacher_confirmed', 'legacy_confirmed');

alter table public.attendance_records
  alter column confirmation_state set default 'teacher_confirmed',
  alter column confirmation_state set not null;

alter table public.attendance_records
  drop constraint if exists attendance_records_confirmation_state_chk;

alter table public.attendance_records
  add constraint attendance_records_confirmation_state_chk
  check (confirmation_state in ('auto_inferred', 'teacher_confirmed', 'legacy_confirmed'));

create index if not exists attendance_records_session_confirmation_idx
  on public.attendance_records(class_session_id, confirmation_state);

comment on column public.attendance_records.confirmation_state is
  'auto_inferred=등원 기록 기반 참고값, teacher_confirmed=선생님 확정, legacy_confirmed=기존 확정 기록';
comment on column public.attendance_records.checked_at is
  '등원 또는 출석 판단에 사용된 원본 시각';
comment on column public.attendance_records.confirmed_at is
  '선생님이 수업 출석 상태를 확정한 시각';

notify pgrst, 'reload schema';
