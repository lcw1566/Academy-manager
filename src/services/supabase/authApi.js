import { supabase, isSupabaseConfigured, setAuthRememberPreference } from '../../lib/supabase';

const AUTH_SESSION_TIMEOUT_MS = 8000;

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
  setAuthRememberPreference(true);
  const options = metadata && Object.keys(metadata).length > 0
    ? { data: metadata }
    : undefined;
  const { data, error } = await supabase.auth.signUp({ email, password, options });
  if (error) throw error;
  return data;
}

export async function signInWithEmail({ email, password, remember = true }) {
  assertSupabaseConfigured();
  setAuthRememberPreference(remember);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
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

export async function signOut() {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function subscribeAuthStateChange(callback) {
  if (!isSupabaseConfigured || !supabase) {
    return { unsubscribe: () => {} };
  }
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}
