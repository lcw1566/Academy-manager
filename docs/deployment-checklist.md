# 배포 체크리스트 (Vercel + Supabase)

학원 파일럿을 위해 **새 환경에 처음 배포**하거나, **변경 사항을 배포**할 때
순서대로 확인할 항목 모음입니다. 가능하면 위에서 아래로 진행해주세요.

---

## 0. 로컬 사전 점검

- [ ] `git status` — 미커밋 변경 없음
- [ ] `npm run build` 성공
- [ ] `.env.local` 이 **커밋되지 않음** (`.gitignore` 가 막고 있는지 확인)
- [ ] `.env.example` 에 두 키만 존재:
  ```
  VITE_SUPABASE_URL=
  VITE_SUPABASE_ANON_KEY=
  ```

## 1. Supabase 프로젝트 준비

> 처음 한 번만. 이미 운영 중이면 SKIP.

- [ ] https://supabase.com/dashboard 에서 새 프로젝트 생성
- [ ] **Project URL** 과 **anon public key** 복사
  - Settings → API → Project URL / Project API keys
- [ ] **service_role key 는 절대 프론트엔드/Vercel 에 노출하지 않음**

## 2. Supabase SQL 마이그레이션

[`supabase-migration-checklist.md`](./supabase-migration-checklist.md) 참조.

Dashboard → SQL Editor 에서 **번호 순서대로 현재 최신 파일까지** 실행:

- [ ] 신규 환경: [`supabase/README.md`](../supabase/README.md)의 실행 순서대로 `001`~`028`
- [ ] 기존 환경: 마지막 적용 번호 다음 파일부터 `028`까지
- [ ] `025_operations_manager_role.sql`
- [ ] `026_deferred_staff_role_assignment.sql`
- [ ] `027_attendance_choices_and_invitation_display.sql`
- [ ] `028_role_permissions_and_payroll_privacy.sql`

각 SQL 은 idempotent — 재실행해도 안전합니다.

## 3. Git push

- [ ] `git push origin master` (또는 운영 브랜치)
- [ ] GitHub 저장소에 최신 커밋 반영 확인

## 4. Vercel 프로젝트 연결

> 처음 한 번만.

- [ ] https://vercel.com/new 에서 GitHub 저장소 import
- [ ] **Framework Preset:** Vite (자동 감지)
- [ ] **Build Command:** `npm run build`
- [ ] **Output Directory:** `dist`

## 5. Vercel 환경 변수 설정

Project Settings → Environment Variables 에서 **Production / Preview / Development**
스코프 모두 체크하고 두 개 추가:

| Key | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | 위 1번에서 복사한 Project URL |
| `VITE_SUPABASE_ANON_KEY` | 위 1번에서 복사한 anon public key |

- [ ] 두 변수 모두 입력 완료
- [ ] **service_role key 가 들어있지 않은지 다시 확인**
- [ ] Save → 다음 배포부터 자동 적용

## 6. Supabase 이메일 인증

- [ ] Authentication → Providers → Email에서 **Confirm email** 활성화
- [ ] Authentication → URL Configuration의 **Site URL**을 실제 Vercel 운영 주소로 설정
- [ ] Preview 주소를 쓸 경우 허용할 Redirect URL도 등록
- [ ] 새 이메일로 가입 → 인증 전 로그인 차단 → 메일 링크 인증 → 로그인 성공 확인

## 6. 첫 배포

- [ ] Vercel 이 자동으로 Deploy 시작 (Push 시 자동 트리거)
- [ ] Build 단계 성공 (`✓ built in ...s`)
- [ ] Deployment 상태 Ready
- [ ] Production URL 클릭 → 로그인 화면 노출 확인 (Phase 26 login-first)

## 7. 첫 로그인 / 스모크 테스트

브라우저 (또는 시크릿 창) 에서 배포 URL 접속:

- [ ] 로그인 화면이 나타남 (Role 선택 화면 X)
- [ ] 회원가입 → 계정 유형 선택 (원장으로 테스트 권장)
- [ ] 이메일 인증 사용 시 메일 확인 → 인증 후 로그인
- [ ] 자동으로 학원 워크스페이스 / Owner 모드 진입
- [ ] 학원 생성 가능

## 8. 모바일 테스트

- [ ] 휴대폰 브라우저로 같은 URL 접속
- [ ] 같은 계정 로그인
- [ ] **자동 hydrate** 발동 → PC 데이터가 모바일에 나타남
- [ ] 자동 hydrate 후 두 번째 새로고침 시 hydrate 가 다시 돌지 않음 (sessionStorage 가 1회로 제한)

## 9. 권한 분리 테스트

각 역할로 회원가입/초대 수락 후:

- [ ] **Owner**: 학생/반/수납/급여/Danger Zone 모두 보임
- [ ] **Teacher**: settlement 탭 없음 / Danger Zone 없음 / 강사관리 없음, 본인 배정만 표시
- [ ] **Assistant**: clinic 탭만 추가, owner UI 미노출

자세한 항목은 [`pilot-qa-checklist.md`](./pilot-qa-checklist.md) 참조.

## 10. 운영 중 점검 항목

- [ ] Vercel Logs / Functions Logs 에 5xx 가 잦지 않은지
- [ ] Supabase Dashboard → Database → Logs 에 RLS 거부가 의외로 자주 발생하지 않는지
- [ ] 사용자 피드백 채널 (Slack/카톡 등) 일일 점검

---

## 알려진 한계

- 자동 hydrate 는 세션당 1회. 새로고침 후에도 sessionStorage 유지 시
  자동으로 다시 받지 않음 (수동 새로고침 버튼 사용)
- 동시 편집 시 충돌 해결 미구현 — 마지막 저장 승리 (last-write-wins)
- 실시간 동기화 미구현
- 초대 메일 자동 발송은 미지원, 앱 내 초대만 동작

## 롤백

- Vercel: Deployments → 이전 빌드 → Promote to Production
- Supabase: SQL 마이그레이션은 idempotent 이지만 **destructive 명령은 들어있지 않음**.
  데이터 롤백이 필요하면 백업/스냅샷 기능 사용 (Supabase Pro 이상)
