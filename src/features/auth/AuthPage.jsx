import { useState } from 'react';
import { X, Building2, Users } from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useAcademyStore from '../../store/useAcademyStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import { updateMyProfileAccountType, updateMyProfileBasic } from '../../services/supabase/workspaceApi';
import { formatPhoneNumber } from '../../utils/format';

const ACCOUNT_TYPES = [
  {
    id: 'owner',
    title: '학원 원장',
    desc: '학원 워크스페이스를 만들고 강사와 학생을 함께 관리해요.',
    Icon: Building2,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    borderActive: 'border-emerald-500 bg-emerald-50',
  },
  {
    id: 'staff',
    title: '강사 / 보조강사',
    desc: '학원 초대를 수락하면 담당 수업과 클리닉을 관리할 수 있어요.',
    Icon: Users,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    borderActive: 'border-purple-500 bg-purple-50',
  },
];

const PENDING_ACCOUNT_TYPE_KEY = 'pending-account-type';
const PENDING_PROFILE_KEY = 'pending-profile-info';

// localStorage 를 사용해 이메일 인증 링크가 새 탭에서 열려도 값이 살아남도록 한다.
// (sessionStorage 는 탭 단위라 새 탭으로 redirect 되면 손실됨.)
function setPendingAccountType(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) localStorage.setItem(PENDING_ACCOUNT_TYPE_KEY, value);
    else localStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);
  } catch {
    /* ignore */
  }
}

// 회원가입 시 입력한 display_name / phone 을 같은 이유로 localStorage 에 저장.
// 이메일 인증 후 다른 탭에서 로그인해도 보존되도록.
function setPendingProfileInfo(info) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (info && (info.displayName || info.phone)) {
      localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(info));
    } else {
      localStorage.removeItem(PENDING_PROFILE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export default function AuthPage({ onAuthSuccess, onCancel, initialMode = 'signIn' }) {
  const [mode, setMode] = useState(initialMode); // 'signIn' | 'signUp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState(null); // 'owner' | 'staff' | null
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [rememberLogin, setRememberLogin] = useState(true);
  const [localMessage, setLocalMessage] = useState(null);

  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const isAuthLoading = useAuthStore((s) => s.isAuthLoading);
  const authError = useAuthStore((s) => s.authError);
  const isSupabaseReady = useAuthStore((s) => s.isSupabaseReady);
  const clearAuthError = useAuthStore((s) => s.clearAuthError);
  const showToast = useAcademyStore((s) => s.showToast);
  const syncProfile = useWorkspaceStore((s) => s.syncProfile);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalMessage(null);
    clearAuthError();

    if (!email || !password) {
      setLocalMessage({ type: 'error', text: '이메일과 비밀번호를 모두 입력해주세요.' });
      return;
    }

    if (mode === 'signUp' && !accountType) {
      setLocalMessage({ type: 'error', text: '계정 유형을 선택해주세요.' });
      return;
    }
    const trimmedName = (displayName || '').trim();
    if (mode === 'signUp' && !trimmedName) {
      setLocalMessage({ type: 'error', text: '이름을 입력해주세요.' });
      return;
    }
    const cleanedPhone = (phone || '').trim() || null;

    try {
      if (mode === 'signIn') {
        await signIn({ email, password, remember: rememberLogin });
        showToast('로그인되었어요.');
        onAuthSuccess?.();
      } else {
        // 회원가입 — 선택한 accountType + display_name + phone 을 localStorage 에
        // 미리 저장. 이메일 인증이 필요한 경우 syncProfile 이 다음 로그인에서 반영.
        setPendingAccountType(accountType);
        setPendingProfileInfo({ displayName: trimmedName, phone: cleanedPhone });
        const data = await signUp({
          email,
          password,
          metadata: {
            display_name: trimmedName,
            phone: cleanedPhone,
            account_type: accountType,
            default_role:
              accountType === 'staff'
                ? 'teacher'
                : accountType,
          },
        });
        if (!data?.session) {
          // 이메일 인증 필요 — 패널은 유지하고 안내 표시
          setLocalMessage({
            type: 'success',
            text: '인증 메일이 발송되었어요. 이메일 인증 후 로그인해주세요.',
          });
        } else {
          // 즉시 로그인됨 — profile 에 account_type + display_name + phone 반영
          try {
            await updateMyProfileAccountType({ accountType });
            await updateMyProfileBasic({ displayName: trimmedName, phone: cleanedPhone });
            setPendingAccountType(null);
            setPendingProfileInfo(null);
            // store 의 profile mirror 도 갱신
            await syncProfile();
          } catch (err) {
            // 프로필 저장 실패해도 회원가입 자체는 성공이므로 토스트만
            console.warn('[signUp] 프로필 저장 실패', err);
          }
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
      <div className="relative min-h-screen flex items-center justify-center px-6 bg-[#F2F4F6]">
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

  const switchMode = (next) => {
    setMode(next);
    setLocalMessage(null);
    clearAuthError();
    if (next === 'signIn') {
      // 로그인 모드로 돌아오면 선택 상태 초기화 (재가입 시 다시 선택하도록)
      setAccountType(null);
    }
  };

  const submitDisabled =
    isAuthLoading || (mode === 'signUp' && (!accountType || !displayName.trim()));

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-[#F2F4F6]">
      <CloseButton onClick={onCancel} />

      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {mode === 'signIn' ? '로그인' : '회원가입'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Seenit 서버 계정으로 접속해요.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4"
        >
          {/* 회원가입 모드에서만 계정 유형 선택 */}
          {mode === 'signUp' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">
                계정 유형
              </label>
              <div className="flex flex-col gap-2">
                {ACCOUNT_TYPES.map(({ id, title, desc, Icon, iconBg, iconColor, borderActive }) => {
                  const active = accountType === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setAccountType(id)}
                      disabled={isAuthLoading}
                      className={`w-full flex items-start gap-3 rounded-2xl p-3 text-left border-2 transition-colors ${
                        active
                          ? borderActive
                          : 'border-gray-200 bg-white active:bg-gray-50'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                        <Icon size={16} className={iconColor} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${active ? 'text-gray-900' : 'text-gray-800'}`}>
                          {title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          {desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

          {mode === 'signIn' && (
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={rememberLogin}
                onChange={(e) => setRememberLogin(e.target.checked)}
                disabled={isAuthLoading}
                className="h-4 w-4 rounded border-gray-300 accent-blue-600"
              />
              로그인 유지
            </label>
          )}

          {/* 회원가입 모드에서만 이름/연락처 입력 */}
          {mode === 'signUp' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  이름
                </label>
                <input
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                  placeholder="홍길동"
                  disabled={isAuthLoading}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  연락처 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                  placeholder="010-0000-0000"
                  disabled={isAuthLoading}
                />
              </div>
            </>
          )}

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
            disabled={submitDisabled}
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
                  onClick={() => switchMode('signUp')}
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
                  onClick={() => switchMode('signIn')}
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
