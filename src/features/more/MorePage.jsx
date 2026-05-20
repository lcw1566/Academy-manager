import { useState } from 'react';
import {
  LogOut, Key, Eye, EyeOff, Check, MessageSquare, ChevronRight, Edit2,
  Wifi, WifiOff, Loader2, Trash2, AlertTriangle, ChevronDown, RotateCcw,
} from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import Modal from '../../components/Modal';
import { roleMap, formatPhoneNumber } from '../../utils/format';
import { testGeminiConnection } from '../../utils/aiNotice';
import { DEFAULT_PARENT_NOTICE_PROMPT, DEFAULT_STUDENT_HOMEWORK_PROMPT } from '../../constants/aiPrompts';
import AuthSection from '../auth/AuthSection';
import WorkspaceSection from '../workspace/WorkspaceSection';

const SUBJECTS = ['수학', '영어', '국어', '과학', '물리', '화학', '사회', '역사', '기타'];

export default function MorePage() {
  const {
    role, logout, consultations, students,
    geminiApiKey, setGeminiApiKey, showToast,
    tutorProfile, setTutorProfile,
    resetAllData, resetDataExceptTeachers,
  } = useAcademyStore();

  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [keyInput, setKeyInput] = useState(geminiApiKey);
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [testState, setTestState] = useState(null);
  const [testMsg, setTestMsg] = useState('');
  const [showResetSheet, setShowResetSheet] = useState(false);
  const [confirmResetType, setConfirmResetType] = useState(null);

  const recentConsultations = [...consultations]
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
        {/* 프로필 카드 */}
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

        {/* 계좌 정보 */}
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

        {/* 서버 계정 (선택 사항) */}
        <AuthSection />

        {/* 학원 워크스페이스 */}
        <WorkspaceSection />

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
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="text-gray-400 p-1"
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                type="button"
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
                <button
                  type="button"
                  onClick={handleDeleteKey}
                  className="text-xs text-red-400 font-medium"
                >
                  API 키 삭제
                </button>
              )}
              {(keyInput.trim() || geminiApiKey) && (
                <button
                  type="button"
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
                testState === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
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

        {/* 최근 상담 기록 */}
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

        {/* 예정 기능 */}
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

        {/* 역할 변경 */}
        <div className="mx-4 mt-5">
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white shadow-sm text-gray-600 text-sm font-medium"
          >
            <LogOut size={16} />
            역할 변경
          </button>
        </div>

        {/* 데이터 초기화 */}
        <div className="mx-4 mt-3 mb-2">
          <button
            type="button"
            onClick={() => setShowResetSheet(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-50 text-red-500 text-sm font-semibold active:bg-red-100 transition-colors"
          >
            <Trash2 size={16} />
            데이터 초기화
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

      {/* 초기화 선택 bottom sheet */}
      <Modal
        isOpen={showResetSheet}
        onClose={() => setShowResetSheet(false)}
        title="데이터를 초기화할까요?"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-500 -mt-1 mb-1">
            테스트 중 입력한 데이터를 삭제할 수 있어요. 삭제한 데이터는 되돌릴 수 없습니다.
          </p>
          <button
            type="button"
            onClick={() => { setShowResetSheet(false); setConfirmResetType('all'); }}
            className="w-full flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-4 text-left active:bg-red-100 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <Trash2 size={16} className="text-red-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-600">전체 초기화</p>
              <p className="text-xs text-red-400 mt-0.5">모든 데이터와 프로필을 초기화해요</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => { setShowResetSheet(false); setConfirmResetType('exceptTeachers'); }}
            className="w-full flex items-center gap-3 bg-orange-50 border border-orange-100 rounded-2xl px-4 py-4 text-left active:bg-orange-100 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={16} className="text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-orange-600">강사 데이터 제외하고 초기화</p>
              <p className="text-xs text-orange-400 mt-0.5">강사 정보는 유지하고 학생·수업·수납 데이터만 삭제해요</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setShowResetSheet(false)}
            className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-600 text-sm font-semibold mt-1"
          >
            취소
          </button>
        </div>
      </Modal>

      {/* 초기화 확인 모달 */}
      <Modal
        isOpen={confirmResetType !== null}
        onClose={() => setConfirmResetType(null)}
        title={confirmResetType === 'all' ? '정말 전체 초기화할까요?' : '강사 데이터 제외 초기화'}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmResetType(null)}
              className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmResetType === 'all') {
                  resetAllData();
                } else {
                  resetDataExceptTeachers();
                }
                setConfirmResetType(null);
              }}
              className="flex-1 py-3.5 rounded-xl bg-red-500 text-white text-sm font-bold"
            >
              초기화하기
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="bg-red-50 rounded-2xl px-4 py-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700 mb-1">이 작업은 되돌릴 수 없습니다</p>
              {confirmResetType === 'all' ? (
                <p className="text-xs text-red-500">학생, 수업, 수납, 상담 기록, 강사 정보, 프로필까지 모든 데이터가 삭제됩니다.</p>
              ) : (
                <p className="text-xs text-red-500">강사 정보와 프로필은 유지되며, 학생·수업·수납·상담 데이터가 삭제됩니다.</p>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── 프로필 수정 모달 ──────────────────────────────────────────────────────────

function ProfileEditModal({ profile, onClose, onSave }) {
  const [form, setForm] = useState({
    parentNoticePrompt: DEFAULT_PARENT_NOTICE_PROMPT,
    studentHomeworkPrompt: DEFAULT_STUDENT_HOMEWORK_PROMPT,
    ...profile,
  });
  const [showAiSection, setShowAiSection] = useState(false);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleSubject = (sub) =>
    setForm((f) => ({
      ...f,
      subjects: f.subjects?.includes(sub)
        ? f.subjects.filter((s) => s !== sub)
        : [...(f.subjects || []), sub],
    }));

  const resetParentPrompt  = () => setField('parentNoticePrompt', DEFAULT_PARENT_NOTICE_PROMPT);
  const resetStudentPrompt = () => setField('studentHomeworkPrompt', DEFAULT_STUDENT_HOMEWORK_PROMPT);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="프로필 수정"
      footer={
        <button
          type="button"
          onClick={() => onSave(form)}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl text-base"
        >
          저장
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 선생님 이름 */}
        <Field label="선생님 이름">
          <input
            value={form.name || ''}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="홍길동"
            className="input"
          />
        </Field>

        {/* 전화번호 */}
        <Field label="전화번호">
          <input
            inputMode="tel"
            value={form.phone || ''}
            onChange={(e) => setField('phone', formatPhoneNumber(e.target.value))}
            placeholder="010-0000-0000"
            className="input"
          />
        </Field>

        {/* 이메일 */}
        <Field label="이메일">
          <input
            type="email"
            value={form.email || ''}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="email@example.com"
            className="input"
          />
        </Field>

        {/* 기본 과목 */}
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

        {/* 기본 수업 장소 */}
        <Field label="기본 수업 장소">
          <input
            value={form.defaultLocation || ''}
            onChange={(e) => setField('defaultLocation', e.target.value)}
            placeholder="예: 학생 자택, 스터디카페"
            className="input"
          />
        </Field>

        {/* 계좌 정보 */}
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

        {/* AI 작성 설정 */}
        <div className="border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => setShowAiSection((v) => !v)}
            className="w-full flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3.5"
          >
            <div className="text-left">
              <p className="text-sm font-bold text-gray-800">AI 작성 설정</p>
              <p className="text-xs text-gray-400 mt-0.5">알림장과 숙제 알림의 기본 작성 방식을 설정해요</p>
            </div>
            <ChevronDown
              size={18}
              className={`text-gray-400 flex-shrink-0 ml-3 transition-transform duration-200 ${showAiSection ? 'rotate-180' : ''}`}
            />
          </button>

          {showAiSection && (
            <div className="mt-3 flex flex-col gap-4">
              {/* 학부모용 작성 방식 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-blue-700">학부모용 작성 방식</label>
                  <button
                    type="button"
                    onClick={resetParentPrompt}
                    className="flex items-center gap-1 text-xs text-gray-400 font-medium"
                  >
                    <RotateCcw size={11} />
                    기본 문구로
                  </button>
                </div>
                <textarea
                  value={form.parentNoticePrompt || DEFAULT_PARENT_NOTICE_PROMPT}
                  onChange={(e) => setField('parentNoticePrompt', e.target.value)}
                  rows={6}
                  className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-xs leading-relaxed focus:outline-none focus:border-blue-400 bg-blue-50 resize-none"
                />
              </div>

              {/* 학생용 숙제 알림 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-green-700">학생용 숙제 알림 작성 방식</label>
                  <button
                    type="button"
                    onClick={resetStudentPrompt}
                    className="flex items-center gap-1 text-xs text-gray-400 font-medium"
                  >
                    <RotateCcw size={11} />
                    기본 문구로
                  </button>
                </div>
                <textarea
                  value={form.studentHomeworkPrompt || DEFAULT_STUDENT_HOMEWORK_PROMPT}
                  onChange={(e) => setField('studentHomeworkPrompt', e.target.value)}
                  rows={6}
                  className="w-full border border-green-200 rounded-xl px-3 py-2.5 text-xs leading-relaxed focus:outline-none focus:border-green-400 bg-green-50 resize-none"
                />
              </div>
            </div>
          )}
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
