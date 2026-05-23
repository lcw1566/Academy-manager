import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, BookOpen, Users, MoreHorizontal, Stethoscope, CreditCard, BarChart2, CalendarClock } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import useAuthStore from '../../store/useAuthStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import { currentUserCan } from '../../utils/staffPermissions';
import OwnerDashboard from './dashboard/OwnerDashboard';
import TeacherDashboard from './dashboard/TeacherDashboard';
import AssistantDashboard from './dashboard/AssistantDashboard';
import ClassGroupsPage from './classes/ClassGroupsPage';
import ClassGroupDetailPage from './classes/ClassGroupDetailPage';
import ClassSessionPage from './classes/ClassSessionPage';
import ClinicPage from './clinic/ClinicPage';
import AcademyStudentsPage from './students/AcademyStudentsPage';
import AcademyStudentDetailPage from './students/AcademyStudentDetailPage';
import AcademyMorePage from './more/AcademyMorePage';
import SettlementPage from './settlement/SettlementPage';
import PayrollPage from './payroll/PayrollPage';
import WorkSchedulePage from './work/WorkSchedulePage';
import Sidebar from '../../components/Sidebar';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: -4, transition: { duration: 0.08, ease: 'easeIn' } },
};

// Pre-Phase 34 — 근무 탭은 PC 좌측 사이드바에서만 노출 (mobileBottomNav=false).
// 모바일에서는 BottomNav 가 한 줄에 들어가지 않으므로 더보기 안 "내 근무표" / "근무 관리"
// 카드를 통해 진입한다.
const TAB_CONFIG = {
  owner: [
    { id: 'home',       label: '홈',    Icon: Home },
    { id: 'classes',    label: '수업',  Icon: BookOpen },
    { id: 'students',   label: '학생',  Icon: Users },
    { id: 'settlement', label: '정산',  Icon: BarChart2 },
    { id: 'work',       label: '근무',  Icon: CalendarClock, mobileBottomNav: false },
    { id: 'more',       label: '더보기', Icon: MoreHorizontal },
  ],
  teacher: [
    { id: 'home',     label: '홈',   Icon: Home },
    { id: 'classes',  label: '수업', Icon: BookOpen },
    { id: 'students', label: '학생', Icon: Users },
    { id: 'payroll',  label: '급여', Icon: CreditCard },
    { id: 'work',     label: '근무', Icon: CalendarClock, mobileBottomNav: false },
    { id: 'more',     label: '더보기', Icon: MoreHorizontal },
  ],
  assistant: [
    { id: 'home',     label: '홈',    Icon: Home },
    { id: 'clinic',   label: '클리닉', Icon: Stethoscope },
    { id: 'students', label: '학생',  Icon: Users },
    { id: 'payroll',  label: '급여',  Icon: CreditCard },
    { id: 'work',     label: '근무',  Icon: CalendarClock, mobileBottomNav: false },
    { id: 'more',     label: '더보기', Icon: MoreHorizontal },
  ],
};

function FallbackScreen() {
  const { setActiveTab } = useAcademyStore();
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
  const {
    role,
    activeTab,
    setActiveTab,
    selectedClassGroupId,
    selectedClassSessionId,
    selectedAcademyStudentId,
    classGroups,
    classSessions,
    academyStudents,
    goBackFromClassGroup,
    goBackFromClassSession,
    goBackFromAcademyStudent,
  } = useAcademyStore();

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

  // 역할이 바뀌어 현재 activeTab이 해당 역할 탭 목록에 없으면 첫 번째 탭으로 보정
  useEffect(() => {
    const validTabIds = tabs.map((t) => t.id);
    if (!validTabIds.includes(activeTab)) {
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
      if (activeTab === 'work')       return <WorkSchedulePage />;
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
    <div className="min-h-screen bg-[#F5F6F8] md:flex">
      {/* PC 사이드바 — md 이상에서만 표시 */}
      <Sidebar tabs={tabs} />

      <main className="flex-1 min-w-0">
        <div className="main-content max-w-md mx-auto md:mx-0 md:max-w-none md:px-8 md:py-6 pb-24 md:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={pageKey}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ willChange: 'opacity, transform' }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Phase 25 — 자동 hydrate 가 App.jsx 에서 처리되므로 HydratePromptModal 은
          기본 흐름에서 표시하지 않는다. 수동 새로고침은 더보기 → 학원 워크스페이스 패널의
          "서버 데이터 새로고침/불러오기" 버튼으로 진행. */}

      {/* Bottom Nav — 모바일 전용 (md 이상에서는 좌측 사이드바가 대체) */}
      <nav className="md:hidden bottom-nav fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 shadow-[0_-1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto flex pt-2">
          {tabs.filter((t) => t.mobileBottomNav !== false).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <motion.button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                whileTap={{ scale: 0.97 }}
                className="flex-1 flex flex-col items-center gap-1 pb-1"
              >
                <div className={`flex items-center justify-center w-10 h-7 rounded-2xl transition-colors ${active ? 'bg-blue-50' : ''}`}>
                  <Icon size={21} className={active ? 'text-blue-600' : 'text-gray-400'} strokeWidth={active ? 2.5 : 1.8} />
                </div>
                <span className={`text-[10px] font-medium ${active ? 'text-blue-600' : 'text-gray-400'}`}>{label}</span>
              </motion.button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
