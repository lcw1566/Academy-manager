# Supabase 설정 가이드

이 폴더에는 Academy Manager 의 Supabase 스키마 / RLS 정책을 정의한 SQL 파일이
들어 있습니다. Supabase Dashboard 의 SQL Editor 에서 **번호 순서대로** 실행해주세요.

## 디렉터리 구조

```
supabase/
├── README.md                       (이 파일)
└── sql/
    ├── 001_workspace_schema.sql    (계정 / 학원 워크스페이스 스키마)
    └── 002_domain_schema.sql       (학생·수업·정산·클리닉 등 도메인 스키마)
```

## 실행 순서 요약

| 순서 | 파일 | 만들어지는 것 |
| --- | --- | --- |
| 1 | `001_workspace_schema.sql` | profiles / academies / academy_members + helper functions |
| 2 | `002_domain_schema.sql` | 도메인 테이블 10개 + RLS + GRANT |

각 파일은 idempotent 하게 작성되어 있어 여러 번 실행해도 안전합니다.
`drop table` 같은 destructive 명령은 포함되어 있지 않습니다.

> ⚠ **002 는 001 의 helper function 에 의존합니다.**
> `public.set_updated_at`, `public.is_member_of_academy`, `public.is_owner_of_academy`
> 가 없으면 002 실행 시 에러가 납니다. 반드시 001 → 002 순서로 실행하세요.

---

## STEP 1 — `001_workspace_schema.sql` 실행

1. https://supabase.com/dashboard 접속 후 **Academy-manager** 프로젝트 선택
2. 좌측 메뉴에서 **SQL Editor** 열기
3. **New query** 버튼 클릭
4. `supabase/sql/001_workspace_schema.sql` 의 내용 전체를 복사하여 붙여넣기
5. **Run** (또는 Ctrl/Cmd + Enter) 실행
6. 하단에 `Success. No rows returned` 가 표시되면 성공

### 결과 확인

좌측 메뉴 **Table Editor** → 다음 세 테이블이 보이는지 확인:

- `profiles`
- `academies`
- `academy_members`

각 테이블 상단에 **RLS enabled** 배지가 표시되어 있어야 합니다.

**Database → Functions** 메뉴에 다음 함수 3개가 생성되어 있어야 합니다:

- `public.set_updated_at`
- `public.is_owner_of_academy`
- `public.is_member_of_academy`

---

## STEP 2 — `002_domain_schema.sql` 실행

1. SQL Editor 에서 **New query** 새로 클릭
2. `supabase/sql/002_domain_schema.sql` 의 내용 전체를 복사하여 붙여넣기
3. **Run**
4. `Success. No rows returned` 확인

### 결과 확인

**Table Editor** 좌측 목록에 다음 10개 테이블이 모두 보여야 합니다:

| 테이블 | 용도 |
| --- | --- |
| `students` | 학생 정보 |
| `class_groups` | 반 / 수업 그룹 |
| `class_sessions` | 날짜별 수업 회차 |
| `lesson_records` | 수업 기록 (회차당 1행, `student_records` jsonb 로 학생별 통합) |
| `attendance_records` | 출결 기록 |
| `clinic_records` | 클리닉 기록 |
| `payments` | 수납 |
| `payrolls` | 급여 |
| `exam_results` | 성적 |
| `student_events` | 학생 일정 |

각 테이블 상단에 **RLS enabled** 배지가 있어야 합니다.

### 정책 / GRANT 확인 (선택)

각 테이블의 **... → Auth policies** 에서 4개 정책이 보입니다.

| 정책 | 동작 |
| --- | --- |
| `<table>_select_own_or_academy_member` | academy 멤버 OR 본인 (private) |
| `<table>_insert_own_or_academy_member` | 동일 |
| `<table>_update_own_or_academy_member` | 동일 |
| `<table>_delete_own_or_academy_owner` | academy owner OR 본인 (private) |

GRANT 도 함께 부여됩니다 (`authenticated` role 에 대해 select/insert/update/delete).
RLS 가 row 단위로 차단하므로, GRANT 가 있어도 안전합니다.

---

## STEP 3 — 앱 동작 확인

1. 앱은 별도 변경 없이 계속 정상 동작해야 합니다 (기존 localStorage 모드 유지).
2. `npm run dev` 로 띄운 뒤 더보기 탭에서:
   - **계정 연결됨** + **프로필 동기화됨** 상태 확인
   - **학원 워크스페이스** 카드에서 학원 생성 / 선택 동작 확인
3. **도메인 테이블 (students 등) 은 이번 단계에서 앱과 연결되지 않습니다.**
   다음 단계에서 점진적으로 fetch / sync 로직을 추가할 예정입니다.

---

## 권한 모델 요약

### Workspace (001)

- **profiles** — 1 user : 1 row, 본인만 read/write
- **academies** — owner 본인 또는 active 멤버만 select, owner 만 insert/update
- **academy_members** — 본인 row 또는 해당 학원의 owner 가 관리
- **academies.delete** — 학원 삭제는 안전 절차가 더 필요하므로 정책 없음 (차단)

### Domain (002)

모든 도메인 테이블은 동일한 **mode 기반 dual-scope** 패턴을 사용합니다.

- `mode = 'academy'` 인 row → `academy_id` 의 active 멤버만 select/insert/update
- `mode = 'private'` 인 row → `user_id = auth.uid()` 본인만 select/insert/update
- `delete` 는 academy owner 또는 private 본인만

이 패턴 덕분에 같은 테이블에 **학원 데이터** 와 **개인 과외 데이터** 가 공존할 수 있고,
다른 사용자/학원의 데이터는 절대 읽거나 수정할 수 없습니다.

---

## RLS 재귀 방지

`academies` ↔ `academy_members` 정책이 서로를 참조하면 무한 재귀가 발생할 수
있어, `security definer` 헬퍼 함수 두 개를 사용합니다.

- `public.is_owner_of_academy(academy_id uuid)`
- `public.is_member_of_academy(academy_id uuid)`

이 함수들이 정책 내부에서 호출되며, security definer 컨텍스트에서 실행되므로
RLS 재귀 루프가 끊깁니다. 도메인 테이블 (002) 의 정책에서도 동일한 헬퍼를 재사용합니다.

---

## 다음 단계

- 도메인 테이블이 만들어졌지만 **앱은 아직 이 테이블들을 사용하지 않습니다.**
- 다음 단계에서:
  1. `src/services/supabase/domainApi.js` 작성 (CRUD 래퍼)
  2. 학생 한 종류부터 점진적 서버 sync 도입 (read-only → write-through 순)
  3. 마지막에 localStorage / Zustand 와 서버 상태를 어떻게 동기화할지 결정
