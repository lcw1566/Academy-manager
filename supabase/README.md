# Supabase 설정 가이드

이 폴더에는 Seenit 의 Supabase 스키마 / RLS 정책을 정의한 SQL 파일이
들어 있습니다. Supabase Dashboard 의 SQL Editor 에서 **번호 순서대로** 실행해주세요.

## 디렉터리 구조

```
supabase/
├── README.md                       (이 파일)
└── sql/
    ├── 001_workspace_schema.sql    (계정 / 학원 워크스페이스 스키마)
    ├── 002_domain_schema.sql       (학생·수업·정산·클리닉 등 도메인 스키마)
    ├── 003_account_type_and_invitations.sql  (계정 유형 + 학원 초대)
    ├── 004_profiles_staff_and_delete_policies.sql  (profile.phone + staff_profiles + academies delete)
    ├── 005_accept_invitation_rpc.sql  (초대 수락 RPC hotfix)
    ├── 006_staff_operations.sql    (근무표 + 권한·범위 + 대체 강사)
    ├── 007_profile_search_rpc.sql  (이메일로 profile 검색 RPC)
    ├── 008_assistant_assignment.sql (반/회차에 보조강사 배정 영속화)
    ├── 009_academy_billing_settings.sql (학원별 급여/수강료 일자 설정)
    ├── 010_staff_wage_integer_guard.sql (강사 시급/월급 정수 원 단위 보정)
    ├── 011_attendance_settings_and_qr.sql (출결·등하원 설정 + 학생 체크인 이벤트)
    ├── 012_remove_wifi_check_method.sql (출결 방식에서 wifi 제거)
    ├── 013_teacher_assignment_user_id.sql (담당 강사 user_id 영속화)
    ├── 014_schedule_rules_refactor.sql (룰 기반 스케줄)
    ├── 015_staff_attendance_logs_self_rls.sql (직원 본인 근태 로그 RLS)
    ├── 016_profiles_signup_trigger_and_realtime.sql (가입 즉시 profile 생성 + Realtime 등록)
    ├── 017_domain_realtime_publication.sql (도메인 테이블 Realtime 등록)
    ├── 018_student_pin_public_checkin.sql (학생 PIN 공개 체크인)
    ├── 019_academy_chat.sql (학원 직원 채팅)
    ├── 020_academy_chat_members_rpc.sql (채팅 멤버 디렉터리 RPC)
    ├── 021_academy_onboarding_settings.sql (학원 온보딩 설정)
    ├── 022_chat_push_notifications.sql (채팅 푸시 기기 등록)
    ├── 023_chat_push_service_role_grants.sql (푸시 함수 권한)
    ├── 024_academy_drive.sql (공유 드라이브 비공개 Storage + 파일별 다운로드 정책)
    ├── 025_operations_manager_role.sql (운영 매니저 역할 + 데스크 운영 권한/RLS)
    ├── 026_deferred_staff_role_assignment.sql (직원 초대 수락 후 역할 배정/RLS)
    ├── 027_attendance_choices_and_invitation_display.sql (출결 선택 + 초대 학원명 RPC)
    ├── 028_role_permissions_and_payroll_privacy.sql (역할별 RLS + 급여/근태 개인정보 보호)
    ├── ...                               (후속 기능 마이그레이션)
    ├── 041_assistant_attendance_default_permission.sql (보조강사 기본 등하원 권한)
    └── 042_staff_biweekly_work_rules.sql (직원 격주 근무 규칙)
```

## 실행 순서 요약

| 순서 | 파일 | 만들어지는 것 |
| --- | --- | --- |
| 1 | `001_workspace_schema.sql` | profiles / academies / academy_members + helper functions |
| 2 | `002_domain_schema.sql` | 도메인 테이블 10개 + RLS + GRANT |
| 3 | `003_account_type_and_invitations.sql` | profiles.account_type 컬럼 + academy_invitations 테이블 + RLS |
| 4 | `004_profiles_staff_and_delete_policies.sql` | profiles.phone, academy_staff_profiles, academies delete 정책, list_academy_member_profiles 함수 |
| 5 | `005_accept_invitation_rpc.sql` | accept_academy_invitation security definer RPC (academy_members RLS 우회 + 강한 검증) |
| 6 | `006_staff_operations.sql` | academy_staff_shifts 테이블 + academy_staff_profiles 의 permissions/scope jsonb + class_sessions 의 substitute_teacher_user_id / substitute_reason 컬럼 |
| 7 | `007_profile_search_rpc.sql` | search_profile_by_email(text) security definer RPC (강사 초대 시 이메일로 profile 조회) |
| 8 | `008_assistant_assignment.sql` | class_groups.assistant_ids / class_sessions.assistant_ids jsonb 컬럼 추가 (Phase 35) |
| 9 | `009_academy_billing_settings.sql` | academies.salary_payment_day / tuition_due_day 컬럼 추가 (Phase 39) |
| 10 | `010_staff_wage_integer_guard.sql` | academy_staff_profiles.hourly_wage / monthly_salary 정수 원 단위 보정 |
| 11 | `011_attendance_settings_and_qr.sql` | academies 출결 설정 컬럼, attendance_records 출처/체크시각, student_check_events 테이블 (Phase 41) |
| 12 | `012_remove_wifi_check_method.sql` | 출결 방식에서 wifi 옵션 제거 |
| 13 | `013_teacher_assignment_user_id.sql` | 수업/반 담당 강사 user_id 참조 보강 |
| 14 | `014_schedule_rules_refactor.sql` | 직원/수업 룰 기반 스케줄 테이블 |
| 15 | `015_staff_attendance_logs_self_rls.sql` | 직원 본인 근태 로그 조회/기록 RLS |
| 16 | `016_profiles_signup_trigger_and_realtime.sql` | auth.users 가입 직후 profiles row 생성, 초대/멤버 Realtime 등록 |
| 17 | `017_domain_realtime_publication.sql` | 도메인 테이블 Realtime publication 등록 |
| 18 | `018_student_pin_public_checkin.sql` | 학생 PIN 기반 공개 등·하원 처리 |
| 19 | `019_academy_chat.sql` | 학원 직원 채팅 테이블·RLS·RPC |
| 20 | `020_academy_chat_members_rpc.sql` | 직원용 채팅 멤버 디렉터리 RPC |
| 21 | `021_academy_onboarding_settings.sql` | 학원 온보딩 설정 컬럼 |
| 22 | `022_chat_push_notifications.sql` | 채팅 푸시 기기 등록 및 정책 |
| 23 | `023_chat_push_service_role_grants.sql` | 채팅 푸시 함수용 서비스 역할 권한 |
| 24 | `024_academy_drive.sql` | 비공개 `academy-drive` 버킷, `academy_drive_files` 메타데이터, 원장 관리 RLS |
| 25 | `025_operations_manager_role.sql` | 운영 매니저 초대·근무표·학생/수납·공유 드라이브 관리. 학원 삭제·최종 설정·급여 관리는 원장 전용 |
| 26 | `026_deferred_staff_role_assignment.sql` | 역할 없는 직원 초대, 수락 후 역할 배정 대기, 원장/운영 매니저의 활성화 권한 및 보안 경계 |
| 27 | `027_attendance_choices_and_invitation_display.sql` | 직원 직접 기록/QR 선택, 초대받은 사용자에게 학원 이름을 안전하게 표시하는 RPC |
| 28 | `028_role_permissions_and_payroll_privacy.sql` | 화면 권한을 DB RLS에서도 강제, 직원 급여 본인 조회 및 근태 승인 조작 차단 |
| 41 | `041_assistant_attendance_default_permission.sql` | 보조강사 기본 등하원·출석 기록 권한 활성화 |
| 42 | `042_staff_biweekly_work_rules.sql` | 직원 반복 근무의 매주/격주 주기 저장 |

각 파일은 idempotent 하게 작성되어 있어 여러 번 실행해도 안전합니다.
`drop table` 같은 destructive 명령은 포함되어 있지 않습니다.

### 직원 초대·역할 배정 배포 (026)

`025_operations_manager_role.sql`까지 실행한 환경에서
`supabase/sql/026_deferred_staff_role_assignment.sql`을 실행하세요.

- 가입 화면은 **원장 / 직원**만 선택합니다.
- 026은 역할 미지정 초대의 `역할 배정 대기` 경로를 지원합니다.
- 원장은 강사·보조강사·운영 매니저를 배정할 수 있으며, 운영 매니저는 강사·보조강사만 배정할 수 있습니다.
- 배정 전 멤버십은 `pending / invited`라 기존 active-member RLS를 통과하지 못합니다.
- 027 적용 후 신규 UI는 역할을 먼저 정해 초대하므로 직원이 수락 즉시 활성화됩니다.

> ⚠ **002 는 001 의 helper function 에 의존합니다.**
> `public.set_updated_at`, `public.is_member_of_academy`, `public.is_owner_of_academy`
> 가 없으면 002 실행 시 에러가 납니다. 반드시 001 → 002 순서로 실행하세요.

### 출결 선택·초대 학원명 배포 (027)

`026_deferred_staff_role_assignment.sql`까지 실행한 환경에서
`supabase/sql/027_attendance_choices_and_invitation_display.sql`을 실행하세요.

- 직원 출퇴근을 `직접 기록 / QR` 중 선택할 수 있습니다.
- 학생 등하원을 `선생님 직접 체크 / QR` 중 선택할 수 있습니다.
- 초대 카드에는 `academies` RLS를 넓히지 않고 실제 학원 이름만 표시합니다.
- 새 초대는 원장이 역할을 먼저 선택하고, 직원은 수락 즉시 해당 역할로 참여합니다.

### 역할 권한·급여 개인정보 보호 배포 (028)

`027_attendance_choices_and_invitation_display.sql`까지 실행한 환경에서
`supabase/sql/028_role_permissions_and_payroll_privacy.sql`을 실행하세요.

- 직원 화면의 권한 토글을 DB RLS에서도 강제합니다.
- 수납은 권한 있는 원장/운영 매니저만 조회·변경합니다.
- 급여는 원장은 전체, 직원은 `staff_user_id`가 일치하는 본인 행만 조회합니다.
- 일반 직원은 자기 근태 로그를 `approved/rejected`로 바꿀 수 없습니다.
- 예전 급여 중 `teacher_<uuid>` 형태가 아닌 로컬 ID 행은 자동 연결할 수 없습니다.
  해당 직원에게 과거 급여가 보이지 않으면 원장 계정에서 해당 월 급여를 다시 생성하세요.

### 보조강사 기본 등하원 권한 배포 (041)

`040_member_role_source_of_truth.sql`까지 실행한 환경에서
`supabase/sql/041_assistant_attendance_default_permission.sql`을 실행하세요.

- 별도 권한을 설정하지 않은 보조강사에게 등하원 탭과 기록 권한이 기본 제공됩니다.
- 원장이 `등하원·출석 기록` 권한을 명시적으로 끈 보조강사는 계속 접근할 수 없습니다.
- 기존 직원·학생·등하원 데이터는 변경하지 않습니다.

### 직원 격주 근무 배포 (042)

`041_assistant_attendance_default_permission.sql`까지 실행한 환경에서
`supabase/sql/042_staff_biweekly_work_rules.sql`을 실행하세요.

- 기존 근무 규칙은 자동으로 `매주`를 유지합니다.
- 새 반복 근무에서 `매주 / 격주`를 선택할 수 있습니다.
- 격주는 시작일이 포함된 주를 첫 근무 주로 계산합니다.
- 날짜별 휴무·시간 변경·추가 근무 예외는 기존과 동일하게 적용됩니다.

### 공유 드라이브 배포 (024)

1. 기존 SQL을 적용한 뒤 `supabase/sql/024_academy_drive.sql` 전체를 SQL Editor에서 실행합니다.
2. Supabase CLI로 Edge Function을 배포합니다.

   ```bash
   supabase functions deploy academy-drive-file
   ```

3. 함수에는 Supabase가 기본 제공하는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`가 필요합니다. 서비스 역할 키는 브라우저 환경변수에
   절대 넣지 않습니다.

이후 학원 멤버는 자료 목록을 볼 수 있고, 원장은 업로드·삭제·파일별 다운로드 허용을
관리합니다. 직원의 파일 열람/인쇄/다운로드 URL은 `academy-drive-file` 함수가 활성
멤버십과 `download_allowed`를 확인한 뒤 60초 동안만 발급합니다.

앱 안 열람·인쇄 형식은 PDF, 이미지, Word `.docx`, 한글 `.hwp`/`.hwpx`,
텍스트·CSV입니다. `.doc`, Excel, PowerPoint 등도 드라이브에 안전하게 보관·권한
관리할 수 있으며, 서식 그대로 앱 안에서 인쇄해야 하는 자료는 PDF로 변환해 올리면 됩니다.

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

## STEP 3 — `003_account_type_and_invitations.sql` 실행

1. SQL Editor 에서 **New query** 새로 클릭
2. `supabase/sql/003_account_type_and_invitations.sql` 의 내용 전체를 복사하여 붙여넣기
3. **Run**
4. `Success. No rows returned` 확인

### 결과 확인

- **Table Editor** 에서 `academy_invitations` 테이블이 보이고 **RLS enabled** 배지 확인
- **Table Editor → profiles** 컬럼 목록에 `account_type` 컬럼 추가 확인
- **academy_invitations 의 Auth policies** 에 다음 3개 정책 확인:
  - `academy_invitations select owner or invitee`
  - `academy_invitations insert by owner`
  - `academy_invitations update by owner or invitee`

### 정책 요약

| 동작 | 허용 대상 |
| --- | --- |
| select | 해당 학원의 owner **또는** 본인 이메일과 일치하는 초대를 받은 사용자 |
| insert | 해당 학원의 owner (invited_by 가 본인) |
| update | 해당 학원의 owner 또는 본인 이메일과 일치하는 invitee |
| delete | 정책 없음 → 차단. 취소는 `status='canceled'` 로 update 처리 |

> `auth.email()` 헬퍼 (Supabase 가 JWT 에서 email 을 꺼내주는 함수) 를 사용해
> 본인 이메일과의 매칭을 RLS 안에서 직접 처리합니다. 이메일은 lowercase 로
> 비교하므로 앱에서도 lowercase trim 후 저장해야 합니다.

---

## STEP 4 — `004_profiles_staff_and_delete_policies.sql` 실행

1. SQL Editor 에서 **New query** 클릭
2. `supabase/sql/004_profiles_staff_and_delete_policies.sql` 의 내용 전체를 복사하여 붙여넣기
3. **Run**
4. `Success. No rows returned` 확인

### 결과 확인

- **Table Editor → profiles** 컬럼에 `phone` 추가 확인
- **Table Editor** 에 `academy_staff_profiles` 테이블 생성 + **RLS enabled** 확인
- **academies → Auth policies** 에 `academies delete by owner` 정책 추가 확인
- **Database → Functions** 에 `list_academy_member_profiles` 함수 추가 확인

### 변경 요약

| 항목 | 동작 |
| --- | --- |
| `profiles.phone` | 사용자 본인이 편집 가능 (기존 profiles RLS 본인 row 정책 적용) |
| `academy_staff_profiles` | 원장이 학원-특정 강사 설정(과목/급여/메모) 관리. 본인 row 는 강사 본인도 조회 가능. delete 정책 없음 → soft-delete(status='inactive')만 |
| `academies delete by owner` | 원장 본인이 자기 학원 삭제 가능. cascade FK 로 자식 행 자동 정리 |
| `list_academy_member_profiles(uuid)` | security definer 함수로, 원장이 자기 학원 멤버의 이름/이메일/전화/계정유형만 조회 (다른 사용자 profile 누출 없음) |

> ⚠ **academies delete 는 매우 파괴적입니다.** 프론트엔드에서 학원 이름 입력 등
> 강한 타입드-컨펌 UX 를 반드시 요구합니다.

---

## STEP 5 — `005_accept_invitation_rpc.sql` 실행

1. SQL Editor 에서 **New query** 클릭
2. `supabase/sql/005_accept_invitation_rpc.sql` 의 내용 전체를 복사하여 붙여넣기
3. **Run**
4. `Success. No rows returned` 확인

### 결과 확인

- **Database → Functions** 에 `accept_academy_invitation(uuid)` 함수가 존재 + execute 권한이 `authenticated` 에 부여되어 있는지 확인

### 왜 필요한가

`academy_members.insert` RLS 는 owner 만 허용합니다. 초대받은 사용자는 자기 자신의
멤버 행을 직접 insert 할 수 없으므로, 초대 수락은 반드시 **security definer RPC**
를 거쳐야 합니다. 함수 내부에서 다음을 강제로 검증합니다:

| 검증 | 실패 시 |
| --- | --- |
| `auth.uid()` 존재 | `auth required` |
| invitation 존재 | "초대를 찾을 수 없어요." |
| status='pending' | "이미 처리된 초대예요." |
| `lower(invitation.email) = lower(auth.email())` | "초대받은 이메일과 로그인 이메일이 달라요." |
| role ∈ {teacher, assistant} | "잘못된 초대 역할이에요." |

검증 통과 시 본인 academy_members 행만 upsert 하고 invitation 을 accepted 로 마킹합니다.
다른 사용자의 멤버십은 절대 건드리지 않습니다.

> RLS 정책은 그대로 유지됩니다. 이 RPC 가 유일한 합법적 우회 경로입니다.

---

## STEP 6 — `006_staff_operations.sql` 실행 (Phase 30/31)

1. SQL Editor 에서 **New query** 클릭
2. `supabase/sql/006_staff_operations.sql` 의 내용 전체를 복사하여 붙여넣기
3. **Run**
4. `Success. No rows returned` 확인

### 결과 확인

- **Table Editor** 에 `academy_staff_shifts` 테이블이 생성 + **RLS enabled** 배지 확인
- **Table Editor → academy_staff_profiles** 컬럼에 `permissions` (jsonb) / `scope` (jsonb) 추가 확인
- **Table Editor → class_sessions** 컬럼에 `substitute_teacher_user_id` / `substitute_reason` 추가 확인
- **academy_staff_shifts → Auth policies** 4개 확인:
  - `academy_staff_shifts select owner or self`
  - `academy_staff_shifts insert by owner`
  - `academy_staff_shifts update by owner or self`
  - `academy_staff_shifts delete by owner`

### 변경 요약

| 항목 | 용도 |
| --- | --- |
| `academy_staff_shifts` | 강사·보조강사의 일별 근무표 / 타임카드. scheduled/actual 시간 분리, status (scheduled/completed/canceled), 휴게 분 |
| `academy_staff_profiles.permissions` | UI 게이팅용 권한 토글 jsonb (canViewStudents / canEditLessonRecords 등) |
| `academy_staff_profiles.scope` | 강사가 다룰 수 있는 대상 제한 jsonb (subjects / classGroupIds / studentIds) — 현재는 helper 만 제공, 점진 적용 예정 |
| `class_sessions.substitute_teacher_user_id` | 한 회차의 대체 강사 (auth.users.id 참조, on delete set null) |
| `class_sessions.substitute_reason` | 대체 사유 (선택) |

### 권한 정책 요약

| 동작 | 허용 대상 |
| --- | --- |
| select (shift) | 학원 owner **또는** 본인(`staff_user_id = auth.uid()`) |
| insert (shift) | 학원 owner 만 |
| update (shift) | 학원 owner **또는** 본인 (column-level 제한은 현재 미적용; staff 가 actual 시간만 갱신하도록 추후 강화) |
| delete (shift) | 학원 owner 만 |

> 이 단계에서 `permissions` / `scope` 는 jsonb 컬럼만 추가하고 RLS 수준 검증은
> 아직 적용하지 않습니다. 프론트엔드 UI 게이팅만 수행하며, 추후 단계적으로 강화됩니다.

---

## STEP 7 — `007_profile_search_rpc.sql` 실행 (Phase 32 post-fix)

1. SQL Editor 에서 **New query** 클릭
2. `supabase/sql/007_profile_search_rpc.sql` 의 내용 전체를 복사하여 붙여넣기
3. **Run**
4. `Success. No rows returned` 확인

### 결과 확인

- **Database → Functions** 에 `public.search_profile_by_email(text)` 함수 존재 확인
- execute 권한이 `authenticated` 에만 부여되어 있는지 확인 (anon / service_role 부여 없음)

### 왜 필요한가

`profiles` RLS 는 본인 row 만 select 허용한다. 따라서 원장이 강사/보조강사를 초대하려고
이메일로 검색해도 RLS 가 다른 사용자 row 를 차단한다. 이 RPC 는 **security definer** 로
RLS 를 우회하되, 다음 안전 가드를 강제한다:

| 가드 | 동작 |
| --- | --- |
| exact match | `lower(p.email) = lower(trim(p_email))` — 부분 일치 / wildcard 없음 |
| 1행 제한 | `limit 1` |
| 노출 컬럼 제한 | `id / email / display_name / phone / account_type` — 전체 profile 누출 방지 |
| 최소 입력 길이 | `length(cleaned) < 3` 이면 빈 결과 |
| GRANT 범위 | `authenticated` 만 |

`StaffInviteWidget` 의 "계정 검색" 버튼이 이 함수를 호출한다. 검색 실패 시에도
초대 생성은 그대로 동작한다 (가입 안 한 이메일에 invitation row 만 미리 만들어 둠).

---

## STEP 8 — `008_assistant_assignment.sql` 실행 (Phase 35)

1. Supabase Dashboard → SQL Editor
2. `supabase/sql/008_assistant_assignment.sql` 내용 전체를 붙여넣고 RUN
3. 결과 검증 (옵션):
   ```sql
   select column_name, data_type
   from information_schema.columns
   where table_schema = 'public'
     and table_name in ('class_groups', 'class_sessions')
     and column_name = 'assistant_ids';
   ```
   두 줄 결과 (둘 다 `jsonb`) 가 나오면 정상.

### 왜 필요한가

Phase 34 에서 보조강사 배정을 추가했지만 로컬에만 저장됐어요. 다른 기기에서
같은 학원에 로그인하면 배정이 사라져 보이는 문제가 있어, 서버에도 같이 저장하도록 합니다.

### 안전 보장

- `add column if not exists` — 여러 번 실행해도 안전
- 기본값 `'[]'::jsonb` — 기존 row 는 빈 배열로 자동 채워짐
- RLS 변경 없음 — 기존 정책이 그대로 적용
- destructive 명령 없음

---

## STEP 9 — `009_academy_billing_settings.sql` 실행 (Phase 39)

1. Supabase Dashboard → SQL Editor
2. `supabase/sql/009_academy_billing_settings.sql` 내용 전체를 붙여넣고 RUN
3. 결과 검증 (옵션):
   ```sql
   select id, name, salary_payment_day, tuition_due_day
     from public.academies limit 5;
   ```
   두 컬럼이 보이면 정상. 기본값은 각각 10 / 1.

### 왜 필요한가

학원마다 "매월 N일 급여 지급", "매월 M일 수강료 납부 예정" 같은 정책이 다르므로,
academies 테이블에 직접 보관해서 모든 화면이 같은 값을 참조하도록 합니다.

### 안전 보장

- `add column if not exists` — 여러 번 실행해도 안전
- check 제약 (1~31) 도 idempotent 추가
- 기존 academies RLS 가 그대로 적용 (멤버만 select, owner 만 update)
- destructive 명령 없음

---

## STEP 10 — 앱 동작 확인

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
