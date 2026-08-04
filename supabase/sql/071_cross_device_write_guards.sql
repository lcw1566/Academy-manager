-- Seenit — 계정·기기 간 동시 수정 보호
--
-- 1) 반과 반복 규칙 수정 전에 프런트가 읽은 class_groups.updated_at을 확인한다.
-- 2) 한 회차의 학생 출석을 묶음으로 저장하되, 모든 행의 updated_at이 일치할
--    때만 한 트랜잭션으로 반영한다. 한 행이라도 충돌하면 전체가 롤백된다.

create or replace function public.update_class_group_with_rules_guarded(
  p_academy_id uuid,
  p_class_group_id uuid,
  p_group_patch jsonb,
  p_rules jsonb,
  p_effective_from date,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  -- 기존 SQL 047과 같은 학원 단위 잠금을 잡은 뒤 버전을 검사한다. 이후 호출하는
  -- 원자 수정 함수도 같은 잠금을 사용하므로 새 클라이언트끼리 검사-수정 사이에
  -- 다른 반 수정이 끼어들 수 없다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 0));

  select updated_at
    into v_updated_at
    from public.class_groups
   where id = p_class_group_id
     and academy_id = p_academy_id
     and mode = 'academy'
   for update;

  if not found then
    raise exception '수정할 반을 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is null or v_updated_at is distinct from p_expected_updated_at then
    raise exception '다른 기기에서 이 반을 먼저 수정했어요.' using errcode = '40001';
  end if;

  return public.update_class_group_with_rules(
    p_academy_id,
    p_class_group_id,
    p_group_patch,
    p_rules,
    p_effective_from
  );
end;
$$;

revoke all on function public.update_class_group_with_rules_guarded(
  uuid, uuid, jsonb, jsonb, date, timestamptz
) from public;
grant execute on function public.update_class_group_with_rules_guarded(
  uuid, uuid, jsonb, jsonb, date, timestamptz
) to authenticated;

create or replace function public.save_attendance_records_guarded(
  p_academy_id uuid,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record jsonb;
  v_saved public.attendance_records%rowtype;
  v_saved_rows jsonb := '[]'::jsonb;
  v_session_id uuid;
  v_student_id uuid;
  v_group_id uuid;
  v_expected_updated_at timestamptz;
  v_status text;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if not (
    public.is_member_of_academy(p_academy_id)
    and public.has_academy_permission(p_academy_id, 'canEditAttendance')
  ) then
    raise exception '출석을 기록할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception '출석 기록 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  -- 같은 학원의 출석 저장끼리 직렬화해 새 행 INSERT 경쟁도 예측 가능하게 만든다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text || ':attendance', 0));

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    begin
      v_session_id := (v_record->>'class_session_id')::uuid;
      v_student_id := (v_record->>'student_id')::uuid;
      v_group_id := nullif(v_record->>'class_group_id', '')::uuid;
      v_expected_updated_at := nullif(v_record->>'expected_updated_at', '')::timestamptz;
    exception when others then
      raise exception '출석 대상 정보가 올바르지 않아요.' using errcode = '22023';
    end;

    v_status := coalesce(nullif(v_record->>'status', ''), 'absent');
    if v_status not in ('present', 'late', 'absent', 'makeup', 'excused') then
      raise exception '지원하지 않는 출석 상태예요.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.class_sessions cs
       where cs.id = v_session_id and cs.academy_id = p_academy_id and cs.mode = 'academy'
    ) or not exists (
      select 1 from public.students s
       where s.id = v_student_id and s.academy_id = p_academy_id and s.mode = 'academy'
    ) then
      raise exception '다른 학원의 수업 또는 학생은 기록할 수 없어요.' using errcode = '42501';
    end if;

    if v_expected_updated_at is null then
      begin
        insert into public.attendance_records (
          academy_id, user_id, mode, class_group_id, class_session_id, student_id,
          date, status, memo, source, checked_at,
          confirmation_state, confirmed_at, confirmed_by
        ) values (
          p_academy_id, auth.uid(), 'academy', v_group_id, v_session_id, v_student_id,
          nullif(v_record->>'date', '')::date,
          v_status,
          nullif(v_record->>'memo', ''),
          nullif(v_record->>'source', ''),
          nullif(v_record->>'checked_at', '')::timestamptz,
          coalesce(nullif(v_record->>'confirmation_state', ''), 'teacher_confirmed'),
          nullif(v_record->>'confirmed_at', '')::timestamptz,
          nullif(v_record->>'confirmed_by', '')::uuid
        )
        returning * into v_saved;
      exception when unique_violation then
        raise exception '다른 기기에서 출석을 먼저 저장했어요.' using errcode = '40001';
      end;
    else
      update public.attendance_records
         set user_id = auth.uid(),
             class_group_id = v_group_id,
             date = nullif(v_record->>'date', '')::date,
             status = v_status,
             memo = nullif(v_record->>'memo', ''),
             source = nullif(v_record->>'source', ''),
             checked_at = nullif(v_record->>'checked_at', '')::timestamptz,
             confirmation_state = coalesce(
               nullif(v_record->>'confirmation_state', ''), 'teacher_confirmed'
             ),
             confirmed_at = nullif(v_record->>'confirmed_at', '')::timestamptz,
             confirmed_by = nullif(v_record->>'confirmed_by', '')::uuid
       where academy_id = p_academy_id
         and class_session_id = v_session_id
         and student_id = v_student_id
         and updated_at = v_expected_updated_at
      returning * into v_saved;

      get diagnostics v_count = row_count;
      if v_count <> 1 then
        raise exception '다른 기기에서 출석을 먼저 수정했어요.' using errcode = '40001';
      end if;
    end if;

    v_saved_rows := v_saved_rows || jsonb_build_array(to_jsonb(v_saved));
  end loop;

  return v_saved_rows;
end;
$$;

revoke all on function public.save_attendance_records_guarded(uuid, jsonb) from public;
grant execute on function public.save_attendance_records_guarded(uuid, jsonb) to authenticated;

create or replace function public.assign_student_to_class_groups_guarded(
  p_academy_id uuid,
  p_student_id uuid,
  p_class_group_ids uuid[],
  p_effective_from date,
  p_tuition_subjects jsonb,
  p_base_tuition integer,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student public.students%rowtype;
  v_group_ids uuid[] := coalesce(p_class_group_ids, '{}'::uuid[]);
  v_valid_group_count integer;
  v_group_count integer;
  v_group_updates integer := 0;
  v_session_updates integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if not (
    public.is_member_of_academy(p_academy_id)
    and public.has_academy_permission(p_academy_id, 'canManageStudents')
  ) then
    raise exception '학생을 배정할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_effective_from is null then
    raise exception '배정 시작일이 필요해요.' using errcode = '22023';
  end if;
  if p_tuition_subjects is null or jsonb_typeof(p_tuition_subjects) <> 'array' then
    raise exception '수강 과목 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if coalesce(p_base_tuition, 0) < 0 then
    raise exception '기본 학원비는 0원 이상이어야 해요.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text || ':student-assignment', 0));

  select *
    into v_student
    from public.students
   where id = p_student_id
     and academy_id = p_academy_id
     and mode = 'academy'
   for update;
  if not found then
    raise exception '배정할 학생을 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is null or v_student.updated_at is distinct from p_expected_updated_at then
    raise exception '다른 기기에서 이 학생 정보를 먼저 수정했어요.' using errcode = '40001';
  end if;

  select count(*), count(distinct group_id)
    into v_group_count, v_valid_group_count
    from unnest(v_group_ids) as selected(group_id);
  if v_group_count <> v_valid_group_count then
    raise exception '같은 반이 중복 선택됐어요.' using errcode = '22023';
  end if;
  select count(*)
    into v_valid_group_count
    from public.class_groups cg
   where cg.id = any(v_group_ids)
     and cg.academy_id = p_academy_id
     and cg.mode = 'academy'
     and cg.status <> 'inactive';
  if v_valid_group_count <> cardinality(v_group_ids) then
    raise exception '선택한 반 중 사용할 수 없는 반이 있어요.' using errcode = '22023';
  end if;

  update public.students
     set class_group_ids = to_jsonb(v_group_ids),
         tuition_subjects = p_tuition_subjects,
         base_tuition = coalesce(p_base_tuition, 0)
   where id = p_student_id
  returning * into v_student;

  update public.class_groups cg
     set student_ids = case
       when coalesce(cg.student_ids, '[]'::jsonb) @> jsonb_build_array(p_student_id)
         then coalesce(cg.student_ids, '[]'::jsonb)
       else coalesce(cg.student_ids, '[]'::jsonb) || jsonb_build_array(p_student_id)
     end
   where cg.id = any(v_group_ids);
  get diagnostics v_group_updates = row_count;

  update public.class_sessions cs
     set student_ids = case
       when coalesce(cs.student_ids, '[]'::jsonb) @> jsonb_build_array(p_student_id)
         then coalesce(cs.student_ids, '[]'::jsonb)
       else coalesce(cs.student_ids, '[]'::jsonb) || jsonb_build_array(p_student_id)
     end
   where cs.academy_id = p_academy_id
     and cs.class_group_id = any(v_group_ids)
     and cs.status <> 'canceled'
     and coalesce(cs.occurrence_date, cs.date) >= p_effective_from;
  get diagnostics v_session_updates = row_count;

  return jsonb_build_object(
    'student', to_jsonb(v_student),
    'group_update_count', v_group_updates,
    'session_update_count', v_session_updates
  );
end;
$$;

revoke all on function public.assign_student_to_class_groups_guarded(
  uuid, uuid, uuid[], date, jsonb, integer, timestamptz
) from public;
grant execute on function public.assign_student_to_class_groups_guarded(
  uuid, uuid, uuid[], date, jsonb, integer, timestamptz
) to authenticated;

notify pgrst, 'reload schema';
