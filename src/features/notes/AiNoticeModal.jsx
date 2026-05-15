import { useState } from 'react';
import { Loader2, Key, AlertTriangle, Copy } from 'lucide-react';
import Modal from '../../components/Modal';
import useAcademyStore from '../../store/useAcademyStore';
import { generateNoticeWithAI, generateNotice } from '../../utils/aiNotice';

const TONES = [
  { id: 'friendly',    label: '친절한',     desc: '따뜻하고 친근하게' },
  { id: 'plain',       label: '담백한',     desc: '간결하고 깔끔하게' },
  { id: 'praise',      label: '칭찬 중심', desc: '잘한 점 위주로' },
  { id: 'improvement', label: '개선 중심', desc: '보완할 점 위주로' },
];

const TONE_LABELS = {
  friendly: '친절한', plain: '담백한', praise: '칭찬 중심', improvement: '개선 중심',
};

export default function AiNoticeModal({ cls, studentId, form, onGenerated, onClose }) {
  const { students, geminiApiKey, showToast, tutorProfile } = useAcademyStore();
  const student = students.find((s) => s.id === studentId);

  const resolvedKey = geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || '';
  const defaultTone = tutorProfile?.defaultNoticeTone || 'friendly';

  const [tone, setTone] = useState(defaultTone);
  const [editedParent, setEditedParent] = useState('');
  const [editedStudent, setEditedStudent] = useState('');
  const [step, setStep] = useState('config'); // 'config' | 'loading' | 'edit'
  const [errorMsg, setErrorMsg] = useState('');
  const [usedFallback, setUsedFallback] = useState(false);

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

          {/* Tone selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-800">알림장 톤</p>
              {defaultTone !== tone ? (
                <p className="text-xs text-gray-400">
                  프로필 기본: <span className="font-medium text-gray-600">{TONE_LABELS[defaultTone]}</span>
                </p>
              ) : (
                <p className="text-xs text-blue-500 font-medium">프로필 기본 톤 적용 중</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map(({ id, label, desc }) => (
                <button
                  key={id}
                  onClick={() => setTone(id)}
                  className={`py-3 px-3 rounded-xl text-left border transition-colors ${
                    tone === id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  <p className="text-sm font-semibold">
                    {label}
                    {id === defaultTone && tone !== id && <span className="text-xs ml-1 opacity-60">(기본)</span>}
                  </p>
                  <p className={`text-xs mt-0.5 ${tone === id ? 'text-blue-100' : 'text-gray-400'}`}>{desc}</p>
                </button>
              ))}
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
  );
}
