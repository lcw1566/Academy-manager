import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
  },
})
