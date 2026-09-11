import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import 'wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.css';
import App from './App';
import './index.css';
import { initializeTheme } from './utils/theme';
import { installDynamicImportRecovery } from './utils/dynamicImportRecovery';

// 열린 탭이 배포 교체 전의 해시 청크를 요청하면 최신 HTML을 한 번 다시 받아온다.
// React 렌더링보다 먼저 등록해야 첫 lazy import 실패도 놓치지 않는다.
installDynamicImportRecovery();

const sentryDsn = String(import.meta.env.VITE_SENTRY_DSN || '').trim();

// Playwright가 배포된 앱과 연결 대상 Supabase를 서로 대조할 수 있는 공개 표식이다.
// project ref는 Project URL에도 포함되는 공개 식별자이며 비밀키를 노출하지 않는다.
const deploymentEnvironment = String(
  import.meta.env.VITE_DEPLOY_ENV || (import.meta.env.DEV ? 'local' : 'production'),
).trim();
let supabaseProjectRef = 'unknown';
try {
  const supabaseHost = new URL(String(import.meta.env.VITE_SUPABASE_URL || '')).hostname;
  supabaseProjectRef = ['127.0.0.1', 'localhost', '::1'].includes(supabaseHost)
    ? 'local'
    : supabaseHost.split('.')[0] || 'unknown';
} catch {
  // Supabase 설정 오류는 기존 클라이언트 초기화에서 사용자에게 안내한다.
}
document.documentElement.dataset.seenitEnvironment = deploymentEnvironment;
document.documentElement.dataset.seenitSupabaseProject = supabaseProjectRef;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: import.meta.env.PROD,
    environment: deploymentEnvironment,
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    beforeSend(event) {
      if (!event.request) return event;

      const request = { ...event.request };
      delete request.cookies;
      delete request.data;
      if (request.url) {
        try {
          const url = new URL(request.url);
          url.search = '';
          url.hash = '';
          request.url = url.toString();
        } catch {
          request.url = String(request.url).split(/[?#]/)[0];
        }
      }
      if (request.headers) {
        const headers = { ...request.headers };
        for (const key of Object.keys(headers)) {
          if (['authorization', 'cookie', 'set-cookie'].includes(key.toLowerCase())) {
            delete headers[key];
          }
        }
        request.headers = headers;
      }
      return { ...event, request };
    },
  });
}

// React가 그려지기 전에 저장된 테마를 적용해 첫 화면이 번쩍이는 현상을 막는다.
initializeTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 알림 허용 여부와 무관하게 설치형 PWA로 인식되도록 서비스 워커를 등록한다.
if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/push-sw.js')
      .catch((error) => console.warn('[pwa] service worker registration failed', error));
  });
}
