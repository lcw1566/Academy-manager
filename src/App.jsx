import { useEffect, useRef, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import useAcademyStore from './store/useAcademyStore';
import useAuthStore from './store/useAuthStore';
import useWorkspaceStore from './store/useWorkspaceStore';
import useChatStore from './store/useChatStore';
import RoleSelectPage from './features/auth/RoleSelectPage';
import AuthPage from './features/auth/AuthPage';
import LandingPage from './features/landing/LandingPage';
import StaffWaitingPage from './features/auth/StaffWaitingPage';
import WorkspaceSelectionPage, { wasWorkspacePicked, clearWorkspacePicked } from './features/auth/WorkspaceSelectionPage';
import AppLayout from './components/AppLayout';
import AcademyAppLayout from './features/academy/AcademyAppLayout';
import PublicCheckinPage from './features/academy/attendance/PublicCheckinPage';
import QrDisplayPage from './features/academy/attendance/QrDisplayPage';
import Toast from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { fetchAcademySnapshot } from './services/supabase/hydrateApi';
import { runMonthEndScheduleGeneration } from './services/monthlyScheduleAutomation';
import { membershipRoleToAppRole } from './utils/format';
import { tossSpring } from './utils/motion';
import { retryAsync } from './utils/asyncRetry';
import { initializePushNotifications, showForegroundChatNotification } from './services/pushNotifications';
import { getTodayYMD } from './utils/date';

const ACADEMY_ROLES = ['owner', 'teacher', 'assistant', 'manager'];

function isPublicCheckinRequest() {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    const pathname = url.pathname.replace(/\/+$/, '');
    return url.searchParams.has('checkin') || pathname.endsWith('/checkin');
  } catch {
    return false;
  }
}

function isQrDisplayRequest() {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(window.location.href).searchParams.get('qrDisplay') === '1';
  } catch {
    return false;
  }
}

function closeQrDisplayPage() {
  if (typeof window === 'undefined') return;
  if (window.opener) {
    window.close();
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('qrDisplay');
  window.location.replace(`${url.pathname}${url.search}${url.hash}`);
}

// 사용자·학원·역할 범위별로 한 번만 hydrate한다. 학원 ID만 사용하면 같은
// 브라우저에서 계정을 바꾸거나 역할이 낮아졌을 때 이전 완료 표시를 재사용한다.
function autoHydratedKey(academyId, userId, role) {
  return `auto-hydrated-${userId}-${academyId}-${role}`;
}

function wasAutoHydratedThisSession(academyId, userId, role) {
  if (!academyId || !userId || !role || typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(autoHydratedKey(academyId, userId, role)) === '1';
  } catch {
    return false;
  }
}

function markAutoHydratedThisSession(academyId, userId, role) {
  if (!academyId || !userId || !role || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(autoHydratedKey(academyId, userId, role), '1');
  } catch {
    /* ignore */
  }
}

export default function App() {
  const isPublicCheckin = isPublicCheckinRequest();
  const isQrDisplay = isQrDisplayRequest();
  const role = useAcademyStore((s) => s.role);
  const setRole = useAcademyStore((s) => s.setRole);
  const toast = useAcademyStore((s) => s.toast);
  const hydrateAcademyFromServerSnapshot = useAcademyStore((s) => s.hydrateAcademyFromServerSnapshot);
  const showToast = useAcademyStore((s) => s.showToast);

  const initializeAuth = useAuthStore((s) => s.initializeAuth);
  const isAuthPanelOpen = useAuthStore((s) => s.isAuthPanelOpen);
  const closeAuthPanel = useAuthStore((s) => s.closeAuthPanel);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthInitialized = useAuthStore((s) => s.isInitialized);
  const isSupabaseReady = useAuthStore((s) => s.isSupabaseReady);
  const isPasswordRecovery = useAuthStore((s) => s.isPasswordRecovery);

  const initializeWorkspace = useWorkspaceStore((s) => s.initializeWorkspace);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const profile = useWorkspaceStore((s) => s.profile);
  const authUserId = useAuthStore((s) => s.user?.id);
  const ensureAcademyDataOwner = useAcademyStore((s) => s.ensureAcademyDataOwner);
  const ensureAcademyDataScope = useAcademyStore((s) => s.ensureAcademyDataScope);
  const clearAcademyDataCache = useAcademyStore((s) => s.clearAcademyDataCache);
  const memberships = useWorkspaceStore((s) => s.memberships);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const isWorkspaceReady = useWorkspaceStore((s) => s.isWorkspaceReady);
  const isWorkspaceLoading = useWorkspaceStore((s) => s.isWorkspaceLoading);
  const workspaceError = useWorkspaceStore((s) => s.workspaceError);
  const workspacePicked = useWorkspaceStore((s) => s.workspacePicked);
  const startWorkspaceRealtime = useWorkspaceStore((s) => s.startWorkspaceRealtime);
  const stopWorkspaceRealtime = useWorkspaceStore((s) => s.stopWorkspaceRealtime);
  const refreshWorkspaceCollaborationState = useWorkspaceStore(
    (s) => s.refreshWorkspaceCollaborationState,
  );
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const loadServerStaffShifts = useWorkspaceStore((s) => s.loadServerStaffShifts);
  const [authEntryMode, setAuthEntryMode] = useState(null);
  const wasAuthenticatedRef = useRef(false);

  // 채팅 (학원 직원 전용) — 로그인 + 학원 선택 시 로드/실시간 구독.
  const loadChat = useChatStore((s) => s.loadChat);
  const startChatRealtime = useChatStore((s) => s.startChatRealtime);
  const stopChatRealtime = useChatStore((s) => s.stopChatRealtime);
  const clearChat = useChatStore((s) => s.clearChat);
  const chatMessages = useChatStore((s) => s.messages);
  const chatThreads = useChatStore((s) => s.threads);
  const chatMembers = useChatStore((s) => s.members);
  const chatLoadedAt = useChatStore((s) => s.loadedAt);
  const activeChatThreadId = useChatStore((s) => s.activeThreadId);
  const openThreadFromNotification = useChatStore((s) => s.openThreadFromNotification);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const activeTab = useAcademyStore((s) => s.activeTab);
  const seenChatMessageIdsRef = useRef(new Set());
  const chatNotificationReadyRef = useRef(false);

  const openChatNotification = (threadId) => {
    if (!threadId) return;
    openThreadFromNotification(threadId);
    setActiveTab('chat');
  };

  useEffect(() => {
    if (!isAuthenticated || isQrDisplay) return undefined;
    initializePushNotifications((data) => openChatNotification(data?.threadId || data?.thread_id))
      .catch((err) => console.warn('[push] initialization failed', err?.message || err));
    return undefined;
  }, [isAuthenticated, isQrDisplay]);

  useEffect(() => {
    if (!isAuthenticated || isQrDisplay || typeof window === 'undefined') return undefined;
    const openFromPayload = (threadId) => openChatNotification(threadId);
    const url = new URL(window.location.href);
    const initialThreadId = url.searchParams.get('chatThread');
    if (initialThreadId) {
      openFromPayload(initialThreadId);
      url.searchParams.delete('chatThread');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
    const handleServiceWorkerMessage = (event) => {
      if (event.data?.type === 'OPEN_CHAT_THREAD') openFromPayload(event.data.threadId);
    };
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
  }, [isAuthenticated, isQrDisplay]);

  // 웹이 열려 있을 때 들어오는 새 메시지는 OS 알림으로 표시한다. 초기 채팅
  // hydrate 결과는 기준선으로만 저장해 과거 메시지가 한꺼번에 울리지 않게 한다.
  useEffect(() => {
    if (isQrDisplay) return;
    if (!chatLoadedAt) {
      chatNotificationReadyRef.current = false;
      seenChatMessageIdsRef.current = new Set();
      return;
    }
    if (!chatNotificationReadyRef.current) {
      seenChatMessageIdsRef.current = new Set(chatMessages.map((message) => message.id));
      chatNotificationReadyRef.current = true;
      return;
    }

    for (const message of chatMessages) {
      if (seenChatMessageIdsRef.current.has(message.id)) continue;
      seenChatMessageIdsRef.current.add(message.id);
      if (message.sender_id === authUserId) continue;
      if (activeTab === 'chat' && activeChatThreadId === message.thread_id) continue;

      const thread = chatThreads.find((item) => item.id === message.thread_id);
      const sender = chatMembers.find((member) => member.user_id === message.sender_id);
      const title = thread?.kind === 'group'
        ? (thread.title || (thread.group_scope === 'custom' ? '단톡방' : '학원 전체'))
        : (sender?.display_name || sender?.email || '새 채팅');
      showForegroundChatNotification({
        title,
        body: message.body,
        threadId: message.thread_id,
        onClick: () => openChatNotification(message.thread_id),
      });
    }
  }, [
    chatLoadedAt,
    chatMessages,
    chatThreads,
    chatMembers,
    authUserId,
    activeTab,
    activeChatThreadId,
    isQrDisplay,
  ]);

  // server count loaders 완료 여부 — auto-hydrate 진입 가드.
  const serverStudentsLoadedAt = useWorkspaceStore((s) => s.serverStudentsLoadedAt);
  const serverClassGroupsLoadedAt = useWorkspaceStore((s) => s.serverClassGroupsLoadedAt);
  const serverClassSessionsLoadedAt = useWorkspaceStore((s) => s.serverClassSessionsLoadedAt);
  const isServerStudentsLoading = useWorkspaceStore((s) => s.isServerStudentsLoading);
  const isServerClassGroupsLoading = useWorkspaceStore((s) => s.isServerClassGroupsLoading);
  const isServerClassSessionsLoading = useWorkspaceStore((s) => s.isServerClassSessionsLoading);

  useEffect(() => {
    if (isPublicCheckin) return;
    initializeAuth();
  }, [isPublicCheckin, initializeAuth]);

  useEffect(() => {
    if (isPublicCheckin || !isAuthInitialized) return;
    if (wasAuthenticatedRef.current && !isAuthenticated) {
      setAuthEntryMode('signIn');
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isPublicCheckin, isAuthInitialized, isAuthenticated]);

  useEffect(() => {
    if (isPublicCheckin) return;
    if (!isAuthInitialized) return;
    if (isAuthenticated) {
      // Phase 29: 인증된 사용자가 academy-store 의 마지막 소유자와 다르면
      // 학원 로컬 데이터를 리셋. 같은 브라우저에서 다른 계정이 로그인한 경우
      // 이전 사용자의 강사/학생 등이 leak 되는 것을 막는다.
      // (private/tutor 데이터는 건드리지 않는다.)
      if (authUserId) ensureAcademyDataOwner(authUserId);
      initializeWorkspace();
    } else {
      clearAcademyDataCache();
      clearWorkspace();
      clearChat();
      // Phase 27: 로그아웃 시 자동 역할 ref 초기화. 다음 사용자의 권장 역할이
      // 이전 사용자 값과 같아 잘못 skip 되는 것을 방지.
      autoAppliedRoleRef.current = null;
      // Phase 28: 학원 선택 sessionStorage 도 비워서 다음 사용자가 다시 선택할 수 있게.
      clearWorkspacePicked();
    }
  }, [
    isPublicCheckin, isAuthInitialized, isAuthenticated, authUserId, ensureAcademyDataOwner,
    clearAcademyDataCache, initializeWorkspace, clearWorkspace, clearChat,
  ]);

  useEffect(() => {
    if (isPublicCheckin || !isAuthenticated) return;
    if (!authUserId || !currentAcademyId || !ACADEMY_ROLES.includes(role)) return;
    ensureAcademyDataScope(authUserId, currentAcademyId, role);
  }, [
    isPublicCheckin, isAuthenticated, authUserId, currentAcademyId, role,
    ensureAcademyDataScope,
  ]);

  useEffect(() => {
    if (isPublicCheckin || isQrDisplay) return undefined;
    if (!isAuthenticated || !isWorkspaceReady) return undefined;

    startWorkspaceRealtime();
    refreshWorkspaceCollaborationState({ reason: 'workspace-ready' });

    const refresh = () => {
      refreshWorkspaceCollaborationState({ reason: 'focus' });
    };
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refresh();
      }
    };
    const handleOnline = () => {
      // 모바일 절전·Wi-Fi 전환 뒤 기존 채널이 CLOSED 상태로 남는 경우가 있어
      // 온라인 복귀 시 채널과 서버 원본 조회를 함께 복구한다.
      startWorkspaceRealtime();
      refresh();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', refresh);
      window.addEventListener('online', handleOnline);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', refresh);
        window.removeEventListener('online', handleOnline);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      stopWorkspaceRealtime();
    };
  }, [
    isAuthenticated,
    isWorkspaceReady,
    authUserId,
    currentAcademyId,
    isPublicCheckin,
    isQrDisplay,
    startWorkspaceRealtime,
    stopWorkspaceRealtime,
    refreshWorkspaceCollaborationState,
  ]);

  // ─── 앱 내 채팅 로드 + 실시간 ──────────────────────────────
  // 학원 멤버십이 있는 사용자(owner/teacher/assistant)만. 과외(tutor) 단독
  // 사용자는 currentAcademyId 멤버십이 없어 자연히 제외된다.
  const hasAcademyMembership = useMemo(
    () => !!currentAcademyId && memberships.some(
      (m) => m.academy_id === currentAcademyId && m.status === 'active',
    ),
    [currentAcademyId, memberships],
  );
  useEffect(() => {
    if (isPublicCheckin || isQrDisplay) return undefined;
    if (!isAuthenticated || !isWorkspaceReady || !hasAcademyMembership) return undefined;
    loadChat(currentAcademyId);
    startChatRealtime(currentAcademyId);
    const refreshChat = () => {
      void useChatStore.getState().reloadThreadsAndMessages();
    };
    const handleChatOnline = () => {
      startChatRealtime(currentAcademyId);
      refreshChat();
    };
    const handleChatVisibility = () => {
      if (document.visibilityState === 'visible') refreshChat();
    };
    window.addEventListener('focus', refreshChat);
    window.addEventListener('online', handleChatOnline);
    document.addEventListener('visibilitychange', handleChatVisibility);
    return () => {
      window.removeEventListener('focus', refreshChat);
      window.removeEventListener('online', handleChatOnline);
      document.removeEventListener('visibilitychange', handleChatVisibility);
      stopChatRealtime();
    };
  }, [
    isPublicCheckin,
    isQrDisplay,
    isAuthenticated,
    isWorkspaceReady,
    hasAcademyMembership,
    currentAcademyId,
    loadChat,
    startChatRealtime,
    stopChatRealtime,
  ]);

  // ─── Phase 25: 자동 역할 진입 ───────────────────────────────
  // 로그인 + workspace ready 이후 currentAcademyId 의 membership.role 을 보고
  // app role 을 자동 설정. 이미 일치하면 setRole 호출하지 않음 (루프 방지).
  //
  // 우선순위:
  //   1) currentAcademyId 의 membership → membership.role
  //   2) account_type === 'tutor' & 멤버십 없음 → 'tutor'
  //   3) account_type === 'owner' & 멤버십 없음 → 'owner' (학원 생성 안내)
  //   4) account_type === 'staff' & 멤버십 없음 → role 유지 (StaffWaitingPage 가 처리)
  //
  // 사용자가 명시적으로 모드를 바꿔도 다음 effect 트리거 시 다시 권장값으로
  // 되돌리지 않도록, "마지막에 우리가 권장해서 설정한 role" 을 기억하고
  // role 이 그 값과 다른 동안은 재설정하지 않는다 (Workspace UI 의 수동 전환 보호).
  const autoAppliedRoleRef = useRef(null);
  useEffect(() => {
    if (isPublicCheckin || isQrDisplay) return;
    if (!isAuthenticated) return;
    if (!isWorkspaceReady) return; // memberships 가 아직 로딩 중일 수 있음

    const currentMembership = memberships.find(
      (m) => m.academy_id === currentAcademyId && m.status === 'active',
    );
    let nextRole = null;
    if (currentMembership) {
      nextRole = membershipRoleToAppRole(currentMembership.role);
    } else if (profile?.account_type === 'tutor') {
      nextRole = 'tutor';
    } else if (profile?.account_type === 'owner') {
      nextRole = 'owner';
    }
    // staff 계정 + 멤버십 없음: nextRole 은 null. StaffWaitingPage 가 노출됨.

    if (!nextRole) return;
    if (nextRole === role) return;
    // 사용자가 자동 설정 이후 수동으로 역할을 바꾼 경우 — 같은 권장값으로 되돌리지 않음.
    if (autoAppliedRoleRef.current && autoAppliedRoleRef.current !== role) {
      // 단, currentAcademyId 가 바뀌어 새로운 권장값이 등장했다면 적용.
      if (nextRole === autoAppliedRoleRef.current) return;
    }
    setRole(nextRole);
    autoAppliedRoleRef.current = nextRole;
  }, [
    isPublicCheckin, isQrDisplay, isAuthenticated, isWorkspaceReady, memberships, currentAcademyId,
    profile?.account_type, role, setRole,
  ]);

  // ─── Phase 25: 자동 서버 hydrate ────────────────────────────
  // 조건:
  //   - 인증됨, currentAcademyId 있음
  //   - 핵심 server count 3개 (학생/반/회차) 로드 완료
  //   - 같은 세션에서 자동 hydrate 한 적 없음
  //
  // 사용자·학원·역할 단위 sessionStorage 키로 중복 실행을 차단한다.
  // 서버 snapshot 과 매칭되는 항목은 최신 값으로 교체하고, 아직 서버 저장에 실패한
  // local-only 항목은 보존한다. 조회 자체가 실패하면 세션 성공 표시도 남기지 않는다.
  const hydratingRef = useRef(null);
  const [hydratedScopeKey, setHydratedScopeKey] = useState(null);
  const monthEndGenerationRef = useRef(null);
  useEffect(() => {
    if (isPublicCheckin || isQrDisplay) return;
    if (!isAuthenticated) return;
    if (!isWorkspaceReady || !authUserId || !currentAcademyId) return;
    const currentMembership = memberships.find(
      (membership) => membership.academy_id === currentAcademyId
        && membership.status === 'active',
    );
    const membershipRole = currentMembership
      ? membershipRoleToAppRole(currentMembership.role)
      : null;
    if (!membershipRole || role !== membershipRole) return;
    const scopeKey = autoHydratedKey(currentAcademyId, authUserId, role);
    if (hydratingRef.current === scopeKey) return;
    if (wasAutoHydratedThisSession(currentAcademyId, authUserId, role)) return;

    // 핵심 카운터가 백그라운드 초기 로딩을 한 번이라도 마쳤는지
    const hasInitialServerLoad = !!(
      serverStudentsLoadedAt && serverClassGroupsLoadedAt && serverClassSessionsLoadedAt
    );
    if (!hasInitialServerLoad) return;
    if (isServerStudentsLoading || isServerClassGroupsLoading || isServerClassSessionsLoading) return;

    hydratingRef.current = scopeKey;
    (async () => {
      try {
        const snapshot = await retryAsync(
          () => fetchAcademySnapshot(currentAcademyId),
          {
            attempts: 3,
            delays: [500, 1200],
            onRetry: (error, attempt) => {
              console.warn(`[auto-hydrate] snapshot 재시도 ${attempt}`, error);
            },
          },
        );
        // fetch 도중 사용자가 다른 학원으로 전환했다면 이전 학원 snapshot을 적용하지 않는다.
        if (
          useWorkspaceStore.getState().currentAcademyId !== currentAcademyId
          || useAuthStore.getState().user?.id !== authUserId
          || useAcademyStore.getState().role !== role
        ) return;
        const counts = hydrateAcademyFromServerSnapshot(snapshot, {
          strategy: 'serverWins',
          // 로그인된 앱에서는 Supabase가 단일 원본이다. 원장도 서버에 없는 과거
          // local-only 행을 보존하지 않아 계정·기기별 유령 데이터가 남지 않게 한다.
          preserveLocalOnly: false,
        });
        const total =
          (counts?.students || 0) + (counts?.classGroups || 0) +
          (counts?.classSessions || 0) + (counts?.lessonRecords || 0) +
          (counts?.attendanceRecords || 0) + (counts?.clinicRecords || 0) +
          (counts?.payments || 0) + (counts?.payrolls || 0);
        if (total > 0) {
          showToast(`접속 완료!`);
        }
        markAutoHydratedThisSession(currentAcademyId, authUserId, role);
        setHydratedScopeKey(scopeKey);
      } catch (err) {
        console.error('[auto-hydrate] fetchAcademySnapshot failed', err);
        showToast('데이터 동기화에 실패했어요.', 'error');
      } finally {
        if (hydratingRef.current === scopeKey) {
          hydratingRef.current = null;
        }
      }
    })();
  }, [
    isPublicCheckin, isQrDisplay, isAuthenticated, isWorkspaceReady,
    authUserId, currentAcademyId, memberships, role,
    serverStudentsLoadedAt, serverClassGroupsLoadedAt, serverClassSessionsLoadedAt,
    isServerStudentsLoading, isServerClassGroupsLoading, isServerClassSessionsLoading,
    hydrateAcademyFromServerSnapshot, showToast,
  ]);

  useEffect(() => {
    if (isPublicCheckin || isQrDisplay) return;
    if (!isAuthenticated) return;
    if (!isWorkspaceReady) return;
    if (role !== 'owner') return;
    if (!currentAcademyId) return;
    const scopeKey = autoHydratedKey(currentAcademyId, authUserId, role);
    if (
      hydratedScopeKey !== scopeKey
      && !wasAutoHydratedThisSession(currentAcademyId, authUserId, role)
    ) return;
    if (hydratingRef.current === scopeKey) return;

    const runKey = `${currentAcademyId}:${getTodayYMD()}`;
    if (monthEndGenerationRef.current === runKey) return;
    monthEndGenerationRef.current = runKey;

    (async () => {
      try {
        const result = await runMonthEndScheduleGeneration({
          academyId: currentAcademyId,
          ownerUserId: authUserId,
        });
        if (result?.skipped) return;
        const total = result.staffShiftsCreated || 0;
        if (total > 0) {
          showToast(
            `${result.targetMonth} 근무 일정 ${result.staffShiftsCreated || 0}개가 준비됐어요.`,
          );
          await Promise.all([
            loadServerClassSessions?.(),
            loadServerStaffShifts?.(),
          ]);
        }
      } catch (err) {
        console.error('[month-end-schedule-generation] failed', err);
        showToast('다음 달 운영 일정 자동 생성에 실패했어요.', 'error');
      }
    })();
  }, [
    isAuthenticated,
    isPublicCheckin,
    isQrDisplay,
    isWorkspaceReady,
    role,
    currentAcademyId,
    authUserId,
    hydratedScopeKey,
    showToast,
    loadServerClassSessions,
    loadServerStaffShifts,
  ]);

  const renderLayout = () => {
    if (isPublicCheckin) return <PublicCheckinPage />;

    if (isPasswordRecovery) {
      return (
        <AuthPage
          initialMode="resetPassword"
          onAuthSuccess={() => setAuthEntryMode(null)}
        />
      );
    }

    // Phase 26 — 인증 우선. Supabase 가 설정돼 있을 때만 login-first 적용.
    // (env 미설정 환경에서는 인증이 불가하므로 RoleSelectPage / 기존 흐름으로 폴백)
    if (isSupabaseReady) {
      // auth 초기화 중에는 깜빡임 방지용 로딩 화면.
      if (!isAuthInitialized) {
        return <LoadingScreen label="로그인 정보 확인 중…" />;
      }
      // 미인증 → 랜딩 페이지. CTA에서 로그인/회원가입 화면을 연다.
      if (!isAuthenticated) {
        return (
          <LandingPage
            onSignIn={() => setAuthEntryMode('signIn')}
            onSignUp={() => setAuthEntryMode('signUp')}
          />
        );
      }
      // 인증됐지만 workspace 가 아직 준비 안 됨 — 권한 결정 전 화면 깜빡임 방지.
      if (!isWorkspaceReady) {
        return (
          <LoadingScreen
            label="학원 정보 확인 중…"
            error={!isWorkspaceLoading ? workspaceError : null}
            onRetry={initializeWorkspace}
          />
        );
      }
    }

    if (isQrDisplay) {
      return <QrDisplayPage onClose={closeQrDisplayPage} />;
    }

    // 직원은 active 멤버십이 생기기 전까지 전용 대기 화면에 머문다. 새 역할 없는
    // 초대를 수락하면 pending/invited 멤버십이 생기며, 원장/운영 매니저가 역할을
    // 배정하기 전에는 일반 학원 화면·채팅에 접근할 수 없다.
    const activeMemberships = memberships.filter((membership) => membership.status === 'active');
    const roleAssignmentMembership = memberships.find(
      (membership) => membership.status === 'invited' && membership.role === 'pending',
    );
    if (
      isAuthenticated &&
      isWorkspaceReady &&
      profile?.account_type === 'staff' &&
      activeMemberships.length === 0
    ) {
      return <StaffWaitingPage assignmentMembership={roleAssignmentMembership} />;
    }

    // Phase 32 — academy 모드 사용자(owner/teacher/assistant) 는 이번 세션에서
    // 학원을 한 번도 선택하지 않았다면 학원 선택 화면을 거친다 (membership 수와
    // 무관). 학원이 0개여도 안내/생성/초대 수락이 이 한 화면에서 모두 처리된다.
    // store 의 reactive 한 workspacePicked 를 subscribe 해서 mark 직후 즉시
    // re-render 가 일어나도록 한다.
    if (
      isAuthenticated &&
      isWorkspaceReady &&
      ACADEMY_ROLES.includes(role) &&
      !workspacePicked
    ) {
      return <WorkspaceSelectionPage />;
    }

    // 역할이 결정되지 않은 인증 사용자 (예: account_type 미설정) → RoleSelectPage 폴백.
    // 인증 전에는 위에서 AuthPage 로 분기되므로 이 코드에 도달하지 않는다.
    if (!role) return <RoleSelectPage />;
    if (ACADEMY_ROLES.includes(role)) return <AcademyAppLayout />;
    return <AppLayout />;
  };

  return (
    <MotionConfig reducedMotion="user" transition={tossSpring.soft}>
      <div className="min-h-screen bg-[#F2F4F6]">
        <ErrorBoundary>
          {renderLayout()}
        </ErrorBoundary>
        {/* Phase 26: 미인증 상태에서는 renderLayout 이 AuthPage 를 노출하므로
            isAuthPanelOpen 으로 모달을 띄울 필요가 없다. 인증된 사용자가
            "다른 계정으로 로그인" 등을 트리거하면 이 패널이 열린다. */}
        {!isPublicCheckin && !isPasswordRecovery && isAuthenticated && isAuthPanelOpen && (
          <div className="fixed inset-0 z-50 bg-[#F2F4F6] overflow-y-auto">
            <AuthPage onAuthSuccess={closeAuthPanel} onCancel={closeAuthPanel} />
          </div>
        )}
        {!isPublicCheckin && !isPasswordRecovery && !isAuthenticated && authEntryMode && (
          <div className="fixed inset-0 z-50 bg-[#F2F4F6] overflow-y-auto">
            <AuthPage
              key={authEntryMode}
              initialMode={authEntryMode}
              onAuthSuccess={() => setAuthEntryMode(null)}
              onCancel={() => setAuthEntryMode(null)}
            />
          </div>
        )}
        <AnimatePresence>
          {toast && <Toast key={toast.message} message={toast.message} type={toast.type} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function LoadingScreen({ label = '불러오는 중…', error = null, onRetry }) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    setIsSlow(false);
    const timer = setTimeout(() => setIsSlow(true), 5000);
    return () => clearTimeout(timer);
  }, [label, error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F2F4F6] text-gray-400">
      {error ? (
        <>
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm mb-4">
            <AlertCircle size={23} className="text-red-500" />
          </div>
          <p className="text-base font-bold text-gray-900">학원 정보를 불러오지 못했어요</p>
          <p className="mt-2 px-6 text-center text-sm text-gray-500">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"
            >
              <RotateCcw size={16} />
              다시 시도
            </button>
          )}
        </>
      ) : (
        <>
          <Loader2 size={22} className="animate-spin mb-3" />
          <p className="text-xs">{label}</p>
          {isSlow && (
            <p className="mt-2 text-[11px] text-gray-400">
              서버 응답이 평소보다 늦어요. 잠시만 기다려주세요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
