# Supabase 최종 마이그레이션 체크리스트 (001 ~ 008)

> 실제 학원 파일럿 도입 직전 점검용 통합 체크리스트.
> 보다 자세한 안내는 [supabase-migration-checklist.md](./supabase-migration-checklist.md) 와
> [`/supabase/README.md`](../supabase/README.md) 참고.

각 파일은 **순서대로 한 번씩** 실행하면 됩니다. 모두 `add column if not exists` /
`create table if not exists` / `create or replace function` 형태라 재실행도 안전합니다.

`Success. No rows returned` 가 뜨면 정상.

---

## 실행 흐름

1. Supabase Dashboard → SQL Editor → **New query**
2. `supabase/sql/00X_*.sql` 파일을 하나씩 열어 전체 복사 → 붙여넣기 → Run
3. 각 단계 끝나면 아래 검증 SQL 을 한 번 실행해 결과 확인

---

## 001_workspace_schema.sql

**목적**: 계정·학원·멤버 핵심 스키마 + RLS 인프라 (security definer 헬퍼 포함).

**만들어지는 것**:
- 테이블: `profiles`, `academies`, `academy_members`
- 함수: `set_updated_at()`, `is_owner_of_academy(uuid)`, `is_member_of_academy(uuid)`
- 모든 테이블에 RLS enable + 기본 정책

**검증 SQL**:
```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','academies','academy_members')
order by table_name;
-- 3행

select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('set_updated_at','is_owner_of_academy','is_member_of_academy')
order by proname;
-- 3행
```

---

## 002_domain_schema.sql

**목적**: 도메인 8개 테이블 + mode 기반 dual-scope RLS (학원/개인 동시 사용).

**만들어지는 것**:
- 테이블: `students`, `class_groups`, `class_sessions`, `lesson_records`,
  `attendance_records`, `clinic_records`, `payments`, `payrolls`,
  `exam_results`, `student_events`
- 각 테이블 RLS + (academy / private) 분기 정책

**검증 SQL**:
```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'students','class_groups','class_sessions','lesson_records',
    'attendance_records','clinic_records','payments','payrolls',
    'exam_results','student_events'
  )
order by table_name;
-- 10행

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'students','class_groups','class_sessions','lesson_records',
    'attendance_records','clinic_records','payments','payrolls',
    'exam_results','student_events'
  );
-- 10행, 모두 rowsecurity = true
```

---

## 003_account_type_and_invitations.sql

**목적**: 계정 유형 (tutor/owner/teacher/assistant) 구분 + 초대 시스템.

**만들어지는 것**:
- `profiles.account_type text` 컬럼
- `academy_invitations` 테이블 + RLS (pending/accepted/canceled)

**검증 SQL**:
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='profiles'
  and column_name='account_type';
-- 1행

select table_name from information_schema.tables
where table_schema='public' and table_name='academy_invitations';
-- 1행
```

---

## 004_profiles_staff_and_delete_policies.sql

**목적**: 학원 멤버 프로필 (display_name 등) + 강사 권한/직군 메타 + 학원 삭제 정책.

**만들어지는 것**:
- `profiles.display_name`, `profiles.phone` 컬럼 추가
- `academy_staff_profiles` 테이블 + RLS
- `list_academy_member_profiles(p_academy_id uuid)` 함수
- `academies` 에 delete 정책 (owner 본인만)

**검증 SQL**:
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='profiles'
  and column_name in ('display_name','phone')
order by column_name;
-- 2행

select table_name from information_schema.tables
where table_schema='public' and table_name='academy_staff_profiles';
-- 1행

select proname from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and proname='list_academy_member_profiles';
-- 1행
```

---

## 005_accept_invitation_rpc.sql

**목적**: 초대 수락 RPC — pending invitation → academy_members 자동 변환.

**만들어지는 것**:
- `accept_academy_invitation(p_invitation_id uuid)` security definer 함수

**검증 SQL**:
```sql
select proname, prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and proname='accept_academy_invitation';
-- 1행, prosecdef=true
```

---

## 006_staff_operations.sql

**목적**: 근무표 / 권한·범위 / 대체 강사. Phase 30/31 운영 기능 지원.

**만들어지는 것**:
- 테이블 `academy_staff_shifts` + index + updated_at trigger + RLS
- `academy_staff_profiles.permissions jsonb`, `academy_staff_profiles.scope jsonb`
- `class_sessions.substitute_teacher_user_id uuid`, `class_sessions.substitute_reason text`

**검증 SQL**:
```sql
select table_name from information_schema.tables
where table_schema='public' and table_name='academy_staff_shifts';
-- 1행

select column_name from information_schema.columns
where table_schema='public' and table_name='academy_staff_profiles'
  and column_name in ('permissions','scope')
order by column_name;
-- 2행

select column_name from information_schema.columns
where table_schema='public' and table_name='class_sessions'
  and column_name in ('substitute_teacher_user_id','substitute_reason')
order by column_name;
-- 2행
```

---

## 007_profile_search_rpc.sql

**목적**: 강사 초대 시 이메일로 계정 조회 (profiles RLS 우회).

**만들어지는 것**:
- `search_profile_by_email(p_email text)` security definer 함수

**검증 SQL**:
```sql
select proname, prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and proname='search_profile_by_email';
-- 1행, prosecdef=true
```

---

## 008_assistant_assignment.sql

**목적**: 반·회차에 보조강사 배정 영속화 (다른 기기에서도 동일하게 보이도록).

**만들어지는 것**:
- `class_groups.assistant_ids jsonb default '[]'::jsonb`
- `class_sessions.assistant_ids jsonb default '[]'::jsonb`

**검증 SQL**:
```sql
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema='public'
  and table_name in ('class_groups','class_sessions')
  and column_name='assistant_ids'
order by table_name;
-- 2행, data_type=jsonb, column_default='[]'::jsonb
```

---

## 전체 적용 후 한 줄 확인

```sql
select 'tables' as kind, count(*) as n
from information_schema.tables
where table_schema='public'
  and table_name in (
    'profiles','academies','academy_members','academy_invitations',
    'academy_staff_profiles','academy_staff_shifts',
    'students','class_groups','class_sessions','lesson_records',
    'attendance_records','clinic_records','payments','payrolls',
    'exam_results','student_events'
  )
union all
select 'functions', count(*)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and proname in (
    'set_updated_at','is_owner_of_academy','is_member_of_academy',
    'accept_academy_invitation','list_academy_member_profiles',
    'search_profile_by_email'
  );
-- tables=16, functions=6
```

---

## 재실행이 안전한 이유

- 모든 SQL 은 `if not exists` / `or replace` / `drop policy if exists` 패턴 사용.
- 절대 `drop table`, `delete`, `truncate` 를 포함하지 않음.
- 컬럼 default 는 `'[]'::jsonb` 같이 null-safe.
- 정책 재실행은 정책 객체만 교체하고 데이터는 건드리지 않음.

문제가 생긴 경우, 어느 단계에서 실패했는지 확인 후 그 파일만 다시 실행하면 됩니다.

## 보안 원칙

- 프론트는 **anon key** 만 사용 (`.env` 의 `VITE_SUPABASE_ANON_KEY`).
- `service_role` 키는 절대 클라이언트에 노출하지 않음.
- 모든 도메인 테이블 접근은 RLS 통과 후에만 가능.
- security definer 함수는 모두 입력 검증 (academy 멤버십 확인) 포함.
