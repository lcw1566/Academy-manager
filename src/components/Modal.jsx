import { useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { sheetTransition, fadeTransition } from '../utils/motion';

export default function Modal({ isOpen, onClose, title, children, footer }) {
  // body 스크롤 잠금 — position:fixed 사용 금지 (iOS PWA에서 viewport 재계산 버그)
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-40">
          {/* 배경 딤 — touch-action:none 으로 터치 스크롤이 배경까지 전달되는 것 차단 */}
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeTransition}
            onClick={onClose}
            style={{ touchAction: 'none' }}
          />

          {/* 시트 본체 — absolute bottom:0 + maxHeight 계산으로 상단 safe area를 침범하지 않음 */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-3xl flex flex-col overflow-hidden shadow-2xl"
            style={{
              // 100vh(PWA에서 = 전체 화면) — 상단 safe area — 여백 16px
              // dvh/svh 미사용: iOS PWA에서 단위 지원 여부 무관하게 vh가 안전
              maxHeight: 'calc(100vh - env(safe-area-inset-top, 44px) - 16px)',
              willChange: 'transform',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={sheetTransition}
          >
            {/* 드래그 핸들 */}
            <div className="flex justify-center pt-3 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              <motion.button
                onClick={onClose}
                whileTap={{ scale: 0.97 }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
              >
                <X size={16} />
              </motion.button>
            </div>

            {/* 내용 — 이 div만 스크롤되고 배경은 고정 */}
            <div
              className="overflow-y-auto overscroll-contain flex-1 px-5 py-4"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
            >
              {children}
            </div>

            {/* 푸터 */}
            {footer && (
              <div
                className="px-5 py-4 border-t border-gray-100 bg-white flex-shrink-0"
                style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
