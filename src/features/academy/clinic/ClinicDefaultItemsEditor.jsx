import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { ACADEMY_SUBJECT_OPTIONS } from '../../../constants/academySettings';
import { getClinicOptions } from '../../../constants/clinicOptions';

function normalizeItem(item) {
  if (!item?.title) return null;
  return {
    categoryKey: item.categoryKey || item.key || `custom_${Date.now()}`,
    title: String(item.title).trim(),
    description: String(item.description || '').trim(),
    custom: item.custom === true || String(item.categoryKey || '').startsWith('custom_'),
  };
}

export function normalizeClinicDefaultItems(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([subjectId, items]) => [
      subjectId,
      (Array.isArray(items) ? items : []).map(normalizeItem).filter(Boolean),
    ]),
  );
}

export default function ClinicDefaultItemsEditor({
  subjects = [],
  value,
  onChange,
  compact = false,
}) {
  const subjectOptions = useMemo(() => {
    const configured = (subjects || [])
      .map((id) => ACADEMY_SUBJECT_OPTIONS.find((option) => option.id === id))
      .filter(Boolean);
    return configured.length > 0
      ? configured
      : ACADEMY_SUBJECT_OPTIONS.filter((option) => ['korean', 'english', 'math'].includes(option.id));
  }, [subjects]);
  const normalized = normalizeClinicDefaultItems(value);
  const [activeSubject, setActiveSubject] = useState(subjectOptions[0]?.id || 'english');
  const [showCustom, setShowCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState({ title: '', description: '' });

  useEffect(() => {
    if (subjectOptions.some((option) => option.id === activeSubject)) return;
    setActiveSubject(subjectOptions[0]?.id || 'english');
  }, [subjectOptions, activeSubject]);

  const activeOption = subjectOptions.find((option) => option.id === activeSubject);
  const selectedItems = normalized[activeSubject] || [];
  const options = getClinicOptions(activeOption?.label || activeSubject);
  const isSelected = (key) => selectedItems.some((item) => item.categoryKey === key);
  const updateActiveItems = (items) => onChange?.({
    ...normalized,
    [activeSubject]: items,
  });

  const toggleOption = (option) => {
    if (isSelected(option.key)) {
      updateActiveItems(selectedItems.filter((item) => item.categoryKey !== option.key));
      return;
    }
    updateActiveItems([
      ...selectedItems,
      {
        categoryKey: option.key,
        title: option.title,
        description: option.description || '',
        custom: false,
      },
    ]);
  };

  const addCustom = () => {
    const title = customDraft.title.trim();
    if (!title) return;
    updateActiveItems([
      ...selectedItems,
      {
        categoryKey: `custom_${Date.now()}`,
        title,
        description: '',
        custom: true,
      },
    ]);
    setCustomDraft({ title: '', description: '' });
    setShowCustom(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {subjectOptions.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {subjectOptions.map((subject) => {
            const selected = activeSubject === subject.id;
            const count = normalized[subject.id]?.length || 0;
            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => {
                  setActiveSubject(subject.id);
                  setShowCustom(false);
                }}
                className={`flex-shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${
                  selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {subject.label}{count > 0 ? ` ${count}` : ''}
              </button>
            );
          })}
        </div>
      )}

      <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-2'}>
        {options.filter((option) => option.key !== 'other').map((option) => {
          const selected = isSelected(option.key);
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => toggleOption(option)}
              className={`rounded-2xl border px-3 py-3 text-left ${
                selected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white active:bg-gray-50'
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span>
                  <span className={`block text-sm font-bold ${selected ? 'text-blue-700' : 'text-gray-900'}`}>
                    {option.title}
                  </span>
                  {!compact && option.description && (
                    <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-gray-400">
                      {option.description}
                    </span>
                  )}
                </span>
                <Check size={14} className={`mt-0.5 flex-shrink-0 ${selected ? 'text-blue-600' : 'invisible'}`} />
              </span>
            </button>
          );
        })}
      </div>

      {selectedItems.some((item) => item.custom) && (
        <div className="flex flex-col gap-2">
          {selectedItems.filter((item) => item.custom).map((item) => (
            <div key={item.categoryKey} className="flex items-start gap-2 rounded-2xl bg-violet-50 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-violet-700">{item.title}</p>
              </div>
              <button
                type="button"
                onClick={() => updateActiveItems(
                  selectedItems.filter((current) => current.categoryKey !== item.categoryKey),
                )}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-violet-400 active:bg-violet-100"
                aria-label={`${item.title} 삭제`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCustom ? (
        <div className="rounded-2xl bg-gray-50 p-3">
          <input
            value={customDraft.title}
            onChange={(event) => setCustomDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="예: 본문 암기"
            className="input"
            autoFocus
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={addCustom}
              disabled={!customDraft.title.trim()}
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white disabled:bg-blue-300"
            >
              추가
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCustom(false);
                setCustomDraft({ title: '', description: '' });
              }}
              className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-gray-500"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 py-3 text-xs font-bold text-gray-500"
        >
          <Plus size={14} />
          직접 항목 추가
        </button>
      )}
    </div>
  );
}
