# 채팅 푸시 알림 설정

앱 코드는 PC Web Push, Android FCM, iOS APNs를 지원한다. 채팅과 사용자
데이터는 계속 Supabase에만 저장되며, FCM/APNs는 알림 전달 통로로만 사용한다.

## 1. DB와 Edge Function

1. Supabase SQL Editor에서 `supabase/sql/022_chat_push_notifications.sql` 실행
2. 함수 배포

```bash
supabase functions deploy chat-push
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 배포된
Supabase 함수에 기본 제공된다. service role 키는 프론트/Vercel에 넣지 않는다.

## 2. PC Web Push

VAPID 키를 한 번 생성한다.

```bash
npx web-push generate-vapid-keys
```

- 공개키: Vercel의 `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`
- Edge Function secret: `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`: 운영자 연락처(`mailto:admin@example.com` 형식)

로컬에서는 `.env.local`에도 공개키만 추가한다. Web Push는 운영 HTTPS 주소에서
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
