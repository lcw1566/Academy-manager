-- Seenit — 반 생성과 반복 규칙 원자적 저장
--
-- 반을 localStorage에 먼저 만든 뒤 class_groups / class_schedule_rules를 따로
-- 저장하던 흐름을 대체한다. 반과 모든 반복 규칙이 함께 성공하거나 함께
-- 롤백되며, 클라이언트가 만든 UUID를 사용해 응답 유실 후 재시도해도 같은 반을
-- 중복 생성하지 않는다.

create or replace function public.create_class_group_with_rules(
  p_academy_id uuid,
  p_class_group_id uuid,
  p_group jsonb,
  p_rules jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group public.class_groups%rowtype;
  v_rule jsonb;
  v_rule_ids uuid[] := '{}'::uuid[];
  v_rule_id uuid;
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
    raise exception '반을 만들 권한이 없어요.' using errcode = '42501';
  end if;

  if p_group is null or jsonb_typeof(p_group) <> 'object' then
    raise exception '반 정보 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception '수업 규칙 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  if nullif(btrim(p_group->>'name'), '') is null then
    raise exception '반 이름이 필요해요.' using errcode = '22023';
  end if;

  -- 회차 실체화 및 규칙 수정과 같은 학원 단위 잠금을 사용한다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 0));

  -- 같은 클라이언트 요청이 응답 유실로 다시 들어오면 기존 결과를 반환한다.
  select *
    into v_group
    from public.class_groups
   where id = p_class_group_id
   for update;

  if found then
    if v_group.academy_id <> p_academy_id or v_group.mode <> 'academy' then
      raise exception '반 생성 요청을 다시 확인해주세요.' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'rules', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.day_of_week)
          from public.class_schedule_rules r
         where r.class_group_id = p_class_group_id
           and r.academy_id = p_academy_id
           and r.is_active = true
      ), '[]'::jsonb),
      'replayed', true
    );
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

  v_effective_from := greatest(
    coalesce(nullif(p_group->>'start_date', '')::date, (now() at time zone 'Asia/Seoul')::date),
    (now() at time zone 'Asia/Seoul')::date
  );

  insert into public.class_groups (
    id,
    academy_id,
    user_id,
    mode,
    name,
    subject,
    level,
    activity_type,
    activity_name,
    record_blocks,
    record_schema,
    initial_homework,
    initial_next_plan,
    teacher_id,
    teacher_type,
    teacher_user_id,
    student_ids,
    assistant_ids,
    weekdays,
    start_time,
    end_time,
    room,
    start_date,
    end_date,
    billing_mode,
    default_billing,
    student_billings,
    fee_policy,
    additional_fee_type,
    additional_fee_amount,
    memo,
    status
  ) values (
    p_class_group_id,
    p_academy_id,
    auth.uid(),
    'academy',
    btrim(p_group->>'name'),
    nullif(p_group->>'subject', ''),
    nullif(p_group->>'level', ''),
    coalesce(nullif(p_group->>'activity_type', ''), 'regular_class'),
    nullif(p_group->>'activity_name', ''),
    coalesce(p_group->'record_blocks', '[]'::jsonb),
    p_group->'record_schema',
    nullif(p_group->>'initial_homework', ''),
    nullif(p_group->>'initial_next_plan', ''),
    nullif(p_group->>'teacher_id', ''),
    coalesce(nullif(p_group->>'teacher_type', ''), 'teacher'),
    nullif(p_group->>'teacher_user_id', '')::uuid,
    coalesce(p_group->'student_ids', '[]'::jsonb),
    coalesce(p_group->'assistant_ids', '[]'::jsonb),
    coalesce(p_group->'weekdays', '[]'::jsonb),
    nullif(p_group->>'start_time', ''),
    nullif(p_group->>'end_time', ''),
    nullif(p_group->>'room', ''),
    nullif(p_group->>'start_date', '')::date,
    nullif(p_group->>'end_date', '')::date,
    coalesce(nullif(p_group->>'billing_mode', ''), 'same'),
    coalesce(p_group->'default_billing', '{}'::jsonb),
    coalesce(p_group->'student_billings', '{}'::jsonb),
    coalesce(nullif(p_group->>'fee_policy', ''), 'included'),
    coalesce(nullif(p_group->>'additional_fee_type', ''), 'monthly'),
    coalesce((p_group->>'additional_fee_amount')::integer, 0),
    nullif(p_group->>'memo', ''),
    coalesce(nullif(p_group->>'status', ''), 'active')
  )
  returning * into v_group;

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
    returning id into v_rule_id;
    v_rule_ids := array_append(v_rule_ids, v_rule_id);
  end loop;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'rules', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.day_of_week)
        from public.class_schedule_rules r
       where r.id = any(v_rule_ids)
    ), '[]'::jsonb),
    'replayed', false
  );
end;
$$;

revoke all on function public.create_class_group_with_rules(uuid, uuid, jsonb, jsonb)
  from public;
grant execute on function public.create_class_group_with_rules(uuid, uuid, jsonb, jsonb)
  to authenticated;

comment on function public.create_class_group_with_rules(uuid, uuid, jsonb, jsonb) is
  '반과 반복 수업 규칙을 클라이언트 UUID 기준으로 원자적·멱등 생성한다.';

notify pgrst, 'reload schema';
