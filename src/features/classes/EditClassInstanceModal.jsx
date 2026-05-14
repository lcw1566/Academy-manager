import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import { formatDateShort } from '../../utils/date';

const STATUS_OPTIONS = [
  { id: 'scheduled',     label: '예정' },
  { id: 'completed',     label: '완료' },
  { id: 'canceled',      label: '취소' },
  { id: 'makeup_needed', label: '보강 예정' },
  { id: 'rescheduled',   label: '날짜 변경됨' },
];

export default function EditClassInstanceModal({ cls, onClose }) {
  const { updateClassInstance, showToast } = useAcademyStore();

  const [form, setForm] = useState({
    date: cls.date,
    startTime: cls.startTime,
    endTime: cls.endTime,
    location: cls.location || '',
    status: cls.status || 'scheduled',
    rescheduleReason: cls.rescheduleReason || '',
  });

  const setF = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = () => {
    const dateChanged  = form.date !== cls.date;
    const timeChanged  = form.startTime !== cls.startTime || form.endTime !== cls.endTime;
    const anyChanged   = dateChanged || timeChanged || form.location !== (cls.location || '') || form.status !== (cls.status || 'scheduled');
    const willOverride = anyChanged;

    const updateData = { ...form };

    if (willOverride && !cls.isOverridden) {
      // First-time override — snapshot original values
      updateData.originalDate      = cls.date;
      updateData.originalStartTime = cls.startTime;
      updateData.originalEndTime   = cls.endTime;
    }

    updateData.isOverridden = willOverride || cls.isOverridden || false;

    // Auto-set status to rescheduled when date changes (unless user picked a different status)
    if (dateChanged && form.status === 'scheduled') {
      updateData.status = 'rescheduled';
    }

    updateClassInstance(cls.id, updateData);
    showToast('이 수업 회차만 변경했어요.');
    onClose();
  };

  const originalDateLabel =
    cls.isOverridden && cls.originalDate && cls.originalDate !== form.date
      ? `원래 ${formatDateShort(cls.originalDate)} 수업`
      : null;

  return (
    <AnimatePresence>
      <motion.div
        key="instance-dim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 bg-black/40 z-50"
        onClick={onClose}
      />
      <motion.div
        key="instance-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-w-md mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
          {/* Handle */}
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-gray-900">수업 일정 변경</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100"
            >
              <X size={16} className="text-gray-500" />
            </button>
          </div>
          <p className="text-xs text-blue-500 bg-blue-50 rounded-xl px-3 py-2 mb-4">
            이 날짜의 수업만 변경돼요. 정기 과외 전체 일정은 그대로 유지됩니다.
          </p>

          <div className="flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: '55vh' }}>
            {originalDateLabel && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <p className="text-xs text-amber-700 font-medium">{originalDateLabel}</p>
              </div>
            )}

            {/* Date */}
            <Field label="수업 날짜">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setF('date', e.target.value)}
                className="input"
              />
            </Field>

            {/* Time */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작 시간">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setF('startTime', e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="종료 시간">
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setF('endTime', e.target.value)}
                  className="input"
                />
              </Field>
            </div>

            {/* Location */}
            <Field label="장소 (선택)">
              <input
                value={form.location}
                onChange={(e) => setF('location', e.target.value)}
                placeholder="기존 장소와 다를 경우 입력"
                className="input"
              />
            </Field>

            {/* Status */}
            <Field label="회차 상태">
              <div className="grid grid-cols-3 gap-2">
                {STATUS_OPTIONS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setF('status', id)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      form.status === id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            {/* Reason */}
            <Field label="변경 사유 (선택)">
              <input
                value={form.rescheduleReason}
                onChange={(e) => setF('rescheduleReason', e.target.value)}
                placeholder="예: 학생 학교 일정, 보강"
                className="input"
              />
            </Field>

            <p className="text-xs text-gray-400 pb-1">
              정기 과외 전체 요일/시간을 바꾸려면 수업 정보 수정에서 변경해주세요.
            </p>
          </div>

          <button
            onClick={handleSave}
            className="w-full mt-4 bg-blue-600 text-white font-bold py-3.5 rounded-xl text-base"
          >
            변경 저장
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
