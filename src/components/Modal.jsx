import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { fadeTransition } from '../utils/motion';

const EASE_OUT = [0.22, 1, 0.36, 1];
const EASE_IN  = [0.4, 0, 1, 1];

export default function Modal({ isOpen, onClose, title, children, footer }) {
  const [maxH, setMaxH] = useState(0);
  const [navH, setNavH] = useState(0);
  const maxHRef = useRef(0);
  const y = useMotionValue(0);

  useEffect(() => {
    const measure = () => {
      const nav = document.querySelector('.bottom-nav')?.offsetHeight ?? 0;
      const h = (window.visualViewport?.height ?? window.innerHeight) - 16 - nav;
      setNavH(nav);
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

  // 열릴 때: 화면 밖 → 완전 펼침
  useEffect(() => {
    if (!isOpen || !maxH) return;
    y.set(maxH);
    animate(y, 0, { duration: 0.3, ease: EASE_OUT });
  }, [isOpen, maxH]); // eslint-disable-line

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const doClose = () => {
    animate(y, maxHRef.current, { duration: 0.22, ease: EASE_IN });
    setTimeout(onClose, 220);
  };

  const handleDragEnd = (_, info) => {
    const cur = y.get();
    const h   = maxHRef.current;
    if (info.velocity.y > 400 || cur > h * 0.4) {
      doClose();
    } else {
      animate(y, 0, { type: 'spring', damping: 28, stiffness: 180 });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-40">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeTransition}
            onClick={doClose}
            style={{ touchAction: 'none' }}
          />

          {maxH > 0 && (
            <motion.div
              className="absolute left-0 right-0 max-w-md mx-auto bg-white rounded-t-3xl flex flex-col shadow-2xl overflow-hidden"
              style={{ bottom: navH, height: maxH, y, willChange: 'transform' }}
              drag="y"
              dragConstraints={{ top: 0, bottom: maxH }}
              dragElastic={{ top: 0.04, bottom: 0 }}
              onDragEnd={handleDragEnd}
            >
              {/* 드래그 핸들 */}
              <div className="flex items-center justify-center pt-3 pb-1 flex-shrink-0 select-none">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
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

              {/* 내용 */}
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
