# Supabase 마이그레이션 체크리스트

`supabase/sql/` 의 SQL 파일을 **순서대로** 실행하기 위한 가이드입니다.
이미 운영 중인 프로젝트에 새 파일만 추가 실행하는 경우도 동일하게 적용됩니다.

각 파일은 **idempotent** (재실행 안전), **destructive 명령 없음** (drop table /
delete / truncate 등 없음). 프론트엔드는 **anon key 만 사용**합니다.

---

## 실행 환경

- Supabase Dashboard → SQL Editor → **New query**
- 파일 내용 전체 복사 → 붙여넣기 → **Run** (Ctrl/Cmd + Enter)
- 하단에 `Success. No rows returned` 표시 시 정상

---

## 001_workspace_schema.sql

**목적**: 계정/학원/멤버 핵심 스키마 + RLS 기반 인프라.

| 만들어지는 것 | 종류 |
| --- | --- |
| `public.profiles` | 테이블 (auth.users 와 1:1) |
| `public.academies` | 테이블 |
| `public.academy_members` | 테이블 (user × academy × role) |
| `public.set_updated_at()` | trigger 함수 |
| `public.is_member_of_academy(academy_id)` | security definer helper |
| `public.is_owner_of_academy(academy_id)` | security definer helper |
| profiles / academies / academy_members RLS | enable + 기본 정책 |

**검증 방법** (Table Editor):
- [ ] `profiles`, `academies`, `academy_members` 세 테이블 존재
- [ ] `profiles.default_role` 컬럼 존재 (default 'tutor', check 4 값)
- [ ] Database → Functions: `set_updated_at`, `is_member_of_academy`, `is_owner_of_academy` 보임
- [ ] Database → Authentication → Policies: 세 테이블에 정책 다수

---

## 002_domain_schema.sql

**의존성**: 001 의 helper 함수 (`set_updated_at`, `is_member_of_academy`,
`is_owner_of_academy`) — 반드시 001 이후 실행.

**목적**: 학생·반·세션·수업기록·출결·클리닉·수납·급여 등 10개 도메인 테이블 + RLS + GRANT.

| 만들어지는 것 | 종류 |
| --- | --- |
| `public.students` | 학원 학생 |
| `public.class_groups` | 반 |
| `public.class_sessions` | 회차 |
| `public.lesson_records` | 수업 기록 |
| `public.attendance_records` | 출결 |
| `public.clinic_records` | 클리닉 기록 |
| `public.payments` | 수납 |
| `public.payrolls` | 급여 명세 |
| 각 테이블 RLS + GRANT | "is_member_of_academy" 기반 read/write |

**검증 방법**:
- [ ] Table Editor 에 위 8개 테이블 모두 존재
- [ ] 각 테이블에 `academy_id` 컬럼 + FK 보임
- [ ] Policies 탭에서 각 테이블에 select/insert/update/delete 정책 보임

---

## 003_account_type_and_invitations.sql

**의존성**: 001.

**목적**: 회원가입 시 계정 유형 분류 + 학원 초대.

| 만들어지는 것 | 종류 |
| --- | --- |
| `profiles.account_type` (text) | 컬럼 추가 |
| account_type CHECK ('tutor', 'owner', 'staff') | 제약 |
| `public.academy_invitations` | 테이블 |
| academy_invitations RLS + 3 policies | RLS |
| academy_invitations GRANT | select/insert/update |

**검증 방법**:
- [ ] `profiles.account_type` 컬럼 존재 + check 제약
- [ ] `academy_invitations` 테이블 존재 (academy_id, email, role, status, expires_at 등)
- [ ] Policies 탭에 `select own / select by owner / insert by owner` 3개

---

## 004_profiles_staff_and_delete_policies.sql

**의존성**: 001 + 002 + 003.

**목적**: 사용자 프로필 phone 컬럼 + 학원-specific 강사 설정 + 학원 삭제 정책.

| 만들어지는 것 | 종류 |
| --- | --- |
| `profiles.phone` (text) | 컬럼 추가 |
| `public.academy_staff_profiles` | 테이블 (학원별 강사 설정) |
| academy_staff_profiles RLS + GRANT | 원장 + 본인만 read/write |
| `academies delete by owner` 정책 | 학원 삭제 권한 |
| `public.list_academy_member_profiles(uuid)` | security definer 함수 |

**검증 방법**:
- [ ] `profiles.phone` 컬럼 존재
- [ ] `academy_staff_profiles` 테이블 존재 (subject/subjects/wage_type/hourly_wage/monthly_salary/memo/status/role)
- [ ] unique (academy_id, user_id) 제약 보임
- [ ] Functions 에 `list_academy_member_profiles(uuid)` 함수 존재
- [ ] academies 의 Policies 에 delete 정책 있음

---

## 005_accept_invitation_rpc.sql

**의존성**: 001 + 003.

**목적**: 초대 수락 시 RLS 우회 + 강한 검증 (`security definer` RPC).

| 만들어지는 것 | 종류 |
| --- | --- |
| `public.accept_academy_invitation(p_invitation_id uuid)` | security definer 함수 |

**왜 필요한가**: 001 의 `academy_members insert by owner` 정책은 초대받은 사람이
자신의 academy_members 행을 직접 insert 하는 것을 막습니다. 이 RPC 가:
- 호출자(auth.uid()) 와 초대 이메일(auth.email()) 일치 검증
- 초대 상태 pending 검증
- 단일 트랜잭션에서 `academy_members` upsert + invitation 마킹

**검증 방법**:
- [ ] Functions 에 `accept_academy_invitation` 존재 (returns table 형태)
- [ ] 함수 정의가 `security definer` 인지 확인
- [ ] OUT 파라미터가 `out_invitation_id / out_academy_id / out_role / out_accepted_user_id` (이전 충돌 fix)

---

## 실행 순서 요약

```
001  →  002  →  003  →  004  →  005
```

```
필수 의존성:
  002 ← 001
  003 ← 001
  004 ← 001 + 002 + 003
  005 ← 001 + 003
```

## 재실행 시

모든 파일이 idempotent 하므로 다시 실행해도 데이터 손실 없음.
다만 005 는 `drop function if exists` 가 들어있어 **함수만** 잠시 사라졌다
재생성됩니다. 그 사이에 초대 수락 호출이 들어오면 일시적으로 실패할 수 있음.
운영 트래픽이 적은 시간대 실행 권장.

## 보안 원칙 (모든 파일 공통)

- [ ] anon key 만 프론트엔드 사용
- [ ] service_role key 는 절대 노출 금지
- [ ] RLS 가 모든 테이블에 활성화
- [ ] 권한 분리는 `is_member_of_academy` / `is_owner_of_academy` 헬퍼 + `accept_academy_invitation` RPC 로 표현
