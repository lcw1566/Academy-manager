import { useState } from 'react';
import { Loader2, Key, AlertTriangle, Copy, Settings2, ChevronDown, ChevronUp, RotateCcw, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '../../components/Modal';
import useAcademyStore from '../../store/useAcademyStore';
import { generateNoticeWithAI, generateNotice, buildGeminiPrompt, TONE_LABELS } from '../../utils/aiNotice';
import { DEFAULT_PARENT_NOTICE_PROMPT, DEFAULT_STUDENT_HOMEWORK_PROMPT } from '../../constants/aiPrompts';

const TONES = [
  { id: 'friendly',    label: '친절한',     desc: '따뜻하고 친근하게' },
  { id: 'plain',       label: '담백한',     desc: '간결하고 깔끔하게' },
  { id: 'praise',      label: '칭찬 중심', desc: '잘한 점 위주로' },
  { id: 'improvement', label: '개선 중심', desc: '보완할 점 위주로' },
];

export default function AiNoticeModal({ cls, studentId, form, onGenerated, onClose }) {
  const { students, geminiApiKey, showToast, tutorProfile, setTutorProfile } = useAcademyStore();
  const student = students.find((s) => s.id === studentId);

  const resolvedKey = geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || '';

  // Profile-level prompts (with fallback to defaults)
  const profileTone = tutorProfile?.defaultNoticeTone || 'friendly';
  const profileParentPrompt = tutorProfile?.parentNoticePrompt || DEFAULT_PARENT_NOTICE_PROMPT;
  const profileStudentPrompt = tutorProfile?.studentHomeworkPrompt || DEFAULT_STUDENT_HOMEWORK_PROMPT;

  // Session-level overrides (temporary, not saved to profile)
  const [tone, setTone] = useState(profileTone);
  const [sessionParentPrompt, setSessionParentPrompt] = useState(null); // null = use profile
  const [sessionStudentPrompt, setSessionStudentPrompt] = useState(null); // null = use profile

  const [editedParent, setEditedParent] = useState('');
  const [editedStudent, setEditedStudent] = useState('');
  const [step, setStep] = useState('config'); // 'config' | 'loading' | 'edit'
  const [errorMsg, setErrorMsg] = useState('');
  const [usedFallback, setUsedFallback] = useState(false);
  const [showStyleSheet, setShowStyleSheet] = useState(false);

  const effectiveParentPrompt = sessionParentPrompt ?? profileParentPrompt;
  const effectiveStudentPrompt = sessionStudentPrompt ?? profileStudentPrompt;

  const hasCustomStyle = tone !== profileTone || sessionParentPrompt !== null || sessionStudentPrompt !== null;

  const handleGenerate = async () => {
    setStep('loading');
    setErrorMsg('');
    setUsedFallback(false);

    let result;

    if (resolvedKey) {
      try {
        result = await generateNoticeWithAI({
          studentName: student?.name || '학생',
          content: form.content,
          materials: form.materials,
          homework: form.homework,
          nextPlan: form.nextPlan,
          evaluation: form.evaluation,
          memo: form.memo,
          tone,
          apiKey: resolvedKey,
          parentNoticePrompt: effectiveParentPrompt,
          studentHomeworkPrompt: effectiveStudentPrompt,
        });
      } catch (aiErr) {
        setErrorMsg(aiErr.message);
        result = generateNotice({
          studentName: student?.name || '학생',
          content: form.content,
          homework: form.homework,
          evaluation: form.evaluation,
          memo: form.memo,
          tone,
        });
        setUsedFallback(true);
      }
    } else {
      result = generateNotice({
        studentName: student?.name || '학생',
        content: form.content,
        homework: form.homework,
        evaluation: form.evaluation,
        memo: form.memo,
        tone,
      });
    }

    setEditedParent(result.parentNotice || '');
    setEditedStudent(result.studentHomework || '');
    setStep('edit');
  };

  const handleConfirm = () => {
    onGenerated({ parentNotice: editedParent, studentHomework: editedStudent });
    showToast('알림장이 저장되었습니다.');
    onClose();
  };

  const handleCopyParent = () => {
    if (!editedParent) return;
    navigator.clipboard.writeText(editedParent).then(() => showToast('학부모용 알림장을 복사했어요.'));
  };

  const handleCopyStudent = () => {
    if (!editedStudent) return;
    navigator.clipboard.writeText(editedStudent).then(() => showToast('학생용 숙제 알림을 복사했어요.'));
  };

  return (
    <>
      <Modal
        isOpen
        onClose={step === 'loading' ? undefined : onClose}
        title="AI 알림장 생성"
        footer={
          step === 'config' ? (
            <button
              onClick={handleGenerate}
              className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl text-base"
            >
              ✨ {resolvedKey ? 'AI로 생성하기' : '미리보기 생성'}
            </button>
          ) : step === 'loading' ? (
            <div className="w-full flex items-center justify-center py-3 text-gray-400 gap-2">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">AI가 알림장을 작성하고 있어요...</span>
            </div>
          ) : (
            <button onClick={handleConfirm} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl text-base">
              저장하기
            </button>
          )
        }
      >
        {step === 'config' && (
          <div className="flex flex-col gap-5">
            {/* API key status */}
            {!resolvedKey ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <Key size={15} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-yellow-800">Gemini API 키 미설정</p>
                  <p className="text-xs text-yellow-600 mt-0.5">
                    더보기 → API 설정에서 키를 등록하면 AI가 직접 알림장을 작성해줍니다.
                    지금은 템플릿 기반으로 생성됩니다.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-green-800">✓ Gemini AI 연결됨</p>
                <p className="text-xs text-green-600 mt-0.5">수업 내용을 분석해 자연스러운 알림장을 작성합니다</p>
              </div>
            )}

            {/* Content summary */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1.5 font-medium">입력된 수업 정보</p>
              <div className="flex flex-col gap-1">
                {form.content && <p className="text-xs text-gray-700">📖 {form.content}</p>}
                {form.homework && <p className="text-xs text-gray-700">✏️ 숙제: {form.homework}</p>}
                {form.memo && <p className="text-xs text-gray-700">💬 특이사항: {form.memo}</p>}
                {!form.content && !form.homework && !form.memo && (
                  <p className="text-xs text-gray-400">수업 기록이 비어있어요. 내용을 입력하면 더 자세한 알림장이 생성됩니다.</p>
                )}
              </div>
            </div>

            {/* Writing style — compact display with edit button */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">작성 스타일</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-gray-900">{TONE_LABELS[tone]}</span>
                    {hasCustomStyle && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                        수정됨
                      </span>
                    )}
                    {!hasCustomStyle && (
                      <span className="text-xs text-gray-400">· 프로필 기본값</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowStyleSheet(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 font-semibold bg-blue-50 px-3 py-1.5 rounded-xl"
                >
                  <Settings2 size={12} />
                  스타일 수정하기
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 size={36} className="animate-spin text-blue-500" />
            <p className="text-sm text-gray-500 text-center">
              수업 내용을 분석하여<br />알림장을 작성하고 있어요
            </p>
          </div>
        )}

        {step === 'edit' && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-800">생성된 알림장</p>
              <button
                onClick={() => { setStep('config'); setErrorMsg(''); }}
                className="text-xs text-blue-600 font-medium"
              >
                다시 생성
              </button>
            </div>

            {errorMsg && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">{errorMsg}</p>
              </div>
            )}
            {usedFallback && !errorMsg && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <p className="text-xs text-amber-700 font-medium">AI 연결이 원활하지 않아 기본 알림장으로 생성했어요.</p>
                <p className="text-xs text-amber-500 mt-0.5">직접 수정 후 사용하세요.</p>
              </div>
            )}

            {/* 학부모용 알림장 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-blue-700">📩 학부모용 알림장</p>
                <button
                  onClick={handleCopyParent}
                  className="flex items-center gap-1 text-xs text-blue-600 font-medium"
                >
                  <Copy size={11} />
                  복사
                </button>
              </div>
              <textarea
                value={editedParent}
                onChange={(e) => setEditedParent(e.target.value)}
                style={{ minHeight: '150px' }}
                className="w-full border border-blue-200 rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none focus:border-blue-400 resize-y bg-blue-50"
              />
            </div>

            {/* 학생용 숙제 알림 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-green-700">📝 학생용 숙제 알림</p>
                <button
                  onClick={handleCopyStudent}
                  className="flex items-center gap-1 text-xs text-green-600 font-medium"
                >
                  <Copy size={11} />
                  복사
                </button>
              </div>
              <textarea
                value={editedStudent}
                onChange={(e) => setEditedStudent(e.target.value)}
                style={{ minHeight: '150px' }}
                className="w-full border border-green-200 rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none focus:border-green-400 resize-y bg-green-50"
              />
            </div>

            <p className="text-xs text-gray-400 text-center">각각 직접 수정 후 저장하세요</p>
          </div>
        )}
      </Modal>

      {/* Style sheet bottom sheet */}
      <AnimatePresence>
        {showStyleSheet && (
          <StyleSheet
            tone={tone}
            setTone={setTone}
            profileTone={profileTone}
            profileParentPrompt={profileParentPrompt}
            profileStudentPrompt={profileStudentPrompt}
            sessionParentPrompt={sessionParentPrompt}
            sessionStudentPrompt={sessionStudentPrompt}
            setSessionParentPrompt={setSessionParentPrompt}
            setSessionStudentPrompt={setSessionStudentPrompt}
            tutorProfile={tutorProfile}
            setTutorProfile={setTutorProfile}
            showToast={showToast}
            studentName={student?.name || '학생'}
            form={form}
            onClose={() => setShowStyleSheet(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Style sheet bottom sheet ───────────────────────────────────────────────────

function StyleSheet({
  tone, setTone, profileTone,
  profileParentPrompt, profileStudentPrompt,
  sessionParentPrompt, sessionStudentPrompt,
  setSessionParentPrompt, setSessionStudentPrompt,
  tutorProfile, setTutorProfile, showToast,
  studentName, form,
  onClose,
}) {
  const [localTone, setLocalTone] = useState(tone);
  const [localParentPrompt, setLocalParentPrompt] = useState(
    sessionParentPrompt ?? profileParentPrompt
  );
  const [localStudentPrompt, setLocalStudentPrompt] = useState(
    sessionStudentPrompt ?? profileStudentPrompt
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const previewPrompt = buildGeminiPrompt({
    studentName,
    content: form.content || '(수업 내용)',
    materials: form.materials,
    homework: form.homework,
    nextPlan: form.nextPlan,
    evaluation: form.evaluation,
    memo: form.memo,
    tone: localTone,
    parentNoticePrompt: localParentPrompt,
    studentHomeworkPrompt: localStudentPrompt,
  });

  const handleApplyOnce = () => {
    setTone(localTone);
    setSessionParentPrompt(localParentPrompt !== profileParentPrompt ? localParentPrompt : null);
    setSessionStudentPrompt(localStudentPrompt !== profileStudentPrompt ? localStudentPrompt : null);
    showToast('이번 생성에만 적용됩니다.');
    onClose();
  };

  const handleSaveToProfile = () => {
    setTone(localTone);
    setSessionParentPrompt(null);
    setSessionStudentPrompt(null);
    setTutorProfile({
      ...tutorProfile,
      defaultNoticeTone: localTone,
      parentNoticePrompt: localParentPrompt,
      studentHomeworkPrompt: localStudentPrompt,
    });
    showToast('프로필 기본값으로 저장되었습니다.');
    onClose();
  };

  return (
    <>
      <motion.div
        key="style-dim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[60]"
        onClick={onClose}
      />
      <motion.div
        key="style-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl px-4 pt-5 pb-10 overflow-y-auto"
        style={{ maxHeight: '90vh' }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <p className="text-base font-bold text-gray-900 mb-1">작성 스타일 수정</p>
        <p className="text-sm text-gray-400 mb-5">이번 생성 또는 기본값으로 저장할 수 있어요</p>

        {/* Tone selection */}
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-500 mb-3">작성 톤</p>
          <div className="grid grid-cols-2 gap-2">
            {TONES.map(({ id, label, desc }) => (
              <button
                key={id}
                onClick={() => setLocalTone(id)}
                className={`py-3 px-3 rounded-xl text-left border transition-colors ${
                  localTone === id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                <p className="text-sm font-semibold">
                  {label}
                  {id === profileTone && localTone !== id && (
                    <span className="text-xs ml-1 opacity-60">(기본)</span>
                  )}
                </p>
                <p className={`text-xs mt-0.5 ${localTone === id ? 'text-blue-100' : 'text-gray-400'}`}>
                  {desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Advanced settings (collapsible) */}
        <div className="border border-gray-200 rounded-2xl overflow-hidden mb-4">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50"
          >
            <div>
              <p className="text-sm font-semibold text-gray-800 text-left">고급 설정</p>
              <p className="text-xs text-gray-400 text-left">학부모/학생 작성 방식 직접 수정</p>
            </div>
            {showAdvanced
              ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" />
              : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
            }
          </button>

          {showAdvanced && (
            <div className="px-4 pb-4 pt-3 flex flex-col gap-4">
              {/* Parent notice prompt */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-blue-700">학부모용 작성 방식</label>
                  <button
                    type="button"
                    onClick={() => setLocalParentPrompt(DEFAULT_PARENT_NOTICE_PROMPT)}
                    className="flex items-center gap-1 text-xs text-gray-400"
                  >
                    <RotateCcw size={10} />
                    기본으로
                  </button>
                </div>
                <textarea
                  value={localParentPrompt}
                  onChange={(e) => setLocalParentPrompt(e.target.value)}
                  rows={5}
                  style={{ maxHeight: '160px' }}
                  className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-xs leading-relaxed focus:outline-none focus:border-blue-400 bg-blue-50 resize-none overflow-y-auto"
                />
              </div>

              {/* Student homework prompt */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-green-700">학생용 숙제 알림 작성 방식</label>
                  <button
                    type="button"
                    onClick={() => setLocalStudentPrompt(DEFAULT_STUDENT_HOMEWORK_PROMPT)}
                    className="flex items-center gap-1 text-xs text-gray-400"
                  >
                    <RotateCcw size={10} />
                    기본으로
                  </button>
                </div>
                <textarea
                  value={localStudentPrompt}
                  onChange={(e) => setLocalStudentPrompt(e.target.value)}
                  rows={5}
                  style={{ maxHeight: '160px' }}
                  className="w-full border border-green-200 rounded-xl px-3 py-2.5 text-xs leading-relaxed focus:outline-none focus:border-green-400 bg-green-50 resize-none overflow-y-auto"
                />
              </div>

              {/* Prompt preview */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold mb-2"
                >
                  <Eye size={12} />
                  프롬프트 미리보기
                  {showPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showPreview && (
                  <div
                    className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 leading-relaxed overflow-y-auto whitespace-pre-wrap font-mono"
                    style={{ maxHeight: '200px' }}
                  >
                    {previewPrompt}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleApplyOnce}
            className="w-full py-3.5 rounded-2xl bg-blue-600 text-white text-sm font-bold"
          >
            이번 생성에만 적용
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSaveToProfile}
            className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-800 text-sm font-bold"
          >
            프로필 기본값으로 저장
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
            className="w-full py-3 rounded-2xl text-gray-400 text-sm font-medium"
          >
            취소
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}
