import { Check } from 'lucide-react';
import Modal from './Modal';

// Toss-style 단일 선택 bottom sheet.
// - options: [{ value, label, description? }]            (flat list)
// - groups:  [{ label, options: [{ value, label }] }]    (grouped list — 학년 등)
// 둘 중 하나만 넘긴다. value 가 있는 옵션은 파란 강조 + 체크.
export default function OptionSelectSheet({
  open,
  onClose,
  title,
  options,
  groups,
  value,
  onSelect,
}) {
  const handlePick = (v) => {
    onSelect?.(v);
    onClose?.();
  };

  return (
    <Modal isOpen={!!open} onClose={onClose} title={title}>
      {groups ? (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-xs font-bold text-gray-400 mb-2 px-1">{g.label}</p>
              <div className="flex flex-col gap-1">
                {g.options.map((opt) => (
                  <OptionRow
                    key={opt.value}
                    option={opt}
                    selected={value === opt.value}
                    onClick={() => handlePick(opt.value)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {options?.map((opt) => (
            <OptionRow
              key={opt.value}
              option={opt}
              selected={value === opt.value}
              onClick={() => handlePick(opt.value)}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function OptionRow({ option, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between px-4 py-3.5 rounded-xl transition-colors text-left ${
        selected ? 'bg-blue-50' : 'active:bg-gray-50'
      }`}
    >
      <span className="flex flex-col">
        <span className={`text-sm font-semibold ${selected ? 'text-blue-600' : 'text-gray-800'}`}>
          {option.label}
        </span>
        {option.description && (
          <span className="text-[11px] text-gray-400 mt-0.5">{option.description}</span>
        )}
      </span>
      {selected && <Check size={18} className="text-blue-600" />}
    </button>
  );
}
