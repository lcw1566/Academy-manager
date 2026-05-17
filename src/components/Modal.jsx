import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { fadeTransition } from '../utils/motion';

const EASE_OUT = [0.22, 1, 0.36, 1];
const EASE_IN  = [0.4, 0, 1, 1];
const PARTIAL  = 0.32; // 기본 상태: 위에서 32%만 숨김 (68% 노출)

export default function Modal({ isOpen, onClose, title, children, footer }) {
  // CSS vh/dvh 대신 JS로 실제 가시 높이 측정 — iOS PWA에서도 정확함
  const [maxH, setMaxH] = useState(0);
  const maxHRef = useRef(0);
  const y = useMotionValue(0);

  useEffect(() => {
    const measure = () => {
      const h = (window.visualViewport?.height ?? window.innerHeight) - 16;
      setMaxH(h);
      maxHRef.current = h;
    };
    measure();
    window.visualViewport?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    return () => {
      window.visualViewport?.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  // 열릴 때: 화면 밖에서 시작 → partial 위치로 슬라이드 업
  useEffect(() => {
    if (!isOpen || !maxH) return;
    y.set(maxH);
    animate(y, maxH * PARTIAL, { duration: 0.3, ease: EASE_OUT });
  }, [isOpen, maxH]); // eslint-disable-line

  // body 스크롤 잠금
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // 닫기 애니메이션 후 onClose 호출
  const doClose = () => {
    animate(y, maxHRef.current, { duration: 0.22, ease: EASE_IN });
    setTimeout(onClose, 220);
  };

  const handleDragEnd = (_, info) => {
    const cur = y.get();
    const h   = maxHRef.current;

    if (info.velocity.y > 400 || cur > h * 0.55) {
      // 아래로 충분히 드래그 → 닫기
      doClose();
    } else if (info.velocity.y < -200 || cur < h * 0.08) {
      // 위로 드래그 → 완전 펼침 (y=0)
      animate(y, 0, { type: 'spring', damping: 28, stiffness: 180 });
    } else {
      // 그 외 → partial 위치로 복귀
      animate(y, h * PARTIAL, { type: 'spring', damping: 28, stiffness: 180 });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-40">
          {/* 배경 딤 */}
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeTransition}
            onClick={doClose}
            style={{ touchAction: 'none' }}
          />

          {/* 시트 — 높이는 JS로 측정한 실제 가시 높이 */}
          {maxH > 0 && (
            <motion.div
              className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-3xl flex flex-col shadow-2xl overflow-hidden"
              style={{ height: maxH, y, willChange: 'transform' }}
              drag="y"
              dragConstraints={{ top: 0, bottom: maxH }}
              dragElastic={{ top: 0.08, bottom: 0 }}
              onDragEnd={handleDragEnd}
            >
              {/* 드래그 핸들 — 이 영역에서만 드래그 시작 가능 */}
              <div className="flex flex-col items-center pt-3 pb-1 flex-shrink-0 select-none">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
                <p className="text-[10px] text-gray-300 mt-1.5">위로 드래그해서 펼치기</p>
              </div>

              {/* 헤더 */}
              <div className="flex items-center justify-between px-5 pt-1.5 pb-3 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                <motion.button
                  onClick={doClose}
                  whileTap={{ scale: 0.97 }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
                >
                  <X size={16} />
                </motion.button>
              </div>

              {/* 내용 — 이 div에서는 드래그 미발동, 수직 스크롤만 허용 */}
              <div
                className="overflow-y-auto overscroll-contain flex-1 px-5 py-4"
                style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {children}
              </div>

              {/* 푸터 */}
              {footer && (
                <div
                  className="px-5 py-4 border-t border-gray-100 bg-white flex-shrink-0"
                  style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {footer}
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}
