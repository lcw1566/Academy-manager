import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  createAcademyExamResult,
  updateExamResult,
} from '../../../services/supabase/domainApi';
import useAcademyStore from '../../../store/useAcademyStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { getTodayYMD } from '../../../utils/date';

const EXAM_TYPES = [
  { value: 'school', label: '학교 시험' },
  { value: 'midterm', label: '중간고사' },
  { value: 'final', label: '기말고사' },
  { value: 'mock', label: '모의고사' },
  { value: 'sat', label: '수능' },
  { value: 'other', label: '기타' },
];

function toFormValue(result) {
  return {
    examName: result?.examName || '',
    examType: result?.examType || 'school',
    subject: result?.subject || '',
    examDate: result?.examDate || getTodayYMD(),
    score: result?.score === null || result?.score === undefined ? '' : String(result.score),
    maxScore: result?.maxScore === null || result?.maxScore === undefined ? '100' : String(result.maxScore),
    grade: result?.grade || '',
    memo: result?.memo || '',
  };
}

export default function AcademyExamResultModal({
  student,
  result = null,
  onClose,
}) {
  const currentAcademyId = useWorkspaceStore((state) => state.currentAcademyId);
  const loadServerExamResults = useWorkspaceStore((state) => state.loadServerExamResults);
  const showToast = useAcademyStore((state) => state.showToast);
  const [form, setForm] = useState(() => toFormValue(result));
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(result?.serverId || result?.id);
  const scorePreview = useMemo(() => {
    const score = Number(form.score);
    const maxScore = Number(form.maxScore);
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return '';
    return `${Math.round((score / maxScore) * 1000) / 10}%`;
  }, [form.score, form.maxScore]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.examName.trim()) {
      showToast('시험 이름을 입력해주세요.', 'error');
      return;
    }
    if (!form.examDate) {
      showToast('시험 날짜를 선택해주세요.', 'error');
      return;
    }

    const score = form.score === '' ? null : Number(form.score);
    const maxScore = form.maxScore === '' ? null : Number(form.maxScore);
    if ((score !== null && (!Number.isFinite(score) || score < 0))
      || (maxScore !== null && (!Number.isFinite(maxScore) || maxScore <= 0))) {
      showToast('점수를 다시 확인해주세요.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        exam_name: form.examName.trim(),
        exam_type: form.examType,
        subject: form.subject.trim() || null,
        exam_date: form.examDate,
        score,
        max_score: maxScore,
        grade: form.grade.trim() || null,
        memo: form.memo.trim() || null,
      };
      if (isEditing) {
        await updateExamResult(result.serverId || result.id, payload);
      } else {
        await createAcademyExamResult({
          academyId: currentAcademyId,
          student_id: student.serverId || student.id,
          ...payload,
        });
      }
      await loadServerExamResults();
      showToast(isEditing ? '성적을 수정했어요.' : '성적을 추가했어요.');
      onClose();
    } catch (error) {
      console.error('[exam-results] save failed', error);
      showToast(error?.message || '성적을 저장하지 못했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 md:items-center md:p-5">
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 cursor-default"
        onClick={() => !saving && onClose()}
      />
      <form
        onSubmit={handleSubmit}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white px-5 pb-6 pt-5 shadow-2xl md:max-w-xl md:rounded-[28px] md:p-6"
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-black text-[#191F28]">
              {isEditing ? '성적 수정' : '성적 추가'}
            </p>
            <p className="mt-1 text-sm font-medium text-[#8B95A1]">{student.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F4F6] text-[#6B7684]"
            aria-label="닫기"
          >
            <X size={19} />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[#333D4B]">시험 이름 *</span>
            <input
              value={form.examName}
              onChange={(event) => set('examName', event.target.value)}
              placeholder="예: 2학기 중간고사"
              className="input"
              autoFocus
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#333D4B]">종류</span>
              <select
                value={form.examType}
                onChange={(event) => set('examType', event.target.value)}
                className="input"
              >
                {EXAM_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#333D4B]">날짜 *</span>
              <input
                type="date"
                value={form.examDate}
                onChange={(event) => set('examDate', event.target.value)}
                className="input"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#333D4B]">과목</span>
              <input
                value={form.subject}
                onChange={(event) => set('subject', event.target.value)}
                placeholder="예: 영어"
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#333D4B]">등급·성취도</span>
              <input
                value={form.grade}
                onChange={(event) => set('grade', event.target.value)}
                placeholder="예: 2등급, A"
                className="input"
              />
            </label>
          </div>

          <div className="rounded-2xl bg-[#F2F4F6] p-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-[#333D4B]">점수</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.score}
                  onChange={(event) => set('score', event.target.value)}
                  placeholder="점수"
                  className="input bg-white text-right"
                />
              </label>
              <span className="pb-3 text-sm font-bold text-[#8B95A1]">/</span>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-[#333D4B]">만점</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={form.maxScore}
                  onChange={(event) => set('maxScore', event.target.value)}
                  placeholder="100"
                  className="input bg-white text-right"
                />
              </label>
            </div>
            {scorePreview && (
              <p className="mt-2 text-right text-xs font-bold text-blue-600">{scorePreview}</p>
            )}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[#333D4B]">메모</span>
            <textarea
              value={form.memo}
              onChange={(event) => set('memo', event.target.value)}
              placeholder="필요한 내용만 간단히 남겨주세요."
              rows={3}
              className="input resize-none"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-6 h-14 w-full rounded-2xl bg-blue-600 text-base font-black text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </form>
    </div>
  );
}
