import { useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { sheetTransition, fadeTransition } from '../utils/motion';

export default function Modal({ isOpen, onClose, title, children, footer }) {
  // 모달이 열리면 body 스크롤 잠금 (배경 스크롤 방지)
  useEffect(() => {
    if (!isOpen) return;
    const y = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${y}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, y);
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeTransition}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-md bg-white rounded-t-3xl flex flex-col overflow-hidden shadow-2xl"
            style={{
              // dvh = 주소창 제외 실제 보이는 뷰포트 높이
              // safe-area-inset-top = 노치/다이나믹 아일랜드 높이
              maxHeight: 'calc(100dvh - env(safe-area-inset-top, 44px) - 16px)',
              willChange: 'transform',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={sheetTransition}
          >
            {/* 드래그 핸들 */}
            <div className="flex justify-center pt-3 pb-0 flex-shrink-0">
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

            {/* 내용 — 이 영역만 스크롤됨 */}
            <div
              className="overflow-y-auto overscroll-contain flex-1 px-5 py-4"
              style={{ WebkitOverflowScrolling: 'touch' }}
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
