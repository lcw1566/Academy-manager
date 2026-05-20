import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.warn(
    '[Supabase] 환경변수가 설정되지 않았습니다. 현재는 localStorage 모드로 동작합니다. ' +
      '.env.local에 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정해주세요.'
  );
}
