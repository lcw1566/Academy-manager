import { ChevronRight } from 'lucide-react';

const TONES = {
  blue: 'bg-seenit-brand-soft text-seenit-brand',
  green: 'bg-seenit-success-soft text-seenit-success',
  amber: 'bg-seenit-warning-soft text-seenit-warning',
  purple: 'bg-seenit-purple-soft text-seenit-purple',
  gray: 'bg-seenit-control text-seenit-muted',
};

export default function HomeActionList({ items = [] }) {
  if (items.length === 0) return null;

  return (
    <section className="px-4 mb-4">
      <p className="mb-2 px-1 text-sm font-bold text-seenit-ink">지금 할 일</p>
      <div className="overflow-hidden rounded-2xl bg-seenit-surface shadow-sm">
        {items.slice(0, 3).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="flex w-full items-center gap-3 border-b border-seenit-border-soft px-3.5 py-3 text-left transition-colors last:border-0 active:bg-seenit-elevated"
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
                  <span className="truncate text-sm font-bold text-seenit-ink">{item.title}</span>
                  {item.live && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      실시간
                    </span>
                  )}
                </span>
                {item.detail && (
                  <span className="mt-0.5 block truncate text-xs text-seenit-muted">{item.detail}</span>
                )}
              </span>
              {item.value && (
                <span className="flex-shrink-0 text-xs font-bold text-seenit-secondary">{item.value}</span>
              )}
              <ChevronRight size={14} className="flex-shrink-0 text-seenit-subtle" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
