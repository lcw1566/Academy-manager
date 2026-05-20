# Supabase 동기화 테스트 체크리스트

학원 파일럿 전 write-through 흐름 전체를 손으로 점검하기 위한 체크리스트입니다.

- 모든 시나리오는 **원장(owner) 모드**에서 진행 (강사/보조강사 권한 차이는 RLS 가 처리)
- 현 단계는 **localStorage = source of truth, Supabase = mirror** 구조. 서버 실패 시 local 데이터는 유지되고 toast 로 안내만 표시되어야 함
- 각 시나리오 끝에 [Supabase 확인] 단계가 있으면 Table Editor 또는 SQL Editor 로 row 를 직접 확인

## 사전 준비

- [ ] `.env.local` 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 설정
- [ ] `supabase/sql/` 내 schema/policy/grant 모두 실행 완료
- [ ] 브라우저에서 `npm run dev` 실행
- [ ] 시크릿 창 / DevTools Application 탭으로 localStorage 초기화 가능 상태
- [ ] Supabase 대시보드 Table Editor 열어둠

## 1. 로그인 / 학원 생성

- [ ] 이메일/비밀번호로 회원가입
- [ ] 첫 진입 시 "더 보기 → 학원 워크스페이스 → 학원 만들기" 로 학원 생성
- [ ] 학원 생성 후 WorkspaceSection 접힘 패널이 노출되고 "서버 데이터" 8개 카운트가 모두 0 으로 표시됨
- [ ] [Supabase 확인] `academies` / `academy_members` 에 row 1개씩

## 2. 학생 (students)

- [ ] **추가**: 학생 1명 등록 → toast "학생이 추가되고 서버에도 저장되었어요." 노출
- [ ] [Supabase 확인] `students` 에 row 1개, `mode='academy'`, `academy_id` 일치
- [ ] WorkspaceSection 새로고침 후 "학생 1명"
- [ ] **수정**: 이름/학년 변경 후 저장
- [ ] [Supabase 확인] `students.updated_at` 갱신, 필드 반영
- [ ] **삭제**: 학생 삭제
- [ ] [Supabase 확인] `students` row 사라짐 (cascade 로 종속 row 도 정리됨)
- [ ] 새로고침 후 "학생 0명"

> 🟡 **serverId 없는 기존 학생**: 페이즈 6 이전에 만든 학생은 `serverId` 가 없음. 수정/삭제 시 localStorage 만 반영되고 서버는 조용히 skip 되어야 함 (에러 없음).

## 3. 반 (class_groups) + 수업 회차 (class_sessions)

- [ ] 학생 2명을 먼저 추가하고 모두 serverId 보유 확인
- [ ] **반 생성**: 학생 2명 배정, 요일 2개, 시작일 오늘
- [ ] toast "반이 생성되고 서버에도 저장되었어요 · 수업 회차 N개"
- [ ] [Supabase 확인] `class_groups` row 1개. `student_ids` jsonb 가 학생 **uuid** 배열 (local id 아님)
- [ ] [Supabase 확인] `class_sessions` 가 자동 생성된 회차 수만큼 (요일×기간)
- [ ] [Supabase 확인] `class_sessions.class_group_id` 가 위 group uuid 와 일치, `student_ids` 도 uuid 배열
- [ ] WorkspaceSection 새로고침 후 "반 1개", "수업 회차 N개"
- [ ] **반 수정**: 강의실/메모 변경
- [ ] [Supabase 확인] `class_groups` row 반영
- [ ] **반 삭제**: 반과 모든 수업 회차 삭제 확인
- [ ] [Supabase 확인] `class_groups` row 사라짐, **cascade 로 `class_sessions` 도 자동 삭제**

> 🟡 **반 수정 시 스케줄 변경**: 시작일/요일이 변경되어 local에서 sessions가 재생성되더라도 서버 sessions는 갱신되지 않음 (의도된 한계). 새 반을 만드는 것이 일관성 있음.

## 4. 수업 회차 진입 / 수업 완료 (class_sessions.status)

- [ ] 반 상세 진입 → 회차 카드 탭
- [ ] "수업 완료" 버튼 클릭
- [ ] [Supabase 확인] 해당 `class_sessions.status='completed'`
- [ ] 새로고침 후 변경 없음 (이미 동기화됨)

## 5. 수업 기록 (lesson_records) + 출결 (attendance_records)

- [ ] 회차 진입 → 공통 수업 기록 / 학생별 평가 / 메모 입력
- [ ] 학생 2명 중 1명만 명시적으로 출결 버튼 누르고 (예: late) 나머지는 기본 상태로 둠
- [ ] "기록 저장" 버튼 클릭
- [ ] [Supabase 확인] `lesson_records` 에 row 1개 (unique `class_session_id`)
- [ ] [Supabase 확인] `lesson_records.student_records` jsonb 의 key 가 학생 **uuid**
- [ ] [Supabase 확인] `attendance_records` 에 row **2개** (반에 속한 학생 전원)
- [ ] [Supabase 확인] late 누른 학생만 `status='late'`, 다른 학생은 `status='present'` (기본 present 보정)
- [ ] **재저장**: 동일 회차에서 값 일부 변경 후 다시 저장
- [ ] [Supabase 확인] `lesson_records` row 수 그대로 1개 (update), `attendance_records` 도 그대로 2개 (upsert)
- [ ] WorkspaceSection 새로고침 후 "수업 기록 1개", "출결 2개"

> 🟡 **출결 버튼만 누르고 저장 안 함**: 출결 버튼은 local 상태만 변경. 서버 동기화는 "기록 저장" 버튼이 트리거. 의도된 설계.

## 6. 클리닉 (clinic_records)

- [ ] 클리닉 탭 → "+" → serverId 있는 학생 선택, 과목/항목 입력 후 저장
- [ ] [Supabase 확인] `clinic_records` row 1개. `student_id` 가 uuid
- [ ] **수정**: 메모/항목 변경
- [ ] [Supabase 확인] row 갱신
- [ ] **삭제**: 카드 펼침 → "삭제"
- [ ] [Supabase 확인] row 사라짐
- [ ] **보완 항목 → 클리닉** (보조강사 모드): 수업 기록에서 강사가 남긴 보완 항목 카드 → "클리닉 기록" 버튼
- [ ] [Supabase 확인] `clinic_records.source_support_tags`, `source_support_memo` 에 강사의 보완 정보가 보존됨

> 🟡 **source_lesson_record_id**: lesson_records 는 serverId 가 local 에 저장되지 않아 항상 `null` 로 저장됨. source 정보는 `source_support_tags` / `source_support_memo` 로만 추적됨.

## 7. 수납 (payments)

- [ ] 정산 → 수납 탭 → 월 선택 → "직접 추가"
- [ ] 학생, 반, 금액 입력 후 추가
- [ ] [Supabase 확인] `payments` row 1개. `student_id` 가 uuid
- [ ] **상태 토글**: 미납 → 수납 완료 (✓)
- [ ] [Supabase 확인] `payments.status='paid'`, `paid_date` 가 오늘 날짜
- [ ] 다시 토글 → 미납
- [ ] [Supabase 확인] `payments.status='unpaid'`, `paid_date=null`
- [ ] **삭제**: 휴지통
- [ ] [Supabase 확인] row 사라짐
- [ ] **자동 생성**: "자동 생성" 버튼 → 반 수강료 기준으로 학생별 row 생성
- [ ] [Supabase 확인] `payments` 에 자동 생성된 row 들 (`unique(class_group_id, student_id, month)` 적용)
- [ ] 같은 달에서 "자동 생성" 다시 눌러도 중복 row 안 생기는지 (local exists check 가 막아줌)
- [ ] **학생 상세 → 정산 탭**: 같은 흐름 한 번 더 확인

## 8. 급여 (payrolls)

- [ ] 정산 → 급여 탭 → "자동 계산"
- [ ] [Supabase 확인] `payrolls` 에 강사/보조강사 수 만큼 row. `staff_type`, `staff_id`, `month` 채워짐
- [ ] **재계산**: 같은 달에서 다시 "자동 계산" → 기존 row 가 덮어쓰기되며 row 수 변하지 않음 (upsert with onConflict)
- [ ] **지급 완료**: "지급 완료 처리" 버튼
- [ ] [Supabase 확인] `payrolls.status='completed'`, `paid_date` 가 오늘 날짜
- [ ] WorkspaceSection 새로고침 후 "급여 기록 N개"

> 🟡 **삭제 UI 없음**: SettlementPage 에 급여 삭제 버튼이 없음. `domainApi.deletePayroll(id)` 만 준비됨.

## 9. WorkspaceSection 서버 카운트

- [ ] 8개 행 모두 표시됨:
  - 학생 N명
  - 반 N개
  - 수업 회차 N개
  - 수업 기록 N개
  - 출결 N개
  - 클리닉 기록 N개
  - 수납 기록 N개
  - 급여 기록 N개
- [ ] "새로고침" 클릭 시 8개 모두 재조회되며 스피너 표시
- [ ] 임의 row 를 Supabase 대시보드에서 직접 삭제 후 새로고침 → 해당 카운트 감소

## 10. 실패 시나리오

- [ ] 인터넷 연결 끊고 학생 추가 → local 에는 저장되고 toast "학생은 추가되었지만 서버 저장은 실패했어요." 표시
- [ ] 연결 복구 후 새로고침 시 서버 카운트에는 미반영 (write-through 만 시도, retry 큐 없음)
- [ ] 다른 사용자가 학원 멤버에서 빠진 뒤 row 수정 → RLS 가 막아 서버 동기화 실패 toast

## 11. 과외 모드 (회귀 점검)

- [ ] 좌측 위 모드 토글로 과외 모드 진입 → 학원 모드와 무관한 학생 목록이 표시됨
- [ ] 과외 모드에서 학생 추가/수정/삭제, 수업 기록, 수납 등 사용
- [ ] [Supabase 확인] **학원 테이블에 변화 없음** (`mode='academy'` 조건이 RLS 와 store 양쪽으로 격리)

## 12. Supabase Table Editor 에서 확인할 테이블 목록

- `academies`
- `academy_members`
- `profiles`
- `students`
- `class_groups`
- `class_sessions`
- `lesson_records`
- `attendance_records`
- `clinic_records`
- `payments`
- `payrolls`

각 테이블에 대해 다음을 자주 확인:
- `mode = 'academy'` 인 row 만 학원 모드에서 보이는지
- `academy_id` 가 본인 학원과 일치하는지
- FK 컬럼 (`student_id`, `class_group_id`, `class_session_id` 등) 이 모두 **uuid** 인지 (local 문자열 id 아님)
- `student_ids`, `student_records` 등 jsonb 컬럼이 uuid 기반인지
