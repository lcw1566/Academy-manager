import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { validateDeploymentEnvironment } from './scripts/deployment-environment.mjs';

export default defineConfig(({ command, mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  const isProductionBuild = command === 'build' && mode === 'production';
  if (command === 'build') validateDeploymentEnvironment(env, { command });
  const uploadSourceMaps = isProductionBuild
    && env.SENTRY_UPLOAD_SOURCEMAPS !== '0'
    && Boolean(env.SENTRY_AUTH_TOKEN);

  return {
    plugins: [
      react(),
      // 개발 서버와 E2E 빌드가 Sentry release/source map 업로드를 시도하지 않게 한다.
      // Vite의 기본 `build` 모드인 production에서만 업로드 플러그인을 활성화한다.
      ...(uploadSourceMaps ? [sentryVitePlugin({
        org: "student-n02",
        project: "javascript-react",
        sourcemaps: {
          // Upload first, then remove maps before Vercel collects dist.
          filesToDeleteAfterUpload: './dist/**/*.map',
        },
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
      // Hidden maps still exist as files; only create them for Sentry upload.
      sourcemap: uploadSourceMaps ? 'hidden' : false,
    },
  };
})
