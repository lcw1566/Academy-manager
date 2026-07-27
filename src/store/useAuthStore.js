import { create } from 'zustand';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  getCurrentSession,
  signUpWithEmail,
  signInWithEmail,
  resendSignUpConfirmation,
  signOut,
  subscribeAuthStateChange,
} from '../services/supabase/authApi';
import { disableCurrentPushDevice } from '../services/pushNotifications';

let authSubscription = null;
let authInitializationPromise = null;

const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  isAuthLoading: false,
  authError: null,
  isSupabaseReady: isSupabaseConfigured,
  isInitialized: false,

  isAuthPanelOpen: false,
  openAuthPanel: () => set({ isAuthPanelOpen: true, authError: null }),
  closeAuthPanel: () => set({ isAuthPanelOpen: false }),

  clearAuthError: () => set({ authError: null }),

  initializeAuth: () => {
    if (get().isInitialized) return;
    if (authInitializationPromise) return authInitializationPromise;

    if (!isSupabaseConfigured) {
      set({ isInitialized: true, isSupabaseReady: false });
      return;
    }

    const initialization = (async () => {
      set({ isAuthLoading: true, authError: null });

      try {
        const session = await getCurrentSession();
        set({
          session,
          user: session?.user ?? null,
          isAuthenticated: Boolean(session?.user),
        });

        if (!authSubscription) {
          authSubscription = subscribeAuthStateChange((_event, nextSession) => {
            set({
              session: nextSession,
              user: nextSession?.user ?? null,
              isAuthenticated: Boolean(nextSession?.user),
            });
          });
        }
      } catch (err) {
        set({ authError: err?.message ?? 'Auth 초기화에 실패했습니다.' });
      } finally {
        set({ isAuthLoading: false, isInitialized: true });
      }
    })();

    authInitializationPromise = initialization;
    void initialization.finally(() => {
      if (authInitializationPromise === initialization) {
        authInitializationPromise = null;
      }
    });
    return initialization;
  },

  signUp: async ({ email, password, metadata } = {}) => {
    set({ isAuthLoading: true, authError: null });
    try {
      const data = await signUpWithEmail({ email, password, metadata });
      set({
        session: data.session ?? null,
        user: data.user ?? null,
        isAuthenticated: Boolean(data.session?.user),
      });
      return data;
    } catch (err) {
      set({ authError: err?.message ?? '회원가입에 실패했습니다.' });
      throw err;
    } finally {
      set({ isAuthLoading: false });
    }
  },

  signIn: async ({ email, password, remember = true }) => {
    set({ isAuthLoading: true, authError: null });
    try {
      const data = await signInWithEmail({ email, password, remember });
      set({
        session: data.session ?? null,
        user: data.user ?? null,
        isAuthenticated: Boolean(data.session?.user),
      });
      return data;
    } catch (err) {
      set({ authError: err?.message ?? '로그인에 실패했습니다.' });
      throw err;
    } finally {
      set({ isAuthLoading: false });
    }
  },

  resendConfirmation: async (email) => {
    set({ isAuthLoading: true, authError: null });
    try {
      return await resendSignUpConfirmation(email);
    } catch (err) {
      set({ authError: err?.message ?? '인증 메일 재발송에 실패했습니다.' });
      throw err;
    } finally {
      set({ isAuthLoading: false });
    }
  },

  signOutUser: async () => {
    set({ isAuthLoading: true, authError: null });
    try {
      try {
        await disableCurrentPushDevice();
      } catch (pushError) {
        console.warn('[push] device disable on sign-out failed', pushError?.message || pushError);
      }
      await signOut();
      set({ session: null, user: null, isAuthenticated: false });
    } catch (err) {
      set({ authError: err?.message ?? '로그아웃에 실패했습니다.' });
      throw err;
    } finally {
      set({ isAuthLoading: false });
    }
  },
}));

export default useAuthStore;
