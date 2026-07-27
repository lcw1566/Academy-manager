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
let signOutPromise = null;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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

  signOutUser: () => {
    if (signOutPromise) return signOutPromise;

    const previousAuth = {
      session: get().session,
      user: get().user,
      isAuthenticated: get().isAuthenticated,
    };

    // 사용자가 누른 즉시 랜딩 화면으로 전환한다. 원격 세션/푸시 정리는 아래에서
    // 계속 진행하고, 실제 로그아웃 실패 시에만 이전 인증 상태를 복구한다.
    set({
      session: null,
      user: null,
      isAuthenticated: false,
      isAuthLoading: true,
      authError: null,
    });

    const operation = (async () => {
      const pushCleanup = disableCurrentPushDevice().catch((pushError) => {
        console.warn('[push] device disable on sign-out failed', pushError?.message || pushError);
      });

      try {
        // 서버의 push_devices 비활성화 요청이 먼저 출발할 짧은 시간을 주되,
        // 느린 푸시 서버 때문에 세션 종료가 계속 밀리지는 않게 한다.
        await Promise.race([pushCleanup, wait(600)]);
        await signOut();
        void pushCleanup;
      } catch (err) {
        set({
          ...previousAuth,
          authError: err?.message ?? '로그아웃에 실패했습니다.',
        });
        throw err;
      } finally {
        set({ isAuthLoading: false });
      }
    })();

    signOutPromise = operation;
    const clearSignOutPromise = () => {
      if (signOutPromise === operation) signOutPromise = null;
    };
    void operation.then(clearSignOutPromise, clearSignOutPromise);
    return operation;
  },
}));

export default useAuthStore;
