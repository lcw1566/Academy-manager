import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Building2, Users, GraduationCap, CheckCircle2, ShieldCheck, Sparkles,
} from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useAcademyStore from '../../store/useAcademyStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import { updateMyProfileAccountType, updateMyProfileBasic } from '../../services/supabase/workspaceApi';
import { formatPhoneNumber } from '../../utils/format';

const ACCOUNT_TYPES = [
  {
    id: 'owner',
    title: '원장',
    desc: '학원 워크스페이스를 만들고 강사와 학생을 함께 관리해요.',
    Icon: Building2,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    borderActive: 'border-emerald-500 bg-emerald-50',
  },
  {
    id: 'staff',
    title: '직원',
    desc: '학원에서 보낸 역할 초대를 수락하고 바로 함께 일해요.',
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
            // staff의 default_role은 기존 데이터 호환용이다. 실제 학원 역할은
            // 초대 수락 뒤 academy_members에서 원장/운영 매니저가 배정한다.
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
    <div className="relative min-h-screen overflow-hidden bg-white text-gray-950">
      <CloseButton onClick={onCancel} />

      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5 md:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
              <GraduationCap size={18} />
            </span>
            <span className="text-base font-black">씨닛</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 pb-12 pt-24 md:grid-cols-[0.9fr_1.1fr] md:px-6 md:py-24">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="hidden md:block"
        >
          <p className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-600">
            누구나 간편한 학원 관리
          </p>
          <h1 className="mt-5 text-5xl font-black leading-[1.12]">
            학원 운영을
            <br />
            한곳에서 간편하게
          </h1>
          <p className="mt-5 max-w-md text-base font-semibold leading-relaxed text-gray-600">
            학생, 수업, 출결, 수납과 직원 업무를 PC와 모바일에서 같은 기준으로 관리하세요.
          </p>
          <div className="mt-8 space-y-3">
            {[
              '원장과 직원이 같은 데이터를 공유해요.',
              '초대받은 역할로 바로 학원에 참여해요.',
              '학생과 직원의 출결 방식을 직접 선택해요.',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm font-bold text-gray-700">
                <CheckCircle2 size={18} className="text-blue-600" />
                {item}
              </div>
            ))}
          </div>
          <AuthPromotionSlot />
        </motion.section>

        <motion.section
          key={mode}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="mx-auto w-full max-w-lg"
        >
          <div className="mb-7">
            <p className="text-sm font-black text-blue-600">
              {mode === 'signIn' ? '다시 만나서 반가워요' : '씨닛을 시작해볼까요?'}
            </p>
            <h2 className="mt-2 text-3xl font-black">
              {mode === 'signIn' ? '로그인' : '회원가입'}
            </h2>
            <p className="mt-2 text-sm font-semibold text-gray-500">
              {mode === 'signIn'
                ? '학원 워크스페이스로 안전하게 이어집니다.'
                : '원장 또는 직원 중 내 계정 유형을 선택해주세요.'}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-[28px] bg-[#F7F8FA] p-5 shadow-sm ring-1 ring-gray-100 md:p-7"
          >
            {mode === 'signUp' && (
              <div>
                <label className="mb-2 block text-xs font-bold text-gray-600">계정 유형</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ACCOUNT_TYPES.map(({ id, title, desc, Icon, iconBg, iconColor, borderActive }) => {
                    const active = accountType === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setAccountType(id)}
                        disabled={isAuthLoading}
                        className={`flex min-h-[104px] items-start gap-3 rounded-2xl border-2 bg-white p-3.5 text-left transition-colors ${
                          active ? borderActive : 'border-transparent active:bg-gray-50'
                        }`}
                      >
                        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${iconBg}`}>
                          <Icon size={18} className={iconColor} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black text-gray-900">{title}</span>
                          <span className="mt-1 block text-xs leading-relaxed text-gray-500">{desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <AuthField label="이메일">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[52px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition-colors focus:border-blue-500"
                placeholder="you@example.com"
                disabled={isAuthLoading}
              />
            </AuthField>

            <AuthField label="비밀번호">
              <input
                type="password"
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition-colors focus:border-blue-500"
                placeholder="6자 이상"
                disabled={isAuthLoading}
              />
            </AuthField>

            {mode === 'signUp' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AuthField label="이름">
                  <input
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition-colors focus:border-blue-500"
                    placeholder="홍길동"
                    disabled={isAuthLoading}
                  />
                </AuthField>
                <AuthField label="연락처" optional>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition-colors focus:border-blue-500"
                    placeholder="010-0000-0000"
                    disabled={isAuthLoading}
                  />
                </AuthField>
              </div>
            )}

            {mode === 'signIn' && (
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
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

            {(authError || localMessage) && (
              <div className={`rounded-2xl px-4 py-3 text-xs font-semibold leading-relaxed ${
                authError || localMessage?.type === 'error'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-emerald-50 text-emerald-700'
              }`}>
                {authError || localMessage?.text}
              </div>
            )}

            <button
              type="submit"
              disabled={submitDisabled}
              className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-600/15 transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:opacity-50"
            >
              {isAuthLoading ? '처리 중...' : mode === 'signIn' ? '로그인' : '회원가입'}
            </button>

            <div className="text-center text-xs font-semibold text-gray-500">
              {mode === 'signIn' ? '계정이 없으면 ' : '이미 계정이 있으면 '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}
                className="font-black text-blue-600"
              >
                {mode === 'signIn' ? '회원가입' : '로그인'}
              </button>
            </div>
          </form>

          <div className="mt-5 md:hidden">
            <AuthPromotionSlot compact />
          </div>
        </motion.section>
      </main>
    </div>
  );
}

function AuthField({ label, optional = false, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-gray-600">
        {label}
        {optional && <span className="ml-1 font-medium text-gray-400">(선택)</span>}
      </span>
      {children}
    </label>
  );
}

function AuthPromotionSlot({ compact = false }) {
  return (
    <div
      data-ad-slot="auth-promotion"
      className={`${compact ? 'p-4' : 'mt-10 p-5'} rounded-3xl bg-blue-600 text-white shadow-lg shadow-blue-600/15`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <Sparkles size={19} />
        </span>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-black text-blue-100">씨닛 활용 팁</p>
            <ShieldCheck size={13} className="text-blue-100" />
          </div>
          <p className="mt-1 text-sm font-black">직원은 초대받은 역할로 바로 시작해요.</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-blue-100">
            씨닛의 새로운 기능과 학원 운영 팁을 이곳에서 빠르게 확인하세요.
          </p>
        </div>
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
    className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100 transition-transform active:scale-95"
    >
      <X size={18} className="text-gray-600" />
    </button>
  );
}
