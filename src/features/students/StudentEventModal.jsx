import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import { STUDENT_EVENT_TYPES, IMPORTANCE_LABELS, SUBJECT_OPTIONS } from '../../constants/studentSchedule';
import { getTodayYMD } from '../../utils/date';

const FI = 'w-full h-11 px-4 rounded-2xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none';

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <label className="text-xs font-semibold text-gray-600">{label}</label>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function StudentEventModal({ studentId, event = null, onClose }) {
  const { addStudentEvent, updateStudentEvent } = useAcademyStore();
  const isEdit = !!event;

  const [form, setForm] = useState({
    eventType:  event?.eventType && STUDENT_EVENT_TYPES[event.eventType] ? event.eventType : 'midterm',
    title:      event?.title      || '',
    date:       event?.date       || getTodayYMD(),
    subject:    event?.subject    || '',
    importance: event?.importance || 'medium',
    memo:       event?.memo       || '',
  });

  const upd = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = () => {
    if (!form.date) return;
    const title = form.title.trim() || STUDENT_EVENT_TYPES[form.eventType]?.label;
    const data = { ...form, title, studentId };
    if (isEdit) {
      updateStudentEvent(event.id, data);
    } else {
      addStudentEvent(data);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <motion.div
          className="relative w-full max-w-md bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[92vh] overflow-y-auto"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{isEdit ? '일정 수정' : '시험 일정 추가'}</h2>
              <p className="text-xs text-gray-400 mt-0.5">시험, 수행평가, 학교 일정을 기록해요</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 flex-shrink-0">
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          <div className="flex flex-col gap-5">
            {/* 기본 정보 */}
            <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-4">
              <p className="text-xs font-bold text-gray-400 -mb-1">기본 정보</p>

              <Field label="시험 종류">
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(STUDENT_EVENT_TYPES).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => upd('eventType', key)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl border text-[11px] font-medium transition-all ${
                        form.eventType === key
                          ? 'bg-blue-50 border-blue-400 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-600'
                      }`}
                    >
                      <span className="text-base">{info.icon}</span>
                      {info.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="시험명" hint="(선택 · 비우면 종류명 사용)">
                <input
                  value={form.title}
                  onChange={(e) => upd('title', e.target.value)}
                  placeholder={STUDENT_EVENT_TYPES[form.eventType]?.label}
                  className={FI}
                />
              </Field>
            </div>

            {/* 날짜 */}
            <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-4">
              <p className="text-xs font-bold text-gray-400 -mb-1">날짜</p>
              <Field label="날짜">
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => upd('date', e.target.value)}
                  className={FI}
                />
              </Field>
            </div>

            {/* 과목 및 중요도 */}
            <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-4">
              <p className="text-xs font-bold text-gray-400 -mb-1">과목 및 중요도</p>

              <Field label="관련 과목" hint="(선택)">
                <input
                  list="event-subject-list"
                  value={form.subject}
                  onChange={(e) => upd('subject', e.target.value)}
                  placeholder="예: 수학, 영어"
                  className={FI}
                />
                <datalist id="event-subject-list">
                  {SUBJECT_OPTIONS.map((s) => <option key={s} value={s} />)}
                </datalist>
              </Field>

              <Field label="중요도">
                <div className="flex gap-2">
                  {Object.entries(IMPORTANCE_LABELS).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => upd('importance', key)}
                      className={`flex-1 h-10 rounded-xl border text-xs font-bold transition-all ${
                        form.importance === key
                          ? `${info.bg} ${info.border} ${info.color} border-2`
                          : 'bg-white border-gray-200 text-gray-500'
                      }`}
                    >
                      {info.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="메모" hint="(선택)">
                <textarea
                  value={form.memo}
                  onChange={(e) => upd('memo', e.target.value)}
                  rows={2}
                  placeholder="준비 범위, 참고 사항 등"
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </Field>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!form.date}
            className="w-full h-12 mt-6 bg-blue-600 text-white font-bold rounded-2xl text-sm disabled:opacity-40 active:bg-blue-700"
          >
            {isEdit ? '수정 완료' : '추가하기'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
