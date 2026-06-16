# 씨닛 (Seenit)

React + Vite + Tailwind 기반 과외 선생님용 MVP 관리 앱.

## 시작하기

```bash
npm install
npm run dev
```

## AI 알림장 설정 (Gemini API)

AI 알림장 기능을 사용하려면 Gemini API 키가 필요합니다.

### 1. API 키 발급

1. [Google AI Studio](https://aistudio.google.com) 접속
2. Google 계정으로 로그인
3. "Get API key" 클릭 후 키 복사

### 2. 환경변수 설정 (선택)

프로젝트 루트에 `.env.local` 파일을 생성하세요.

```
VITE_GEMINI_API_KEY=여기에_API_키_입력
VITE_GEMINI_MODEL=gemini-2.5-flash
```

> `.env.local`은 `.gitignore`에 포함되어 있어 GitHub에 업로드되지 않습니다.

환경변수를 설정하지 않아도 앱 내 **더보기 → AI 알림장 설정**에서 API 키를 직접 입력할 수 있습니다 (기기 localStorage에만 저장).

### 3. Vercel 배포 시 환경변수 설정

Vercel에 배포하는 경우 환경변수를 대시보드에서 설정하세요.

1. Vercel 대시보드 → 프로젝트 → **Settings → Environment Variables**
2. `VITE_GEMINI_API_KEY` 추가
3. `VITE_GEMINI_MODEL` 추가 (선택, 기본값: `gemini-2.5-flash`)
4. **Redeploy** 실행

> **주의:** `VITE_` 접두사가 붙은 환경변수는 빌드 시 번들에 포함됩니다.  
> 브라우저에서 직접 Gemini API를 호출하므로 API 키가 클라이언트 번들에 노출됩니다.  
> Google AI Studio에서 키에 **HTTP 리퍼러 제한**을 설정하면 무단 사용을 방지할 수 있습니다.

### 4. 사용 모델 및 fallback 순서

기본 모델 시도 순서:

1. `gemini-2.5-flash` (기본)
2. `gemini-2.5-flash-lite`
3. `gemini-2.0-flash`

`VITE_GEMINI_MODEL`이 설정된 경우 해당 모델을 가장 먼저 시도합니다.  
404 오류(모델 없음)일 때만 다음 모델로 넘어갑니다.

### 모델 오류 발생 시

오류 예: `model is not found for API version v1beta`

현재 사용 가능한 모델을 확인하려면:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY"
```

또는 [Google AI Studio 문서](https://ai.google.dev/gemini-api/docs/models) 참고.

## 개인정보 주의사항

AI 알림장 생성 시 학생 이름, 수업 내용, 평가 항목 등 일부 정보가 Google Gemini API로 전송됩니다.

**절대 전송하지 않는 정보:**
- 학부모/학생 전화번호
- 주소
- 계좌번호 및 결제 정보

실사용 시 학생 이름 대신 이니셜을 사용하거나, 민감한 내용은 수업 기록에 적지 않도록 주의하세요.

## 무료 API 한도

- 하루 1,500건
- 분당 15건

## 데이터 저장

모든 데이터는 브라우저 `localStorage`에 저장됩니다. 외부 서버로 전송되지 않습니다.
