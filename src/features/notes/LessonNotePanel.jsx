import { useState, useEffect } from 'react';
import useAcademyStore from '../../store/useAcademyStore';
import AiNoticeModal from './AiNoticeModal';
import { evaluationLabels, evaluationLevels, evaluationLevelColors } from '../../utils/format';

const SHARED_ID = '_shared_';

// ── Shared note section (group classes only) ───────────────────────────────────

export function SharedNoteSection({ cls }) {
  const { lessonRecords, saveLessonRecord } = useAcademyStore();

  const existing = lessonRecords.find(
    (lr) => lr.classId === cls.id && lr.studentId === SHARED_ID && lr.date === cls.date
  );

  const [form, setForm] = useState({
    content: '',
    materials: '',
    homework: '',
    nextPlan: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        content: existing.content || '',
        materials: existing.materials || '',
        homework: existing.homework || '',
        nextPlan: existing.nextPlan || '',
      });
    }
  }, [cls.id, cls.date]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    saveLessonRecord({ classId: cls.id, studentId: SHARED_ID, date: cls.date, ...form });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-4 mt-4 bg-blue-50 rounded-2xl p-4">
      <p className="text-sm font-bold text-blue-900 mb-3">공통 수업 내용</p>
      <div className="flex flex-col gap-3">
        <Section label="오늘 배운 내용">
          <textarea
            value={form.content}
            onChange={(e) => setField('content', e.target.value)}
            placeholder="예: 일차함수 그래프 해석, 기울기 개념"
            rows={2}
            className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-white"
          />
        </Section>
        <Section label="교재/페이지">
          <input
            value={form.materials}
            onChange={(e) => setField('materials', e.target.value)}
            placeholder="예: 유형서 p.42~45"
            className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-white"
          />
        </Section>
        <Section label="공통 숙제">
          <input
            value={form.homework}
            onChange={(e) => setField('homework', e.target.value)}
            placeholder="예: 유형서 p.46~48 풀기"
            className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-white"
          />
        </Section>
        <Section label="다음 수업 계획">
          <input
            value={form.nextPlan}
            onChange={(e) => setField('nextPlan', e.target.value)}
            placeholder="예: 이차함수 개념 도입"
            className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-white"
          />
        </Section>
        <button
          onClick={handleSave}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${
            saved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'
          }`}
        >
          {saved ? '✓ 저장됨' : '공통 내용 저장'}
        </button>
      </div>
    </div>
  );
}

// ── Per-student lesson note panel ──────────────────────────────────────────────

export default function LessonNotePanel({ cls, studentId, groupMode = false }) {
  const { students, lessonRecords, saveLessonRecord, showToast } = useAcademyStore();

  const student = students.find((s) => s.id === studentId);
  const existing = lessonRecords.find(
    (lr) => lr.classId === cls.id && lr.studentId === studentId && lr.date === cls.date
  );

  const [form, setForm] = useState({
    content: '',
    materials: '',
    homework: '',
    nextPlan: '',
    memo: '',
    evaluation: {},
    noticeText: '',
    noticeStatus: 'unsent',
  });

  const [showNotice, setShowNotice] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        content: existing.content || '',
        materials: existing.materials || '',
        homework: existing.homework || '',
        nextPlan: existing.nextPlan || '',
        memo: existing.memo || '',
        evaluation: existing.evaluation || {},
        noticeText: existing.noticeText || '',
        noticeStatus: existing.noticeStatus || 'unsent',
      });
    } else {
      setForm({
        content: '',
        materials: '',
        homework: '',
        nextPlan: '',
        memo: '',
        evaluation: {},
        noticeText: '',
        noticeStatus: 'unsent',
      });
    }
  }, [studentId, cls.id]);

  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const setEval = (key, val) => setForm((f) => ({ ...f, evaluation: { ...f.evaluation, [key]: val } }));

  const handleSave = () => {
    saveLessonRecord({ classId: cls.id, studentId, date: cls.date, ...form });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleNoticeGenerated = (text) => {
    setField('noticeText', text);
    saveLessonRecord({ classId: cls.id, studentId, date: cls.date, ...form, noticeText: text });
  };

  const handleNoticeSent = () => {
    const updated = { ...form, noticeStatus: 'sent' };
    setForm(updated);
    saveLessonRecord({ classId: cls.id, studentId, date: cls.date, ...updated });
    showToast('알림장이 전송 완료 처리되었습니다.');
  };

  const handleCopyNotice = () => {
    if (!form.noticeText) return;
    navigator.clipboard.writeText(form.noticeText).then(() => {
      showToast('알림장이 복사되었습니다.');
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Student name header in group mode */}
      {groupMode && student && (
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
            {student.name[0]}
          </div>
          <p className="text-sm font-bold text-gray-800">{student.name} 개인 기록</p>
        </div>
      )}

      {/* Individual content (hidden in group mode) */}
      {!groupMode && (
        <>
          <Section label="오늘 배운 내용">
            <textarea
              value={form.content}
              onChange={(e) => setField('content', e.target.value)}
              placeholder="예: 일차함수 그래프 해석, 기울기 개념"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
            />
          </Section>

          <Section label="교재/페이지">
            <input
              value={form.materials}
              onChange={(e) => setField('materials', e.target.value)}
              placeholder="예: 유형서 p.42~45"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
            />
          </Section>

          <Section label="숙제">
            <input
              value={form.homework}
              onChange={(e) => setField('homework', e.target.value)}
              placeholder="예: 유형서 p.46~48 풀기"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
            />
          </Section>

          <Section label="다음 수업 계획">
            <input
              value={form.nextPlan}
              onChange={(e) => setField('nextPlan', e.target.value)}
              placeholder="예: 이차함수 개념 도입"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
            />
          </Section>
        </>
      )}

      {/* Memo (always shown, group mode = student-specific) */}
      <Section label={groupMode ? '학생별 특이사항' : '특이사항'}>
        <textarea
          value={form.memo}
          onChange={(e) => setField('memo', e.target.value)}
          placeholder={groupMode ? `${student?.name || '학생'} 특이사항` : '수업 중 특이사항이나 메모'}
          rows={2}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
        />
      </Section>

      {/* Evaluation */}
      <div>
        <p className="text-xs font-bold text-gray-700 mb-3">{groupMode ? `${student?.name || '학생'} 평가` : '학생 평가'}</p>
        <div className="flex flex-col gap-3">
          {Object.entries(evaluationLabels).map(([key, label]) => (
            <div key={key}>
              <p className="text-xs text-gray-500 mb-1.5 font-medium">{label}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {evaluationLevels.map(({ key: lk, label: ll }) => {
                  const isActive = form.evaluation[key] === lk;
                  const colors = evaluationLevelColors[lk];
                  return (
                    <button
                      key={lk}
                      onClick={() => setEval(key, lk)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                        isActive ? colors.active : colors.inactive
                      }`}
                    >
                      {ll}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        className={`w-full py-3.5 rounded-xl font-bold text-base transition-colors ${
          saved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'
        }`}
      >
        {saved ? '✓ 저장됨' : '수업 기록 저장'}
      </button>

      {/* AI Notice section */}
      <div className="bg-blue-50 rounded-2xl p-4 mt-1">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-blue-900">
              {groupMode ? `${student?.name || '학생'} 알림장` : 'AI 알림장'}
            </p>
            {form.noticeStatus === 'sent' && (
              <span className="text-xs text-green-600 font-medium">✓ 전송 완료</span>
            )}
          </div>
          <button
            onClick={() => setShowNotice(true)}
            className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
          >
            {form.noticeText ? '다시 생성' : 'AI 초안 생성'}
          </button>
        </div>

        {form.noticeText ? (
          <>
            <p className="text-sm text-gray-700 whitespace-pre-line bg-white rounded-xl p-3 border border-blue-100 mb-3">
              {form.noticeText}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleCopyNotice}
                className="flex-1 bg-white text-blue-600 font-bold text-sm py-2.5 rounded-xl border border-blue-200"
              >
                복사하기
              </button>
              <button
                onClick={handleNoticeSent}
                disabled={form.noticeStatus === 'sent'}
                className={`flex-1 font-bold text-sm py-2.5 rounded-xl ${
                  form.noticeStatus === 'sent'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {form.noticeStatus === 'sent' ? '전송 완료' : '전송 완료 처리'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-blue-500">수업 기록을 입력 후 AI 알림장을 생성하세요</p>
        )}
      </div>

      {showNotice && (
        <AiNoticeModal
          cls={cls}
          studentId={studentId}
          form={form}
          onGenerated={handleNoticeGenerated}
          onClose={() => setShowNotice(false)}
        />
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-700 mb-1.5">{label}</p>
      {children}
    </div>
  );
}
