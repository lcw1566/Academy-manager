import { useState } from 'react';
import { Loader2, Key } from 'lucide-react';
import Modal from '../../components/Modal';
import useAcademyStore from '../../store/useAcademyStore';
import { generateNoticeWithAI, generateNotice } from '../../utils/aiNotice';

const TONES = [
  { id: 'friendly',    label: '친절한',     desc: '따뜻하고 친근하게' },
  { id: 'plain',       label: '담백한',     desc: '간결하고 깔끔하게' },
  { id: 'praise',      label: '칭찬 중심', desc: '잘한 점 위주로' },
  { id: 'improvement', label: '개선 중심', desc: '보완할 점 위주로' },
];

export default function AiNoticeModal({ cls, studentId, form, onGenerated, onClose }) {
  const { students, geminiApiKey, setActiveTab, showToast } = useAcademyStore();
  const student = students.find((s) => s.id === studentId);

  const [tone, setTone] = useState('friendly');
  const [edited, setEdited] = useState('');
  const [step, setStep] = useState('config'); // 'config' | 'loading' | 'edit'
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setStep('loading');
    setError('');

    try {
      let text;
      if (geminiApiKey) {
        text = await generateNoticeWithAI({
          studentName: student?.name || '학생',
          content: form.content,
          materials: form.materials,
          homework: form.homework,
          nextPlan: form.nextPlan,
          evaluation: form.evaluation,
          memo: form.memo,
          tone,
          apiKey: geminiApiKey,
        });
      } else {
        // Mock fallback
        text = generateNotice({
          studentName: student?.name || '학생',
          content: form.content,
          homework: form.homework,
          evaluation: form.evaluation,
          memo: form.memo,
          tone,
        });
      }
      setEdited(text);
      setStep('edit');
    } catch (err) {
      setError(err.message || '생성 중 오류가 발생했습니다.');
      setStep('config');
    }
  };

  const handleConfirm = () => {
    onGenerated(edited);
    showToast('알림장이 저장되었습니다.');
    onClose();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(edited).then(() => {
      showToast('알림장이 복사되었습니다.');
    });
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
            ✨ {geminiApiKey ? 'AI로 생성하기' : '미리보기 생성'}
          </button>
        ) : step === 'loading' ? (
          <div className="w-full flex items-center justify-center py-3 text-gray-400 gap-2">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">AI가 알림장을 작성하고 있어요...</span>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleCopy} className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-xl text-sm">
              복사하기
            </button>
            <button onClick={handleConfirm} className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-xl text-sm">
              저장하기
            </button>
          </div>
        )
      }
    >
      {step === 'config' && (
        <div className="flex flex-col gap-5">
          {/* API key status */}
          {!geminiApiKey ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <Key size={15} className="text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-yellow-800">Gemini API 키 미설정</p>
                <p className="text-xs text-yellow-600 mt-0.5">
                  더보기 → API 설정에서 키를 등록하면 AI가 직접 알림장을 작성해줍니다.
                  지금은 템플릿 기반 미리보기로 생성됩니다.
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

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-xs text-red-600 font-medium">오류: {error}</p>
            </div>
          )}

          {/* Tone selection */}
          <div>
            <p className="text-sm font-bold text-gray-800 mb-3">알림장 톤</p>
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
                  <p className="text-sm font-semibold">{label}</p>
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
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-800">생성된 알림장</p>
            <button onClick={() => setStep('config')} className="text-xs text-blue-600 font-medium">
              다시 생성
            </button>
          </div>
          <textarea
            value={edited}
            onChange={(e) => setEdited(e.target.value)}
            rows={10}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none focus:border-blue-400"
          />
          <p className="text-xs text-gray-400 text-center">직접 수정 후 저장하세요</p>
        </div>
      )}
    </Modal>
  );
}
