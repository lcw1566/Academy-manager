# 학원 파일럿 QA 체크리스트

실제 학원 도입 직전 / 도입 첫 주 동안 빠짐없이 확인할 항목 모음입니다.
계정 4개(원장/강사/보조강사/과외) + 기기 2개(PC + 모바일) 로 진행 권장.

각 시나리오는 **실제 작업 흐름** 기준이며, 항목별 PASS/FAIL 표시.

---

## 0. 사전 준비

- [ ] [`deployment-checklist.md`](./deployment-checklist.md) 완료
- [ ] [`supabase-migration-checklist.md`](./supabase-migration-checklist.md) 의 001~005 적용 완료
- [ ] Vercel 배포 URL 확인
- [ ] 테스트 계정 4개 준비 (다른 이메일 사용 권장)
  - owner@example.com
  - teacher@example.com
  - assistant@example.com
  - tutor@example.com

---

## 1. Owner 체크리스트

### 로그인 / 자동 진입
- [ ] 로그아웃 상태에서 앱 열면 **로그인 화면** 노출 (RoleSelectPage X)
- [ ] 회원가입 → 계정 유형 "학원 원장" 선택
- [ ] 로그인 직후 **owner 모드** 자동 진입 (RoleSelectPage 거치지 않음)
- [ ] 좌측 사이드바 / 하단 탭에 owner 5개 (home/classes/students/settlement/more)

### 학원 워크스페이스
- [ ] 더보기 → 학원 워크스페이스 → "학원 만들기"
- [ ] 학원 이름 입력 → 생성 성공 → currentAcademyId 자동 설정
- [ ] 멤버 목록에 본인 owner 표시

### 강사/보조강사 초대
- [ ] 더보기 → 강사 추가 → 이메일 입력 → "앱 초대 보내기" 성공
- [ ] 더보기 → 보조강사 추가 → 같은 흐름
- [ ] 더보기 → 받은 학원 초대 영역에 본인의 초대는 노출되지 않음 (다른 계정에서 확인)

### 학생 관리
- [ ] 학생 추가 (이름/학년/연락처)
- [ ] 학생 수정
- [ ] 학생 삭제 (확인 모달 → 삭제)
- [ ] 서버 연동 시 student.serverId 가 채워짐

### 반 / 수업
- [ ] 반 생성 (요일/시간/학생/강사 선택)
- [ ] 세션 자동 생성 N개 확인
- [ ] 반 수정 / 세션 수정 / 세션 삭제
- [ ] 반 삭제 → 연결 세션도 삭제

### 수업 기록 / 출결
- [ ] 세션 열기 → 출결 체크 → 저장
- [ ] 수업 기록 (공통/학생별) 저장
- [ ] 보완 항목 (supportTags) 기록 시 보조강사에게 노출되는지

### 클리닉
- [ ] 클리닉 기록 추가
- [ ] 클리닉 기록 수정 / 삭제

### 수납 / 급여
- [ ] 정산 탭 → 월 수납 자동 생성
- [ ] 수납 상태 변경 (미납 → 완납)
- [ ] 급여 명세 자동 생성 → 지급 완료 처리
- [ ] **강사/보조강사 본인이 자신의 급여만 보는지** 별도 확인

### Danger Zone
- [ ] 더보기 → Danger Zone (owner 본인만 표시)
- [ ] "서버 데이터 초기화" — 모든 학원 도메인 데이터 삭제됨 (강사/보조강사 본인은 학원 멤버십 유지)
- [ ] "학원 삭제" — 학원명 정확히 입력 필요 → 삭제 → 학원 목록에서 사라짐

### Owner 자동 hydrate
- [ ] 시크릿 창에서 같은 계정 로그인 → 학원 데이터 자동 노출
- [ ] sessionStorage 의 `auto-hydrated-<academyId>` 키 확인 (DevTools)

---

## 2. Teacher 체크리스트

### 로그인 / 자동 진입
- [ ] 다른 브라우저/시크릿에서 teacher 이메일로 회원가입
- [ ] 계정 유형 "강사 / 보조강사" 선택
- [ ] 로그인 후 **StaffWaitingPage** 노출 ("아직 참여 중인 학원이 없어요")
- [ ] 원장이 보낸 초대 목록에 학원 이름 표시
- [ ] "수락" 클릭 → teacher 모드 자동 진입
- [ ] 탭 = home/classes/students/payroll/more (settlement 없음)

### 본인 식별 + 배정 필터
- [ ] 원장이 강사 설정에서 role='teacher' 로 저장 → academy_staff_profiles 매핑
- [ ] **TeacherDashboard** 에 본인 배정 수업만 표시
- [ ] 본인이 배정되지 않은 반/세션은 노출되지 않음
- [ ] 배정 없으면 "아직 배정된 수업이 없어요" 안내

### 작업 가능 항목
- [ ] 본인 세션 열기 → 출결 입력 → 저장
- [ ] 수업 기록 저장 (공통/학생별)
- [ ] 보완 항목 입력 (보조강사에게 전달용)
- [ ] 본인 급여 페이지 → 자신의 명세만

### 차단되어야 할 항목
- [ ] 더보기에 **Danger Zone 안 보임**
- [ ] 더보기에 **강사관리 / 보조강사관리 / 초대 / 학원 멤버 섹션 안 보임**
- [ ] 정산(settlement) 탭 자체가 사이드바/하단 탭에 없음
- [ ] 학생 삭제 / 반 삭제 버튼 안 보임
- [ ] 학원 프로필 편집 안 됨 (탭이 readonly)

---

## 3. Assistant 체크리스트

### 로그인 / 자동 진입
- [ ] assistant 이메일로 회원가입 → "강사 / 보조강사" 선택
- [ ] StaffWaitingPage 노출 → 초대 수락
- [ ] **assistant 모드** 자동 진입
- [ ] 탭 = home/clinic/students/payroll/more (classes 없음)

### 본인 식별 + 클리닉 필터
- [ ] 원장이 academy_staff_profiles role='assistant' 로 저장
- [ ] **AssistantDashboard** 에 본인 assignedToId 인 클리닉만 표시
- [ ] 배정 없으면 "아직 배정된 클리닉이 없어요"

### 작업 가능 항목
- [ ] 클리닉 페이지 → 보완 항목 → 클리닉 기록 작성
- [ ] 클리닉 기록 수정 / 삭제 (본인 작성분)
- [ ] 본인 급여 페이지

### 차단되어야 할 항목
- [ ] Danger Zone 안 보임
- [ ] 강사관리 / 초대 안 보임
- [ ] 정산 탭 없음
- [ ] 반 관리 페이지 자체가 없음

---

## 4. Tutor (과외) 체크리스트

### 로그인 / 자동 진입
- [ ] tutor 이메일로 회원가입 → "과외 선생님" 선택
- [ ] 로그인 후 **tutor 모드** 자동 진입 (RoleSelectPage 거치지 않음)
- [ ] 좌측/하단 탭 = 과외 모드 5개 (home/classes/students/payments/more)

### 기능 동작 (private workspace)
- [ ] 학생 추가/수정/삭제
- [ ] 정기 과외 그룹 생성 → 자동 회차 생성
- [ ] 출결 체크
- [ ] 수업 기록 저장
- [ ] 수납 입력
- [ ] 더보기 → 학원 워크스페이스 영역에서 학원 만들기도 가능 (deemphasized 버튼)

### 차단되어야 할 항목
- [ ] tutor 모드에서는 학원 모드의 Danger Zone / 강사관리 등 노출되지 않음
- [ ] 자동 hydrate 가 currentAcademyId 가 없으면 동작하지 않음 (정상)

---

## 5. 교차 기기 / 교차 사용자 시나리오

### Cross-device
- [ ] PC 원장 계정에서 학생 5명 + 반 1개 + 세션 8개 생성
- [ ] 모바일 시크릿 창에서 같은 계정 로그인
- [ ] 자동 hydrate 발동 → toast "서버 데이터를 불러왔어요. (N개)"
- [ ] 5명/1개/8개 모두 모바일에 노출됨
- [ ] 모바일에서 학생 1명 수정 → 저장
- [ ] PC 의 더보기 → 학원 워크스페이스 → "🔄 새로고침" 또는 "서버 데이터 불러오기"
- [ ] 변경 사항이 PC 에도 반영됨

### Cross-user
- [ ] 같은 PC 에서 owner 로그아웃 → teacher 로그인
- [ ] 로그아웃 직후 AuthPage 노출 (역할 화면 X)
- [ ] teacher 로그인 후 자동으로 teacher 모드 진입
- [ ] teacher 시야에 owner 데이터가 그대로 보이는 경우 → **알려진 한계** (localStorage 공유)

---

## 6. Supabase 테이블 점검

Supabase Dashboard → Table Editor 에서 직접 행 확인:

- [ ] `profiles` — 가입한 4계정 모두 row 존재, account_type 정확
- [ ] `academies` — 원장이 만든 학원 row 존재
- [ ] `academy_members` — owner/teacher/assistant 3개 row + 초대 수락한 행
- [ ] `academy_invitations` — accepted 상태로 변경됨
- [ ] `academy_staff_profiles` — 원장이 설정한 강사/보조강사 settings
- [ ] `students` / `class_groups` / `class_sessions` — 도메인 데이터
- [ ] `lesson_records` / `attendance_records` — 강사 작업물
- [ ] `clinic_records` — 보조강사 작업물
- [ ] `payments` / `payrolls` — 원장 정산 작업물

각 행의 `academy_id` 가 올바른 학원을 가리키는지 spot-check.

---

## 7. Vercel 배포 점검

- [ ] Production URL 에서 위 1~5 시나리오 재실행
- [ ] Vercel Logs 에 5xx 에러 없음
- [ ] Console 에 빨간색 에러 없음 (단, supabase fetch 가 RLS 로 막힌 일부 로그는 정상)

---

## 8. 알려진 한계 (Known Limitations)

파일럿 동안 사용자에게 미리 안내해야 할 항목:

### 동기화
- **localStorage 가 source of truth** — 데이터 입력은 즉시 로컬에 반영되고, 서버 write-through 는 best-effort. 네트워크 오류 시 로컬 변경은 유지되며 자동 재시도 안 됨.
- **자동 hydrate 는 세션당 1회** — 같은 브라우저에서 두 번째 새로고침 시 자동으로 다시 받지 않음. 더보기 → 학원 워크스페이스 → "🔄 새로고침" 으로 수동 갱신 가능.
- **실시간 동기화 미구현** — PC 와 모바일에서 동시에 편집해도 즉시 반영되지 않음. 새로고침 시점에 한쪽이 다른 쪽을 덮어쓸 수 있음 (마지막 저장 승리).
- **충돌 해결 미구현** — 두 사용자가 동시에 같은 학생을 수정하면 마지막 저장이 이김. 데이터 손실 가능성 있음.

### 멀티 유저 / 멀티 디바이스
- **같은 브라우저에서 여러 계정 사용 시 localStorage 가 공유됨** — owner 로그아웃 후 teacher 로그인 시 owner 의 학원 도메인 데이터가 localStorage 에 남아있음. teacher 의 자동 hydrate 가 serverWins 로 덮어쓰지만, 그 사이 잠시 잘못된 데이터가 노출될 수 있음.
- 같은 학원에서 다중 디바이스 동시 작업은 가능하지만, 정산/급여 같은 일괄 생성 작업은 한 디바이스에서 한 번만 수행 권장.

### 초대 / 계정
- **초대 이메일 자동 발송 미지원** — academy_invitations 는 앱 내부 알림만. 원장이 다른 채널 (카톡/메일)로 가입 안내를 별도 전달해야 함.
- **이메일 변경 미지원** — Supabase auth 자체로는 가능하나 앱 UI 는 미제공.

### 권한 / 보안
- **owner 가 임의로 academy_members.role 을 바꾸는 UI 는 부분 제공** — academy_staff_profiles.role 만 변경 가능. 핵심 멤버십 역할 (owner/teacher/assistant) 변경은 SQL Editor 에서 수동.
- **모든 RLS 는 academy_id 단위로 분리** — 같은 학원 멤버는 서로의 academy-specific 데이터를 모두 볼 수 있음. private 데이터(예: 강사 메모) 분리는 미지원.

### 백업
- **앱 내부 백업/export 기능 없음** — Supabase 자체 백업/스냅샷 사용 필요 (Pro 플랜 이상).

---

## 9. 파일럿 종료 후 회고 항목

- 어떤 권한 분리가 추가로 필요한가
- 어떤 화면에 empty/loading state 가 부족했나
- 실시간 동기화의 필요 강도
- 초대 자동 발송이 실제 도입 차단 요인이었는가
- localStorage 의 source-of-truth 정책 유지 여부
