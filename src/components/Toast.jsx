import { CheckCircle, AlertCircle, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { tossSpring } from '../utils/motion';

const icons = {
  success: <CheckCircle size={18} className="text-green-400 flex-shrink-0" />,
  error:   <AlertCircle size={18} className="text-red-400 flex-shrink-0" />,
  info:    <Info size={18} className="text-blue-400 flex-shrink-0" />,
};

export default function Toast({ message, type = 'success' }) {
  return (
    <motion.div
      layout="position"
      className="fixed bottom-28 left-1/2 z-50 w-[88%] max-w-sm transform-gpu"
      style={{ x: '-50%' }}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={tossSpring.tap}
    >
      <div className="flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-xl will-change-transform">
        {icons[type]}
        <span className="text-sm font-medium">{message}</span>
      </div>
    </motion.div>
  );
}
