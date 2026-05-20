# Supabase read-first 전환 전략

## 1. 현재 구조 요약 (Phase 15 시점)

- **localStorage = source of truth**
  - Zustand `useAcademyStore` 가 학원 도메인 데이터를 보유
  - 새 데이터를 만들면 항상 local 에 먼저 저장
- **Supabase = mirror / write-through**
  - 8개 도메인 (`students`, `class_groups`, `class_sessions`, `lesson_records`, `attendance_records`, `clinic_records`, `payments`, `payrolls`) 에 동기 저장
  - 서버 실패 시 local 변경은 유지, 사용자에게 toast 안내
  - 각 local row 에 server uuid 가 `serverId` 로 저장됨 (lesson/attendance 는 unique upsert 패턴이라 보류)
- **읽기**
  - 앱 화면의 모든 목록은 여전히 localStorage 기준
  - 서버 데이터는 `useWorkspaceStore.serverX` 에 read-only 미러로만 보관
  - `WorkspaceSection` 의 카운트 패널이 유일한 가시 표시

## 2. 목표 구조 (Phase 19 도달 후)

- **Supabase = source of truth**
- **localStorage = cache + offline draft**
- 다중 디바이스 (PC ↔ 핸드폰) 에서 동일한 학원 데이터를 일관되게 보게 됨
- 오프라인 상태에서도 입력 가능, 온라인 복귀 시 큐에서 자동 재시도

## 3. 전환 단계

| 단계 | 내용 |
|---|---|
| **16 (현재)** | **수동 hydrate** — 사용자가 버튼을 눌렀을 때만 서버 → local 반영. local-only row 는 보존. 자동 hydrate 없음 |
| 17 | 로그인 직후 hydrate 선택지 제공 — "지금 불러올까요?" 모달. 새 기기에서는 권장 on |
| 18 | 서버 우선 읽기로 전환 — 일부 목록부터 server snapshot 기준으로 표시, localStorage 는 캐시로 강등 |
| 19 | 충돌 해결 + 오프라인 큐 — 동일 row 동시 편집, 네트워크 단절 등에 대한 정책 구현 |

각 단계는 독립적으로 출시·롤백 가능해야 한다. 16단계는 데이터 구조만 만들고 실제 hydrate 는 사용자가 명시적으로 트리거.

## 4. 충돌 정책 초안

### v1 (Phase 16 ~ 18)
- **server wins** — 같은 id/serverId 를 가진 row 는 서버 값으로 덮어쓴다
- **preserve local-only** — server snapshot 에 매핑되지 않는 local row (= serverId 가 없고 server uuid 와도 일치하지 않는 row) 는 그대로 유지
- 자연키 (이름, month 등) 가 같다는 이유만으로 merge 하지 않는다 → 중복이 발생할 수 있음 (인지된 risk)

### v2 (Phase 19~)
- updated_at 기반의 last-writer-wins 또는 사용자에게 선택 모달
- 오프라인 큐: 서버 호출이 실패한 write 를 IndexedDB 에 쌓아 재시도

## 5. 데이터 매핑 원칙

- **server.id == local.id == local.serverId** (Phase 16 기준)
  - server uuid 를 local id 로 그대로 사용
  - PC/핸드폰에서 동일 row 가 동일 id 로 식별됨
  - 기존 write-through 가 그대로 작동 (`update*(serverId, patch)` → serverId 동일)
- **기존 local-only row 의 id 는 변경하지 않는다**
  - 이전에 만든 `as${timestamp}` 같은 ad-hoc id 는 그대로 유지
  - 새로 서버에서 받아온 row 는 uuid id 로 추가
- **이중 id 구조는 유지**
  - hydrate 된 row 도 `serverId` 필드를 명시적으로 보유 (검색 / 명확한 의도)

### 도메인별 매핑 키 요약
| 도메인 | server 키 | local 키 | merge 기준 |
|---|---|---|---|
| students | `id` | `id`, `serverId` | id 일치 또는 serverId 일치 |
| class_groups | `id` | `id`, `serverId` | id 일치 또는 serverId 일치 |
| class_sessions | `id` | `id`, `serverId` | id 일치 또는 serverId 일치 |
| **lesson_records** | `id` (1 row/session) | id (1 row/student per session) | **sessionId 단위로 일괄 교체** |
| **attendance_records** | `id` | `id`, `serverId` | **(sessionId, studentId) 키 일치** |
| clinic_records | `id` | `id`, `serverId` | id 일치 또는 serverId 일치 |
| payments | `id` | `id`, `serverId` | id 일치 또는 serverId 일치 |
| payrolls | `id` | `id`, `serverId` | id 일치 또는 serverId 일치 |

`lesson_records` 는 서버 1행이 local N행으로 펼쳐지므로 row 단위 merge 가 의미 없음 → `sessionId` 단위로 통째로 교체.
`attendance_records` 는 (session, student) 자연키가 unique 라 이 키로 merge 해야 동일 (sessionId, studentId) 의 local 잔여본을 제대로 덮을 수 있음.

## 6. 위험 요소

1. **기존 local 데이터 덮어쓰기** — server wins 정책이므로 같은 id/serverId 의 local 데이터는 사라진다. Phase 16 의 사용자 확인 모달로 일단 방어
2. **serverId 없는 row** — 서버에 올라가지 않은 채로 두면 다중 디바이스에서 보이지 않는다. Phase 17 의 백필 옵션에서 처리 예정
3. **같은 학생/반 중복 생성** — 다른 디바이스에서 같은 이름의 학생을 따로 만들면 hydrate 후 2개로 보임. 자연키 merge 를 의도적으로 안 함 (이름 기반 merge 위험)
4. **class_sessions 회차 매칭** — 자동 생성 sessions 는 (date, start_time) 자연키로 write-through 시 매칭되지만, 다른 디바이스에서 만든 schedule 변경이 있으면 회차 수/일자가 불일치할 수 있음
5. **lesson_records / attendance_records 의 serverId 보유 부재 (Phase 15)** — Phase 16 의 hydrate 가 처음으로 이들에게 serverId 를 채운다. hydrate 이후에는 unique upsert 외에도 id 기반 추적 가능

## 7. 권장 MVP 운영 방식

- **새 학원 파일럿**
  - 빈 localStorage 로 시작 → 학원 생성 → 모든 데이터를 서버에 처음부터 저장
  - 다른 디바이스에서 로그인 → 빈 localStorage → "서버 데이터 불러오기" 한 번 → 동일 상태가 됨
  - 이 흐름이 가장 안정적
- **기존 local 데이터를 보유한 사용자**
  - 16단계에서는 서버에 올라간 row 만 hydrate 됨
  - 17단계 이후 백필 액션 (`localStorage 의 모든 row 를 일괄 서버에 push`) 으로 마이그레이션 권장
  - 그 전까지는 손대지 말 것

## 8. Phase 16 구현물

| 추가 파일 | 용도 |
|---|---|
| `src/services/supabase/hydrateMappers.js` | 8개 도메인 server → local 매퍼 |
| `src/services/supabase/hydrateApi.js` | `fetchAcademySnapshot(academyId)` — 8개 list 병렬 fetch |
| `docs/supabase-read-first-plan.md` | 본 문서 |

| 추가 액션 | 위치 | 용도 |
|---|---|---|
| `hydrateAcademyFromServerSnapshot(snapshot, options)` | `useAcademyStore` | 8개 collection 머지 (serverWins + preserveLocalOnly) |

| 추가 UI | 위치 | 용도 |
|---|---|---|
| "서버 데이터 불러오기" 버튼 | `WorkspaceSection` 서버 데이터 패널 | 수동 hydrate 트리거 (confirm 모달 포함) |

## 9. 비활성화 (절대 하지 말 것 — Phase 16 범위)

- 앱 시작/로그인 시 자동 hydrate
- localStorage 일괄 삭제 후 서버 데이터로 교체
- 자연키 (이름, month 등) 기반 merge
- 기존 write-through 로직 변경
- 마이그레이션 백필 (local → server push)
- 충돌 해결 (server vs local 어느 쪽 우선)
