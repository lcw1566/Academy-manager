import { ChevronRight } from 'lucide-react';

const TONES = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  purple: 'bg-purple-50 text-purple-600',
  gray: 'bg-gray-100 text-gray-500',
};

export default function HomeActionList({ items = [] }) {
  if (items.length === 0) return null;

  return (
    <section className="px-4 mb-4">
      <p className="mb-2 px-1 text-sm font-bold text-gray-800">지금 할 일</p>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {items.slice(0, 3).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="flex w-full items-center gap-3 border-b border-gray-50 px-3.5 py-3 text-left transition-colors last:border-0 active:bg-gray-50"
            >
              <span
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
                  TONES[item.tone] || TONES.gray
                }`}
              >
                <Icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-gray-900">{item.title}</span>
                  {item.live && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      실시간
                    </span>
                  )}
                </span>
                {item.detail && (
                  <span className="mt-0.5 block truncate text-xs text-gray-500">{item.detail}</span>
                )}
              </span>
              {item.value && (
                <span className="flex-shrink-0 text-xs font-bold text-gray-700">{item.value}</span>
              )}
              <ChevronRight size={14} className="flex-shrink-0 text-gray-300" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
