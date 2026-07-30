import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeTransition, tossSpring } from '../utils/motion';

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
 * - 애니메이션은 transform translateY + opacity만 사용
 * - drag-to-dismiss: y 방향만 허용하고, velocity/offset 기준으로 닫음
 */
// size: 'default' (max-w-md md:max-w-[560px]) | 'wide' (max-w-md md:max-w-[760px])
//   'wide' 는 2-col 폼처럼 데스크톱에서 가로 공간이 더 필요한 모달용. 모바일 폭은 유지.
// fitContent: true면 콘텐츠 높이만 사용하고 92dvh까지만 확장한다. 문서 미리보기처럼
// 내부에 자체 스크롤 영역이 있는 화면에서 불필요한 빈 공간을 만들지 않는다.
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'default',
  fitContent = false,
  isLoading = false,
  loadingLabel = '불러오는 중이에요',
}) {
  // 배경 스크롤 잠금 — 내부 main 스크롤은 영향 없음
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (typeof document === 'undefined') return null;

  const handleDragEnd = (_, info) => {
    const shouldClose = info.offset.y > 110 || info.velocity.y > 720;
    if (shouldClose) onClose?.();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-black/40 transform-gpu"
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
            transition={tossSpring.sheet}
            drag="y"
            dragDirectionLock
            dragElastic={{ top: 0, bottom: 0.18 }}
            dragConstraints={{ top: 0, bottom: 0 }}
            onDragEnd={handleDragEnd}
            className={`${fitContent ? 'sheet-shell-auto' : 'sheet-shell'} absolute bottom-0 left-0 right-0 max-w-md ${
              size === 'wide' ? 'md:max-w-[760px]' : 'md:max-w-[560px]'
            } mx-auto bg-white rounded-t-[28px] flex flex-col overflow-hidden shadow-2xl transform-gpu`}
            style={{
              willChange: 'transform',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'pan-y',
            }}
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
              <motion.div
                layout="position"
                transition={tossSpring.layout}
                className="px-5 pt-5 pb-6"
              >
                {isLoading ? <SheetLoadingState label={loadingLabel} /> : children}
              </motion.div>
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

function SheetLoadingState({ label }) {
  return (
    <div className="py-8">
      <p className="text-sm font-bold text-[#191F28]">{label}</p>
      <p className="text-xs text-[#8B95A1] mt-1">데이터가 도착하면 자연스럽게 자리를 잡아요.</p>
      <div className="mt-5 flex flex-col gap-3">
        <div className="h-12 rounded-2xl bg-[#F2F4F6]" />
        <div className="h-12 rounded-2xl bg-[#F2F4F6]" />
        <div className="h-20 rounded-2xl bg-[#F2F4F6]" />
      </div>
    </div>
  );
}
