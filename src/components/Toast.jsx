import { CheckCircle, AlertCircle, Info } from 'lucide-react';
import { motion } from 'framer-motion';

const icons = {
  success: <CheckCircle size={18} className="text-green-400 flex-shrink-0" />,
  error:   <AlertCircle size={18} className="text-red-400 flex-shrink-0" />,
  info:    <Info size={18} className="text-blue-400 flex-shrink-0" />,
};

export default function Toast({ message, type = 'success' }) {
  return (
    <motion.div
      className="fixed bottom-28 left-1/2 z-50 w-[88%] max-w-sm"
      style={{ x: '-50%' }}
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className="flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-xl">
        {icons[type]}
        <span className="text-sm font-medium">{message}</span>
      </div>
    </motion.div>
  );
}
