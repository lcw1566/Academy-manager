import { Search } from 'lucide-react';

export function ListSearchField({
  value,
  onChange,
  placeholder = '검색',
  ariaLabel,
  trailing = null,
  className = '',
}) {
  return (
    <div className={`flex h-11 min-w-0 items-center gap-2.5 rounded-2xl border border-[#E5E8EB] bg-white px-3.5 shadow-sm focus-within:border-[#3182F6] focus-within:ring-2 focus-within:ring-blue-50 ${className}`}>
      <Search size={16} className="flex-shrink-0 text-[#8B95A1]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#191F28] outline-none placeholder:text-[#B0B8C1]"
      />
      {trailing}
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
              : 'border-[#E5E8EB] bg-white text-[#6B7684]'
          }`}
        >
          {option.label}
          {option.count !== undefined && (
            <span className={`ml-1 text-[10px] ${value === option.value ? 'text-blue-100' : 'text-[#8B95A1]'}`}>
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
      className={`h-10 min-w-0 rounded-xl border border-[#E5E8EB] bg-white px-3 text-xs font-bold text-[#4E5968] outline-none focus:border-[#3182F6] focus:ring-2 focus:ring-blue-50 ${className}`}
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
