import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const isProductionBuild = command === 'build' && mode === 'production';

  return {
    plugins: [
      react(),
      // 개발 서버와 E2E 빌드가 Sentry release/source map 업로드를 시도하지 않게 한다.
      // Vite의 기본 `build` 모드인 production에서만 업로드 플러그인을 활성화한다.
      ...(isProductionBuild ? [sentryVitePlugin({
        org: "student-n02",
        project: "javascript-react",
        // 로컬 검증처럼 외부 release를 만들면 안 되는 production-mode 빌드에서는
        // SENTRY_UPLOAD_SOURCEMAPS=0으로 명시적으로 끌 수 있다.
        disable: process.env.SENTRY_UPLOAD_SOURCEMAPS === '0',
      })] : []),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/@sentry/')) return 'sentry-vendor';
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
              return 'react-vendor';
            }
            if (id.includes('/@supabase/')) return 'supabase-vendor';
            if (id.includes('/framer-motion/') || id.includes('/motion-dom/') || id.includes('/motion-utils/')) {
              return 'motion-vendor';
            }
            if (id.includes('/lucide-react/')) return 'icons-vendor';
            if (id.includes('/@capacitor/')) return 'capacitor-vendor';
            if (id.includes('/qrcode/') || id.includes('/jsqr/')) return 'qr-vendor';
            // 공유 드라이브에서만 동적으로 불러오는 문서 렌더러. 기본 앱 번들에
            // HWP/HWPX·DOCX 파서를 섞지 않아 초기 로딩을 유지한다.
            if (id.includes('/docx-preview/') || id.includes('/jszip/')) return 'document-docx-vendor';
            if (id.includes('/@rhwp/core/')) return 'document-rhwp-vendor';
            if (id.includes('/@ssabrojs/hwpxjs/')) return 'document-hangul-vendor';
            return 'vendor';
          },
        },
      },
      sourcemap: true,
    },
  };
})
