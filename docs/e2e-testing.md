# Playwright E2E 테스트 가이드

이 테스트는 로컬 Supabase만 사용한다. 실행기가 API URL의 호스트를 확인하며
`localhost`, `127.0.0.1`, `::1` 이외의 프로젝트는 즉시 차단한다. 운영 프로젝트나
운영 개발자 계정으로 E2E를 실행하지 않는다.

## 사전 준비

- Node.js 24
- Docker Desktop 또는 Docker 호환 런타임
- 저장소 의존성 설치: `npm ci`
- Chromium 설치
  - Windows/macOS: `npx playwright install chromium`
  - Linux/WSL: `npx playwright install --with-deps chromium`

Linux/WSL의 `--with-deps` 단계는 시스템 라이브러리를 설치하므로 `sudo` 비밀번호를
요청할 수 있다. 브라우저만 먼저 설치했다면 `npx playwright install-deps chromium`을
한 번 실행하면 된다.

WSL에서 `docker` 명령이 없거나 `UtilBindVsockAnyPort` 오류가 나면 Docker Desktop의
**Settings → Resources → WSL Integration**에서 현재 배포판을 활성화하고 WSL 터미널을
다시 연다. `docker version`에서 Server 버전이 보여야 Supabase를 시작할 수 있다.

## 실행

```bash
npm run supabase:start
npm run test:db
npm run test:e2e
```

반드시 `npm run test:e2e` 실행기를 사용한다. 실행기는 로컬 Supabase URL과 브라우저에
전달되는 `VITE_SUPABASE_URL`을 같은 값으로 설정하고 둘 중 하나라도 원격이면 중단한다.

UI 모드는 다음 명령으로 연다.

```bash
npm run test:e2e:ui
```

HTML 결과는 `npm run test:e2e:report`로 확인한다. 실패한 테스트의 trace, 화면,
비디오는 `test-artifacts/`에 저장되며 Git에 포함되지 않는다.

## 테스트 계정과 데이터

테스트 시작 시 로컬 Auth에 원장, 운영 매니저, 선생님, 초대 대기 전용 계정을 생성하거나
갱신한다. 주소는 모두 예약된 `example.test` 도메인을 사용하며 운영의 테스트 계정을
재사용하지 않는다. 원장 계정만 로컬 `app_developers` 서버 allowlist에 등록한다.
비밀번호와 로컬 service-role 키는 테스트 프로세스 환경에서만 사용하며 브라우저용
`VITE_` 변수나 저장소 파일에 기록하지 않는다.

| 계정 | 서버 상태 | 주 검증 범위 |
|---|---|---|
| `owner.e2e@example.test` | 원장 + 로컬 개발자 | 테스트 랩 준비, 전체 운영 권한 |
| `manager.e2e@example.test` | 활성 운영 매니저 | 수납·직원 운영 |
| `teacher.e2e@example.test` | 활성 선생님 | 수업·학생·본인 급여, 수납 차단 |
| `invited.e2e@example.test` | 초대 대기 | 수락 전 학원 접근 차단 |

각 테스트는 `prepare_developer_test_lab('full')` RPC로 합성 학원을 다시 준비한다.
역할별 계정은 독립 브라우저 세션을 사용하지만 하나의 합성 학원을 공유하므로 Playwright
worker를 1개로 제한했다. 병렬화를 추가하려면 worker마다 별도의 원장 계정과 테스트
학원을 할당해야 한다.

로그인 세션은 역할별로 `playwright/.auth/*.json`에 임시 저장한다. 앱의 워크스페이스
선택 상태는 sessionStorage에 있으므로 테스트는 이를 주입하지 않고 실제 선택 화면을
거친다. 이 파일들은 인증 토큰을 포함하므로 Git에서 제외한다.

## 포함된 검증

- 개발자 워크스페이스 진입과 합성 데이터 개수
- 선생님 역할 및 수납 권한의 UI 반영
- 초대 대기 사용자의 학원 접근 차단
- 수납·급여 RLS 권한 매트릭스
- 학생 연락처·학부모 연락처·체크인 PIN 직접 조회 차단 및 보안 RPC 마스킹
- 원장·운영 매니저·선생님·초대 대기 독립 계정의 UI 및 Data API 분리
- 기존 SQL 역할 테스트 084~087

Playwright는 웹 화면과 Data API를 검증한다. Capacitor 카메라, 네이티브 푸시,
iOS/Android 권한 창은 실제 기기용 별도 테스트 대상이다.

환경별 사용 원칙과 운영 테스트 계정 취급은 `docs/testing-strategy.md`를 따른다.
