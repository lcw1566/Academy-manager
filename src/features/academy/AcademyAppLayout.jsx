import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Home, BookOpen, Users, MoreHorizontal, CreditCard, BarChart2, UserCog, MessageCircle, ClipboardList } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import useAuthStore from '../../store/useAuthStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import useChatStore, { totalUnread } from '../../store/useChatStore';
import { currentUserCan } from '../../utils/staffPermissions';
import AttendanceSettingsSheet from './attendance/AttendanceSettingsSheet';
import Sidebar from '../../components/Sidebar';

const loadOwnerDashboard = () => import('./dashboard/OwnerDashboard');
const loadTeacherDashboard = () => import('./dashboard/TeacherDashboard');
const loadAssistantDashboard = () => import('./dashboard/AssistantDashboard');
const loadClassGroupsPage = () => import('./classes/ClassGroupsPage');
const loadClassGroupDetailPage = () => import('./classes/ClassGroupDetailPage');
const loadClassSessionPage = () => import('./classes/ClassSessionPage');
const loadClinicPage = () => import('./clinic/ClinicPage');
const loadAcademyStudentsPage = () => import('./students/AcademyStudentsPage');
const loadAcademyStudentDetailPage = () => import('./students/AcademyStudentDetailPage');
const loadAcademyMorePage = () => import('./more/AcademyMorePage');
const loadSettlementPage = () => import('./settlement/SettlementPage');
const loadPayrollPage = () => import('./payroll/PayrollPage');
const loadStaffPage = () => import('./staff/StaffPage');
const loadChatPage = () => import('./chat/ChatPage');

const OwnerDashboard = lazy(loadOwnerDashboard);
const TeacherDashboard = lazy(loadTeacherDashboard);
const AssistantDashboard = lazy(loadAssistantDashboard);
const ClassGroupsPage = lazy(loadClassGroupsPage);
const ClassGroupDetailPage = lazy(loadClassGroupDetailPage);
const ClassSessionPage = lazy(loadClassSessionPage);
const ClinicPage = lazy(loadClinicPage);
const AcademyStudentsPage = lazy(loadAcademyStudentsPage);
const AcademyStudentDetailPage = lazy(loadAcademyStudentDetailPage);
const AcademyMorePage = lazy(loadAcademyMorePage);
const SettlementPage = lazy(loadSettlementPage);
const PayrollPage = lazy(loadPayrollPage);
const StaffPage = lazy(loadStaffPage);
const ChatPage = lazy(loadChatPage);

const COMMON_ACADEMY_TAB_LOADERS = [
  loadClassGroupsPage,
  loadAcademyStudentsPage,
  loadChatPage,
  loadAcademyMorePage,
];

// Phase 40 — 기존 "근무" 탭을 "직원" 으로 통합. 직원 리스트 + 근무 스케줄 +
// 계약/권한/배정까지 한 탭에서 처리한다. More 탭은 학원·계정 설정만 남긴다.
//
// Phase 44 (Pilot Hotfix) — 직원 탭은 owner 전용. teacher/assistant 는 본인
// 출퇴근만 Home 카드에서 처리하므로 별도 탭 불필요.
const TAB_CONFIG = {
  owner: [
    { id: 'home',       label: '홈',    Icon: Home },
    { id: 'classes',    label: '수업',  Icon: BookOpen },
    { id: 'students',   label: '학생',  Icon: Users },
    { id: 'clinic',     label: '클리닉', Icon: ClipboardList },
    { id: 'staff',      label: '직원',   Icon: UserCog },
    { id: 'settlement', label: '정산',  Icon: BarChart2 },
    { id: 'chat',       label: '채팅',  Icon: MessageCircle },
    { id: 'more',       label: '더보기', Icon: MoreHorizontal },
  ],
  teacher: [
    { id: 'home',     label: '홈',   Icon: Home },
    { id: 'classes',  label: '수업', Icon: BookOpen },
    { id: 'students', label: '학생', Icon: Users },
    { id: 'clinic',   label: '클리닉', Icon: ClipboardList },
    { id: 'payroll',  label: '급여', Icon: CreditCard },
    { id: 'chat',     label: '채팅', Icon: MessageCircle },
    { id: 'more',     label: '더보기', Icon: MoreHorizontal },
  ],
  // 보조강사는 강사와 동일한 탭 셸을 공유한다 (홈/수업/학생/급여/더보기).
  // 기능 차이만 둔다: 홈은 클리닉 기록 중심(AssistantDashboard), 클리닉 전용 탭은 제거.
  // 클리닉 기록 전체 목록(ClinicPage)은 탭에서 빠졌지만 홈의 "전체 클리닉 기록 보기"
  // 버튼으로 setActiveTab('clinic') 라우트가 그대로 살아 있다.
  assistant: [
    { id: 'home',     label: '홈',   Icon: Home },
    { id: 'classes',  label: '수업', Icon: BookOpen },
    { id: 'students', label: '학생', Icon: Users },
    { id: 'payroll',  label: '급여', Icon: CreditCard },
    { id: 'chat',     label: '채팅', Icon: MessageCircle },
    { id: 'more',     label: '더보기', Icon: MoreHorizontal },
  ],
};

// 네비게이션 탭에는 없지만 프로그램적으로 진입 가능한 유효 라우트.
// 보조강사 홈의 "전체 클리닉 기록 보기" → setActiveTab('clinic') 가 여기에 해당하며,
// 아래 보정 effect 가 이 라우트를 홈으로 되돌리지 않도록 예외 처리한다.
const HIDDEN_VALID_TABS = ['clinic'];

function FallbackScreen() {
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center">
      <div className="text-5xl mb-4">😅</div>
      <p className="text-base font-bold text-gray-800 mb-2">화면을 불러오지 못했어요</p>
      <p className="text-sm text-gray-500 mb-6">다른 탭을 선택하거나 홈으로 이동해보세요.</p>
      <button
        type="button"
        onClick={() => setActiveTab('home')}
        className="px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl text-sm"
      >
        홈으로 이동
      </button>
    </div>
  );
}

export default function AcademyAppLayout() {
  const role = useAcademyStore((s) => s.role);
  const activeTab = useAcademyStore((s) => s.activeTab);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const selectedClassGroupId = useAcademyStore((s) => s.selectedClassGroupId);
  const selectedClassSessionId = useAcademyStore((s) => s.selectedClassSessionId);
  const selectedAcademyStudentId = useAcademyStore((s) => s.selectedAcademyStudentId);
  const classGroups = useAcademyStore((s) => s.classGroups);
  const classSessions = useAcademyStore((s) => s.classSessions);
  const academyStudents = useAcademyStore((s) => s.academyStudents);
  const goBackFromClassGroup = useAcademyStore((s) => s.goBackFromClassGroup);
  const goBackFromClassSession = useAcademyStore((s) => s.goBackFromClassSession);
  const goBackFromAcademyStudent = useAcademyStore((s) => s.goBackFromAcademyStudent);

  useEffect(() => {
    const roleLoaders = role === 'owner'
      ? [loadClinicPage, loadStaffPage, loadSettlementPage]
      : role === 'teacher'
      ? [loadClinicPage, loadPayrollPage]
      : [loadPayrollPage];
    const preload = () => [...COMMON_ACADEMY_TAB_LOADERS, ...roleLoaders]
      .forEach((load) => load().catch(() => {}));
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preload, 1200);
    return () => window.clearTimeout(id);
  }, [role]);

  // Phase 41 — owner 가 출결 onboarding 을 마치지 않았으면 1회성 모달 노출.
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const isWorkspaceReady = useWorkspaceStore((s) => s.isWorkspaceReady);
  const currentAcademy = memberships.find((m) => m.academy_id === currentAcademyId)?.academy || null;
  const needsAttendanceOnboarding = role === 'owner'
    && isWorkspaceReady
    && !!currentAcademy
    && !currentAcademy.attendance_onboarded_at;
  // 사용자가 이번 세션에서 onboarding 모달을 명시적으로 닫은 경우 다시 띄우지 않음.
  // (서버 set 이 실패하더라도 무한 루프 회피.)
  const [attendanceOnboardingDismissed, setAttendanceOnboardingDismissed] = useState(false);

  // Phase 31 — 역할별 default 탭 후, staffPermissions 로 일부 탭 (payroll 등) 가린다.
  const authUserId = useAuthStore((s) => s.user?.id);
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((sp) => sp.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );
  const baseTabs = TAB_CONFIG[role] || TAB_CONFIG.owner;
  const tabs = useMemo(() => {
    return baseTabs.filter((tab) => {
      if (tab.id === 'payroll') {
        return currentUserCan({ role, staffProfile: myStaffProfile }, 'canViewPayroll');
      }
      if (tab.id === 'students') {
        return currentUserCan({ role, staffProfile: myStaffProfile }, 'canViewStudents');
      }
      if (tab.id === 'settlement') {
        // 정산 탭은 owner 기본만 노출 (TAB_CONFIG.owner 에만 포함). owner 의 정산에는
        // 수납 관리도 포함되므로 owner 한정 + 향후 staff 에게 부여 시 canViewPayments 사용.
        if (role === 'owner') return true;
        return currentUserCan({ role, staffProfile: myStaffProfile }, 'canViewPayments');
      }
      return true;
    });
  }, [baseTabs, role, myStaffProfile]);

  // 채팅 안 읽음 — 하단 탭/사이드바 배지.
  const chatMessages = useChatStore((s) => s.messages);
  const chatReads = useChatStore((s) => s.reads);
  const chatUnread = useMemo(
    () => totalUnread({ messages: chatMessages, reads: chatReads }, authUserId),
    [chatMessages, chatReads, authUserId],
  );

  // 역할이 바뀌어 현재 activeTab이 해당 역할 탭 목록에 없으면 첫 번째 탭으로 보정.
  // Phase 40 호환 — 이전에 저장된 'work' 는 새 'staff' 로 자동 마이그레이션.
  useEffect(() => {
    const validTabIds = tabs.map((t) => t.id);
    if (activeTab === 'work' && validTabIds.includes('staff')) {
      setActiveTab('staff');
      return;
    }
    if (!validTabIds.includes(activeTab) && !HIDDEN_VALID_TABS.includes(activeTab)) {
      setActiveTab(tabs[0]?.id || 'home');
    }
  }, [role, tabs, activeTab, setActiveTab]);

  useEffect(() => {
    if (
      selectedClassSessionId &&
      !classSessions.some((session) => session.id === selectedClassSessionId)
    ) {
      goBackFromClassSession();
    }
  }, [selectedClassSessionId, classSessions, goBackFromClassSession]);

  useEffect(() => {
    if (
      selectedClassGroupId &&
      !classGroups.some((group) => group.id === selectedClassGroupId)
    ) {
      goBackFromClassGroup();
    }
  }, [selectedClassGroupId, classGroups, goBackFromClassGroup]);

  useEffect(() => {
    if (
      selectedAcademyStudentId &&
      !academyStudents.some((student) => student.id === selectedAcademyStudentId)
    ) {
      goBackFromAcademyStudent();
    }
  }, [selectedAcademyStudentId, academyStudents, goBackFromAcademyStudent]);

  const pageKey = selectedClassSessionId
    ? `session-${selectedClassSessionId}`
    : selectedClassGroupId
    ? `group-${selectedClassGroupId}`
    : selectedAcademyStudentId
    ? `astudent-${selectedAcademyStudentId}`
    : activeTab;

  const renderDashboard = () => {
    if (role === 'owner')     return <OwnerDashboard />;
    if (role === 'teacher')   return <TeacherDashboard />;
    if (role === 'assistant') return <AssistantDashboard />;
    return <OwnerDashboard />;
  };

  const renderContent = () => {
    try {
      if (selectedClassSessionId) return <ClassSessionPage />;
      if (activeTab === 'home')       return renderDashboard();
      if (activeTab === 'classes')    return selectedClassGroupId ? <ClassGroupDetailPage /> : <ClassGroupsPage />;
      if (activeTab === 'students')   return selectedAcademyStudentId ? <AcademyStudentDetailPage /> : <AcademyStudentsPage />;
      if (activeTab === 'clinic')     return <ClinicPage />;
      if (activeTab === 'settlement') return <SettlementPage />;
      if (activeTab === 'payroll')    return <PayrollPage />;
      if (activeTab === 'staff')      return <StaffPage />;
      if (activeTab === 'chat')       return <ChatPage />;
      // Phase 40 호환 — 이전 버전 store 에 'work' 가 저장되어 있어도 staff 로 매핑.
      if (activeTab === 'work')       return <StaffPage />;
      if (activeTab === 'more')       return <AcademyMorePage />;

      // 탭이 유효하지 않을 경우 대시보드 렌더
      const validTabIds = tabs.map((t) => t.id);
      if (!validTabIds.includes(activeTab)) return renderDashboard();

      return renderDashboard();
    } catch (err) {
      console.error('[AcademyAppLayout] renderContent error:', err);
      return <FallbackScreen />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F6] md:flex">
      {/* PC 사이드바 — md 이상에서만 표시 */}
      <Sidebar tabs={tabs} badges={{ chat: chatUnread }} />

      <main className="flex-1 min-w-0">
        <div className="main-content max-w-md mx-auto md:mx-0 md:max-w-none md:px-8 md:py-6 pb-24 md:pb-8">
          <Suspense fallback={<div className="h-[60vh]" />}>
            <div key={pageKey}>
              {renderContent()}
            </div>
          </Suspense>
        </div>
      </main>

      {/* Phase 25 — 자동 hydrate 가 App.jsx 에서 처리되므로 HydratePromptModal 은
          기본 흐름에서 표시하지 않는다. 수동 새로고침은 더보기 → 학원 워크스페이스 패널의
          "서버 데이터 새로고침/불러오기" 버튼으로 진행. */}

      {/* Phase 41 — 출결 onboarding (owner 만, 1회) */}
      {needsAttendanceOnboarding && !attendanceOnboardingDismissed && (
        <AttendanceSettingsSheet
          kind="onboarding"
          onClose={() => setAttendanceOnboardingDismissed(true)}
        />
      )}

      {/* Bottom Nav — 모바일 전용 (md 이상에서는 좌측 사이드바가 대체).
          Phase 39 — 6개 탭이 들어가도록 아이콘/너비 살짝 축소. */}
      <nav className="md:hidden bottom-nav fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 shadow-[0_-1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto flex pt-2">
          {tabs.filter((t) => t.mobileBottomNav !== false).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            const badge = id === 'chat' ? chatUnread : 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={active ? 'page' : undefined}
                className="flex-1 min-w-0 flex flex-col items-center gap-0.5 pb-1 active:scale-[0.98] transition-transform"
              >
                <div className={`relative flex items-center justify-center w-9 h-7 rounded-2xl transition-colors ${active ? 'bg-blue-50' : ''}`}>
                  <Icon size={19} className={active ? 'text-blue-600' : 'text-gray-400'} strokeWidth={active ? 2.5 : 1.8} />
                  {badge > 0 && (
                    <span className="absolute -top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </div>
                <span className={`text-[9.5px] font-medium ${active ? 'text-blue-600' : 'text-gray-400'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
