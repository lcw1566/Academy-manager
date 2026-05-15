import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import { EXAM_TYPES, SUBJECT_OPTIONS, GRADE_LABELS } from '../../constants/studentSchedule';
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

export default function ExamResultModal({ studentId, result = null, events = [], onClose }) {
  const { addExamResult, updateExamResult } = useAcademyStore();
  const isEdit = !!result;

  const examEvents = events.filter((e) =>
    ['midterm', 'final', 'mock', 'csat', 'performance'].includes(e.eventType)
  );

  const [form, setForm] = useState({
    eventId:    result?.eventId    || '',
    title:      result?.title      || '',
    examType:   result?.examType   || 'midterm',
    subject:    result?.subject    || '',
    date:       result?.date       || getTodayYMD(),
    score:      result?.score      ?? '',
    maxScore:   result?.maxScore   ?? 100,
    percentile: result?.percentile ?? '',
    grade:      result?.grade      || '',
    classRank:  result?.classRank  ?? '',
    schoolRank: result?.schoolRank ?? '',
    weakUnits:  result?.weakUnits  || [],
    memo:       result?.memo       || '',
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
        if (ev.title || EXAM_TYPES[ev.eventType]) {
          upd('title', ev.title || EXAM_TYPES[ev.eventType] || '');
        }
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
      score:      form.score      === '' ? null : Number(form.score),
      maxScore:   Number(form.maxScore)  || 100,
      percentile: form.percentile === '' ? null : Number(form.percentile),
      classRank:  form.classRank  === '' ? null : Number(form.classRank),
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
          className="relative w-full max-w-md bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[94vh] overflow-y-auto"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{isEdit ? '성적 수정' : '성적 기록'}</h2>
              <p className="text-xs text-gray-400 mt-0.5">시험 점수, 등급, 취약 단원을 기록해요</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 flex-shrink-0">
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          <div className="flex flex-col gap-5">
            {/* 시험 정보 */}
            <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-4">
              <p className="text-xs font-bold text-gray-400 -mb-1">시험 정보</p>

              {/* 연결 일정 */}
              {examEvents.length > 0 && (
                <Field label="일정과 연결" hint="(선택)">
                  <select
                    value={form.eventId}
                    onChange={(e) => handleEventSelect(e.target.value)}
                    className={FI}
                  >
                    <option value="">연결하지 않음</option>
                    {examEvents.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.date} {ev.title || EXAM_TYPES[ev.eventType]}
                        {ev.subject ? ` (${ev.subject})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {/* 시험 종류 */}
              <Field label="시험 종류">
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(EXAM_TYPES).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => upd('examType', key)}
                      className={`h-10 rounded-xl border text-xs font-bold transition-all ${
                        form.examType === key
                          ? 'bg-blue-50 border-blue-400 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              {/* 시험명 */}
              <Field label="시험명" hint="(선택 · 예: 1학기 중간고사)">
                <input
                  value={form.title}
                  onChange={(e) => upd('title', e.target.value)}
                  placeholder={EXAM_TYPES[form.examType]}
                  className={FI}
                />
              </Field>

              {/* 과목 + 날짜 */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="과목">
                  <input
                    list="result-subject-list"
                    value={form.subject}
                    onChange={(e) => upd('subject', e.target.value)}
                    placeholder="예: 수학"
                    className={FI}
                  />
                  <datalist id="result-subject-list">
                    {SUBJECT_OPTIONS.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </Field>
                <Field label="시험 날짜">
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => upd('date', e.target.value)}
                    className={FI}
                  />
                </Field>
              </div>
            </div>

            {/* 성적 */}
            <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-4">
              <p className="text-xs font-bold text-gray-400 -mb-1">성적</p>

              {/* 점수 */}
              <Field label="점수">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={form.score}
                    onChange={(e) => upd('score', e.target.value)}
                    placeholder="점수"
                    min={0}
                    max={form.maxScore}
                    className="flex-1 h-11 px-4 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <span className="text-gray-400 text-sm flex-shrink-0">/</span>
                  <input
                    type="number"
                    value={form.maxScore}
                    onChange={(e) => upd('maxScore', e.target.value)}
                    min={1}
                    className="w-20 h-11 px-3 rounded-2xl border border-gray-200 bg-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <span className="text-gray-500 text-sm flex-shrink-0">점</span>
                </div>
              </Field>

              {/* 등급 + 백분위 */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="등급">
                  <select value={form.grade} onChange={(e) => upd('grade', e.target.value)} className={FI}>
                    <option value="">선택</option>
                    {Object.entries(GRADE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                    {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                      <option key={`num-${n}`} value={String(n)}>{n}등급</option>
                    ))}
                  </select>
                </Field>
                <Field label="백분위">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={form.percentile}
                      onChange={(e) => upd('percentile', e.target.value)}
                      placeholder="예: 87"
                      min={0}
                      max={100}
                      className="flex-1 h-11 px-4 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                    <span className="text-gray-500 text-sm flex-shrink-0">%</span>
                  </div>
                </Field>
              </div>

              {/* 석차 */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="반 석차">
                  <input type="number" value={form.classRank} onChange={(e) => upd('classRank', e.target.value)} placeholder="예: 3" min={1} className={FI} />
                </Field>
                <Field label="학교 석차">
                  <input type="number" value={form.schoolRank} onChange={(e) => upd('schoolRank', e.target.value)} placeholder="예: 42" min={1} className={FI} />
                </Field>
              </div>
            </div>

            {/* 분석 */}
            <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-4">
              <p className="text-xs font-bold text-gray-400 -mb-1">분석</p>

              <Field label="취약 단원">
                <div className="flex gap-2 mb-2">
                  <input
                    value={weakInput}
                    onChange={(e) => setWeakInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addWeakUnit()}
                    placeholder="예: 이차함수"
                    className="flex-1 h-11 px-4 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <button
                    type="button"
                    onClick={addWeakUnit}
                    className="w-11 h-11 bg-blue-600 text-white rounded-2xl flex items-center justify-center flex-shrink-0"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                {form.weakUnits.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.weakUnits.map((unit) => (
                      <span
                        key={unit}
                        className="flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-medium"
                      >
                        {unit}
                        <button type="button" onClick={() => removeWeakUnit(unit)}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="메모" hint="(선택)">
                <textarea
                  value={form.memo}
                  onChange={(e) => upd('memo', e.target.value)}
                  rows={2}
                  placeholder="시험 후기, 학습 계획 등"
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </Field>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!form.subject || !form.date}
            className="w-full h-12 mt-6 bg-blue-600 text-white font-bold rounded-2xl text-sm disabled:opacity-40 active:bg-blue-700"
          >
            {isEdit ? '수정 완료' : '기록하기'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
