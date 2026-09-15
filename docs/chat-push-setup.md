# 채팅 푸시 알림 설정

앱 코드는 PC Web Push, Android FCM, iOS APNs를 지원한다. 채팅 원문은
Supabase에서 조회하고, 푸시 제공자에는 일반 안내 문구와 채팅방·학원 ID만 전달한다.
이름, 이메일, 채팅방 제목과 메시지 원문은 알림에 넣지 않는다.

## 1. DB와 Edge Function

1. 로컬에서 새 마이그레이션을 재생하고 `npm run test:db`와 빌드를 확인한다.
2. 배포할 프로젝트의 마이그레이션 내역과 dry-run을 확인한 후 승인된 DB 변경을 적용한다.
   이번 변경은 `20260915032402_harden_chat_push.sql`이다.
   `supabase/sql/022` 등 과거 SQL Editor 스크립트는 다시 실행하지 않는다.
3. **동일한 프로젝트**에 함수 배포. Vercel 프론트 배포만으로 함수는 갱신되지 않는다.

```bash
supabase functions deploy chat-push --project-ref <배포할-project-ref>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 배포된
Supabase 함수에 기본 제공된다. service role 키는 프론트/Vercel에 넣지 않는다.

## 2. PC Web Push

VAPID 키를 한 번 생성한다.

```bash
npx web-push generate-vapid-keys
```

- 앱은 로그인 후 `chat-push` 함수에서 공개키를 조회한다. 별도 Vercel 설정은 필요 없다.
  기존 `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`가 있으면 그 값을 우선 사용하므로 함수의 공개키와 일치해야 한다.
- Edge Function secret: `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`: 운영자 연락처(`mailto:admin@example.com` 형식)

로컬에서는 `.env.local`에 공개키만 추가할 수도 있다. Web Push는 대상 HTTPS 주소에서
실기기 검증한다.

## 3. Android

1. Firebase 프로젝트에 Android 앱 `com.classnote.academymanager` 등록
2. 받은 `google-services.json`을 `android/app/google-services.json`에 배치
3. Firebase 서비스 계정 JSON 전체를 Edge Function의
   `FCM_SERVICE_ACCOUNT_JSON` secret으로 등록
4. `npm run build && npx cap sync android` 후 실기기 빌드

Firebase Database/Auth는 사용하지 않는다. Cloud Messaging만 사용한다.

## 4. iOS

1. Apple Developer에서 App ID의 Push Notifications capability 활성화
2. APNs Auth Key(`.p8`) 생성
3. 다음 Edge Function secrets 등록
   - `APNS_KEY_ID`
   - `APNS_TEAM_ID`
   - `APNS_PRIVATE_KEY`
   - `APNS_BUNDLE_ID=com.classnote.academymanager`
   - 개발 빌드 테스트 시 `APNS_USE_SANDBOX=true`, 배포 빌드는 `false`
4. Xcode에서 서명 팀/프로비저닝 프로파일 선택 후 실기기 빌드

시뮬레이터가 아니라 실제 iPhone에서 테스트한다.

## 5. 동작 확인

- 채팅 탭에서 `채팅 알림 켜기` 선택
- 다른 계정에서 메시지 전송
- 앱/브라우저가 열린 상태, 백그라운드, 종료 상태 각각 확인
- 알림 선택 시 해당 채팅방으로 이동하는지 확인
- 로그아웃한 기기로 이전 계정의 알림이 오지 않는지 확인
- 전체방·선택 단톡방·DM에서 퇴사자와 초대 대기자가 푸시 대상에서 제외되는지 확인
- 알림에 원문·이름·이메일·방 제목이 없고 일반 안내만 표시되는지 확인
- 같은 메시지로 발송 요청을 반복해도 새 푸시가 발생하지 않는지 확인

발송 보장 범위, 자동 테스트와 배포 점검은 [채팅 푸시 보안 변경](./chat-push-hardening.md)을 참고한다.
