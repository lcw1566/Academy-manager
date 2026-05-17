import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeTransition } from '../utils/motion';

const SHEET_EASE = [0.22, 1, 0.36, 1];

/**
 * Bottom Sheet Modal
 *
 * 핵심: createPortal로 document.body에 렌더한다.
 *   AppLayout/AcademyAppLayout이 페이지 wrapper에 framer-motion `y` 애니메이션을
 *   적용해 transform이 걸려 있는데, transform이 있는 ancestor는 position:fixed의
 *   containing block이 되므로 portal 없이는 시트가 페이지 영역에 갇혀 viewport
 *   기준이 무너진다 (제목 잘림 / 시트가 위로 밀려 보임 / 배경 dim이 viewport를
 *   다 덮지 못함의 근본 원인).
 *
 * 안정성을 위해 다음 규칙을 지킴:
 * - sheet 자체는 .sheet-shell로 h+max-h 92dvh 고정 (flex 자식 계산이 안정)
 * - sheet: flex flex-col + overflow-hidden
 * - header: shrink-0 (제목 + drag handle + 닫기)
 * - main: flex-1 **min-h-0** overflow-y-auto  ← min-h-0이 없으면 flex 자식이 content 크기 아래로 안 줄어들어 스크롤이 망가짐
 * - footer: shrink-0 + safe-area-inset-bottom padding
 * - 애니메이션은 transform translateY만 사용 (layout 애니메이션 금지)
 * - drag-to-close 제거: overlay 탭/X 버튼으로 충분, 스크롤 충돌 방지
 */
export default function Modal({ isOpen, onClose, title, children, footer }) {
  // 배경 스크롤 잠금 — 내부 main 스크롤은 영향 없음
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (typeof document === 'undefined') return null;

  return createPortal(
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
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.32, ease: SHEET_EASE }}
            className="sheet-shell absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[28px] flex flex-col overflow-hidden shadow-2xl"
            style={{ willChange: 'transform' }}
          >
            {/* Header — 항상 shrink-0, 제목 잘림 방지 */}
            <header className="shrink-0 bg-white border-b border-gray-100">
              <div className="flex justify-center pt-3">
                <div className="h-1.5 w-12 rounded-full bg-gray-200" />
              </div>
              <div className="flex items-center justify-between px-5 pb-4 pt-3">
                <h2 className="text-xl font-bold text-gray-900 truncate pr-3">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 w-11 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200 flex-shrink-0"
                  aria-label="닫기"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            {/* Body — min-h-0이 핵심 (flex-1 + min-h-0가 스크롤 활성화의 조건) */}
            <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar sheet-content">
              <div className="px-5 pt-5 pb-6">
                {children}
              </div>
            </main>

            {/* Footer — main scroll 영역 밖, safe-area 반영 */}
            {footer && (
              <footer className="shrink-0 border-t border-gray-100 bg-white px-5 pt-3 sheet-footer-pad">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
