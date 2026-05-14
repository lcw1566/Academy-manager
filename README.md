# 과외 관리 앱 (Academy Manager)

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

### 2. 환경변수 설정

프로젝트 루트에 `.env.local` 파일을 생성하세요.

```
VITE_GEMINI_API_KEY=여기에_API_키_입력
VITE_GEMINI_MODEL=gemini-2.0-flash
```

> `.env.local`은 `.gitignore`에 포함되어 있어 GitHub에 업로드되지 않습니다.

### 3. 사용 모델

기본값: `gemini-2.0-flash` (안정)  
앱 내에서도 더보기 → AI 알림장 설정에서 API 키를 직접 입력할 수 있습니다.

### 모델 오류 발생 시

오류 예: `model is not found for API version v1beta`

현재 사용 가능한 모델을 확인하려면:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY"
```

또는 [Google AI Studio 문서](https://ai.google.dev/gemini-api/docs/models) 참고.

**모델명은 반드시 정확히 입력해야 합니다.**
- 올바른 예: `gemini-2.0-flash`, `gemini-2.5-flash`
- 잘못된 예: `gemini-1.5 flash` (공백 포함 → 오류 발생)

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
