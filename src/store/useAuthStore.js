import { create } from 'zustand';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  getCurrentSession,
  signUpWithEmail,
  signInWithEmail,
  resendSignUpConfirmation,
  requestPasswordResetEmail,
  completePasswordRecovery,
  updateCurrentUserPassword,
  signOut,
  subscribeAuthStateChange,
} from '../services/supabase/authApi';
import { disableCurrentPushDevice } from '../services/pushNotifications';
import { localizeError } from '../utils/localizeError';

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
  isPasswordRecovery: false,
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

      // 초기 세션 조회가 일시적으로 실패해도 이후 로그인·토큰 갱신 이벤트는
      // 계속 받을 수 있어야 한다.
      if (!authSubscription) {
        authSubscription = subscribeAuthStateChange((event, nextSession) => {
          set({
            session: nextSession,
            user: nextSession?.user ?? null,
            isAuthenticated: Boolean(nextSession?.user),
            isPasswordRecovery:
              event === 'PASSWORD_RECOVERY'
              || (get().isPasswordRecovery && Boolean(nextSession?.user)),
          });
        });
      }

      try {
        const session = await getCurrentSession();
        set({
          session,
          user: session?.user ?? null,
          isAuthenticated: Boolean(session?.user),
          isPasswordRecovery:
            Boolean(session?.user)
            && typeof window !== 'undefined'
            && new URL(window.location.href).searchParams.get('passwordRecovery') === '1',
        });
      } catch (err) {
        set({ authError: localizeError(err, '로그인 상태를 확인하지 못했어요.') });
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
      set({ authError: localizeError(err, '회원가입에 실패했어요.') });
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
      set({ authError: localizeError(err, '로그인에 실패했어요.') });
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
      set({ authError: localizeError(err, '인증 메일을 다시 보내지 못했어요.') });
      throw err;
    } finally {
      set({ isAuthLoading: false });
    }
  },

  requestPasswordReset: async (email) => {
    set({ isAuthLoading: true, authError: null });
    try {
      return await requestPasswordResetEmail(email);
    } catch (err) {
      set({ authError: localizeError(err, '비밀번호 재설정 메일을 보내지 못했어요.') });
      throw err;
    } finally {
      set({ isAuthLoading: false });
    }
  },

  finishPasswordRecovery: async (newPassword) => {
    set({ isAuthLoading: true, authError: null });
    try {
      const data = await completePasswordRecovery(newPassword);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('passwordRecovery');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
      set({ isPasswordRecovery: false });
      return data;
    } catch (err) {
      set({ authError: localizeError(err, '새 비밀번호를 저장하지 못했어요.') });
      throw err;
    } finally {
      set({ isAuthLoading: false });
    }
  },

  changePassword: async ({ currentPassword, newPassword } = {}) => {
    set({ isAuthLoading: true, authError: null });
    try {
      return await updateCurrentUserPassword({ currentPassword, newPassword });
    } catch (err) {
      const message = localizeError(err, '비밀번호를 변경하지 못했어요.');
      set({ authError: message });
      const localizedError = new Error(message);
      localizedError.cause = err;
      throw localizedError;
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
      isPasswordRecovery: false,
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
          authError: localizeError(err, '로그아웃에 실패했어요.'),
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
