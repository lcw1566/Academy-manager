import { ChevronLeft } from 'lucide-react';

export default function Header({ title, onBack, right }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-100">
      <div className="max-w-md mx-auto flex items-center h-14 px-4">
        {onBack ? (
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center -ml-2 rounded-full"
          >
            <ChevronLeft size={24} className="text-gray-700" />
          </button>
        ) : (
          <div className="w-7" />
        )}
        <h1 className="flex-1 text-center text-base font-bold text-gray-900">{title}</h1>
        <div className="w-7 flex justify-end">
          {right || null}
        </div>
      </div>
    </header>
  );
}
