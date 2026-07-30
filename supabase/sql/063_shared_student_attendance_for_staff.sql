-- Seenit — 직원 간 학생 등하원 데이터 공통화
--
-- 같은 학원에서 등하원 화면을 사용할 수 있는 직원은 담당 반과 관계없이 같은
-- student_check_events를 조회하고 기록한다. 화면의 canEditAttendance 판정과
-- 서버 RPC 판정을 일치시키며, 재원 시작일이 된 scheduled 학생도 허용한다.

begin;

-- 058에서 학생 기본 목록은 이미 canViewStudents 기준으로 전체 공개했지만,
-- 학생에 딸린 출석·클리닉·성적·일정 조회는 여전히 담당 반 판정을 사용했다.
-- 같은 학생을 보고도 직원마다 관련 기록 수가 달라지는 원인이므로 읽기 범위를
-- 학생 조회 권한과 일치시킨다. 생성·수정·삭제 정책은 기존 편집 권한을 유지한다.
create or replace function public.can_access_academy_student(
  p_academy_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
        from public.students s
       where s.id = p_student_id
         and s.academy_id = p_academy_id
         and s.mode = 'academy'
    )
    and (
      public.is_owner_of_academy(p_academy_id)
      or public.has_academy_permission(p_academy_id, 'canViewStudents')
      or public.has_academy_permission(p_academy_id, 'canManageStudents')
    );
$$;

revoke all on function public.can_access_academy_student(uuid, uuid)
  from public;
grant execute on function public.can_access_academy_student(uuid, uuid)
  to authenticated;

comment on function public.can_access_academy_student(uuid, uuid) is
  '학생 조회 권한이 있는 활성 직원에게 학원 전체 학생 관련 읽기 범위를 제공한다.';

drop policy if exists "student_check_events select members"
  on public.student_check_events;
create policy "student_check_events select members"
on public.student_check_events for select
using (
  public.is_member_of_academy(academy_id)
  and (
    public.has_academy_permission(academy_id, 'canViewStudents')
    or public.has_academy_permission(academy_id, 'canEditAttendance')
  )
);

drop policy if exists "student_check_events insert members"
  on public.student_check_events;
create policy "student_check_events insert members"
on public.student_check_events for insert
with check (
  public.is_member_of_academy(academy_id)
  and public.has_academy_permission(academy_id, 'canEditAttendance')
);

create or replace function public.toggle_student_check_event(
  p_academy_id uuid,
  p_student_id uuid,
  p_source text default 'qr'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest public.student_check_events%rowtype;
  v_created public.student_check_events%rowtype;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_today_start timestamptz;
  v_next_type text;
begin
  if p_academy_id is null or p_student_id is null then
    raise exception 'academy_id와 student_id가 필요합니다.';
  end if;

  if p_source not in ('qr', 'teacher_manual') then
    raise exception '지원하지 않는 등하원 기록 방식입니다.';
  end if;

  if not (
    public.is_member_of_academy(p_academy_id)
    and public.has_academy_permission(p_academy_id, 'canEditAttendance')
  ) then
    raise exception '등하원을 기록할 권한이 없습니다.' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.students s
     where s.id = p_student_id
       and s.academy_id = p_academy_id
       and s.mode = 'academy'
       and (
         s.status = 'active'
         or (
           s.status = 'scheduled'
           and (s.enrollment_date is null or s.enrollment_date <= v_today)
         )
       )
  ) then
    raise exception '현재 등하원 처리할 수 있는 학생을 찾지 못했어요.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_academy_id::text || ':' || p_student_id::text, 0)
  );

  v_today_start := v_today::timestamp at time zone 'Asia/Seoul';

  select sce.*
    into v_latest
    from public.student_check_events sce
   where sce.academy_id = p_academy_id
     and sce.student_id = p_student_id
     and sce.event_time >= v_today_start
   order by sce.event_time desc
   limit 1;

  if v_latest.id is not null
     and v_latest.event_time >= now() - interval '8 seconds' then
    return jsonb_build_object(
      'event', to_jsonb(v_latest),
      'duplicate', true
    );
  end if;

  v_next_type := case
    when v_latest.event_type = 'check_in' then 'check_out'
    else 'check_in'
  end;

  insert into public.student_check_events (
    academy_id,
    student_id,
    event_type,
    source,
    created_by
  )
  values (
    p_academy_id,
    p_student_id,
    v_next_type,
    p_source,
    auth.uid()
  )
  returning * into v_created;

  return jsonb_build_object(
    'event', to_jsonb(v_created),
    'duplicate', false
  );
end;
$$;

revoke all on function public.toggle_student_check_event(uuid, uuid, text)
  from public;
grant execute on function public.toggle_student_check_event(uuid, uuid, text)
  to authenticated;

comment on function public.toggle_student_check_event(uuid, uuid, text) is
  '등하원 편집 권한이 있는 학원 직원이 전체 학생의 당일 등하원을 원자적으로 기록한다.';

-- academies 설정 변경도 다른 기기에 즉시 전달한다. 기존 016/017 목록에는
-- academies가 없어 설정 변경은 포커스 재조회 전까지 남을 수 있었다.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'academies'
  ) then
    alter publication supabase_realtime add table public.academies;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
