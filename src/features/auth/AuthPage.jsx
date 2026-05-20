import { useState } from 'react';
import { X } from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useAcademyStore from '../../store/useAcademyStore';

export default function AuthPage({ onAuthSuccess, onCancel }) {
  const [mode, setMode] = useState('signIn'); // 'signIn' | 'signUp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localMessage, setLocalMessage] = useState(null);

  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const isAuthLoading = useAuthStore((s) => s.isAuthLoading);
  const authError = useAuthStore((s) => s.authError);
  const isSupabaseReady = useAuthStore((s) => s.isSupabaseReady);
  const clearAuthError = useAuthStore((s) => s.clearAuthError);
  const showToast = useAcademyStore((s) => s.showToast);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalMessage(null);
    clearAuthError();

    if (!email || !password) {
      setLocalMessage({ type: 'error', text: '이메일과 비밀번호를 모두 입력해주세요.' });
      return;
    }

    try {
      if (mode === 'signIn') {
        await signIn({ email, password });
        showToast('로그인되었어요.');
        onAuthSuccess?.();
      } else {
        const data = await signUp({ email, password });
        if (!data?.session) {
          // 이메일 인증 필요 — 패널은 유지하고 안내 표시
          setLocalMessage({
            type: 'success',
            text: '인증 메일이 발송되었어요. 이메일 인증 후 로그인해주세요.',
          });
        } else {
          // 즉시 로그인됨 (이메일 confirm off 상태)
          showToast('회원가입이 완료되었어요.');
          onAuthSuccess?.();
        }
      }
    } catch {
      // store.authError에 메시지 저장됨 — 아래 표시
    }
  };

  // Supabase 미설정 — 이론상 호출되지 않지만 방어
  if (!isSupabaseReady) {
    return (
      <div className="relative min-h-screen flex items-center justify-center px-6 bg-[#F5F6F8]">
        <CloseButton onClick={onCancel} />
        <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
          <h2 className="text-lg font-bold text-gray-900 mb-2">서버 연결 준비 중</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Supabase 환경변수가 설정되지 않았어요.
            <br />
            .env.local에 VITE_SUPABASE_URL과
            <br />
            VITE_SUPABASE_ANON_KEY를 설정해주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 bg-[#F5F6F8]">
      <CloseButton onClick={onCancel} />

      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {mode === 'signIn' ? '로그인' : '회원가입'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Academy Manager 서버 계정으로 접속해요.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              이메일
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
              placeholder="you@example.com"
              disabled={isAuthLoading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              비밀번호
            </label>
            <input
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
              placeholder="6자 이상"
              disabled={isAuthLoading}
            />
          </div>

          {(authError || localMessage) && (
            <div
              className={`text-xs rounded-xl px-3 py-2.5 ${
                authError || localMessage?.type === 'error'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-green-50 text-green-700'
              }`}
            >
              {authError || localMessage?.text}
            </div>
          )}

          <button
            type="submit"
            disabled={isAuthLoading}
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60"
          >
            {isAuthLoading
              ? '처리 중...'
              : mode === 'signIn'
              ? '로그인'
              : '회원가입'}
          </button>

          <div className="text-center text-xs text-gray-500">
            {mode === 'signIn' ? (
              <>
                계정이 없으면{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signUp');
                    setLocalMessage(null);
                    clearAuthError();
                  }}
                  className="text-blue-600 font-semibold"
                >
                  회원가입
                </button>
              </>
            ) : (
              <>
                이미 계정이 있으면{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signIn');
                    setLocalMessage(null);
                    clearAuthError();
                  }}
                  className="text-blue-600 font-semibold"
                >
                  로그인
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function CloseButton({ onClick }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="닫기"
      className="absolute top-4 left-4 w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition-transform"
    >
      <X size={18} className="text-gray-600" />
    </button>
  );
}
