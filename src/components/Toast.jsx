import { CheckCircle, AlertCircle, Info } from 'lucide-react';

const icons = {
  success: <CheckCircle size={18} className="text-green-500" />,
  error:   <AlertCircle size={18} className="text-red-500" />,
  info:    <Info size={18} className="text-blue-500" />,
};

export default function Toast({ message, type = 'success' }) {
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
      <div className="flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-xl animate-fade-in">
        {icons[type]}
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}
