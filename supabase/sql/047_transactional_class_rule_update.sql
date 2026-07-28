-- Seenit — 반 정보와 반복 수업 규칙 원자적 수정
--
-- 반 정보 UPDATE, 기존 규칙 비활성화, 새 규칙 INSERT가 일부만 성공하는 문제를
-- 막는다. RPC 한 번이 PostgreSQL 트랜잭션 하나이므로 어느 단계든 실패하면 전체가
-- 롤백된다. 과거/완료 회차와 기록은 유지하고, 변경일 이후 이전 규칙의 미완료
-- 회차만 취소하여 새 규칙과 동시에 노출되지 않게 한다.

alter table public.class_schedule_rules
  add column if not exists effective_start_date date,
  add column if not exists effective_end_date date;

create index if not exists class_schedule_rules_effective_range_idx
  on public.class_schedule_rules(
    academy_id,
    class_group_id,
    effective_start_date,
    effective_end_date
  );

create or replace function public.update_class_group_with_rules(
  p_academy_id uuid,
  p_class_group_id uuid,
  p_group_patch jsonb,
  p_rules jsonb,
  p_effective_from date default ((now() at time zone 'Asia/Seoul')::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group public.class_groups%rowtype;
  v_rule jsonb;
  v_old_rule_ids uuid[] := '{}'::uuid[];
  v_new_rule_ids uuid[] := '{}'::uuid[];
  v_new_rule_id uuid;
  v_rule_count integer;
  v_distinct_day_count integer;
  v_day_of_week smallint;
  v_start_time text;
  v_end_time text;
  v_effective_from date;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  if p_academy_id is null or p_class_group_id is null then
    raise exception '학원과 반 정보가 필요해요.' using errcode = '22023';
  end if;

  if not (
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageClasses')
  ) then
    raise exception '반을 수정할 권한이 없어요.' using errcode = '42501';
  end if;

  if p_group_patch is null or jsonb_typeof(p_group_patch) <> 'object' then
    raise exception '반 수정 정보 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception '수업 규칙 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  if p_effective_from is null then
    raise exception '규칙 적용 시작일이 필요해요.' using errcode = '22023';
  end if;

  -- SQL 046의 회차 실체화와 같은 잠금을 사용해, 규칙 교체 도중 이전 규칙으로
  -- 미래 회차가 뒤늦게 생성되는 경쟁 상태를 막는다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 0));

  select *
    into v_group
    from public.class_groups
   where id = p_class_group_id
     and academy_id = p_academy_id
     and mode = 'academy'
   for update;

  if not found then
    raise exception '수정할 반을 찾을 수 없어요.' using errcode = 'P0002';
  end if;

  -- 과거 날짜로 규칙을 되돌리지 않는다. 또한 오늘 회차에 이미 수업·출석·클리닉
  -- 기록이 있다면 그 회차는 역사로 보존하고 새 규칙은 다음 날부터 적용한다.
  v_effective_from := greatest(
    p_effective_from,
    (now() at time zone 'Asia/Seoul')::date
  );

  if exists (
    select 1
      from public.class_sessions cs
     where cs.academy_id = p_academy_id
       and cs.class_group_id = p_class_group_id
       and coalesce(cs.occurrence_date, cs.date) = v_effective_from
       and (
         cs.status = 'completed'
         or exists (
           select 1 from public.lesson_records lr where lr.class_session_id = cs.id
         )
         or exists (
           select 1 from public.attendance_records ar where ar.class_session_id = cs.id
         )
         or exists (
           select 1 from public.clinic_records cr where cr.class_session_id = cs.id
         )
       )
  ) then
    v_effective_from := v_effective_from + 1;
  end if;

  if not (p_group_patch ? 'name')
     or nullif(btrim(p_group_patch->>'name'), '') is null then
    raise exception '반 이름이 필요해요.' using errcode = '22023';
  end if;

  select count(*), count(distinct (value->>'day_of_week'))
    into v_rule_count, v_distinct_day_count
    from jsonb_array_elements(p_rules);

  if v_rule_count = 0 then
    raise exception '수업 요일을 최소 1개 선택해주세요.' using errcode = '22023';
  end if;

  if v_rule_count <> v_distinct_day_count then
    raise exception '같은 요일의 수업 규칙이 중복되어 있어요.' using errcode = '22023';
  end if;

  -- 전체 규칙을 먼저 검증한다. 이 단계가 끝나기 전에는 어떤 데이터도 바꾸지 않는다.
  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    begin
      v_day_of_week := (v_rule->>'day_of_week')::smallint;
    exception when others then
      raise exception '수업 요일 값이 올바르지 않아요.' using errcode = '22023';
    end;
    v_start_time := nullif(btrim(v_rule->>'start_time'), '');
    v_end_time := nullif(btrim(v_rule->>'end_time'), '');

    if v_day_of_week not between 0 and 6 then
      raise exception '수업 요일 값은 0~6이어야 해요.' using errcode = '22023';
    end if;
    if v_start_time is null or v_end_time is null
       or v_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or v_end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or v_start_time >= v_end_time then
      raise exception '수업 시작·종료 시간을 확인해주세요.' using errcode = '22023';
    end if;
  end loop;

  select coalesce(array_agg(id), '{}'::uuid[])
    into v_old_rule_ids
    from public.class_schedule_rules
   where academy_id = p_academy_id
     and class_group_id = p_class_group_id
     and is_active = true;

  update public.class_groups
     set name = p_group_patch->>'name',
         subject = case when p_group_patch ? 'subject'
           then nullif(p_group_patch->>'subject', '') else subject end,
         level = case when p_group_patch ? 'level'
           then nullif(p_group_patch->>'level', '') else level end,
         activity_type = case when p_group_patch ? 'activity_type'
           then coalesce(nullif(p_group_patch->>'activity_type', ''), activity_type)
           else activity_type end,
         activity_name = case when p_group_patch ? 'activity_name'
           then nullif(p_group_patch->>'activity_name', '') else activity_name end,
         record_blocks = case when p_group_patch ? 'record_blocks'
           then coalesce(p_group_patch->'record_blocks', '[]'::jsonb) else record_blocks end,
         record_schema = case when p_group_patch ? 'record_schema'
           then p_group_patch->'record_schema' else record_schema end,
         initial_homework = case when p_group_patch ? 'initial_homework'
           then nullif(p_group_patch->>'initial_homework', '') else initial_homework end,
         initial_next_plan = case when p_group_patch ? 'initial_next_plan'
           then nullif(p_group_patch->>'initial_next_plan', '') else initial_next_plan end,
         teacher_id = case when p_group_patch ? 'teacher_id'
           then nullif(p_group_patch->>'teacher_id', '') else teacher_id end,
         teacher_type = case when p_group_patch ? 'teacher_type'
           then coalesce(nullif(p_group_patch->>'teacher_type', ''), teacher_type)
           else teacher_type end,
         teacher_user_id = case when p_group_patch ? 'teacher_user_id'
           then nullif(p_group_patch->>'teacher_user_id', '')::uuid else teacher_user_id end,
         student_ids = case when p_group_patch ? 'student_ids'
           then coalesce(p_group_patch->'student_ids', '[]'::jsonb) else student_ids end,
         assistant_ids = case when p_group_patch ? 'assistant_ids'
           then coalesce(p_group_patch->'assistant_ids', '[]'::jsonb) else assistant_ids end,
         weekdays = case when p_group_patch ? 'weekdays'
           then coalesce(p_group_patch->'weekdays', '[]'::jsonb) else weekdays end,
         start_time = case when p_group_patch ? 'start_time'
           then nullif(p_group_patch->>'start_time', '') else start_time end,
         end_time = case when p_group_patch ? 'end_time'
           then nullif(p_group_patch->>'end_time', '') else end_time end,
         room = case when p_group_patch ? 'room'
           then nullif(p_group_patch->>'room', '') else room end,
         start_date = case when p_group_patch ? 'start_date'
           then nullif(p_group_patch->>'start_date', '')::date else start_date end,
         end_date = case when p_group_patch ? 'end_date'
           then nullif(p_group_patch->>'end_date', '')::date else end_date end,
         billing_mode = case when p_group_patch ? 'billing_mode'
           then coalesce(nullif(p_group_patch->>'billing_mode', ''), billing_mode)
           else billing_mode end,
         default_billing = case when p_group_patch ? 'default_billing'
           then coalesce(p_group_patch->'default_billing', '{}'::jsonb) else default_billing end,
         student_billings = case when p_group_patch ? 'student_billings'
           then coalesce(p_group_patch->'student_billings', '{}'::jsonb) else student_billings end,
         fee_policy = case when p_group_patch ? 'fee_policy'
           then coalesce(nullif(p_group_patch->>'fee_policy', ''), fee_policy)
           else fee_policy end,
         additional_fee_type = case when p_group_patch ? 'additional_fee_type'
           then coalesce(nullif(p_group_patch->>'additional_fee_type', ''), additional_fee_type)
           else additional_fee_type end,
         additional_fee_amount = case when p_group_patch ? 'additional_fee_amount'
           then coalesce((p_group_patch->>'additional_fee_amount')::integer, 0)
           else additional_fee_amount end,
         memo = case when p_group_patch ? 'memo'
           then nullif(p_group_patch->>'memo', '') else memo end,
         status = case when p_group_patch ? 'status'
           then coalesce(nullif(p_group_patch->>'status', ''), status) else status end,
         updated_at = now()
   where id = p_class_group_id
   returning * into v_group;

  if cardinality(v_old_rule_ids) > 0 then
    update public.class_schedule_rules
       set is_active = false,
           updated_at = now()
     where id = any(v_old_rule_ids);
  end if;

  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    insert into public.class_schedule_rules (
      academy_id,
      class_group_id,
      day_of_week,
      start_time,
      end_time,
      teacher_user_id,
      assistant_ids,
      room,
      is_active,
      effective_start_date,
      effective_end_date
    ) values (
      p_academy_id,
      p_class_group_id,
      (v_rule->>'day_of_week')::smallint,
      v_rule->>'start_time',
      v_rule->>'end_time',
      nullif(v_rule->>'teacher_user_id', '')::uuid,
      coalesce(v_rule->'assistant_ids', '[]'::jsonb),
      nullif(v_rule->>'room', ''),
      true,
      v_effective_from,
      null
    )
    returning id into v_new_rule_id;
    v_new_rule_ids := array_append(v_new_rule_ids, v_new_rule_id);
  end loop;

  if cardinality(v_old_rule_ids) > 0 then
    -- 같은 요일이 새 규칙에도 남아 있으면 기존 미래 회차 ID를 새 규칙으로
    -- 넘긴다. 시간·담당·강의실은 새 값으로 바꾸되 회차에 연결된 기록은 유지된다.
    -- 과거에 같은 요일 규칙이 중복된 경우에는 가장 최근 규칙 한 개만 승계한다.
    update public.class_sessions cs
       set schedule_rule_id = new_rule.id,
           occurrence_date = coalesce(cs.occurrence_date, cs.date),
           start_time = case when cs.session_exception_id is not null
             then cs.start_time else new_rule.start_time end,
           end_time = case when cs.session_exception_id is not null
             then cs.end_time else new_rule.end_time end,
           room = coalesce(new_rule.room, v_group.room),
           teacher_id = v_group.teacher_id,
           teacher_type = v_group.teacher_type,
           teacher_user_id = case when cs.session_exception_id is not null
             then cs.teacher_user_id
             else coalesce(new_rule.teacher_user_id, v_group.teacher_user_id) end,
           assistant_ids = case when cs.session_exception_id is not null
             then cs.assistant_ids
             else coalesce(new_rule.assistant_ids, v_group.assistant_ids, '[]'::jsonb) end,
           student_ids = coalesce(v_group.student_ids, '[]'::jsonb),
           record_schema = coalesce(cs.record_schema, v_group.record_schema),
           activity_type = coalesce(cs.activity_type, v_group.activity_type),
           activity_name = coalesce(cs.activity_name, v_group.activity_name),
           updated_at = now()
      from public.class_schedule_rules new_rule
     where new_rule.id = any(v_new_rule_ids)
       and cs.class_group_id = p_class_group_id
       and coalesce(cs.occurrence_date, cs.date) >= v_effective_from
       and cs.schedule_rule_id = (
         select old_rule.id
           from public.class_schedule_rules old_rule
          where old_rule.id = any(v_old_rule_ids)
            and old_rule.day_of_week = new_rule.day_of_week
          order by old_rule.created_at desc, old_rule.id
          limit 1
       )
       and (
         cs.status in ('scheduled', 'rescheduled')
         or (cs.status = 'canceled' and cs.canceled_by_schedule_exception = true)
       );

    -- 새 규칙에서 빠진 요일이나 과거 중복 규칙의 미래 회차는 삭제하지 않고
    -- 취소한다. 완료 회차와 과거 회차는 절대 변경하지 않는다.
    update public.class_sessions
       set status = 'canceled',
           canceled_by_schedule_exception = false,
           updated_at = now()
     where class_group_id = p_class_group_id
       and schedule_rule_id = any(v_old_rule_ids)
       and coalesce(occurrence_date, date) >= v_effective_from
       and status in ('scheduled', 'rescheduled');

    -- SQL 046 이전에 생성되어 규칙 ID가 없는 미래 회차는 이전 규칙 자연키와
    -- 일치하고, 같은 자연키의 새 규칙도 없고, 연결 기록도 없을 때만 취소한다.
    update public.class_sessions cs
       set status = 'canceled',
           updated_at = now()
     where cs.class_group_id = p_class_group_id
       and cs.schedule_rule_id is null
       and cs.date >= v_effective_from
       and cs.status in ('scheduled', 'rescheduled')
       and exists (
         select 1
           from public.class_schedule_rules old_rule
          where old_rule.id = any(v_old_rule_ids)
            and old_rule.day_of_week = extract(dow from cs.date)::smallint
            and left(old_rule.start_time, 5) = left(coalesce(cs.start_time, ''), 5)
       )
       and not exists (
         select 1
           from public.class_schedule_rules new_rule
          where new_rule.id = any(v_new_rule_ids)
            and new_rule.day_of_week = extract(dow from cs.date)::smallint
            and left(new_rule.start_time, 5) = left(coalesce(cs.start_time, ''), 5)
       )
       and not exists (
         select 1 from public.lesson_records lr where lr.class_session_id = cs.id
       )
       and not exists (
         select 1 from public.attendance_records ar where ar.class_session_id = cs.id
       )
       and not exists (
         select 1 from public.clinic_records cr where cr.class_session_id = cs.id
       );
  end if;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'rules', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.day_of_week)
        from public.class_schedule_rules r
       where r.id = any(v_new_rule_ids)
    ), '[]'::jsonb),
    'deactivated_rule_count', cardinality(v_old_rule_ids),
    'effective_from', v_effective_from
  );
end;
$$;

revoke all on function public.update_class_group_with_rules(uuid, uuid, jsonb, jsonb, date)
  from public;
grant execute on function public.update_class_group_with_rules(uuid, uuid, jsonb, jsonb, date)
  to authenticated;

comment on function public.update_class_group_with_rules(uuid, uuid, jsonb, jsonb, date) is
  '반 정보, 반복 규칙 교체, 이전 미래 회차 취소를 한 트랜잭션으로 처리한다.';

notify pgrst, 'reload schema';
