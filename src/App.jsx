import { useEffect, useRef } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import useAcademyStore from './store/useAcademyStore';
import useAuthStore from './store/useAuthStore';
import useWorkspaceStore from './store/useWorkspaceStore';
import RoleSelectPage from './features/auth/RoleSelectPage';
import AuthPage from './features/auth/AuthPage';
import StaffWaitingPage from './features/auth/StaffWaitingPage';
import WorkspaceSelectionPage, { wasWorkspacePicked, clearWorkspacePicked } from './features/auth/WorkspaceSelectionPage';
import AppLayout from './components/AppLayout';
import AcademyAppLayout from './features/academy/AcademyAppLayout';
import Toast from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { fetchAcademySnapshot } from './services/supabase/hydrateApi';
import { membershipRoleToAppRole } from './utils/format';
import { tossSpring } from './utils/motion';

const ACADEMY_ROLES = ['owner', 'teacher', 'assistant'];

// Phase 25 — sessionStorage key per academy. Used to make sure auto-hydrate
// runs at most once per academy per browser session.
function autoHydratedKey(academyId) {
  return `auto-hydrated-${academyId}`;
}

function wasAutoHydratedThisSession(academyId) {
  if (!academyId || typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(autoHydratedKey(academyId)) === '1';
  } catch {
    return false;
  }
}

function markAutoHydratedThisSession(academyId) {
  if (!academyId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(autoHydratedKey(academyId), '1');
  } catch {
    /* ignore */
  }
}

export default function App() {
  const role = useAcademyStore((s) => s.role);
  const setRole = useAcademyStore((s) => s.setRole);
  const toast = useAcademyStore((s) => s.toast);
  const academyStudentsCount = useAcademyStore((s) => s.academyStudents.length);
  const classGroupsCount = useAcademyStore((s) => s.classGroups.length);
  const classSessionsCount = useAcademyStore((s) => s.classSessions.length);
  const hydrateAcademyFromServerSnapshot = useAcademyStore((s) => s.hydrateAcademyFromServerSnapshot);
  const showToast = useAcademyStore((s) => s.showToast);

  const initializeAuth = useAuthStore((s) => s.initializeAuth);
  const isAuthPanelOpen = useAuthStore((s) => s.isAuthPanelOpen);
  const closeAuthPanel = useAuthStore((s) => s.closeAuthPanel);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthInitialized = useAuthStore((s) => s.isInitialized);
  const isSupabaseReady = useAuthStore((s) => s.isSupabaseReady);

  const initializeWorkspace = useWorkspaceStore((s) => s.initializeWorkspace);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const profile = useWorkspaceStore((s) => s.profile);
  const authUserId = useAuthStore((s) => s.user?.id);
  const ensureAcademyDataOwner = useAcademyStore((s) => s.ensureAcademyDataOwner);
  const memberships = useWorkspaceStore((s) => s.memberships);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const isWorkspaceReady = useWorkspaceStore((s) => s.isWorkspaceReady);
  const myPendingInvitations = useWorkspaceStore((s) => s.myPendingInvitations) ?? [];
  const workspacePicked = useWorkspaceStore((s) => s.workspacePicked);

  // server count loaders 완료 여부 — auto-hydrate 진입 가드.
  const serverStudentsLoadedAt = useWorkspaceStore((s) => s.serverStudentsLoadedAt);
  const serverClassGroupsLoadedAt = useWorkspaceStore((s) => s.serverClassGroupsLoadedAt);
  const serverClassSessionsLoadedAt = useWorkspaceStore((s) => s.serverClassSessionsLoadedAt);
  const isServerStudentsLoading = useWorkspaceStore((s) => s.isServerStudentsLoading);
  const isServerClassGroupsLoading = useWorkspaceStore((s) => s.isServerClassGroupsLoading);
  const isServerClassSessionsLoading = useWorkspaceStore((s) => s.isServerClassSessionsLoading);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      // Phase 29: 인증된 사용자가 academy-store 의 마지막 소유자와 다르면
      // 학원 로컬 데이터를 리셋. 같은 브라우저에서 다른 계정이 로그인한 경우
      // 이전 사용자의 강사/학생 등이 leak 되는 것을 막는다.
      // (private/tutor 데이터는 건드리지 않는다.)
      if (authUserId) ensureAcademyDataOwner(authUserId);
      initializeWorkspace();
    } else {
      clearWorkspace();
      // Phase 27: 로그아웃 시 자동 역할 ref 초기화. 다음 사용자의 권장 역할이
      // 이전 사용자 값과 같아 잘못 skip 되는 것을 방지.
      autoAppliedRoleRef.current = null;
      // Phase 28: 학원 선택 sessionStorage 도 비워서 다음 사용자가 다시 선택할 수 있게.
      clearWorkspacePicked();
    }
  }, [isAuthenticated, authUserId, ensureAcademyDataOwner, initializeWorkspace, clearWorkspace]);

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
    if (!isAuthenticated) return;
    if (!isWorkspaceReady) return; // memberships 가 아직 로딩 중일 수 있음

    const currentMembership = memberships.find((m) => m.academy_id === currentAcademyId);
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
    isAuthenticated, isWorkspaceReady, memberships, currentAcademyId,
    profile?.account_type, role, setRole,
  ]);

  // ─── Phase 25: 자동 서버 hydrate ────────────────────────────
  // 조건:
  //   - 인증됨, currentAcademyId 있음
  //   - 핵심 server count 3개 (학생/반/회차) 로드 완료
  //   - local 학원 도메인 데이터 비어 있음
  //   - 같은 세션에서 자동 hydrate 한 적 없음
  //
  // 학원 단위 sessionStorage 키 ('auto-hydrated-<academyId>') 로 중복 실행 차단.
  // 실패해도 키를 표시해 같은 세션 내 반복 시도를 막는다 (앱은 로컬 데이터로 동작).
  const hydratingRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!currentAcademyId) return;
    if (hydratingRef.current) return;
    if (wasAutoHydratedThisSession(currentAcademyId)) return;

    // 핵심 카운터가 한 번이라도 로딩 끝났는지 (initializeWorkspace 의 Promise.all 완료)
    const hasInitialServerLoad = !!(
      serverStudentsLoadedAt && serverClassGroupsLoadedAt && serverClassSessionsLoadedAt
    );
    if (!hasInitialServerLoad) return;
    if (isServerStudentsLoading || isServerClassGroupsLoading || isServerClassSessionsLoading) return;

    const localEmpty =
      academyStudentsCount === 0 && classGroupsCount === 0 && classSessionsCount === 0;
    if (!localEmpty) {
      // 데이터 있음 → 사용자가 이미 사용 중. 수동 새로고침 버튼으로 갱신 가능.
      markAutoHydratedThisSession(currentAcademyId);
      return;
    }

    hydratingRef.current = true;
    (async () => {
      try {
        const snapshot = await fetchAcademySnapshot(currentAcademyId);
        const counts = hydrateAcademyFromServerSnapshot(snapshot, {
          strategy: 'serverWins',
          preserveLocalOnly: true,
        });
        const total =
          (counts?.students || 0) + (counts?.classGroups || 0) +
          (counts?.classSessions || 0) + (counts?.lessonRecords || 0) +
          (counts?.attendanceRecords || 0) + (counts?.clinicRecords || 0) +
          (counts?.payments || 0) + (counts?.payrolls || 0);
        if (total > 0) {
          showToast(`데이터를 동기화했어요. (${total}개)`);
        }
      } catch (err) {
        console.error('[auto-hydrate] fetchAcademySnapshot failed', err);
        showToast('데이터 동기화에 실패했어요.', 'error');
      } finally {
        markAutoHydratedThisSession(currentAcademyId);
        hydratingRef.current = false;
      }
    })();
  }, [
    isAuthenticated, currentAcademyId,
    serverStudentsLoadedAt, serverClassGroupsLoadedAt, serverClassSessionsLoadedAt,
    isServerStudentsLoading, isServerClassGroupsLoading, isServerClassSessionsLoading,
    academyStudentsCount, classGroupsCount, classSessionsCount,
    hydrateAcademyFromServerSnapshot, showToast,
  ]);

  const renderLayout = () => {
    // Phase 26 — 인증 우선. Supabase 가 설정돼 있을 때만 login-first 적용.
    // (env 미설정 환경에서는 인증이 불가하므로 RoleSelectPage / 기존 흐름으로 폴백)
    if (isSupabaseReady) {
      // auth 초기화 중에는 깜빡임 방지용 로딩 화면.
      if (!isAuthInitialized) return <LoadingScreen />;
      // 미인증 → 로그인 화면 (RoleSelectPage 대신).
      if (!isAuthenticated) return <AuthPage />;
      // 인증됐지만 workspace 가 아직 준비 안 됨 — 권한 결정 전 화면 깜빡임 방지.
      if (!isWorkspaceReady) return <LoadingScreen />;
    }

    // Phase 25 — staff 계정 + 멤버십 없음 + 받은 초대도 없음: 전용 대기 화면.
    // (받은 초대가 있으면 WorkspaceSelectionPage 가 처리하므로 분기 안 탐.)
    if (
      isAuthenticated &&
      isWorkspaceReady &&
      profile?.account_type === 'staff' &&
      memberships.length === 0 &&
      myPendingInvitations.length === 0 &&
      !ACADEMY_ROLES.includes(role)
    ) {
      return <StaffWaitingPage />;
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
        {isAuthenticated && isAuthPanelOpen && (
          <div className="fixed inset-0 z-50 bg-[#F2F4F6] overflow-y-auto">
            <AuthPage onAuthSuccess={closeAuthPanel} onCancel={closeAuthPanel} />
          </div>
        )}
        <AnimatePresence>
          {toast && <Toast key={toast.message} message={toast.message} type={toast.type} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F2F4F6] text-gray-400">
      <Loader2 size={22} className="animate-spin mb-3" />
      <p className="text-xs">불러오는 중…</p>
    </div>
  );
}
