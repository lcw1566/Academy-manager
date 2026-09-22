# 씨닛 배포 체크리스트

운영은 `staging` 검증 후 PR로 `master`에 병합한다. 운영 DB 변경과 운영 배포는
승인된 배포 작업에서만 수행한다. 이 문서의 명령은 실행 순서이며, 승인 없이 운영에
적용하라는 뜻이 아니다.

## 1. 검증할 변경 확정

- [ ] 변경 파일과 migration, Edge Function 목록을 검토한다. 비밀값과 테스트 인증
      파일이 Git에 포함되지 않았는지 확인한다.
- [ ] `npm run check`, `npm run test:db`, `npm run test:e2e`,
      `npm run build:local-production`을 같은 커밋에서 통과시킨다.
- [ ] CI의 `release-manifest.json`에 커밋, migration 목록, Edge Function 소스
      해시와 검증 결과가 기록됐는지 확인한다. 배포 직전에 커밋이 바뀌면 다시 검증한다.
- [ ] `staging`의 필수 CI 결과와 스테이징 E2E, 역할별 수동 검증을 확인한다.

## 2. 스테이징 리허설

- [ ] `npm run staging:db:dry-run`에서 스테이징 프로젝트와 **예정된 신규
      timestamp migration만** 표시되는지 확인한다.
- [ ] 스테이징 DB에 변경을 적용하고 같은 커밋의 스테이징 앱과 필요한 Edge
      Function을 배포한다. DB와 앱 사이의 기능별 호환 순서를 검토한다.
- [ ] 역할별 로그인, RLS 직접 REST/RPC 거절, 개인정보, 출결, 채팅, 동기화,
      파일 업로드 등 변경된 경로를 확인한다.
- [ ] 배포 URL의 `.map` 요청이 소스 내용을 반환하지 않는지 확인한다.

## 3. 운영 배포 승인과 대상 확인

- [ ] 스테이징에서 검증한 커밋으로 `staging → master` PR을 만든다. 필수 CI가
      실패하거나 검증 후 변경된 커밋은 병합하지 않는다. GitHub 브랜치 보호와
      required checks의 실제 설정도 확인한다.
- [ ] 운영 Supabase 연결을 다시 확인하고 `npx supabase db push --linked --dry-run`에서
      의도한 파일만 pending인지 확인한다. 기준 migration은
      `20260910163138_remote_schema_baseline`이며, `supabase/sql/001`~`084`는
      재등록하거나 재실행하지 않는다.
- [ ] 운영 데이터 변경, 공개 기능, Edge Function 배포 범위를 승인한다. 스테이징
      계정 전환 함수의 배포·등록·활성화는 운영 범위에서 제외한다.
- [ ] 승인된 순서로 운영 DB, Edge Function, 앱을 반영하고 실제 서비스 주소에서
      배포 커밋 및 Supabase 환경 표식을 확인한다.

## 4. 배포 직후

- [ ] 소스맵 URL이 404/403이며 내용을 반환하지 않는지 확인한다. Sentry 업로드와
      실제 Vercel 배포 성공은 별도로 확인한다.
- [ ] 변경된 경로를 최소한의 합성 데이터로 스모크 테스트한다. 운영 고객 데이터의
      초기화·역할 전환·파괴적 E2E는 하지 않는다.
- [ ] `supabase migration list` 이력, Security/Performance Advisors, 즉시 발생한
      5xx와 Sentry 오류를 확인한다.
- [ ] 배포 커밋, migration, Edge Function 버전, 확인자와 결과를 배포 기록에 남긴다.

## 환경 변수

운영 Vercel은 `VITE_DEPLOY_ENV=production`, 운영 Supabase URL·publishable key를
**Production 범위**에 설정한다. 스테이징 Vercel은 별도 프로젝트와 `staging` 범위
값을 사용한다. 앱 주소는 `src/config/deploymentTargets.js`의 환경별 값으로 고정하며,
기존 `VITE_PUBLIC_APP_URL`이 비어 있거나 잘못된 형식이어도 이 주소를 사용한다. 같은
Supabase 값을 Production/Preview/Development 전부에 복사하지 않는다. 빌드 검증은
환경·앱 주소·Supabase 프로젝트 조합이 맞지 않으면 실패한다. `SENTRY_AUTH_TOKEN`은
필요할 때 Production 빌드 전용 비밀로 두고 `VITE_` 접두사를 붙이지 않는다.
service-role 키, DB 비밀번호, OAuth 비밀은 브라우저 빌드 변수로 넣지 않는다.

이메일 인증은 현재 무료 플랜 제한 때문에 사용자 결정으로 보류 중이다. 활성화와
SMTP 구성은 별도 작업으로 검토한다. 실시간 동기화는 구현돼 있으나, 새 기능의
권한·구독 범위는 별도로 검증한다. 과거와 향후 migration에 데이터 삭제나 호환성
변경이 있을 수 있으므로 모든 SQL을 무해하거나 자동 롤백 가능하다고 가정하지 않는다.

## 장애와 롤백

앱 롤백은 Vercel의 이전 배포를 승격할 수 있지만, DB 스키마와 Edge Function이 이전
앱과 호환되는지 먼저 확인한다. DB를 무작정 역방향 SQL로 되돌리지 않는다. 데이터
복구와 수동 출결 절차는 [운영 복구 가이드](./operations-recovery-runbook.md)를 따른다.
