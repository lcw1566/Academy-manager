import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const AUTH_REMEMBER_KEY = 'seenit-auth-remember';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function getStorage(storageType) {
  if (typeof window === 'undefined') return null;
  try {
    return window[storageType] ?? null;
  } catch {
    return null;
  }
}

function getStoredValue(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setStoredValue(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeStoredValue(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getAuthRememberPreference() {
  const local = getStorage('localStorage');
  const value = getStoredValue(local, AUTH_REMEMBER_KEY);
  return value !== '0';
}

export function setAuthRememberPreference(remember) {
  const local = getStorage('localStorage');
  setStoredValue(local, AUTH_REMEMBER_KEY, remember ? '1' : '0');
}

const authStorage = {
  getItem(key) {
    const session = getStorage('sessionStorage');
    const local = getStorage('localStorage');
    const sessionValue = getStoredValue(session, key);
    if (sessionValue !== null && sessionValue !== undefined) return sessionValue;
    if (!getAuthRememberPreference()) return null;
    return getStoredValue(local, key);
  },
  setItem(key, value) {
    const session = getStorage('sessionStorage');
    const local = getStorage('localStorage');
    if (getAuthRememberPreference()) {
      setStoredValue(local, key, value);
      removeStoredValue(session, key);
    } else {
      setStoredValue(session, key, value);
      removeStoredValue(local, key);
    }
  },
  removeItem(key) {
    removeStoredValue(getStorage('sessionStorage'), key);
    removeStoredValue(getStorage('localStorage'), key);
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: authStorage,
      },
    })
  : null;

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.warn(
    '[Supabase] 환경변수가 설정되지 않았습니다. 현재는 localStorage 모드로 동작합니다. ' +
      '.env.local에 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정해주세요.'
  );
}
