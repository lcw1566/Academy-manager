-- Seenit — 날짜 범위 기반 수업 회차 실체화
--
-- 기존에는 월말에 원장 계정이 접속해야 다음 달 class_sessions가 생성됐다.
-- 이제는 어떤 active 학원 구성원이 필요한 날짜 범위를 열어도 반복 규칙을 실제
-- 회차로 안전하게 준비한다. 같은 범위를 여러 번 호출하거나 여러 기기에서 동시에
-- 호출해도 schedule_rule_id + occurrence_date 기준으로 한 회차만 유지한다.

alter table public.class_schedule_rules
  add column if not exists effective_start_date date,
  add column if not exists effective_end_date date;

alter table public.class_sessions
  add column if not exists schedule_rule_id uuid
    references public.class_schedule_rules(id) on delete set null,
  add column if not exists occurrence_date date,
  add column if not exists session_exception_id uuid
    references public.class_session_exceptions(id) on delete set null,
  add column if not exists canceled_by_schedule_exception boolean not null default false;

create unique index if not exists class_sessions_schedule_occurrence_uidx
  on public.class_sessions(schedule_rule_id, occurrence_date)
  where schedule_rule_id is not null and occurrence_date is not null;

create unique index if not exists class_sessions_extra_exception_uidx
  on public.class_sessions(session_exception_id)
  where schedule_rule_id is null and session_exception_id is not null;

create index if not exists class_sessions_academy_occurrence_idx
  on public.class_sessions(academy_id, occurrence_date);

create or replace function public.ensure_class_sessions_for_range(
  p_academy_id uuid,
  p_from_date date,
  p_to_date date,
  p_class_group_id uuid default null
)
returns setof public.class_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_occ record;
  v_session_id uuid;
  v_start_time text;
  v_end_time text;
  v_teacher_user_id uuid;
  v_assistant_ids jsonb;
  v_substitute_teacher_user_id uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  if p_academy_id is null or p_from_date is null or p_to_date is null then
    raise exception '학원과 날짜 범위가 필요해요.' using errcode = '22023';
  end if;

  if p_from_date > p_to_date then
    raise exception '시작일은 종료일보다 늦을 수 없어요.' using errcode = '22023';
  end if;

  if (p_to_date - p_from_date) > 93 then
    raise exception '한 번에 최대 94일까지만 준비할 수 있어요.' using errcode = '22023';
  end if;

  if not (
    public.is_owner_of_academy(p_academy_id)
    or public.is_member_of_academy(p_academy_id)
  ) then
    raise exception '이 학원의 수업을 준비할 권한이 없어요.' using errcode = '42501';
  end if;

  if p_class_group_id is not null and not exists (
    select 1
      from public.class_groups g
     where g.id = p_class_group_id
       and g.academy_id = p_academy_id
  ) then
    raise exception '선택한 반을 찾을 수 없어요.' using errcode = '22023';
  end if;

  -- 같은 학원에 대한 동시 실체화를 직렬화한다. 기존 자연키 회차를 연결하는 짧은
  -- 순간에만 유지되며, 다른 학원의 요청은 서로 막지 않는다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 0));

  for v_occ in
    select
      r.id as rule_id,
      r.start_time as rule_start_time,
      r.end_time as rule_end_time,
      r.teacher_user_id as rule_teacher_user_id,
      r.assistant_ids as rule_assistant_ids,
      r.room as rule_room,
      g.id as group_id,
      g.user_id as group_user_id,
      g.teacher_id as group_teacher_id,
      g.teacher_type as group_teacher_type,
      g.teacher_user_id as group_teacher_user_id,
      g.assistant_ids as group_assistant_ids,
      g.student_ids as group_student_ids,
      g.room as group_room,
      g.record_schema as group_record_schema,
      g.activity_type as group_activity_type,
      g.activity_name as group_activity_name,
      generated.day::date as occurrence_date,
      e.id as exception_id,
      e.type as exception_type,
      e.start_time as exception_start_time,
      e.end_time as exception_end_time,
      e.teacher_user_id as exception_teacher_user_id,
      e.assistant_ids as exception_assistant_ids,
      e.substitute_teacher_user_id as exception_substitute_teacher_user_id,
      e.reason as exception_reason,
      e.memo as exception_memo
    from public.class_schedule_rules r
    join public.class_groups g
      on g.id = r.class_group_id
     and g.academy_id = r.academy_id
    cross join lateral generate_series(
      p_from_date::timestamp,
      p_to_date::timestamp,
      interval '1 day'
    ) as generated(day)
    left join lateral (
      select x.*
        from public.class_session_exceptions x
       where x.academy_id = r.academy_id
         and x.class_group_id = r.class_group_id
         and x.session_date = generated.day::date
         and x.type <> 'extra'
       order by
         case x.type
           when 'cancel' then 1
           when 'reschedule' then 2
           when 'substitute' then 3
           else 4
         end,
         x.created_at desc
       limit 1
    ) e on true
    where r.academy_id = p_academy_id
      and r.is_active = true
      and g.status = 'active'
      and (p_class_group_id is null or g.id = p_class_group_id)
      and extract(dow from generated.day)::smallint = r.day_of_week
      and (
        r.effective_start_date is null
        or generated.day::date >= r.effective_start_date
      )
      and (
        r.effective_end_date is null
        or generated.day::date <= r.effective_end_date
      )
      and (g.start_date is null or generated.day::date >= g.start_date)
      and (g.end_date is null or generated.day::date <= g.end_date)
    order by generated.day, r.start_time, r.id
  loop
    v_start_time := coalesce(v_occ.exception_start_time, v_occ.rule_start_time);
    v_end_time := coalesce(v_occ.exception_end_time, v_occ.rule_end_time);
    v_teacher_user_id := coalesce(
      v_occ.exception_teacher_user_id,
      v_occ.rule_teacher_user_id,
      v_occ.group_teacher_user_id
    );
    v_assistant_ids := coalesce(
      v_occ.exception_assistant_ids,
      v_occ.rule_assistant_ids,
      v_occ.group_assistant_ids,
      '[]'::jsonb
    );
    v_substitute_teacher_user_id := case
      when v_occ.exception_type = 'substitute'
        then v_occ.exception_substitute_teacher_user_id
      else null
    end;

    select cs.id
      into v_session_id
      from public.class_sessions cs
     where cs.academy_id = p_academy_id
       and cs.class_group_id = v_occ.group_id
       and (
         (
           cs.schedule_rule_id = v_occ.rule_id
           and cs.occurrence_date = v_occ.occurrence_date
         )
         or (
           cs.schedule_rule_id is null
           and cs.date = v_occ.occurrence_date
           and left(coalesce(cs.start_time, ''), 5) in (
             left(coalesce(v_occ.rule_start_time, ''), 5),
             left(coalesce(v_start_time, ''), 5)
           )
         )
       )
     order by
       (cs.schedule_rule_id = v_occ.rule_id) desc,
       cs.created_at
     limit 1;

    if v_occ.exception_type = 'cancel' then
      if v_session_id is not null then
        update public.class_sessions
           set schedule_rule_id = coalesce(schedule_rule_id, v_occ.rule_id),
               occurrence_date = coalesce(occurrence_date, v_occ.occurrence_date),
               session_exception_id = v_occ.exception_id,
               canceled_by_schedule_exception = true,
               status = case when status = 'completed' then status else 'canceled' end
         where id = v_session_id;
      end if;
      continue;
    end if;

    if v_session_id is not null then
      update public.class_sessions
         set schedule_rule_id = coalesce(schedule_rule_id, v_occ.rule_id),
             occurrence_date = coalesce(occurrence_date, v_occ.occurrence_date),
             session_exception_id = v_occ.exception_id,
             date = v_occ.occurrence_date,
             start_time = case
               when status = 'completed' then start_time
               else v_start_time
             end,
             end_time = case
               when status = 'completed' then end_time
               else v_end_time
             end,
             room = case
               when status = 'completed' then room
               else coalesce(v_occ.rule_room, v_occ.group_room)
             end,
             teacher_user_id = case
               when status = 'completed' then teacher_user_id
               else v_teacher_user_id
             end,
             assistant_ids = case
               when status = 'completed' then assistant_ids
               else v_assistant_ids
             end,
             student_ids = case
               when status = 'completed' then student_ids
               else coalesce(v_occ.group_student_ids, '[]'::jsonb)
             end,
             substitute_teacher_user_id = case
               when status = 'completed' then substitute_teacher_user_id
               else v_substitute_teacher_user_id
             end,
             substitute_reason = case
               when status = 'completed' then substitute_reason
               else v_occ.exception_reason
             end,
             memo = case
               when status = 'completed' then memo
               else coalesce(v_occ.exception_memo, memo)
             end,
             record_schema = case
               when status = 'completed' then record_schema
               else coalesce(record_schema, v_occ.group_record_schema)
             end,
             activity_type = case
               when status = 'completed' then activity_type
               else coalesce(activity_type, v_occ.group_activity_type)
             end,
             activity_name = case
               when status = 'completed' then activity_name
               else coalesce(activity_name, v_occ.group_activity_name)
             end,
             status = case
               when status = 'completed' then status
               when canceled_by_schedule_exception then 'scheduled'
               when status = 'canceled' then status
               when v_occ.exception_type = 'reschedule' then 'rescheduled'
               else 'scheduled'
             end,
             canceled_by_schedule_exception = false
       where id = v_session_id;
    else
      v_status := case
        when v_occ.exception_type = 'reschedule' then 'rescheduled'
        else 'scheduled'
      end;

      insert into public.class_sessions (
        academy_id,
        user_id,
        mode,
        class_group_id,
        date,
        start_time,
        end_time,
        room,
        teacher_id,
        teacher_type,
        teacher_user_id,
        assistant_ids,
        student_ids,
        status,
        memo,
        record_schema,
        activity_type,
        activity_name,
        session_kind,
        substitute_teacher_user_id,
        substitute_reason,
        schedule_rule_id,
        occurrence_date,
        session_exception_id,
        canceled_by_schedule_exception
      ) values (
        p_academy_id,
        coalesce(v_occ.group_user_id, auth.uid()),
        'academy',
        v_occ.group_id,
        v_occ.occurrence_date,
        v_start_time,
        v_end_time,
        coalesce(v_occ.rule_room, v_occ.group_room),
        v_occ.group_teacher_id,
        coalesce(v_occ.group_teacher_type, 'teacher'),
        v_teacher_user_id,
        v_assistant_ids,
        coalesce(v_occ.group_student_ids, '[]'::jsonb),
        v_status,
        v_occ.exception_memo,
        v_occ.group_record_schema,
        v_occ.group_activity_type,
        v_occ.group_activity_name,
        'regular',
        v_substitute_teacher_user_id,
        v_occ.exception_reason,
        v_occ.rule_id,
        v_occ.occurrence_date,
        v_occ.exception_id,
        false
      )
      on conflict (schedule_rule_id, occurrence_date)
        where schedule_rule_id is not null and occurrence_date is not null
      do nothing;
    end if;
  end loop;

  -- 정기 규칙이 없는 추가 회차도 예외 ID를 기준으로 한 번만 만든다.
  for v_occ in
    select
      e.id as exception_id,
      e.session_date,
      e.start_time,
      e.end_time,
      e.teacher_user_id as exception_teacher_user_id,
      e.assistant_ids as exception_assistant_ids,
      e.substitute_teacher_user_id,
      e.reason,
      e.memo as exception_memo,
      g.id as group_id,
      g.user_id as group_user_id,
      g.teacher_id as group_teacher_id,
      g.teacher_type as group_teacher_type,
      g.teacher_user_id as group_teacher_user_id,
      g.assistant_ids as group_assistant_ids,
      g.student_ids as group_student_ids,
      g.room as group_room,
      g.record_schema as group_record_schema,
      g.activity_type as group_activity_type,
      g.activity_name as group_activity_name
    from public.class_session_exceptions e
    join public.class_groups g
      on g.id = e.class_group_id
     and g.academy_id = e.academy_id
   where e.academy_id = p_academy_id
     and e.type = 'extra'
     and e.session_date between p_from_date and p_to_date
     and g.status = 'active'
     and (p_class_group_id is null or g.id = p_class_group_id)
     and (g.start_date is null or e.session_date >= g.start_date)
     and (g.end_date is null or e.session_date <= g.end_date)
  loop
    if v_occ.start_time is null or v_occ.end_time is null then
      continue;
    end if;

    insert into public.class_sessions (
      academy_id,
      user_id,
      mode,
      class_group_id,
      date,
      start_time,
      end_time,
      room,
      teacher_id,
      teacher_type,
      teacher_user_id,
      assistant_ids,
      student_ids,
      status,
      memo,
      record_schema,
      activity_type,
      activity_name,
      session_kind,
      substitute_teacher_user_id,
      substitute_reason,
      occurrence_date,
      session_exception_id
    ) values (
      p_academy_id,
      coalesce(v_occ.group_user_id, auth.uid()),
      'academy',
      v_occ.group_id,
      v_occ.session_date,
      v_occ.start_time,
      v_occ.end_time,
      v_occ.group_room,
      v_occ.group_teacher_id,
      coalesce(v_occ.group_teacher_type, 'teacher'),
      coalesce(v_occ.exception_teacher_user_id, v_occ.group_teacher_user_id),
      coalesce(v_occ.exception_assistant_ids, v_occ.group_assistant_ids, '[]'::jsonb),
      coalesce(v_occ.group_student_ids, '[]'::jsonb),
      'scheduled',
      v_occ.exception_memo,
      v_occ.group_record_schema,
      v_occ.group_activity_type,
      v_occ.group_activity_name,
      'regular',
      v_occ.substitute_teacher_user_id,
      v_occ.reason,
      v_occ.session_date,
      v_occ.exception_id
    )
    on conflict (session_exception_id)
      where schedule_rule_id is null and session_exception_id is not null
    do nothing;
  end loop;

  return query
    select cs.*
      from public.class_sessions cs
     where cs.academy_id = p_academy_id
       and cs.date between p_from_date and p_to_date
       and (p_class_group_id is null or cs.class_group_id = p_class_group_id)
     order by cs.date, cs.start_time, cs.id;
end;
$$;

revoke all on function public.ensure_class_sessions_for_range(uuid, date, date, uuid)
  from public;
grant execute on function public.ensure_class_sessions_for_range(uuid, date, date, uuid)
  to authenticated;

comment on function public.ensure_class_sessions_for_range(uuid, date, date, uuid) is
  '반복 수업 규칙과 예외를 실제 class_sessions로 중복 없이 준비한다.';

notify pgrst, 'reload schema';
