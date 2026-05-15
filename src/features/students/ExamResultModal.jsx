import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2 } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import { EXAM_TYPES, SUBJECT_OPTIONS, GRADE_LABELS } from '../../constants/studentSchedule';
import { getTodayYMD } from '../../utils/date';

export default function ExamResultModal({ studentId, result = null, events = [], onClose }) {
  const { addExamResult, updateExamResult } = useAcademyStore();
  const isEdit = !!result;

  const examEvents = events.filter((e) =>
    ['midterm', 'final', 'mock', 'csat', 'performance'].includes(e.eventType)
  );

  const [form, setForm] = useState({
    eventId: result?.eventId || '',
    examType: result?.examType || 'midterm',
    subject: result?.subject || '',
    date: result?.date || getTodayYMD(),
    score: result?.score ?? '',
    maxScore: result?.maxScore ?? 100,
    percentile: result?.percentile ?? '',
    grade: result?.grade || '',
    classRank: result?.classRank ?? '',
    schoolRank: result?.schoolRank ?? '',
    weakUnits: result?.weakUnits || [],
    memo: result?.memo || '',
  });
  const [weakInput, setWeakInput] = useState('');

  const upd = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleEventSelect = (eventId) => {
    upd('eventId', eventId);
    if (eventId) {
      const ev = examEvents.find((e) => e.id === eventId);
      if (ev) {
        upd('examType', ev.eventType);
        upd('date', ev.date);
        if (ev.subject) upd('subject', ev.subject);
      }
    }
  };

  const addWeakUnit = () => {
    const trimmed = weakInput.trim();
    if (!trimmed || form.weakUnits.includes(trimmed)) return;
    upd('weakUnits', [...form.weakUnits, trimmed]);
    setWeakInput('');
  };

  const removeWeakUnit = (unit) => {
    upd('weakUnits', form.weakUnits.filter((u) => u !== unit));
  };

  const handleSubmit = () => {
    if (!form.subject || !form.date) return;
    const data = {
      ...form,
      studentId,
      score: form.score === '' ? null : Number(form.score),
      maxScore: Number(form.maxScore) || 100,
      percentile: form.percentile === '' ? null : Number(form.percentile),
      classRank: form.classRank === '' ? null : Number(form.classRank),
      schoolRank: form.schoolRank === '' ? null : Number(form.schoolRank),
    };

    if (isEdit) {
      updateExamResult(result.id, data);
    } else {
      addExamResult(data);
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
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">{isEdit ? '성적 수정' : '성적 기록'}</h2>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* 연결 일정 */}
          {examEvents.length > 0 && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">연결 일정 (선택)</label>
              <select
                value={form.eventId}
                onChange={(e) => handleEventSelect(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              >
                <option value="">일정과 연결하지 않음</option>
                {examEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.date} {ev.title || EXAM_TYPES[ev.eventType]}
                    {ev.subject ? ` (${ev.subject})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 시험 종류 */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-2">시험 종류</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(EXAM_TYPES).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => upd('examType', key)}
                  className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                    form.examType === key
                      ? 'bg-blue-50 border-blue-400 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 과목 + 날짜 */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">과목</label>
              <input
                list="subject-list"
                value={form.subject}
                onChange={(e) => upd('subject', e.target.value)}
                placeholder="예: 수학"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <datalist id="subject-list">
                {SUBJECT_OPTIONS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">시험 날짜</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => upd('date', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>

          {/* 점수 */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-2">점수</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={form.score}
                onChange={(e) => upd('score', e.target.value)}
                placeholder="점수"
                min={0}
                max={form.maxScore}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <span className="text-gray-400 text-sm">/</span>
              <input
                type="number"
                value={form.maxScore}
                onChange={(e) => upd('maxScore', e.target.value)}
                min={1}
                className="w-20 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <span className="text-gray-500 text-sm">점</span>
            </div>
          </div>

          {/* 등급 + 백분위 */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">등급</label>
              <select
                value={form.grade}
                onChange={(e) => upd('grade', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              >
                <option value="">선택</option>
                {Object.entries(GRADE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
                {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                  <option key={`num-${n}`} value={String(n)}>{n}등급</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">백분위</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={form.percentile}
                  onChange={(e) => upd('percentile', e.target.value)}
                  placeholder="예: 87"
                  min={0}
                  max={100}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <span className="text-gray-500 text-sm">%</span>
              </div>
            </div>
          </div>

          {/* 석차 */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">반 석차</label>
              <input
                type="number"
                value={form.classRank}
                onChange={(e) => upd('classRank', e.target.value)}
                placeholder="예: 3"
                min={1}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">학교 석차</label>
              <input
                type="number"
                value={form.schoolRank}
                onChange={(e) => upd('schoolRank', e.target.value)}
                placeholder="예: 42"
                min={1}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>

          {/* 취약 단원 */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">취약 단원</label>
            <div className="flex gap-2 mb-2">
              <input
                value={weakInput}
                onChange={(e) => setWeakInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addWeakUnit()}
                placeholder="예: 이차함수"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                onClick={addWeakUnit}
                className="px-3 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold"
              >
                <Plus size={16} />
              </button>
            </div>
            {form.weakUnits.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.weakUnits.map((unit) => (
                  <span
                    key={unit}
                    className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-xs font-medium"
                  >
                    {unit}
                    <button onClick={() => removeWeakUnit(unit)} className="ml-0.5">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 메모 */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">메모 (선택)</label>
            <textarea
              value={form.memo}
              onChange={(e) => upd('memo', e.target.value)}
              rows={2}
              placeholder="시험 후기, 학습 계획 등"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!form.subject || !form.date}
            className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl text-sm disabled:opacity-40"
          >
            {isEdit ? '수정하기' : '기록하기'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
