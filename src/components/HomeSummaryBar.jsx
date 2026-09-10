export default function HomeSummaryBar({ items = [], className = 'mb-5' }) {
  const visibleItems = items.filter(Boolean);
  if (visibleItems.length === 0) return null;

  return (
    <div className={`px-4 ${className}`}>
      <div className="grid grid-flow-col auto-cols-fr divide-x divide-seenit-border-soft overflow-hidden rounded-2xl border border-seenit-border-soft bg-seenit-surface shadow-sm">
        {visibleItems.map(({ label, value, color = 'text-seenit-ink', onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className={`min-w-0 px-2 py-3 text-left sm:px-4 sm:py-3.5 ${onClick ? 'pressable-surface' : 'cursor-default'}`}
          >
            <p className="min-h-7 text-[10px] font-semibold leading-3.5 text-seenit-muted sm:min-h-0 sm:text-xs sm:leading-normal">
              {label}
            </p>
            <p className={`mt-1 truncate text-lg font-extrabold leading-none sm:text-xl ${color}`}>
              {value}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
