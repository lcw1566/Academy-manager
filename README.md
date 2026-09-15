# 씨닛 (Seenit)

학원 운영을 위한 React + Vite + Tailwind 애플리케이션. 인증과 학원 데이터는
Supabase에서 관리하며, 서버 RLS와 보안 RPC가 사용자별 권한을 검증한다.

## 개발 시작

Node.js 24와 Docker가 필요하다. `.env.example`을 참고해 Git에서 제외되는
`.env.local`에 개발 대상의 공개 Supabase URL/key를 설정한다.
운영 프로젝트를 자동 테스트 대상으로 사용하지 않는다.

```bash
npm ci
npm run dev
```

## 검증

```bash
npm run supabase:start
npx supabase migration up --local
npm run test:db
npm run test:e2e
SENTRY_UPLOAD_SOURCEMAPS=0 npm run build
```

E2E 실행기가 로컬 전용 환경변수와 합성 테스트 계정을 준비한다.
Chromium 설치 등은 [E2E 가이드](docs/e2e-testing.md)를 따른다.
위 빌드 명령은 로컬 검증에서 외부 Sentry 업로드를 생략한다.

## 환경과 데이터

- 로컬/CI: Docker Supabase와 자동 회귀 테스트.
- 스테이징: 별도 Supabase와 Vercel 프로젝트에서 합성 계정으로 배포 검증.
- 운영: 실제 고객 데이터와 서비스. 검증한 staging 변경을 PR로 master에 병합한다.

개인 과외 모드와 개인 과외용 AI 알림장은 제거했다. 학생 목록·연락처·보호자 정보·
체크인 PIN은 Zustand 영구 캐시에 저장하지 않고, 새로고침마다 서버에서 권한을 확인해
불러온다. 그 외 일부 학원 화면 데이터와 로그인 세션은 브라우저에 저장된다.

## 운영 문서

- [테스트 전략](docs/testing-strategy.md)
- [스테이징 구성과 배포 검증](docs/staging-environment.md)
- [개발자 워크스페이스](docs/developer-workspace.md)
- [개인 과외 제거·개인정보 캐시·공개 QR 변경과 배포 절차](docs/privacy-checkin-hardening.md)

스키마 변경은 `supabase/migrations/`의 timestamp migration으로 관리한다.
`supabase/sql/`은 과거 SQL Editor 기록이며 운영에 다시 일괄 적용하지 않는다.
