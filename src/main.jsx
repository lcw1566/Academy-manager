import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import './index.css';
import { initializeTheme } from './utils/theme';

const sentryDsn = String(import.meta.env.VITE_SENTRY_DSN || '').trim();

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: import.meta.env.PROD,
    environment: import.meta.env.MODE,
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
