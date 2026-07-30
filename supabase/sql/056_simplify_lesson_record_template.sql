-- Seenit — 수업 기록 기본 양식 간소화
--
-- 1) 진도(progress)를 수업 내용(content)에 병합한다.
-- 2) 기존 반/회차의 직접 만든 항목은 그대로 보존한다.
-- 3) 새 반의 기본 양식은 꼭 필요한 5개 항목만 사용한다.

begin;

alter table public.class_groups
  alter column record_blocks set default
    '["content","homework","next_plan","student_memo","support"]'::jsonb;

-- 기존 문자열형 record_blocks에서 progress를 content로 바꾸고 중복을 제거한다.
with normalized_items as (
  select
    class_group.id,
    case when block.value = 'progress' then 'content' else block.value end as block_id,
    min(block.ordinality) as first_position
  from public.class_groups as class_group
  cross join lateral jsonb_array_elements_text(class_group.record_blocks)
    with ordinality as block(value, ordinality)
  where jsonb_typeof(class_group.record_blocks) = 'array'
  group by
    class_group.id,
    case when block.value = 'progress' then 'content' else block.value end
),
normalized as (
  select
    id,
    jsonb_agg(to_jsonb(block_id) order by first_position) as record_blocks
  from normalized_items
  group by id
)
update public.class_groups as class_group
set record_blocks = normalized.record_blocks
from normalized
where class_group.id = normalized.id;

-- 객체/문자열이 섞인 record_schema도 같은 규칙으로 정리한다.
with normalized_elements as (
  select
    class_group.id,
    element.ordinality,
    case
      when jsonb_typeof(element.value) = 'string'
        and element.value #>> '{}' = 'progress'
        then '"content"'::jsonb
      when jsonb_typeof(element.value) = 'object'
        and element.value ->> 'id' = 'progress'
        then element.value || jsonb_build_object(
          'id', 'content',
          'label', '수업 내용',
          'type', 'long_text',
          'scope', 'common',
          'system', true
        )
      else element.value
    end as value
  from public.class_groups as class_group
  cross join lateral jsonb_array_elements(class_group.record_schema)
    with ordinality as element(value, ordinality)
  where jsonb_typeof(class_group.record_schema) = 'array'
),
deduplicated as (
  select
    id,
    value,
    ordinality,
    row_number() over (
      partition by id, coalesce(value ->> 'id', value #>> '{}')
      order by ordinality
    ) as duplicate_order
  from normalized_elements
),
rebuilt as (
  select id, jsonb_agg(value order by ordinality) as record_schema
  from deduplicated
  where duplicate_order = 1
  group by id
)
update public.class_groups as class_group
set record_schema = rebuilt.record_schema
from rebuilt
where class_group.id = rebuilt.id;

with normalized_elements as (
  select
    session.id,
    element.ordinality,
    case
      when jsonb_typeof(element.value) = 'string'
        and element.value #>> '{}' = 'progress'
        then '"content"'::jsonb
      when jsonb_typeof(element.value) = 'object'
        and element.value ->> 'id' = 'progress'
        then element.value || jsonb_build_object(
          'id', 'content',
          'label', '수업 내용',
          'type', 'long_text',
          'scope', 'common',
          'system', true
        )
      else element.value
    end as value
  from public.class_sessions as session
  cross join lateral jsonb_array_elements(session.record_schema)
    with ordinality as element(value, ordinality)
  where jsonb_typeof(session.record_schema) = 'array'
),
deduplicated as (
  select
    id,
    value,
    ordinality,
    row_number() over (
      partition by id, coalesce(value ->> 'id', value #>> '{}')
      order by ordinality
    ) as duplicate_order
  from normalized_elements
),
rebuilt as (
  select id, jsonb_agg(value order by ordinality) as record_schema
  from deduplicated
  where duplicate_order = 1
  group by id
)
update public.class_sessions as session
set record_schema = rebuilt.record_schema
from rebuilt
where session.id = rebuilt.id;

-- 사용자가 직접 구성하지 않은 과거 기본 양식만 새 기본 양식으로 줄인다.
-- 직접 만든 항목이 있거나 일부 항목을 골라 쓴 양식은 건드리지 않는다.
update public.class_groups
set record_blocks = '["content","homework","next_plan","student_memo","support"]'::jsonb
where jsonb_array_length(record_blocks) = 7
  and record_blocks @> '[
    "content",
    "homework",
    "next_plan",
    "teacher_memo",
    "student_evaluation",
    "student_memo",
    "support"
  ]'::jsonb;

with default_schemas as (
  select schema_owner.id
  from public.class_groups as schema_owner
  cross join lateral jsonb_array_elements(schema_owner.record_schema) as element(value)
  where jsonb_typeof(schema_owner.record_schema) = 'array'
  group by schema_owner.id
  having count(*) = 7
    and bool_and(
      coalesce(element.value ->> 'id', element.value #>> '{}') in (
        'content',
        'homework',
        'next_plan',
        'teacher_memo',
        'student_evaluation',
        'student_memo',
        'support'
      )
    )
)
update public.class_groups as class_group
set record_schema = '[
  {"id":"content","type":"long_text","label":"수업 내용","scope":"common","system":true},
  {"id":"homework","type":"short_text","label":"공통 숙제","scope":"common","system":true},
  {"id":"next_plan","type":"short_text","label":"다음 계획","scope":"common","system":true},
  {"id":"student_memo","type":"long_text","label":"학생 메모","scope":"student","system":true},
  {"id":"support","type":"support","label":"보완 항목","scope":"student","system":true}
]'::jsonb
from default_schemas
where class_group.id = default_schemas.id;

with default_schemas as (
  select schema_owner.id
  from public.class_sessions as schema_owner
  cross join lateral jsonb_array_elements(schema_owner.record_schema) as element(value)
  where jsonb_typeof(schema_owner.record_schema) = 'array'
  group by schema_owner.id
  having count(*) = 7
    and bool_and(
      coalesce(element.value ->> 'id', element.value #>> '{}') in (
        'content',
        'homework',
        'next_plan',
        'teacher_memo',
        'student_evaluation',
        'student_memo',
        'support'
      )
    )
)
update public.class_sessions as session
set record_schema = '[
  {"id":"content","type":"long_text","label":"수업 내용","scope":"common","system":true},
  {"id":"homework","type":"short_text","label":"공통 숙제","scope":"common","system":true},
  {"id":"next_plan","type":"short_text","label":"다음 계획","scope":"common","system":true},
  {"id":"student_memo","type":"long_text","label":"학생 메모","scope":"student","system":true},
  {"id":"support","type":"support","label":"보완 항목","scope":"student","system":true}
]'::jsonb
from default_schemas
where session.id = default_schemas.id;

-- 기존 기록 본문은 잃지 않도록 서로 다른 값만 줄바꿈으로 합친다.
update public.lesson_records
set
  common_lesson_content = case
    when nullif(btrim(common_lesson_content), '') is null
      then nullif(btrim(common_progress), '')
    when btrim(common_progress) = btrim(common_lesson_content)
      then common_lesson_content
    else concat_ws(
      E'\n',
      nullif(btrim(common_progress), ''),
      nullif(btrim(common_lesson_content), '')
    )
  end,
  common_progress = null
where nullif(btrim(common_progress), '') is not null;

commit;

notify pgrst, 'reload schema';
