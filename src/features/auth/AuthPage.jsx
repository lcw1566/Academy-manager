import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Building2, Users, GraduationCap, CheckCircle2, ShieldCheck, Sparkles, Eye, EyeOff,
  MailCheck, KeyRound,
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
  const [mode, setMode] = useState(initialMode); // signIn | signUp | forgotPassword | resetPassword
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState(null); // 'owner' | 'staff' | null
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [rememberLogin, setRememberLogin] = useState(true);
  const [localMessage, setLocalMessage] = useState(null);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const resendConfirmation = useAuthStore((s) => s.resendConfirmation);
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const finishPasswordRecovery = useAuthStore((s) => s.finishPasswordRecovery);
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

    if (mode === 'forgotPassword') {
      if (!email.trim()) {
        setLocalMessage({ type: 'error', text: '이메일을 입력해주세요.' });
        return;
      }
      try {
        await requestPasswordReset(email);
        setResetEmailSent(true);
        setLocalMessage({
          type: 'success',
          text: '재설정 링크를 보냈어요. 메일함과 스팸함을 확인해주세요.',
        });
      } catch {
        // store.authError가 안내 문구를 제공한다.
      }
      return;
    }

    if (mode === 'resetPassword') {
      if (password.length < 8) {
        setLocalMessage({ type: 'error', text: '새 비밀번호는 8자 이상 입력해주세요.' });
        return;
      }
      if (password !== confirmPassword) {
        setLocalMessage({ type: 'error', text: '새 비밀번호가 서로 일치하지 않아요.' });
        return;
      }
      try {
        await finishPasswordRecovery(password);
        showToast('새 비밀번호로 변경했어요.');
        onAuthSuccess?.();
      } catch {
        // store.authError가 안내 문구를 제공한다.
      }
      return;
    }

    if (!email.trim() || !password) {
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
    if (mode === 'signUp' && password.length < 8) {
      setLocalMessage({ type: 'error', text: '비밀번호는 8자 이상 입력해주세요.' });
      return;
    }
    if (mode === 'signUp' && password !== confirmPassword) {
      setLocalMessage({ type: 'error', text: '비밀번호가 서로 일치하지 않아요.' });
      return;
    }
    if (
      mode === 'signUp'
      && password.toLowerCase() === email.trim().toLowerCase()
    ) {
      setLocalMessage({ type: 'error', text: '이메일과 다른 비밀번호를 사용해주세요.' });
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
          setVerificationEmail(email.trim().toLowerCase());
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

  const handleResendConfirmation = async () => {
    if (!verificationEmail || isAuthLoading) return;
    setLocalMessage(null);
    clearAuthError();
    try {
      await resendConfirmation(verificationEmail);
      setLocalMessage({
        type: 'success',
        text: '인증 메일을 다시 보냈어요. 스팸함도 확인해주세요.',
      });
    } catch {
      // store.authError가 안내 문구를 제공한다.
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
    setShowPassword(false);
    setPassword('');
    setConfirmPassword('');
    setLocalMessage(null);
    setVerificationEmail('');
    setResetEmailSent(false);
    clearAuthError();
    if (next === 'signIn') {
      // 로그인 모드로 돌아오면 선택 상태 초기화 (재가입 시 다시 선택하도록)
      setAccountType(null);
    }
  };

  const submitDisabled =
    isAuthLoading
    || (mode === 'signUp' && (!accountType || !displayName.trim()))
    || (mode === 'forgotPassword' && resetEmailSent);

  const modeCopy = {
    signIn: {
      eyebrow: '다시 만나서 반가워요',
      title: '로그인',
      description: '학원 워크스페이스로 안전하게 이어집니다.',
    },
    signUp: {
      eyebrow: '씨닛을 시작해볼까요?',
      title: '회원가입',
      description: '원장 또는 직원 중 내 계정 유형을 선택해주세요.',
    },
    forgotPassword: {
      eyebrow: '금방 다시 시작할 수 있어요',
      title: '비밀번호 재설정',
      description: '가입한 이메일로 안전한 재설정 링크를 보내드려요.',
    },
    resetPassword: {
      eyebrow: '새 비밀번호를 정해주세요',
      title: '비밀번호 변경',
      description: '다른 기기에서도 기억하기 쉬운 고유한 비밀번호를 사용해주세요.',
    },
  }[mode] || {};

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white text-gray-950">
      <CloseButton onClick={onCancel} />

      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 md:h-16 md:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
              <GraduationCap size={18} />
            </span>
            <span className="text-base font-black">씨닛</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[100dvh] w-full max-w-6xl grid-cols-1 items-center gap-8 px-4 pb-8 pt-20 md:min-h-screen md:grid-cols-[0.9fr_1.1fr] md:gap-10 md:px-6 md:py-24">
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
          <div className="mb-5 md:mb-7">
            <p className="text-sm font-black text-blue-600">
              {modeCopy.eyebrow}
            </p>
            <h2 className="mt-1.5 text-[28px] font-black md:mt-2 md:text-3xl">{modeCopy.title}</h2>
            <p className="mt-2 text-sm font-semibold text-gray-500">
              {modeCopy.description}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-3.5 rounded-[24px] bg-[#F7F8FA] p-4 shadow-sm ring-1 ring-gray-100 md:space-y-4 md:rounded-[28px] md:p-7"
          >
            {mode === 'resetPassword' && (
              <div className="flex items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-blue-600">
                  <KeyRound size={18} />
                </span>
                <p className="text-xs font-bold leading-5 text-blue-700">
                  링크 확인이 완료됐어요. 이제 새 비밀번호만 저장하면 돼요.
                </p>
              </div>
            )}

            {mode === 'forgotPassword' && resetEmailSent && (
              <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-4">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-emerald-600">
                  <MailCheck size={19} />
                </span>
                <div>
                  <p className="text-sm font-black text-emerald-800">메일을 보냈어요</p>
                  <p className="mt-1 break-all text-xs font-semibold leading-5 text-emerald-700">
                    {email.trim().toLowerCase()}
                  </p>
                </div>
              </div>
            )}

            {mode === 'signUp' && (
              <div>
                <label className="mb-2 block text-xs font-bold text-gray-600">계정 유형</label>
                <div className="grid grid-cols-2 gap-2">
                  {ACCOUNT_TYPES.map(({ id, title, desc, Icon, iconBg, iconColor, borderActive }) => {
                    const active = accountType === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setAccountType(id)}
                        disabled={isAuthLoading}
                        className={`flex min-h-[92px] flex-col items-start gap-2 rounded-2xl border-2 bg-white p-3 text-left transition-colors sm:min-h-[104px] sm:flex-row sm:gap-3 sm:p-3.5 ${
                          active ? borderActive : 'border-transparent active:bg-gray-50'
                        }`}
                      >
                        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${iconBg}`}>
                          <Icon size={18} className={iconColor} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black text-gray-900">{title}</span>
                          <span className="mt-1 hidden text-xs leading-relaxed text-gray-500 sm:block">{desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {mode !== 'resetPassword' && (
              <AuthField label="이메일">
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-[52px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-base font-semibold outline-none transition-colors focus:border-blue-500 md:text-sm"
                  placeholder="you@example.com"
                  disabled={isAuthLoading || resetEmailSent}
                />
              </AuthField>
            )}

            {mode !== 'forgotPassword' && (
            <AuthField label={mode === 'resetPassword' ? '새 비밀번호' : '비밀번호'}>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-[52px] w-full rounded-2xl border border-gray-200 bg-white py-3.5 pl-4 pr-12 text-base font-semibold outline-none transition-colors focus:border-blue-500 md:text-sm"
                  placeholder={mode === 'signIn' ? '비밀번호 입력' : '8자 이상'}
                  disabled={isAuthLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-1 flex w-11 items-center justify-center rounded-xl text-[#8B95A1] transition-colors hover:text-[#4E5968] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </AuthField>
            )}

            {(mode === 'signUp' || mode === 'resetPassword') && (
              <AuthField label="비밀번호 확인">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className={`h-[52px] w-full rounded-2xl border bg-white py-3.5 pl-4 pr-20 text-base font-semibold outline-none transition-colors md:text-sm ${
                      confirmPassword && password !== confirmPassword
                        ? 'border-red-300 focus:border-red-400'
                        : confirmPassword && password === confirmPassword
                          ? 'border-emerald-300 focus:border-emerald-400'
                          : 'border-gray-200 focus:border-blue-500'
                    }`}
                    placeholder="한 번 더 입력"
                    disabled={isAuthLoading}
                  />
                  {confirmPassword && (
                    <span className={`absolute inset-y-0 right-4 flex items-center text-xs font-black ${
                      password === confirmPassword ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {password === confirmPassword ? '일치' : '불일치'}
                    </span>
                  )}
                </div>
              </AuthField>
            )}

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
              <div className="flex items-center justify-between gap-3">
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
                <button
                  type="button"
                  onClick={() => switchMode('forgotPassword')}
                  disabled={isAuthLoading}
                  className="rounded-xl px-2 py-1.5 text-xs font-black text-blue-600 active:bg-blue-50"
                >
                  비밀번호를 잊으셨나요?
                </button>
              </div>
            )}

            {(authError || localMessage) && (
              <div className={`rounded-2xl px-4 py-3 text-xs font-semibold leading-relaxed ${
                authError || localMessage?.type === 'error'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-emerald-50 text-emerald-700'
              }`}>
                <p>{authError || localMessage?.text}</p>
                {verificationEmail && !authError && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={isAuthLoading}
                    className="mt-2 font-black underline underline-offset-2 disabled:opacity-50"
                  >
                    인증 메일 다시 보내기
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitDisabled}
              className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-600/15 transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:opacity-50"
            >
              {isAuthLoading
                ? '처리 중...'
                : mode === 'signIn'
                  ? '로그인'
                  : mode === 'signUp'
                    ? '회원가입'
                    : mode === 'forgotPassword'
                      ? resetEmailSent ? '메일을 보냈어요' : '재설정 링크 받기'
                      : '새 비밀번호 저장'}
            </button>

            {mode !== 'resetPassword' && (
              <div className="text-center text-xs font-semibold text-gray-500">
                {mode === 'signIn'
                  ? '계정이 없으면 '
                  : mode === 'signUp'
                    ? '이미 계정이 있으면 '
                    : ''}
                <button
                  type="button"
                  onClick={() => switchMode(
                    mode === 'signIn' ? 'signUp' : 'signIn',
                  )}
                  className="font-black text-blue-600"
                >
                  {mode === 'signIn'
                    ? '회원가입'
                    : mode === 'signUp'
                      ? '로그인'
                      : '로그인으로 돌아가기'}
                </button>
              </div>
            )}
          </form>

          {(mode === 'signIn' || mode === 'signUp') && (
          <div className="mt-4 md:hidden">
            <AuthPromotionSlot compact />
          </div>
          )}
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
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 mx-auto flex max-w-6xl justify-end px-5 pt-4 md:px-6">
      <button
        type="button"
        onClick={onClick}
        aria-label="닫기"
        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200 transition-transform active:scale-95"
      >
        <X size={18} className="text-gray-700" />
      </button>
    </div>
  );
}
