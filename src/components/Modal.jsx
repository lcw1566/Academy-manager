import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { sheetTransition, fadeTransition } from '../utils/motion';

export default function Modal({ isOpen, onClose, title, children, footer }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeTransition}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={sheetTransition}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              <motion.button
                onClick={onClose}
                whileTap={{ scale: 0.97 }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
              >
                <X size={16} />
              </motion.button>
            </div>
            <div className="overflow-y-auto overscroll-contain flex-1 px-5 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
              {children}
            </div>
            {footer && (
              <div className="px-5 py-4 border-t border-gray-100 bg-white" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
