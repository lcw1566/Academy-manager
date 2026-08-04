import { Search, SlidersHorizontal, X } from 'lucide-react';

export function ListSearchField({
  value,
  onChange,
  placeholder = '검색',
  ariaLabel,
  trailing = null,
  className = '',
}) {
  return (
    <div className={`flex h-11 min-w-0 items-center gap-2.5 rounded-2xl border border-seenit-border-soft bg-seenit-surface px-3.5 shadow-sm focus-within:border-seenit-brand focus-within:ring-2 focus-within:ring-seenit-brand-soft ${className}`}>
      <Search size={16} className="flex-shrink-0 text-seenit-subtle" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-seenit-ink outline-none placeholder:text-seenit-subtle"
      />
      {trailing}
    </div>
  );
}

export function ListSearchFilterBar({
  searchValue,
  onSearchChange,
  placeholder = '검색',
  ariaLabel,
  filterCount = 0,
  filtersOpen = false,
  onToggleFilters,
  onResetFilters,
  resultText = '',
  showFilterButton = true,
  children,
  className = '',
}) {
  const filterIsActive = filterCount > 0;

  return (
    <div className={className}>
      <div className="flex min-w-0 items-center gap-2">
        <ListSearchField
          value={searchValue}
          onChange={onSearchChange}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
          className="flex-1"
          trailing={searchValue ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="검색어 지우기"
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-seenit-control text-seenit-subtle active:bg-seenit-elevated"
            >
              <X size={13} strokeWidth={2.3} />
            </button>
          ) : null}
        />
        {showFilterButton && (
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-label={filterIsActive ? `필터 ${filterCount}개 적용 중` : '필터 열기'}
            onClick={onToggleFilters}
            className={`relative flex h-11 w-[82px] flex-shrink-0 items-center justify-center gap-1.5 rounded-2xl border px-3 text-sm font-bold shadow-sm transition-colors active:scale-[0.98] ${
              filtersOpen || filterIsActive
                ? 'border-seenit-brand bg-seenit-brand-muted text-seenit-brand'
                : 'border-seenit-border-soft bg-seenit-surface text-seenit-secondary'
            }`}
          >
            <SlidersHorizontal size={16} strokeWidth={2.2} />
            <span>필터</span>
            {filterIsActive && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-seenit-surface bg-[#0064FF] px-1 text-[10px] font-extrabold text-white">
                {filterCount}
              </span>
            )}
          </button>
        )}
      </div>

      {showFilterButton && filtersOpen && (
        <div className="mt-2 rounded-2xl border border-seenit-border-soft bg-seenit-surface p-3 shadow-sm">
          <div className="space-y-2">{children}</div>
          {(resultText || (filterIsActive && onResetFilters)) && (
            <div className="mt-3 flex items-center justify-between border-t border-seenit-border-soft px-1 pt-3">
              <span className="text-[11px] font-semibold text-seenit-subtle">{resultText}</span>
              {filterIsActive && onResetFilters && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="text-xs font-bold text-seenit-brand active:opacity-60"
                >
                  필터 초기화
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ListFilterChips({
  value,
  onChange,
  options = [],
  ariaLabel = '목록 필터',
  className = '',
}) {
  return (
    <div
      className={`flex gap-2 overflow-x-auto pb-1 ${className}`}
      style={{ scrollbarWidth: 'none' }}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex h-8 flex-shrink-0 items-center rounded-full border px-3.5 text-xs font-bold transition-colors active:scale-[0.97] ${
            value === option.value
              ? 'border-[#0064FF] bg-[#0064FF] text-white'
              : 'border-seenit-border-soft bg-seenit-surface text-seenit-muted'
          }`}
        >
          {option.label}
          {option.count !== undefined && (
            <span className={`ml-1 text-[10px] ${value === option.value ? 'text-blue-100' : 'text-seenit-subtle'}`}>
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function ListFilterSelect({
  value,
  onChange,
  options = [],
  ariaLabel = '필터 선택',
  className = '',
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className={`h-10 min-w-0 rounded-xl border border-seenit-border-soft bg-seenit-surface px-3 text-xs font-bold text-seenit-secondary outline-none focus:border-seenit-brand focus:ring-2 focus:ring-seenit-brand-soft ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export function ListFilterSelectGrid({ children, columns = 2, className = '' }) {
  const columnClass = columns === 4
    ? 'grid-cols-2 md:grid-cols-4'
    : columns === 3
      ? 'grid-cols-2 md:grid-cols-3'
      : 'grid-cols-2';
  return <div className={`grid gap-2 ${columnClass} ${className}`}>{children}</div>;
}
