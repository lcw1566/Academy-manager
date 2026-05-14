import { useState } from 'react';
import { LogOut, Key, Eye, EyeOff, Check, MessageSquare, ChevronRight, Edit2, Wifi, WifiOff, Loader2 } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import Modal from '../../components/Modal';
import { roleMap, formatPhoneNumber } from '../../utils/format';
import { testGeminiConnection } from '../../utils/aiNotice';

const NOTICE_TONES = [
  { id: 'friendly',    label: '친절한' },
  { id: 'plain',       label: '담백한' },
  { id: 'praise',      label: '칭찬 중심' },
  { id: 'improvement', label: '개선 중심' },
];

const SUBJECTS = ['수학', '영어', '국어', '과학', '물리', '화학', '사회', '역사', '기타'];

export default function MorePage() {
  const {
    role, logout, consultations, students,
    geminiApiKey, setGeminiApiKey, showToast,
    tutorProfile, setTutorProfile,
  } = useAcademyStore();

  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [keyInput, setKeyInput] = useState(geminiApiKey);
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [testState, setTestState] = useState(null); // null | 'testing' | 'success' | 'error'
  const [testMsg, setTestMsg] = useState('');

  const recentConsultations = consultations
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const handleSaveKey = () => {
    setGeminiApiKey(keyInput.trim());
    setKeySaved(true);
    showToast('API 키가 저장되었습니다.');
    setTimeout(() => setKeySaved(false), 2000);
  };

  const handleDeleteKey = () => {
    setKeyInput('');
    setGeminiApiKey('');
    setTestState(null);
    setTestMsg('');
    showToast('API 키가 삭제되었습니다.');
  };

  const handleTestConnection = async () => {
    setTestState('testing');
    setTestMsg('');
    try {
      const { model } = await testGeminiConnection(keyInput.trim() || geminiApiKey);
      setTestState('success');
      setTestMsg(`연결 성공 · ${model}`);
    } catch (err) {
      setTestState('error');
      setTestMsg(err.message);
    }
  };

  return (
    <div>
      <Header title="더보기" />

      <div className="pt-14 pb-6">
        {/* Profile card */}
        <button
          onClick={() => setShowProfileEdit(true)}
          className="mx-4 mt-4 w-[calc(100%-2rem)] bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left active:scale-98 transition-transform"
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">
            {(tutorProfile.name || '선')[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900">{tutorProfile.name || '과외 선생님'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{roleMap[role]}</p>
            {tutorProfile.phone && (
              <p className="text-xs text-gray-400 mt-0.5">{tutorProfile.phone}</p>
            )}
            {tutorProfile.subjects?.length > 0 && (
              <p className="text-xs text-blue-600 mt-0.5">{tutorProfile.subjects.join(' · ')}</p>
            )}
          </div>
          <div className="flex items-center gap-1 text-gray-400 flex-shrink-0">
            <Edit2 size={13} />
            <ChevronRight size={15} />
          </div>
        </button>

        {/* Bank account quick view */}
        {tutorProfile.bankAccount ? (
          <div className="mx-4 mt-2 bg-blue-50 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-700 font-medium">
                {tutorProfile.bankName} {tutorProfile.bankAccount}
              </p>
              {tutorProfile.accountHolder && (
                <p className="text-xs text-blue-500">{tutorProfile.accountHolder}</p>
              )}
            </div>
            <button
              onClick={() => setShowProfileEdit(true)}
              className="text-xs text-blue-600 font-semibold ml-4"
            >
              수정
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowProfileEdit(true)}
            className="mx-4 mt-2 w-[calc(100%-2rem)] bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 text-left"
          >
            <p className="text-xs text-orange-700 font-medium">계좌 정보를 등록하면 수납 안내 문자에 자동으로 포함돼요</p>
            <p className="text-xs text-orange-500 mt-0.5">프로필에서 계좌 정보 추가하기 →</p>
          </button>
        )}

        {/* Gemini API Key */}
        <div className="mx-4 mt-5">
          <p className="text-sm font-bold text-gray-700 mb-3">AI 알림장 설정</p>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Key size={14} className="text-blue-500" />
              <p className="text-sm font-semibold text-gray-800">Gemini API 키</p>
              {geminiApiKey && (
                <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium ml-auto">
                  연결됨
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Google AI Studio에서 무료로 발급 가능 · 기기에만 저장됩니다
            </p>

            <div className="flex gap-2 mb-3">
              <div className="flex-1 flex items-center border border-gray-200 rounded-xl px-3 overflow-hidden">
                <input
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  type={showKey ? 'text' : 'password'}
                  placeholder="AIzaSy..."
                  className="flex-1 py-3 text-sm focus:outline-none text-gray-700 bg-transparent"
                />
                <button onClick={() => setShowKey((v) => !v)} className="text-gray-400 p-1">
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                onClick={handleSaveKey}
                className={`px-4 rounded-xl text-sm font-bold transition-colors ${
                  keySaved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'
                }`}
              >
                {keySaved ? <Check size={16} /> : '저장'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              {geminiApiKey && (
                <button onClick={handleDeleteKey} className="text-xs text-red-400 font-medium">
                  API 키 삭제
                </button>
              )}
              {(keyInput.trim() || geminiApiKey) && (
                <button
                  onClick={handleTestConnection}
                  disabled={testState === 'testing'}
                  className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-blue-600 disabled:opacity-50"
                >
                  {testState === 'testing' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : testState === 'success' ? (
                    <Wifi size={13} />
                  ) : testState === 'error' ? (
                    <WifiOff size={13} className="text-red-400" />
                  ) : (
                    <Wifi size={13} />
                  )}
                  {testState === 'testing' ? '테스트 중...' : 'AI 연결 테스트'}
                </button>
              )}
            </div>

            {testMsg && (
              <div className={`mt-2 rounded-xl px-3 py-2 text-xs font-medium ${
                testState === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-600'
              }`}>
                {testState === 'success' ? '✓ ' : '✗ '}{testMsg}
              </div>
            )}

            <div className="mt-3 bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">무료 발급 방법</p>
              <ol className="text-xs text-gray-400 flex flex-col gap-0.5 list-decimal list-inside">
                <li>aistudio.google.com 접속</li>
                <li>Google 계정으로 로그인</li>
                <li>"Get API key" 클릭 후 키 복사</li>
                <li>위 입력란에 붙여넣기 후 저장</li>
              </ol>
              <p className="text-xs text-blue-500 mt-2">무료 한도: 하루 1,500건, 분당 15건</p>
            </div>
          </div>
        </div>

        {/* Consultations */}
        <div className="mx-4 mt-5">
          <p className="text-sm font-bold text-gray-700 mb-3">최근 상담 기록</p>
          {recentConsultations.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <p className="text-gray-400 text-sm">상담 기록이 없어요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentConsultations.map((con) => {
                const student = students.find((s) => s.id === con.studentId);
                return (
                  <div key={con.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={14} className="text-gray-400" />
                        <span className="font-semibold text-gray-900 text-sm">{student?.name}</span>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{con.method}</span>
                      </div>
                      <span className="text-xs text-gray-400">{con.date}</span>
                    </div>
                    <p className="text-sm text-gray-700">{con.content}</p>
                    {con.followUp && (
                      <p className="text-xs text-blue-600 mt-1.5">→ {con.followUp}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Coming soon */}
        <div className="mx-4 mt-5">
          <p className="text-sm font-bold text-gray-700 mb-3">예정 기능</p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {['강사 관리', '데이터 내보내기', '알림 설정'].map((item, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-4 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-500">{item}</span>
                <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">준비 중</span>
              </div>
            ))}
          </div>
        </div>

        {/* Logout */}
        <div className="mx-4 mt-5">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white shadow-sm text-gray-600 text-sm font-medium"
          >
            <LogOut size={16} />
            역할 변경
          </button>
        </div>
      </div>

      {showProfileEdit && (
        <ProfileEditModal
          profile={tutorProfile}
          onClose={() => setShowProfileEdit(false)}
          onSave={(data) => {
            setTutorProfile(data);
            showToast('프로필이 저장되었습니다.');
            setShowProfileEdit(false);
          }}
        />
      )}
    </div>
  );
}

// ── Profile edit modal ─────────────────────────────────────────────────────────

function ProfileEditModal({ profile, onClose, onSave }) {
  const [form, setForm] = useState({ ...profile });
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleSubject = (sub) =>
    setForm((f) => ({
      ...f,
      subjects: f.subjects?.includes(sub)
        ? f.subjects.filter((s) => s !== sub)
        : [...(f.subjects || []), sub],
    }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="프로필 수정"
      footer={
        <button
          onClick={() => onSave(form)}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl text-base"
        >
          저장
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="선생님 이름">
          <input
            value={form.name || ''}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="홍길동"
            className="input"
          />
        </Field>

        <Field label="전화번호">
          <input
            inputMode="tel"
            value={form.phone || ''}
            onChange={(e) => setField('phone', formatPhoneNumber(e.target.value))}
            placeholder="010-0000-0000"
            className="input"
          />
        </Field>

        <Field label="이메일">
          <input
            type="email"
            value={form.email || ''}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="email@example.com"
            className="input"
          />
        </Field>

        <Field label="기본 과목">
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => toggleSubject(sub)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  form.subjects?.includes(sub)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>
        </Field>

        <Field label="기본 수업 장소">
          <input
            value={form.defaultLocation || ''}
            onChange={(e) => setField('defaultLocation', e.target.value)}
            placeholder="예: 학생 자택, 스터디카페"
            className="input"
          />
        </Field>

        {/* Bank account */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wide">계좌 정보</p>
          <div className="flex flex-col gap-3">
            <Field label="은행">
              <input
                value={form.bankName || ''}
                onChange={(e) => setField('bankName', e.target.value)}
                placeholder="예: 국민은행"
                className="input"
              />
            </Field>
            <Field label="계좌번호">
              <input
                value={form.bankAccount || ''}
                onChange={(e) => setField('bankAccount', e.target.value)}
                placeholder="000000-00-000000"
                className="input"
              />
            </Field>
            <Field label="예금주">
              <input
                value={form.accountHolder || ''}
                onChange={(e) => setField('accountHolder', e.target.value)}
                placeholder="홍길동"
                className="input"
              />
            </Field>
          </div>
        </div>

        {/* Notice tone */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-bold text-gray-500 mb-3">알림장 기본 톤</p>
          <div className="grid grid-cols-2 gap-2">
            {NOTICE_TONES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setField('defaultNoticeTone', id)}
                className={`py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                  form.defaultNoticeTone === id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
