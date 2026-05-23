// ShiftCoverageSheet — Phase 34
//
// 강사/보조강사를 수업에 배정하려는데 그 시간에 근무가 없거나 일부만 겹칠 때 띄우는
// Toss 스타일 bottom-sheet. 항상 "다음 행동" 을 제시해서 막다른 골목을 만들지 않는다.
//
// mode:
//   'none'    : 근무 자체가 없음 → 자동으로 추가/직접 설정/취소
//   'partial' : 일부 겹침 → 근무시간 자동 확장/직접 수정/취소
//
// Props:
//   - open: boolean
//   - mode: 'none' | 'partial'
//   - staffName: string
//   - lessonLabel: string ('16:00 ~ 18:00 수학 A반' 등)
//   - existingShiftSummary?: string (mode='partial' 일 때 표시)
//   - onClose: () => void
//   - onChoose: ('exact' | 'buffer' | 'extend' | 'custom') => Promise<void> | void
//
// "직접 설정/수정" 선택 시 onChoose('custom') — 호출자가 WorkSchedulePage 로
// 보낼지 modal 을 띄울지 결정.
import { useState } from 'react';
import { Clock, Plus, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import Modal from '../../../components/Modal';

export default function ShiftCoverageSheet({
  open,
  mode,
  staffName,
  staffRoleLabel,
  lessonLabel,
  existingShiftSummary,
  onClose,
  onChoose,
}) {
  const [busy, setBusy] = useState(null); // 어떤 옵션 처리 중인지

  if (!open) return null;

  const handlePick = async (key) => {
    if (busy) return;
    setBusy(key);
    try {
      await onChoose?.(key);
    } finally {
      setBusy(null);
    }
  };

  const title = mode === 'partial' ? '근무시간을 늘릴까요?' : '근무 시간이 없어요';
  const description = mode === 'partial'
    ? '이 수업이 기존 근무시간 일부와만 겹쳐요. 어떻게 처리할까요?'
    : '이 시간에 근무 일정이 없어요. 어떻게 처리할까요?';

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
    >
      <div className="flex flex-col gap-4">
        {/* 컨텍스트 카드 */}
        <div className="bg-blue-50 rounded-2xl px-4 py-3 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0">
            <Clock size={16} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">
              {staffRoleLabel ? `${staffRoleLabel} · ` : ''}{staffName || '강사'}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">{lessonLabel}</p>
            {existingShiftSummary && (
              <p className="text-[11px] text-amber-700 mt-1">
                <AlertTriangle size={10} className="inline mr-1 mb-0.5" />
                기존 근무 {existingShiftSummary}
              </p>
            )}
          </div>
        </div>

        <p className="text-sm text-gray-700 leading-relaxed">{description}</p>

        <div className="flex flex-col gap-2">
          {mode === 'none' ? (
            <>
              <OptionRow
                primary
                title="수업 시간만 근무로 추가"
                subtitle="추천 · 수업 시작/끝 시간에 맞춰 근무 일정을 만들어요."
                onClick={() => handlePick('exact')}
                busy={busy === 'exact'}
              />
              <OptionRow
                title="앞뒤 30분 여유 포함해서 추가"
                subtitle="수업 전후 준비/정리 시간까지 근무로 잡아요."
                onClick={() => handlePick('buffer')}
                busy={busy === 'buffer'}
              />
              <OptionRow
                title="직접 근무시간 설정"
                subtitle="근무 탭에서 시간을 직접 입력할게요."
                onClick={() => handlePick('custom')}
                busy={busy === 'custom'}
              />
            </>
          ) : (
            <>
              <OptionRow
                primary
                title="근무시간 자동 확장"
                subtitle="추천 · 기존 근무를 수업이 모두 들어가도록 늘려요."
                onClick={() => handlePick('extend')}
                busy={busy === 'extend'}
              />
              <OptionRow
                title="직접 수정"
                subtitle="근무 탭에서 시간을 직접 조정할게요."
                onClick={() => handlePick('custom')}
                busy={busy === 'custom'}
              />
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            className="w-full text-center py-3 rounded-2xl text-sm font-semibold text-gray-500 active:bg-gray-50"
          >
            취소
          </button>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed">
          근무는 학원 머무는 시간이고, 수업은 그 안에서 진행되는 활동이에요.
          시급 급여는 근무 시간을 기준으로 계산돼요.
        </p>
      </div>
    </Modal>
  );
}

function OptionRow({ title, subtitle, onClick, primary, busy }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:opacity-80 disabled:opacity-60 ${
        primary
          ? 'bg-[#0064FF] text-white'
          : 'bg-white border border-gray-200 text-gray-800'
      }`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
        primary ? 'bg-white/20' : 'bg-gray-100'
      }`}>
        {busy ? (
          <Loader2 size={16} className={`animate-spin ${primary ? 'text-white' : 'text-gray-600'}`} />
        ) : (
          <Plus size={16} className={primary ? 'text-white' : 'text-gray-600'} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${primary ? 'text-white' : 'text-gray-900'}`}>{title}</p>
        {subtitle && (
          <p className={`text-xs mt-0.5 leading-relaxed ${primary ? 'text-white/80' : 'text-gray-500'}`}>
            {subtitle}
          </p>
        )}
      </div>
      <ChevronRight size={14} className={primary ? 'text-white/80' : 'text-gray-300'} />
    </button>
  );
}
