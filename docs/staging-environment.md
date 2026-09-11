# 씨닛 스테이징 환경

스테이징은 운영과 완전히 다른 Supabase 프로젝트와 Vercel 주소에서 실제 로그인, 직원 초대,
권한 변경, 퇴사 같은 흐름을 검증하는 리허설 환경이다. 운영 데이터를 복사하지 않고 합성
데이터만 사용한다.

## 환경 구조

| 환경 | Supabase | 앱 주소 | 목적 |
|---|---|---|---|
| 로컬/CI | 로컬 Docker | localhost | 전체 자동 회귀 테스트 |
| 스테이징 | 별도 프로젝트 | 별도 HTTPS 주소 | 실제 배포와 계정 협업 검증 |
| 운영 | `vfiiieqnxawnhtgrvmxn` | 운영 주소 | 실제 서비스, 최소 스모크만 허용 |

스테이징 자동 테스트는 코드에 기록된 운영 project ref를 거부한다. 실행 전에는 스테이징
Supabase URL/ref를 대조하고, 배포 앱이 공개하는 환경/ref 표식도 다시 대조한다. 둘 중 하나가
다르면 Auth 계정 로그인 전에 중단한다.

## 최초 구성

1. 운영과 같은 조직에 `Academy-manager-staging` Supabase 프로젝트를 생성한다.
2. 운영 데이터를 복사하지 않고 `supabase/migrations/`만 새 프로젝트에 적용한다.
3. 별도 Vercel 프로젝트 또는 고정 스테이징 브랜치 배포를 만든다.
4. 스테이징 Vercel에 아래 공개 빌드 변수만 등록한다.

   - `VITE_DEPLOY_ENV=staging`
   - `VITE_SUPABASE_URL=<스테이징 Project URL>`
   - `VITE_SUPABASE_ANON_KEY=<스테이징 anon key>`
   - `VITE_PUBLIC_APP_URL=<스테이징 앱 주소>`

5. `STAGING_SUPABASE_SERVICE_ROLE_KEY`는 Vercel에 넣지 않는다. 로컬의
   `.env.staging.local` 또는 GitHub `staging` Environment secret에서만 사용한다.
6. 문자, 푸시, 이메일, 결제 연동은 실제 발송 대신 샌드박스 또는 비활성 상태로 둔다.

`.env.staging.local`에 DB 비밀번호를 넣은 뒤 migration을 먼저 미리 보고 적용한다. 두 명령은
운영 project ref를 거부하며 기존 운영 링크도 변경하지 않는다.

```bash
npm run staging:db:dry-run
npm run staging:db:push
```

## 로컬에서 스테이징 검증

저장소의 `.env.staging.example`을 참고해 Git에서 제외되는 `.env.staging.local`을 만든다.

```bash
npm run test:e2e:staging
```

실행 시 스테이징 Auth에 아래 계정을 생성 또는 갱신하고, 실제 초대 RPC로 한 테스트 학원에
연결한다.

- 스테이징 E2E 원장
- 스테이징 E2E 운영 매니저
- 스테이징 E2E 선생님
- 스테이징 E2E 초대 대기 계정

직원 탭에는 원장·매니저·선생님이 실제 멤버로 표시된다. 원장 세션에서 선생님의 개인
권한을 저장하고, 각 계정의 독립 세션에서 서버 권한과 메뉴 노출을 함께 확인한다. 테스트
학원 초기화 RPC는 `developer_test_workspaces`에 등록된 합성 학원만 변경하며 모든 초기화와
권한 변경은 감사 로그에 남는다.

실패 보고서는 다음 명령으로 확인한다.

```bash
npm run test:e2e:staging:report
```

## GitHub 수동 실행

`.github/workflows/staging-e2e.yml`은 자동으로 실행되지 않는다. GitHub의 `staging`
Environment에 다음 값을 등록한 뒤 Actions 화면에서 수동 실행한다.

- Variables: `STAGING_APP_URL`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PROJECT_REF`
- Secrets: `STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`,
  `STAGING_E2E_USER_PASSWORD`

GitHub Environment에 승인 규칙을 두면 스테이징 데이터 변경 테스트를 실행하기 전에 사람이
한 번 확인할 수 있다.
