import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import { STUDENT_EVENT_TYPES, IMPORTANCE_LABELS } from '../../constants/studentSchedule';
import { getTodayYMD } from '../../utils/date';

export default function StudentEventModal({ studentId, event = null, onClose }) {
  const { addStudentEvent, updateStudentEvent } = useAcademyStore();
  const isEdit = !!event;

  const [form, setForm] = useState({
    eventType: event?.eventType || 'midterm',
    title: event?.title || '',
    date: event?.date || getTodayYMD(),
    endDate: event?.endDate || '',
    subject: event?.subject || '',
    importance: event?.importance || 'medium',
    memo: event?.memo || '',
  });

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = () => {
    if (!form.date) return;
    const eventTypeInfo = STUDENT_EVENT_TYPES[form.eventType];
    const title = form.title.trim() || eventTypeInfo.label;
    const data = { ...form, studentId, title };

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
          className="relative w-full max-w-md bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[90vh] overflow-y-auto"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">{isEdit ? '일정 수정' : '일정 추가'}</h2>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* 이벤트 종류 */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-2">종류</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(STUDENT_EVENT_TYPES).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => set('eventType', key)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl border text-xs font-medium transition-all ${
                    form.eventType === key
                      ? 'bg-blue-50 border-blue-400 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600'
                  }`}
                >
                  <span className="text-base">{info.icon}</span>
                  {info.label}
                </button>
              ))}
            </div>
          </div>

          {/* 제목 */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              제목 <span className="font-normal text-gray-400">(선택, 비우면 종류명 사용)</span>
            </label>
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={STUDENT_EVENT_TYPES[form.eventType]?.label}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {/* 날짜 */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">날짜</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                종료일 <span className="font-normal text-gray-400">(선택)</span>
              </label>
              <input
                type="date"
                value={form.endDate}
                min={form.date}
                onChange={(e) => set('endDate', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>

          {/* 과목 */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              과목 <span className="font-normal text-gray-400">(선택)</span>
            </label>
            <input
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              placeholder="예: 수학, 영어"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {/* 중요도 */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-2">중요도</label>
            <div className="flex gap-2">
              {Object.entries(IMPORTANCE_LABELS).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => set('importance', key)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    form.importance === key
                      ? `${info.bg} ${info.border} ${info.color} border`
                      : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  {info.label}
                </button>
              ))}
            </div>
          </div>

          {/* 메모 */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              메모 <span className="font-normal text-gray-400">(선택)</span>
            </label>
            <textarea
              value={form.memo}
              onChange={(e) => set('memo', e.target.value)}
              rows={2}
              placeholder="준비물, 범위 등 메모"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!form.date}
            className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl text-sm disabled:opacity-40"
          >
            {isEdit ? '수정하기' : '추가하기'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
