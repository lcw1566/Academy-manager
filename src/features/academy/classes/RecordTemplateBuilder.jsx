import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, GripVertical, Plus, X } from 'lucide-react';
import {
  CLASS_RECORD_BLOCKS,
  CUSTOM_RECORD_BLOCK_TYPES,
  normalizeRecordSchema,
} from '../../../constants/learningActivitySettings';

function createCustomId() {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function RecordTemplateBuilder({ value, onChange }) {
  const schema = useMemo(() => normalizeRecordSchema(value), [value]);
  const [draggingId, setDraggingId] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [draft, setDraft] = useState({
    label: '',
    type: 'short_text',
    scope: 'common',
    options: '',
  });

  const update = (next) => onChange?.(normalizeRecordSchema(next, []));
  const availableSystemBlocks = CLASS_RECORD_BLOCKS.filter(
    (candidate) => !schema.some((block) => block.id === candidate.id),
  );

  const move = (id, direction) => {
    const index = schema.findIndex((block) => block.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= schema.length) return;
    const next = [...schema];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };

  const moveBefore = (movingId, targetId) => {
    if (!movingId || movingId === targetId) return;
    const moving = schema.find((block) => block.id === movingId);
    if (!moving) return;
    const without = schema.filter((block) => block.id !== movingId);
    const targetIndex = without.findIndex((block) => block.id === targetId);
    if (targetIndex < 0) return;
    without.splice(targetIndex, 0, moving);
    update(without);
  };

  const addCustom = () => {
    const label = draft.label.trim();
    if (!label) return;
    update([
      ...schema,
      {
        id: createCustomId(),
        label,
        type: draft.type,
        scope: draft.scope,
        system: false,
        options: draft.type === 'select'
          ? draft.options.split(',').map((item) => item.trim()).filter(Boolean)
          : [],
      },
    ]);
    setDraft({ label: '', type: 'short_text', scope: 'common', options: '' });
    setShowCustom(false);
  };

  return (
    <div>
      {schema.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D1D6DB] px-4 py-6 text-center">
          <p className="text-sm font-bold text-[#4E5968]">아직 기록 항목이 없어요</p>
          <p className="mt-1 text-xs text-[#8B95A1]">아래에서 필요한 항목을 추가해주세요.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E5E8EB] bg-white">
          {schema.map((block, index) => (
            <div
              key={block.id}
              draggable
              onDragStart={() => setDraggingId(block.id)}
              onDragEnd={() => setDraggingId('')}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                moveBefore(draggingId, block.id);
                setDraggingId('');
              }}
              className={`flex items-center gap-3 px-3 py-3.5 ${
                index > 0 ? 'border-t border-[#F2F4F6]' : ''
              } ${draggingId === block.id ? 'bg-blue-50/70 opacity-70' : 'bg-white'}`}
            >
              <GripVertical size={17} className="hidden flex-shrink-0 cursor-grab text-[#B0B8C1] md:block" />
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#F2F4F6] text-xs font-black text-[#6B7684]">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#191F28]">{block.label}</p>
                <p className="mt-0.5 text-[11px] font-medium text-[#8B95A1]">
                  {block.scope === 'student' ? '학생별' : '반 공통'}
                  {!block.system && ' · 직접 만든 항목'}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(block.id, -1)}
                  disabled={index === 0}
                  aria-label="위로 이동"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8B95A1] active:bg-gray-100 disabled:opacity-20"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => move(block.id, 1)}
                  disabled={index === schema.length - 1}
                  aria-label="아래로 이동"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8B95A1] active:bg-gray-100 disabled:opacity-20"
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => update(schema.filter((item) => item.id !== block.id))}
                  aria-label={`${block.label} 삭제`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#B0B8C1] active:bg-red-50 active:text-red-500"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {availableSystemBlocks.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-[#6B7684]">기본 항목 추가</p>
          <div className="flex flex-wrap gap-2">
            {availableSystemBlocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => update([...schema, block])}
                className="flex items-center gap-1 rounded-xl border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-bold text-[#4E5968] active:bg-gray-50"
              >
                <Plus size={12} />
                {block.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!showCustom ? (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#B0B8C1] py-3 text-xs font-bold text-[#4E5968] active:bg-gray-50"
        >
          <Plus size={14} />
          직접 항목 만들기
        </button>
      ) : (
        <div className="mt-3 rounded-2xl bg-[#F2F4F6] p-3.5">
          <input
            value={draft.label}
            onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
            placeholder="항목 이름"
            className="input bg-white"
            autoFocus
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={draft.type}
              onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}
              className="input bg-white"
            >
              {CUSTOM_RECORD_BLOCK_TYPES.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <select
              value={draft.scope}
              onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value }))}
              className="input bg-white"
            >
              <option value="common">반 공통</option>
              <option value="student">학생별</option>
            </select>
          </div>
          {draft.type === 'select' && (
            <input
              value={draft.options}
              onChange={(event) => setDraft((current) => ({ ...current, options: event.target.value }))}
              placeholder="선택지 입력 · 예: 상, 중, 하"
              className="input mt-2 bg-white"
            />
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={addCustom}
              disabled={!draft.label.trim()}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[#3182F6] py-2.5 text-xs font-bold text-white disabled:bg-[#D1D6DB]"
            >
              <Check size={13} />
              추가
            </button>
            <button
              type="button"
              onClick={() => setShowCustom(false)}
              className="rounded-xl bg-white px-4 text-xs font-bold text-[#6B7684]"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
