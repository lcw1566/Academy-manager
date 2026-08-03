-- Seenit — 반에 종속되지 않는 클리닉 일정 + 학생별 행 기록
--
-- clinic_events: 날짜/시간/기본 과목/장소 같은 운영 단위
-- clinic_event_students: 반과 무관하게 자유롭게 구성하는 참여 학생
-- clinic_records: 기존처럼 학생 한 명당 한 행, items 배열에 여러 활동 기록

create table if not exists public.clinic_events (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references public.academies(id) on delete cascade,
  name             text not null,
  event_date       date not null,
  start_time       time,
  end_time         time,
  subject          text,
  room             text,
  class_group_id   uuid references public.class_groups(id) on delete set null,
  memo             text,
  status           text not null default 'scheduled'
                   check (status in ('scheduled', 'completed', 'cancelled')),
  created_by       uuid references auth.users(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint clinic_events_name_not_blank check (btrim(name) <> ''),
  constraint clinic_events_time_order check (
    start_time is null or end_time is null or end_time > start_time
  )
);

create table if not exists public.clinic_event_students (
  clinic_event_id  uuid not null references public.clinic_events(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  subject_override text,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  primary key (clinic_event_id, student_id)
);

alter table public.clinic_records
  add column if not exists clinic_event_id uuid
  references public.clinic_events(id) on delete set null;

create index if not exists clinic_events_academy_date_idx
  on public.clinic_events(academy_id, event_date, start_time);
create index if not exists clinic_event_students_student_idx
  on public.clinic_event_students(student_id, clinic_event_id);
create index if not exists clinic_records_clinic_event_idx
  on public.clinic_records(clinic_event_id, student_id);

-- 하나의 일정에서 학생 한 명은 items 배열을 가진 기록 한 행만 사용한다.
create unique index if not exists clinic_records_event_student_unique_idx
  on public.clinic_records(clinic_event_id, student_id)
  where clinic_event_id is not null;

drop trigger if exists set_clinic_events_updated_at on public.clinic_events;
create trigger set_clinic_events_updated_at
before update on public.clinic_events
for each row execute function public.set_updated_at();

alter table public.clinic_events enable row level security;
alter table public.clinic_event_students enable row level security;

drop policy if exists "clinic_events_select_members" on public.clinic_events;
create policy "clinic_events_select_members"
on public.clinic_events for select
using (public.is_member_of_academy(academy_id));

drop policy if exists "clinic_events_insert_by_permission" on public.clinic_events;
create policy "clinic_events_insert_by_permission"
on public.clinic_events for insert
with check (
  public.is_member_of_academy(academy_id)
  and public.has_academy_permission(academy_id, 'canEditClinicRecords')
);

drop policy if exists "clinic_events_update_by_permission" on public.clinic_events;
create policy "clinic_events_update_by_permission"
on public.clinic_events for update
using (
  public.is_member_of_academy(academy_id)
  and public.has_academy_permission(academy_id, 'canEditClinicRecords')
)
with check (
  public.is_member_of_academy(academy_id)
  and public.has_academy_permission(academy_id, 'canEditClinicRecords')
);

drop policy if exists "clinic_events_delete_by_permission" on public.clinic_events;
create policy "clinic_events_delete_by_permission"
on public.clinic_events for delete
using (
  public.is_member_of_academy(academy_id)
  and public.has_academy_permission(academy_id, 'canEditClinicRecords')
);

drop policy if exists "clinic_event_students_select_members" on public.clinic_event_students;
create policy "clinic_event_students_select_members"
on public.clinic_event_students for select
using (
  exists (
    select 1
    from public.clinic_events event
    where event.id = clinic_event_id
      and public.is_member_of_academy(event.academy_id)
  )
);

drop policy if exists "clinic_event_students_insert_by_permission" on public.clinic_event_students;
create policy "clinic_event_students_insert_by_permission"
on public.clinic_event_students for insert
with check (
  exists (
    select 1
    from public.clinic_events event
    where event.id = clinic_event_id
      and public.has_academy_permission(event.academy_id, 'canEditClinicRecords')
  )
);

drop policy if exists "clinic_event_students_update_by_permission" on public.clinic_event_students;
create policy "clinic_event_students_update_by_permission"
on public.clinic_event_students for update
using (
  exists (
    select 1
    from public.clinic_events event
    where event.id = clinic_event_id
      and public.has_academy_permission(event.academy_id, 'canEditClinicRecords')
  )
)
with check (
  exists (
    select 1
    from public.clinic_events event
    where event.id = clinic_event_id
      and public.has_academy_permission(event.academy_id, 'canEditClinicRecords')
  )
);

drop policy if exists "clinic_event_students_delete_by_permission" on public.clinic_event_students;
create policy "clinic_event_students_delete_by_permission"
on public.clinic_event_students for delete
using (
  exists (
    select 1
    from public.clinic_events event
    where event.id = clinic_event_id
      and public.has_academy_permission(event.academy_id, 'canEditClinicRecords')
  )
);

grant select, insert, update, delete on public.clinic_events to authenticated;
grant select, insert, update, delete on public.clinic_event_students to authenticated;

create or replace function public.save_academy_clinic_event(
  p_event_id uuid,
  p_academy_id uuid,
  p_name text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_subject text,
  p_room text,
  p_class_group_id uuid,
  p_memo text,
  p_participants jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_id uuid := coalesce(p_event_id, gen_random_uuid());
begin
  if not public.is_member_of_academy(p_academy_id)
     or not public.has_academy_permission(p_academy_id, 'canEditClinicRecords') then
    raise exception '클리닉 일정을 관리할 권한이 없습니다.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception '클리닉 일정 이름이 필요합니다.' using errcode = '22023';
  end if;
  if p_event_date is null then
    raise exception '클리닉 날짜가 필요합니다.' using errcode = '22023';
  end if;
  if p_start_time is not null and p_end_time is not null and p_end_time <= p_start_time then
    raise exception '종료 시간은 시작 시간보다 늦어야 합니다.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_participants, '[]'::jsonb)) <> 'array' then
    raise exception '참여 학생 정보가 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_class_group_id is not null and not exists (
    select 1 from public.class_groups group_row
    where group_row.id = p_class_group_id
      and group_row.academy_id = p_academy_id
  ) then
    raise exception '다른 학원의 반은 연결할 수 없습니다.' using errcode = '23503';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_participants, '[]'::jsonb)) participant
    left join public.students student
      on student.id = nullif(participant->>'student_id', '')::uuid
    where student.id is null
       or student.academy_id <> p_academy_id
       or student.mode <> 'academy'
  ) then
    raise exception '다른 학원의 학생은 추가할 수 없습니다.' using errcode = '23503';
  end if;

  insert into public.clinic_events (
    id, academy_id, name, event_date, start_time, end_time,
    subject, room, class_group_id, memo, created_by
  ) values (
    v_event_id, p_academy_id, btrim(p_name), p_event_date, p_start_time, p_end_time,
    nullif(btrim(coalesce(p_subject, '')), ''),
    nullif(btrim(coalesce(p_room, '')), ''),
    p_class_group_id,
    nullif(btrim(coalesce(p_memo, '')), ''),
    auth.uid()
  )
  on conflict (id) do update set
    name = excluded.name,
    event_date = excluded.event_date,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    subject = excluded.subject,
    room = excluded.room,
    class_group_id = excluded.class_group_id,
    memo = excluded.memo
  where clinic_events.academy_id = p_academy_id;

  if not exists (
    select 1 from public.clinic_events
    where id = v_event_id and academy_id = p_academy_id
  ) then
    raise exception '클리닉 일정을 찾지 못했습니다.' using errcode = 'P0002';
  end if;

  delete from public.clinic_event_students where clinic_event_id = v_event_id;
  insert into public.clinic_event_students (
    clinic_event_id, student_id, subject_override, sort_order
  )
  select distinct on (student_id)
    v_event_id,
    student_id,
    subject_override,
    sort_order
  from (
    select
      nullif(participant->>'student_id', '')::uuid as student_id,
      nullif(btrim(coalesce(participant->>'subject', '')), '') as subject_override,
      (ordinality - 1)::integer as sort_order
    from jsonb_array_elements(coalesce(p_participants, '[]'::jsonb))
      with ordinality as rows(participant, ordinality)
  ) normalized
  where student_id is not null
  order by student_id, sort_order;

  return v_event_id;
end;
$$;

grant execute on function public.save_academy_clinic_event(
  uuid, uuid, text, date, time, time, text, text, uuid, text, jsonb
) to authenticated;

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array['clinic_events', 'clinic_event_students']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table_name);
    end if;
  end loop;
end $$;

