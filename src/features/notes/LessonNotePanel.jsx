import { useState, useEffect, useMemo } from 'react';
import useAcademyStore from '../../store/useAcademyStore';
import AiNoticeModal from './AiNoticeModal';
import { evaluationLabels, evaluationLevels, evaluationLevelColors } from '../../utils/format';

const SHARED_ID = '_shared_';

// ── Helper ────────────────────────────────────────────────────────────────────

function buildForm(existing) {
  return {
    content:              existing?.content              || '',
    materials:            existing?.materials            || '',
    homework:             existing?.homework             || '',
    nextPlan:             existing?.nextPlan             || '',
    memo:                 existing?.memo                 || '',
    evaluation:           existing?.evaluation           || {},
    parentNoticeText:     existing?.parentNoticeText     || existing?.noticeText || '',
    studentHomeworkText:  existing?.studentHomeworkText  || '',
    parentNoticeStatus:   existing?.parentNoticeStatus   || existing?.noticeStatus || 'unsent',
    studentHomeworkStatus: existing?.studentHomeworkStatus || 'unsent',
  };
}

const DIRTY_KEYS = ['content', 'materials', 'homework', 'nextPlan', 'memo', 'evaluation'];

function isFormDirty(a, b) {
  return DIRTY_KEYS.some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

// ── Shared note section (group classes only) ───────────────────────────────────

export function SharedNoteSection({ cls }) {
  const { lessonRecords, saveLessonRecord } = useAcademyStore();

  const existing = lessonRecords.find(
    (lr) => lr.classId === cls.id && lr.studentId === SHARED_ID && lr.date === cls.date
  );

  const initShared = () => ({
    content:  existing?.content  || '',
    materials: existing?.materials || '',
    homework: existing?.homework || '',
    nextPlan: existing?.nextPlan || '',
  });

  const [form, setForm]       = useState(initShared);
  const [savedForm, setSaved] = useState(initShared);

  useEffect(() => {
    const initial = initShared();
    setForm(initial);
    setSaved(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls.id, cls.date]);

  const isDirty = useMemo(
    () => ['content', 'materials', 'homework', 'nextPlan'].some(
      (k) => form[k] !== savedForm[k]
    ),
    [form, savedForm]
  );

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    saveLessonRecord({ classId: cls.id, studentId: SHARED_ID, date: cls.date, ...form });
    setSaved({ ...form });
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
          disabled={!isDirty}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${
            isDirty
              ? 'bg-blue-600 text-white'
              : 'bg-green-50 text-green-600'
          }`}
        >
          {isDirty ? '공통 내용 저장' : '✓ 저장됨'}
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

  const [form, setFormState]   = useState(() => buildForm(existing));
  const [savedForm, setSaved]  = useState(() => buildForm(existing));
  const [isSaving, setIsSaving] = useState(false);
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    const initial = buildForm(existing);
    setFormState(initial);
    setSaved(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, cls.id]);

  const isDirty = useMemo(() => isFormDirty(form, savedForm), [form, savedForm]);

  const setField = (key, val) => setFormState((f) => ({ ...f, [key]: val }));
  const setEval  = (key, val) => setFormState((f) => ({ ...f, evaluation: { ...f.evaluation, [key]: val } }));

  const handleSave = () => {
    if (!isDirty) return;
    setIsSaving(true);
    saveLessonRecord({ classId: cls.id, studentId, date: cls.date, ...form });
    setSaved({ ...form, evaluation: { ...form.evaluation } });
    showToast('수업 기록이 저장되었어요.');
    setIsSaving(false);
  };

  const handleNoticeGenerated = ({ parentNotice, studentHomework }) => {
    const updated = { ...form, parentNoticeText: parentNotice, studentHomeworkText: studentHomework };
    setFormState(updated);
    setSaved({ ...updated, evaluation: { ...updated.evaluation } });
    saveLessonRecord({ classId: cls.id, studentId, date: cls.date, ...updated });
  };

  const handleCopyParent = () => {
    if (!form.parentNoticeText) return;
    navigator.clipboard.writeText(form.parentNoticeText).then(() =>
      showToast('학부모용 알림장을 복사했어요.')
    );
  };

  const handleCopyStudent = () => {
    if (!form.studentHomeworkText) return;
    navigator.clipboard.writeText(form.studentHomeworkText).then(() =>
      showToast('학생용 숙제 알림을 복사했어요.')
    );
  };

  const handleParentSent = () => {
    const updated = { ...form, parentNoticeStatus: 'sent' };
    setFormState(updated);
    setSaved((s) => ({ ...s, parentNoticeStatus: 'sent' }));
    saveLessonRecord({ classId: cls.id, studentId, date: cls.date, ...updated });
    showToast('학부모 알림장이 전송 완료 처리되었습니다.');
  };

  const handleStudentSent = () => {
    const updated = { ...form, studentHomeworkStatus: 'sent' };
    setFormState(updated);
    setSaved((s) => ({ ...s, studentHomeworkStatus: 'sent' }));
    saveLessonRecord({ classId: cls.id, studentId, date: cls.date, ...updated });
    showToast('학생 숙제 알림이 전달 완료 처리되었습니다.');
  };

  const hasNotice = !!(form.parentNoticeText || form.studentHomeworkText);

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

      {/* Memo */}
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
        <p className="text-xs font-bold text-gray-700 mb-3">
          {groupMode ? `${student?.name || '학생'} 평가` : '학생 평가'}
        </p>
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

      {/* Save button — dirty state */}
      <button
        onClick={handleSave}
        disabled={isSaving || !isDirty}
        className={`w-full py-3.5 rounded-xl font-bold text-base transition-colors ${
          isSaving
            ? 'bg-gray-100 text-gray-400'
            : isDirty
              ? 'bg-blue-600 text-white'
              : 'bg-green-50 text-green-600'
        }`}
      >
        {isSaving ? '저장 중...' : isDirty ? '수업 기록 저장' : '✓ 저장됨'}
      </button>

      {/* AI Notice section */}
      <div className="mt-1 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-800">
            {groupMode ? `${student?.name || '학생'} 알림장` : 'AI 알림장'}
          </p>
          <button
            onClick={() => setShowNotice(true)}
            className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
          >
            {hasNotice ? '다시 생성' : 'AI 초안 생성'}
          </button>
        </div>

        {hasNotice ? (
          <>
            {/* 학부모용 알림장 카드 */}
            <div className="bg-blue-50 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-blue-900">📩 학부모용 알림장</p>
                {form.parentNoticeStatus === 'sent' && (
                  <span className="text-xs text-green-600 font-medium">✓ 전송 완료</span>
                )}
              </div>
              {form.parentNoticeText ? (
                <>
                  <div
                    className="text-sm text-gray-700 whitespace-pre-line bg-white rounded-xl p-3 border border-blue-100 mb-3 overflow-y-auto"
                    style={{ minHeight: '72px', maxHeight: '200px' }}
                  >
                    {form.parentNoticeText}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyParent}
                      className="flex-1 bg-white text-blue-600 font-bold text-sm py-2.5 rounded-xl border border-blue-200"
                    >
                      복사하기
                    </button>
                    <button
                      onClick={handleParentSent}
                      disabled={form.parentNoticeStatus === 'sent'}
                      className={`flex-1 font-bold text-sm py-2.5 rounded-xl ${
                        form.parentNoticeStatus === 'sent'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      {form.parentNoticeStatus === 'sent' ? '전송 완료' : '전송 완료 처리'}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-blue-400">학부모용 알림장이 없어요. 다시 생성해보세요.</p>
              )}
            </div>

            {/* 학생용 숙제 알림 카드 */}
            <div className="bg-green-50 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-green-900">📝 학생용 숙제 알림</p>
                {form.studentHomeworkStatus === 'sent' && (
                  <span className="text-xs text-green-600 font-medium">✓ 전달 완료</span>
                )}
              </div>
              {form.studentHomeworkText ? (
                <>
                  <div
                    className="text-sm text-gray-700 whitespace-pre-line bg-white rounded-xl p-3 border border-green-100 mb-3 overflow-y-auto"
                    style={{ minHeight: '72px', maxHeight: '200px' }}
                  >
                    {form.studentHomeworkText}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyStudent}
                      className="flex-1 bg-white text-green-600 font-bold text-sm py-2.5 rounded-xl border border-green-200"
                    >
                      복사하기
                    </button>
                    <button
                      onClick={handleStudentSent}
                      disabled={form.studentHomeworkStatus === 'sent'}
                      className={`flex-1 font-bold text-sm py-2.5 rounded-xl ${
                        form.studentHomeworkStatus === 'sent'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-green-600 text-white'
                      }`}
                    >
                      {form.studentHomeworkStatus === 'sent' ? '전달 완료' : '전달 완료 처리'}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-green-400">학생용 숙제 알림이 없어요. 다시 생성해보세요.</p>
              )}
            </div>
          </>
        ) : (
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-400">수업 기록을 입력 후 AI 알림장을 생성하세요</p>
          </div>
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
