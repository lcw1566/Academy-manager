import { supabase, isSupabaseConfigured, setAuthRememberPreference } from '../../lib/supabase';

const AUTH_SESSION_TIMEOUT_MS = 8000;
const AUTH_SIGN_IN_TIMEOUT_MS = 15000;

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase가 설정되지 않았습니다. .env.local을 확인해주세요.');
  }
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getCurrentSession() {
  assertSupabaseConfigured();
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    AUTH_SESSION_TIMEOUT_MS,
    '로그인 상태 확인 시간이 초과됐어요. 다시 시도해주세요.',
  );
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function signUpWithEmail({ email, password, metadata } = {}) {
  assertSupabaseConfigured();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('이메일을 입력해주세요.');
  setAuthRememberPreference(true);
  const options = metadata && Object.keys(metadata).length > 0
    ? { data: metadata }
    : undefined;
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options,
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail({ email, password, remember = true }) {
  assertSupabaseConfigured();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('이메일을 입력해주세요.');
  if (!password) throw new Error('비밀번호를 입력해주세요.');
  setAuthRememberPreference(remember);
  const { data, error } = await withTimeout(
    supabase.auth.signInWithPassword({ email: normalizedEmail, password }),
    AUTH_SIGN_IN_TIMEOUT_MS,
    '로그인 요청 시간이 초과됐어요. 네트워크를 확인하고 다시 시도해주세요.',
  );
  if (error) throw error;
  if (!data?.session?.user) {
    throw new Error('로그인 정보를 받지 못했어요. 다시 시도해주세요.');
  }
  return data;
}

export async function resendSignUpConfirmation(email) {
  assertSupabaseConfigured();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('이메일을 입력해주세요.');
  const { data, error } = await supabase.auth.resend({
    type: 'signup',
    email: normalizedEmail,
  });
  if (error) throw error;
  return data;
}

export async function requestPasswordResetEmail(email) {
  assertSupabaseConfigured();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('이메일을 입력해주세요.');
  const redirectUrl = typeof window !== 'undefined'
    ? new URL(window.location.href)
    : null;
  if (redirectUrl) {
    redirectUrl.search = '';
    redirectUrl.hash = '';
    redirectUrl.searchParams.set('passwordRecovery', '1');
  }
  const { data, error } = await supabase.auth.resetPasswordForEmail(
    normalizedEmail,
    redirectUrl ? { redirectTo: redirectUrl.toString() } : undefined,
  );
  if (error) throw error;
  return data;
}

export async function completePasswordRecovery(newPassword) {
  assertSupabaseConfigured();
  const next = String(newPassword || '');
  if (next.length < 8) throw new Error('새 비밀번호는 8자 이상 입력해주세요.');
  const { data, error } = await supabase.auth.updateUser({ password: next });
  if (error) throw error;
  return data;
}

export async function updateCurrentUserPassword({ currentPassword, newPassword } = {}) {
  assertSupabaseConfigured();
  const current = String(currentPassword || '');
  const next = String(newPassword || '');
  if (!current) throw new Error('현재 비밀번호를 입력해주세요.');
  if (next.length < 8) throw new Error('새 비밀번호는 8자 이상 입력해주세요.');
  if (current === next) throw new Error('새 비밀번호는 현재 비밀번호와 다르게 입력해주세요.');

  const { data, error } = await supabase.auth.updateUser({
    password: next,
    current_password: current,
  });
  if (error) throw error;
  return data;
}

async function readFunctionError(error, fallback) {
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        return payload.error.trim();
      }
    } catch {
      // JSON 응답이 아니면 아래 상태별 기본 문구를 사용한다.
    }
  }
  if (response?.status === 401) return '로그인 정보가 만료됐어요. 다시 로그인해주세요.';
  if (response?.status === 409) return '원장 계정은 학원 소유권을 정리한 뒤 탈퇴할 수 있어요.';
  return fallback;
}

export async function withdrawCurrentAccount() {
  assertSupabaseConfigured();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('로그인이 필요해요.');

  const { data, error } = await supabase.functions.invoke('withdraw-account', {
    body: {},
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) {
    throw new Error(await readFunctionError(
      error,
      '탈퇴 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
    ));
  }
  if (!data?.withdrawn) throw new Error('탈퇴 처리 결과를 확인하지 못했어요.');
  return data;
}

export async function signOut() {
  assertSupabaseConfigured();
  // 일반 로그아웃은 현재 기기의 세션만 종료한다. 기본 global scope는 사용자의
  // 다른 PC/휴대폰 세션까지 폐기하는 원격 요청이라 불필요하게 무겁다.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export function subscribeAuthStateChange(callback) {
  if (!isSupabaseConfigured || !supabase) {
    return { unsubscribe: () => {} };
  }
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}
