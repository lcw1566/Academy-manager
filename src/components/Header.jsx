import { ChevronLeft } from 'lucide-react';

export default function Header({ title, onBack, right }) {
  return (
    <header className="fixed md:static top-0 md:top-auto left-0 md:left-auto right-0 md:right-auto z-30 md:z-auto bg-seenit-surface md:bg-transparent border-b border-seenit-border-soft md:border-0">
      <div className="max-w-md mx-auto md:mx-0 md:max-w-none flex items-center h-14 md:h-auto px-4 md:pt-6 md:pb-5">
        {onBack ? (
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center -ml-2 rounded-full active:bg-seenit-control md:hover:bg-seenit-control"
          >
            <ChevronLeft size={24} className="text-seenit-secondary" />
          </button>
        ) : (
          <div className="w-7 md:hidden" />
        )}
        <h1 className="flex-1 min-w-0 text-center md:text-left text-base md:text-[28px] md:leading-9 font-extrabold text-seenit-ink truncate">{title}</h1>
        <div className="min-w-7 shrink-0 flex justify-end md:ml-4">
          {right || null}
        </div>
      </div>
    </header>
  );
}
