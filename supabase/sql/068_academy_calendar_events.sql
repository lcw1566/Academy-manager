-- Seenit — 학원 공통 일정(방학/시험/학교 일정/행사/상담)
--
-- 모든 활성 직원은 일정을 보고 등록할 수 있다.
-- 작성자는 본인 일정을 수정/삭제할 수 있고, canManageClasses 보유자는 전체 일정과
-- 수업 휴강 영향을 관리할 수 있다. 휴원으로 생성한 예외는 일정과 연결해 수정·삭제
-- 시 실제 회차까지 원래 상태로 복구한다.

begin;

create table if not exists public.academy_calendar_events (
  id                       uuid primary key default gen_random_uuid(),
  academy_id               uuid not null references public.academies(id) on delete cascade,
  category                 text not null default 'other',
  title                    text not null,
  start_date               date not null,
  end_date                 date not null,
  all_day                  boolean not null default true,
  start_time               time,
  end_time                 time,
  target_type              text not null default 'all',
  school_names             jsonb not null default '[]'::jsonb,
  grades                   jsonb not null default '[]'::jsonb,
  class_group_ids          jsonb not null default '[]'::jsonb,
  student_ids              jsonb not null default '[]'::jsonb,
  memo                     text,
  visibility               text not null default 'internal',
  affects_classes          boolean not null default false,
  impact_class_group_ids   jsonb not null default '[]'::jsonb,
  source                   text not null default 'manual',
  external_id              text,
  created_by               uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by               uuid references auth.users(id) on delete set null default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,
  constraint academy_calendar_events_title_chk check (btrim(title) <> ''),
  constraint academy_calendar_events_date_chk check (end_date >= start_date),
  constraint academy_calendar_events_range_chk check ((end_date - start_date) <= 366),
  constraint academy_calendar_events_category_chk check (
    category in ('academy_break', 'school_exam', 'school_schedule', 'academy_event', 'consultation', 'other')
  ),
  constraint academy_calendar_events_target_chk check (
    target_type in ('all', 'school', 'class', 'student')
  ),
  constraint academy_calendar_events_visibility_chk check (
    visibility in ('internal', 'parent')
  ),
  constraint academy_calendar_events_source_chk check (
    source in ('manual', 'neis')
  ),
  constraint academy_calendar_events_time_chk check (
    all_day or (start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index if not exists academy_calendar_events_academy_range_idx
  on public.academy_calendar_events(academy_id, start_date, end_date)
  where deleted_at is null;
create index if not exists academy_calendar_events_creator_idx
  on public.academy_calendar_events(academy_id, created_by, created_at desc);
create unique index if not exists academy_calendar_events_external_unique_idx
  on public.academy_calendar_events(academy_id, source, external_id)
  where external_id is not null and deleted_at is null;

alter table public.class_session_exceptions
  add column if not exists calendar_event_id uuid
  references public.academy_calendar_events(id) on delete set null;

create unique index if not exists class_session_exceptions_calendar_cancel_unique_idx
  on public.class_session_exceptions(calendar_event_id, class_group_id, session_date)
  where calendar_event_id is not null and type = 'cancel';

drop trigger if exists set_academy_calendar_events_updated_at
  on public.academy_calendar_events;
create trigger set_academy_calendar_events_updated_at
before update on public.academy_calendar_events
for each row execute function public.set_updated_at();

alter table public.academy_calendar_events enable row level security;

drop policy if exists "academy_calendar_events_select_members" on public.academy_calendar_events;
create policy "academy_calendar_events_select_members"
on public.academy_calendar_events for select
using (public.is_member_of_academy(academy_id));

drop policy if exists "academy_calendar_events_insert_members" on public.academy_calendar_events;
create policy "academy_calendar_events_insert_members"
on public.academy_calendar_events for insert
with check (
  public.is_member_of_academy(academy_id)
  and created_by = auth.uid()
);

drop policy if exists "academy_calendar_events_update_owner_or_creator" on public.academy_calendar_events;
create policy "academy_calendar_events_update_owner_or_creator"
on public.academy_calendar_events for update
using (
  public.is_member_of_academy(academy_id)
  and (
    created_by = auth.uid()
    or public.has_academy_permission(academy_id, 'canManageClasses')
  )
)
with check (
  public.is_member_of_academy(academy_id)
  and (
    created_by = auth.uid()
    or public.has_academy_permission(academy_id, 'canManageClasses')
  )
);

drop policy if exists "academy_calendar_events_delete_owner_or_creator" on public.academy_calendar_events;
create policy "academy_calendar_events_delete_owner_or_creator"
on public.academy_calendar_events for delete
using (
  public.is_member_of_academy(academy_id)
  and (
    created_by = auth.uid()
    or public.has_academy_permission(academy_id, 'canManageClasses')
  )
);

-- 쓰기는 반드시 아래 RPC를 통과해야 휴강 예외와 실제 회차가 한 트랜잭션으로
-- 함께 바뀐다. 직접 insert/update/delete는 의도적으로 막는다.
revoke insert, update, delete on public.academy_calendar_events from authenticated;
grant select on public.academy_calendar_events to authenticated;

create or replace function public.save_academy_calendar_event(
  p_academy_id uuid,
  p_event jsonb,
  p_event_id uuid default null
)
returns public.academy_calendar_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.academy_calendar_events%rowtype;
  v_saved public.academy_calendar_events%rowtype;
  v_id uuid := coalesce(p_event_id, gen_random_uuid());
  v_category text := coalesce(nullif(btrim(p_event ->> 'category'), ''), 'other');
  v_title text := nullif(btrim(p_event ->> 'title'), '');
  v_start_date date := nullif(p_event ->> 'start_date', '')::date;
  v_end_date date := coalesce(nullif(p_event ->> 'end_date', '')::date, nullif(p_event ->> 'start_date', '')::date);
  v_all_day boolean := coalesce((p_event ->> 'all_day')::boolean, true);
  v_start_time time := case when coalesce((p_event ->> 'all_day')::boolean, true) then null else nullif(p_event ->> 'start_time', '')::time end;
  v_end_time time := case when coalesce((p_event ->> 'all_day')::boolean, true) then null else nullif(p_event ->> 'end_time', '')::time end;
  v_target_type text := coalesce(nullif(p_event ->> 'target_type', ''), 'all');
  v_school_names jsonb := '[]'::jsonb;
  v_grades jsonb := '[]'::jsonb;
  v_class_group_ids jsonb := '[]'::jsonb;
  v_student_ids jsonb := '[]'::jsonb;
  v_affects_classes boolean := coalesce((p_event ->> 'affects_classes')::boolean, false);
  v_impact_ids jsonb := '[]'::jsonb;
  v_old_from date;
  v_old_to date;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  if p_academy_id is null or not public.is_member_of_academy(p_academy_id) then
    raise exception '학원 일정을 등록할 권한이 없어요.' using errcode = '42501';
  end if;
  if v_title is null then raise exception '일정 제목을 입력해주세요.'; end if;
  if v_start_date is null or v_end_date is null or v_end_date < v_start_date then
    raise exception '일정 날짜를 확인해주세요.';
  end if;
  if (v_end_date - v_start_date) > 366 then raise exception '일정은 최대 1년까지 등록할 수 있어요.'; end if;
  if v_affects_classes and (v_end_date - v_start_date) > 93 then
    raise exception '수업을 쉬는 일정은 한 번에 최대 94일까지 설정할 수 있어요.';
  end if;
  if v_affects_classes and not public.has_academy_permission(p_academy_id, 'canManageClasses') then
    raise exception '수업을 휴강 처리할 권한이 없어요.' using errcode = '42501';
  end if;
  if not v_all_day and (v_start_time is null or v_end_time is null or v_end_time <= v_start_time) then
    raise exception '종료 시간은 시작 시간보다 늦어야 해요.';
  end if;

  -- 배열의 순서나 중복 선택과 무관하게 같은 대상을 같은 값으로 저장한다.
  if v_target_type = 'school' then
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into v_school_names
    from (
      select distinct value
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_event -> 'school_names') = 'array'
          then p_event -> 'school_names' else '[]'::jsonb end
      )
    ) normalized;
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into v_grades
    from (
      select distinct value
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_event -> 'grades') = 'array'
          then p_event -> 'grades' else '[]'::jsonb end
      )
    ) normalized;
  elsif v_target_type = 'class' then
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into v_class_group_ids
    from (
      select distinct value
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_event -> 'class_group_ids') = 'array'
          then p_event -> 'class_group_ids' else '[]'::jsonb end
      )
    ) normalized;
  elsif v_target_type = 'student' then
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into v_student_ids
    from (
      select distinct value
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_event -> 'student_ids') = 'array'
          then p_event -> 'student_ids' else '[]'::jsonb end
      )
    ) normalized;
  end if;

  if v_affects_classes then
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into v_impact_ids
    from (
      select distinct value
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_event -> 'impact_class_group_ids') = 'array'
          then p_event -> 'impact_class_group_ids' else '[]'::jsonb end
      )
    ) normalized;
  end if;

  -- 같은 학원에서 두 기기가 동시에 저장해도 검사와 insert 사이에 끼어들지 못한다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 0));

  if exists (
    select 1
    from public.academy_calendar_events duplicate_event
    where duplicate_event.academy_id = p_academy_id
      and duplicate_event.deleted_at is null
      and duplicate_event.id <> v_id
      and duplicate_event.category = v_category
      and lower(regexp_replace(btrim(duplicate_event.title), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(v_title, '[[:space:]]+', ' ', 'g'))
      and duplicate_event.start_date = v_start_date
      and duplicate_event.end_date = v_end_date
      and duplicate_event.all_day = v_all_day
      and duplicate_event.start_time is not distinct from v_start_time
      and duplicate_event.end_time is not distinct from v_end_time
      and duplicate_event.target_type = v_target_type
      and (
        v_target_type = 'all'
        or (
          v_target_type = 'school'
          and duplicate_event.school_names @> v_school_names
          and v_school_names @> duplicate_event.school_names
          and duplicate_event.grades @> v_grades
          and v_grades @> duplicate_event.grades
        )
        or (
          v_target_type = 'class'
          and duplicate_event.class_group_ids @> v_class_group_ids
          and v_class_group_ids @> duplicate_event.class_group_ids
        )
        or (
          v_target_type = 'student'
          and duplicate_event.student_ids @> v_student_ids
          and v_student_ids @> duplicate_event.student_ids
        )
      )
  ) then
    raise exception '이미 같은 일정이 등록되어 있어요. 기존 일정을 확인해주세요.';
  end if;

  if p_event_id is not null then
    select * into v_existing
    from public.academy_calendar_events
    where id = p_event_id and academy_id = p_academy_id and deleted_at is null
    for update;
    if not found then raise exception '일정을 찾을 수 없어요.'; end if;
    if v_existing.created_by is distinct from auth.uid()
       and not public.has_academy_permission(p_academy_id, 'canManageClasses') then
      raise exception '다른 직원의 일정을 수정할 권한이 없어요.' using errcode = '42501';
    end if;
    v_old_from := v_existing.start_date;
    v_old_to := v_existing.end_date;

    -- 이 일정이 취소했던 실제 회차를 먼저 복구한 뒤 예외를 다시 만든다.
    update public.class_sessions cs
       set status = case
             when exists (
               select 1 from public.class_session_exceptions other_exception
               where other_exception.calendar_event_id is distinct from p_event_id
                 and other_exception.class_group_id = cs.class_group_id
                 and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
                 and other_exception.type = 'cancel'
             ) then 'canceled'
             when cs.status = 'canceled' then 'scheduled'
             else cs.status
           end,
           canceled_by_schedule_exception = exists (
             select 1 from public.class_session_exceptions other_exception
             where other_exception.calendar_event_id is distinct from p_event_id
               and other_exception.class_group_id = cs.class_group_id
               and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
               and other_exception.type = 'cancel'
           ),
           session_exception_id = (
             select other_exception.id
             from public.class_session_exceptions other_exception
             where other_exception.calendar_event_id is distinct from p_event_id
               and other_exception.class_group_id = cs.class_group_id
               and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
               and other_exception.type = 'cancel'
             order by other_exception.created_at desc
             limit 1
           ),
           updated_at = now()
      from public.class_session_exceptions e
     where e.calendar_event_id = p_event_id
       and cs.session_exception_id = e.id
       and cs.canceled_by_schedule_exception = true
       and cs.status <> 'completed';
    delete from public.class_session_exceptions where calendar_event_id = p_event_id;
  end if;

  insert into public.academy_calendar_events as event (
    id, academy_id, category, title, start_date, end_date, all_day, start_time, end_time,
    target_type, school_names, grades, class_group_ids, student_ids, memo, visibility,
    affects_classes, impact_class_group_ids, source, external_id, created_by, updated_by
  ) values (
    v_id, p_academy_id, v_category, v_title, v_start_date, v_end_date, v_all_day,
    v_start_time, v_end_time, v_target_type,
    v_school_names, v_grades, v_class_group_ids, v_student_ids,
    nullif(btrim(p_event ->> 'memo'), ''),
    coalesce(nullif(p_event ->> 'visibility', ''), 'internal'),
    v_affects_classes, v_impact_ids,
    coalesce(nullif(p_event ->> 'source', ''), 'manual'),
    nullif(p_event ->> 'external_id', ''),
    coalesce(v_existing.created_by, auth.uid()), auth.uid()
  )
  on conflict (id) do update set
    category = excluded.category,
    title = excluded.title,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    all_day = excluded.all_day,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    target_type = excluded.target_type,
    school_names = excluded.school_names,
    grades = excluded.grades,
    class_group_ids = excluded.class_group_ids,
    student_ids = excluded.student_ids,
    memo = excluded.memo,
    visibility = excluded.visibility,
    affects_classes = excluded.affects_classes,
    impact_class_group_ids = excluded.impact_class_group_ids,
    source = excluded.source,
    external_id = excluded.external_id,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_saved;

  if v_affects_classes then
    insert into public.class_session_exceptions (
      academy_id, class_group_id, session_date, type, reason, memo, calendar_event_id
    )
    select distinct
      p_academy_id,
      rule.class_group_id,
      generated.day::date,
      'cancel',
      '학원 일정: ' || v_title,
      nullif(btrim(p_event ->> 'memo'), ''),
      v_id
    from public.class_schedule_rules rule
    join public.class_groups class_group
      on class_group.id = rule.class_group_id and class_group.academy_id = p_academy_id
    cross join lateral generate_series(
      v_start_date::timestamp,
      v_end_date::timestamp,
      interval '1 day'
    ) generated(day)
    where rule.academy_id = p_academy_id
      and rule.is_active = true
      and class_group.status = 'active'
      and extract(dow from generated.day)::smallint = rule.day_of_week
      and (rule.effective_start_date is null or generated.day::date >= rule.effective_start_date)
      and (rule.effective_end_date is null or generated.day::date <= rule.effective_end_date)
      and (class_group.start_date is null or generated.day::date >= class_group.start_date)
      and (class_group.end_date is null or generated.day::date <= class_group.end_date)
      and (
        jsonb_array_length(v_impact_ids) = 0
        or v_impact_ids ? rule.class_group_id::text
      )
    on conflict (calendar_event_id, class_group_id, session_date)
      where calendar_event_id is not null and type = 'cancel'
    do nothing;

    -- 보강·특강처럼 정규 규칙 밖에서 이미 만들어진 회차도 같은 기간이면 빠짐없이
    -- 휴강한다. 반/날짜당 예외 하나가 그날 여러 회차를 함께 보호한다.
    insert into public.class_session_exceptions (
      academy_id, class_group_id, session_date, type, reason, memo, calendar_event_id
    )
    select distinct
      p_academy_id,
      cs.class_group_id,
      coalesce(cs.occurrence_date, cs.date),
      'cancel',
      '학원 일정: ' || v_title,
      nullif(btrim(p_event ->> 'memo'), ''),
      v_id
    from public.class_sessions cs
    where cs.academy_id = p_academy_id
      and coalesce(cs.occurrence_date, cs.date) between v_start_date and v_end_date
      and cs.status <> 'completed'
      and (
        jsonb_array_length(v_impact_ids) = 0
        or v_impact_ids ? cs.class_group_id::text
      )
    on conflict (calendar_event_id, class_group_id, session_date)
      where calendar_event_id is not null and type = 'cancel'
    do nothing;

    -- 이미 만들어진 정규/추가 회차도 같은 일정 예외에 연결해 즉시 휴강 처리한다.
    update public.class_sessions cs
       set status = case when cs.status = 'completed' then cs.status else 'canceled' end,
           canceled_by_schedule_exception = case when cs.status = 'completed' then cs.canceled_by_schedule_exception else true end,
           session_exception_id = case when cs.status = 'completed' then cs.session_exception_id else e.id end,
           updated_at = now()
      from public.class_session_exceptions e
     where e.calendar_event_id = v_id
       and e.class_group_id = cs.class_group_id
       and e.session_date = coalesce(cs.occurrence_date, cs.date)
       and cs.academy_id = p_academy_id;
  end if;

  if v_old_from is not null
     and public.has_academy_permission(p_academy_id, 'canManageClasses') then
    perform 1 from public.ensure_class_sessions_for_range(p_academy_id, v_old_from, v_old_to, null);
  end if;
  if v_affects_classes then
    perform 1 from public.ensure_class_sessions_for_range(p_academy_id, v_start_date, v_end_date, null);
  end if;

  return v_saved;
end;
$$;

create or replace function public.delete_academy_calendar_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.academy_calendar_events%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  select * into v_event
  from public.academy_calendar_events
  where id = p_event_id and deleted_at is null
  for update;
  if not found then raise exception '일정을 찾을 수 없어요.'; end if;
  if v_event.created_by is distinct from auth.uid()
     and not public.has_academy_permission(v_event.academy_id, 'canManageClasses') then
    raise exception '다른 직원의 일정을 삭제할 권한이 없어요.' using errcode = '42501';
  end if;

  update public.class_sessions cs
     set status = case
           when exists (
             select 1 from public.class_session_exceptions other_exception
             where other_exception.calendar_event_id is distinct from p_event_id
               and other_exception.class_group_id = cs.class_group_id
               and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
               and other_exception.type = 'cancel'
           ) then 'canceled'
           when cs.status = 'canceled' then 'scheduled'
           else cs.status
         end,
         canceled_by_schedule_exception = exists (
           select 1 from public.class_session_exceptions other_exception
           where other_exception.calendar_event_id is distinct from p_event_id
             and other_exception.class_group_id = cs.class_group_id
             and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
             and other_exception.type = 'cancel'
         ),
         session_exception_id = (
           select other_exception.id
           from public.class_session_exceptions other_exception
           where other_exception.calendar_event_id is distinct from p_event_id
             and other_exception.class_group_id = cs.class_group_id
             and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
             and other_exception.type = 'cancel'
           order by other_exception.created_at desc
           limit 1
         ),
         updated_at = now()
    from public.class_session_exceptions e
   where e.calendar_event_id = p_event_id
     and cs.session_exception_id = e.id
     and cs.canceled_by_schedule_exception = true
     and cs.status <> 'completed';
  delete from public.class_session_exceptions where calendar_event_id = p_event_id;

  update public.academy_calendar_events
  set deleted_at = now(), updated_by = auth.uid(), updated_at = now()
  where id = p_event_id;

  if v_event.affects_classes
     and public.has_academy_permission(v_event.academy_id, 'canManageClasses') then
    perform 1 from public.ensure_class_sessions_for_range(
      v_event.academy_id, v_event.start_date, v_event.end_date, null
    );
  end if;
  return p_event_id;
end;
$$;

revoke all on function public.save_academy_calendar_event(uuid, jsonb, uuid) from public;
grant execute on function public.save_academy_calendar_event(uuid, jsonb, uuid) to authenticated;
revoke all on function public.delete_academy_calendar_event(uuid) from public;
grant execute on function public.delete_academy_calendar_event(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'academy_calendar_events'
  ) then
    alter publication supabase_realtime add table public.academy_calendar_events;
  end if;
end$$;

notify pgrst, 'reload schema';

commit;
