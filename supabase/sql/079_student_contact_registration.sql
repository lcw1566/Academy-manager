-- 학생 연락처의 '등록'과 '조회/수정' 권한을 분리한다.
--
-- canManageStudents 사용자는 신규 학생을 등록할 때 연락처를 함께 전달할 수 있다.
-- 저장 직후부터 조회 결과는 SQL 075의 secure RPC에서 계속 마스킹되며,
-- 기존 학생의 연락처 수정은 canManageStudentContacts 권한이 있어야 한다.

begin;

create or replace function public.enforce_student_contact_write_permission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contacts_changed boolean;
  v_can_register_contacts boolean := false;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  if new.mode = 'private' then
    if new.user_id is distinct from auth.uid() then
      raise exception '개인 학생 연락처를 변경할 권한이 없어요.' using errcode = '42501';
    end if;
    return new;
  end if;

  v_contacts_changed := tg_op = 'INSERT'
    and num_nonnulls(new.phone, new.parent_phone, new.parent_name, new.parent_title,
      new.parent_title_custom, new.checkin_pin) > 0;
  if tg_op = 'UPDATE' then
    v_contacts_changed := row(
      new.phone, new.parent_phone, new.parent_name, new.parent_title,
      new.parent_title_custom, new.checkin_pin
    ) is distinct from row(
      old.phone, old.parent_phone, old.parent_name, old.parent_title,
      old.parent_title_custom, old.checkin_pin
    );
  end if;

  -- 신규 등록에 한해서만 학생 관리 권한을 연락처 입력 권한으로 인정한다.
  -- has_academy_permission은 active 멤버십과 서버 저장 권한을 다시 확인한다.
  v_can_register_contacts := tg_op = 'INSERT'
    and new.mode = 'academy'
    and new.academy_id is not null
    and (
      public.is_owner_of_academy(new.academy_id)
      or public.has_academy_permission(new.academy_id, 'canManageStudents')
    );

  if v_contacts_changed
     and not v_can_register_contacts
     and not public.can_manage_student_contacts(new.academy_id) then
    raise exception '학생·보호자 연락처를 변경할 권한이 없어요.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_student_contact_write_permission on public.students;
create trigger enforce_student_contact_write_permission
before insert or update of phone, parent_phone, parent_name, parent_title, parent_title_custom, checkin_pin
on public.students
for each row execute function public.enforce_student_contact_write_permission();

commit;
