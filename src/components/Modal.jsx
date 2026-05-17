import { useEffect } from 'react';
import { X } from 'lucide-react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  useDragControls,
} from 'framer-motion';
import { fadeTransition } from '../utils/motion';

const EASE_OUT = [0.22, 1, 0.36, 1];
const EASE_IN  = [0.4, 0, 1, 1];

/**
 * Bottom Sheet Modal
 * - 구조: header (shrink-0) / main (flex-1 overflow-y-auto) / footer (shrink-0)
 * - 높이: max-h-[92dvh] (모바일 dynamic viewport 대응)
 * - drag-to-close: 헤더(drag handle)만 잡을 때 동작. 본문 스크롤과 충돌 없음.
 * - safe-area: footer padding-bottom에 env(safe-area-inset-bottom) 포함
 */
export default function Modal({ isOpen, onClose, title, children, footer }) {
  const y = useMotionValue(0);
  const dragControls = useDragControls();

  // 열릴 때: 화면 아래에서 → y=0 (in-place)
  useEffect(() => {
    if (!isOpen) return;
    y.set(window.innerHeight);
    animate(y, 0, { duration: 0.3, ease: EASE_OUT });
  }, [isOpen]); // eslint-disable-line

  // 배경 스크롤 잠금
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const doClose = () => {
    animate(y, window.innerHeight, { duration: 0.22, ease: EASE_IN });
    setTimeout(onClose, 220);
  };

  const handleDragEnd = (_, info) => {
    const cur = y.get();
    // 빠른 아래 스와이프 또는 일정 거리 이상 내려갔으면 닫기
    if (info.velocity.y > 400 || cur > 120) {
      doClose();
    } else {
      animate(y, 0, { type: 'spring', damping: 28, stiffness: 220 });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeTransition}
            onClick={doClose}
          />

          {/* Sheet — bottom-anchored, max-h-[92dvh] */}
          <motion.div
            className="sheet-shell absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[28px] flex flex-col overflow-hidden shadow-2xl"
            style={{ y, willChange: 'transform' }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.2 }}
            onDragEnd={handleDragEnd}
          >
            {/* Header (drag handle + title + close) — 드래그는 여기서만 시작 */}
            <header
              className="shrink-0 select-none"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="flex items-center justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>
              <div className="flex items-center justify-between px-5 pt-1.5 pb-3 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                <motion.button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={doClose}
                  whileTap={{ scale: 0.95 }}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
                  aria-label="닫기"
                >
                  <X size={16} />
                </motion.button>
              </div>
            </header>

            {/* Body — 단일 스크롤 컨테이너 */}
            <main
              className="flex-1 overflow-y-auto overscroll-contain scroll-soft px-5 pt-4 sheet-content-pad"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {children}
            </main>

            {/* Footer — 항상 보이는 액션 영역 */}
            {footer && (
              <footer className="shrink-0 border-t border-gray-100 bg-white px-5 pt-3 sheet-footer-pad">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
