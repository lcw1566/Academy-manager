import { supabase, isSupabaseConfigured } from '../../lib/supabase';

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase가 설정되지 않았습니다. .env.local을 확인해주세요.');
  }
}

export async function getCurrentSession() {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.getSession();
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
  const options = metadata && Object.keys(metadata).length > 0
    ? { data: metadata }
    : undefined;
  const { data, error } = await supabase.auth.signUp({ email, password, options });
  if (error) throw error;
  return data;
}

export async function signInWithEmail({ email, password }) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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
