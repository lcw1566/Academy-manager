import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, BookOpen, Users, MoreHorizontal, CreditCard, BarChart2, UserCog, MessageCircle, ClipboardList, FolderOpen, Clock3, Pin, X, CheckSquare, RefreshCw } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import useAuthStore from '../../store/useAuthStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import useChatStore, { totalUnread } from '../../store/useChatStore';
import { currentUserCan } from '../../utils/staffPermissions';
import AttendanceSettingsSheet from './attendance/AttendanceSettingsSheet';
import { readAttendanceSettings } from './attendance/attendanceHelpers';
import TuitionPolicyOnboardingSheet from './onboarding/TuitionPolicyOnboardingSheet';
import Sidebar from '../../components/Sidebar';

const loadOwnerDashboard = () => import('./dashboard/OwnerDashboard');
const loadTeacherDashboard = () => import('./dashboard/TeacherDashboard');
const loadClassGroupsPage = () => import('./classes/ClassGroupsPage');
const loadClassGroupDetailPage = () => import('./classes/ClassGroupDetailPage');
const loadClassSessionPage = () => import('./classes/ClassSessionPage');
const loadClinicPage = () => import('./clinic/ClinicPage');
const loadAcademyStudentsPage = () => import('./students/AcademyStudentsPage');
const loadAcademyStudentDetailPage = () => import('./students/AcademyStudentDetailPage');
const loadStudentAttendancePage = () => import('./attendance/StudentAttendancePage');
const loadAcademyMorePage = () => import('./more/AcademyMorePage');
const loadStaffPage = () => import('./staff/StaffPage');
const loadChatPage = () => import('./chat/ChatPage');
const loadDrivePage = () => import('./drive/DrivePage');

const OwnerDashboard = lazy(loadOwnerDashboard);
const TeacherDashboard = lazy(loadTeacherDashboard);
const ClassGroupsPage = lazy(loadClassGroupsPage);
const ClassGroupDetailPage = lazy(loadClassGroupDetailPage);
const ClassSessionPage = lazy(loadClassSessionPage);
const ClinicPage = lazy(loadClinicPage);
const AcademyStudentsPage = lazy(loadAcademyStudentsPage);
const AcademyStudentDetailPage = lazy(loadAcademyStudentDetailPage);
const StudentAttendancePage = lazy(loadStudentAttendancePage);
const AcademyMorePage = lazy(loadAcademyMorePage);
const StaffPage = lazy(loadStaffPage);
const ChatPage = lazy(loadChatPage);
const DrivePage = lazy(loadDrivePage);

const COMMON_ACADEMY_TAB_LOADERS = [
  loadClassGroupsPage,
  loadAcademyStudentsPage,
  loadStudentAttendancePage,
  loadChatPage,
  loadDrivePage,
  loadAcademyMorePage,
];

// Phase 40 — 기존 "근무" 탭을 "직원" 으로 통합. 직원 리스트 + 근무 스케줄 +
// 계약/권한/배정까지 한 탭에서 처리한다. More 탭은 학원·계정 설정만 남긴다.
//
// 강사/보조강사는 본인 출퇴근만 Home 카드에서 처리한다. 운영 매니저는
// 데스크 실무를 위해 직원·수납·공유자료 탭에 접근하되, 원장 전용 급여는 제외한다.
const TAB_CONFIG = {
  owner: [
    { id: 'home',       label: '홈',    Icon: Home },
    { id: 'attendance', label: '등하원', Icon: CheckSquare, mobileBottomNav: false },
    { id: 'classes',    label: '수업',  Icon: BookOpen },
    { id: 'students',   label: '학생',  Icon: Users },
    { id: 'clinic',     label: '클리닉', Icon: ClipboardList },
    { id: 'staff',      label: '직원',   Icon: UserCog },
    { id: 'payments',   label: '수납',  Icon: CreditCard, pilotLocked: true },
    { id: 'owner-payroll', label: '급여', Icon: BarChart2, pilotLocked: true },
    { id: 'drive',      label: '드라이브', Icon: FolderOpen },
    { id: 'chat',       label: '채팅',  Icon: MessageCircle },
    { id: 'more',       label: '더보기', Icon: MoreHorizontal },
  ],
  teacher: [
    { id: 'home',     label: '홈',   Icon: Home },
    { id: 'attendance', label: '등하원', Icon: CheckSquare, mobileBottomNav: false },
    { id: 'classes',  label: '수업', Icon: BookOpen },
    { id: 'students', label: '학생', Icon: Users },
    { id: 'clinic',   label: '클리닉', Icon: ClipboardList },
    { id: 'staff',    label: '직원', Icon: UserCog },
    { id: 'payments', label: '수납', Icon: CreditCard, pilotLocked: true },
    { id: 'payroll',  label: '급여', Icon: CreditCard, pilotLocked: true },
    { id: 'drive',    label: '드라이브', Icon: FolderOpen },
    { id: 'chat',     label: '채팅', Icon: MessageCircle },
    { id: 'more',     label: '더보기', Icon: MoreHorizontal },
  ],
  // 모든 직원 역할에 같은 후보 탭을 제공한 뒤 아래 권한 필터에서 실제 노출을 결정한다.
  // 역할 변경 및 개별 권한 수정이 즉시 탭 구성에 반영되도록 탭 배열 자체에 예외를 두지 않는다.
  assistant: [
    { id: 'home',     label: '홈',   Icon: Home },
    { id: 'attendance', label: '등하원', Icon: CheckSquare, mobileBottomNav: false },
    { id: 'classes',  label: '수업', Icon: BookOpen },
    { id: 'students', label: '학생', Icon: Users },
    { id: 'clinic',   label: '클리닉', Icon: ClipboardList },
    { id: 'staff',    label: '직원', Icon: UserCog },
    { id: 'payments', label: '수납', Icon: CreditCard, pilotLocked: true },
    { id: 'payroll',  label: '급여', Icon: CreditCard, pilotLocked: true },
    { id: 'drive',    label: '드라이브', Icon: FolderOpen },
    { id: 'chat',     label: '채팅', Icon: MessageCircle },
    { id: 'more',     label: '더보기', Icon: MoreHorizontal },
  ],
  manager: [
    { id: 'home',       label: '홈',    Icon: Home },
    { id: 'attendance', label: '등하원', Icon: CheckSquare, mobileBottomNav: false },
    { id: 'classes',    label: '수업',  Icon: BookOpen },
    { id: 'students',   label: '학생',  Icon: Users },
    { id: 'clinic',     label: '클리닉', Icon: ClipboardList },
    { id: 'staff',      label: '직원',  Icon: UserCog },
    { id: 'payments',   label: '수납',  Icon: CreditCard, pilotLocked: true },
    { id: 'payroll',    label: '급여',  Icon: BarChart2, pilotLocked: true },
    { id: 'drive',      label: '드라이브', Icon: FolderOpen },
    { id: 'chat',       label: '채팅', Icon: MessageCircle },
    { id: 'more',       label: '더보기', Icon: MoreHorizontal },
  ],
};

// 모바일은 매일 가장 자주 쓰는 기능 5개 + 더보기로 고정한다.
// 권한이나 학원 설정으로 항목이 빠지면 뒤의 후보(채팅·직원 등)로 채워
// 가능한 경우 항상 6칸을 유지한다.
const MOBILE_PRIMARY_TAB_IDS = ['home', 'attendance', 'classes', 'students', 'clinic'];
const MOBILE_FALLBACK_TAB_IDS = ['chat', 'staff', 'payments', 'payroll', 'owner-payroll', 'drive'];

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

const PILOT_LOCKED_FEATURES = {
  payments: {
    title: '수납',
    description: '학생별 수납 내역을 더 안전하게 관리할 수 있도록 파일럿 이후에 정식으로 제공할 예정이에요.',
  },
  'owner-payroll': {
    title: '급여',
    description: '직원별 급여 계산과 지급 관리를 충분히 검증한 뒤 정식으로 제공할 예정이에요.',
  },
  payroll: {
    title: '급여',
    description: '근무 기록과 급여 계산을 충분히 검증한 뒤 정식으로 제공할 예정이에요.',
  },
  drive: {
    title: '드라이브',
    description: '학원 자료 공유와 권한 관리를 충분히 검증한 뒤 정식으로 제공할 예정이에요.',
  },
};

function PilotLockedFeature({ featureId, onReturn }) {
  const feature = PILOT_LOCKED_FEATURES[featureId] || PILOT_LOCKED_FEATURES.drive;
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-5 py-16">
      <div className="w-full max-w-md rounded-3xl border border-seenit-border bg-seenit-surface px-6 py-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
          <Clock3 size={26} strokeWidth={2} />
        </div>
        <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">
          파일럿 이후 제공 예정
        </span>
        <h1 className="mt-4 text-xl font-black text-seenit-ink">{feature.title} 기능을 준비하고 있어요</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-gray-500">{feature.description}</p>
        <div className="mt-6 rounded-2xl bg-blue-50 px-4 py-4 text-left">
          <p className="text-xs font-bold text-blue-600">이번 테스트 집중 기능</p>
          <p className="mt-1 text-sm font-bold text-gray-800">스케줄링 · 학생 정보 · 클리닉 기록</p>
        </div>
        <button
          type="button"
          onClick={onReturn}
          className="mt-6 h-12 w-full rounded-2xl bg-[#0064FF] text-sm font-black text-white active:bg-[#0050CC]"
        >
          테스트 기능으로 돌아가기
        </button>
      </div>
    </div>
  );
}

function DesktopChatWindow({ pinned, onPinnedChange, onClose }) {
  const windowRef = useRef(null);

  useEffect(() => {
    if (pinned) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!windowRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [pinned, onClose]);

  return (
    <motion.aside
      ref={windowRef}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="fixed bottom-5 right-5 z-[60] hidden h-[min(720px,calc(100vh-40px))] w-[420px] flex-col overflow-hidden rounded-[24px] border border-seenit-border bg-seenit-canvas shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:flex"
      aria-label="PC 채팅 창"
    >
      <div className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-seenit-border bg-seenit-surface px-4">
        <MessageCircle size={16} className="text-[#0064FF]" />
        <p className="flex-1 text-sm font-extrabold text-seenit-ink">채팅</p>
        <button
          type="button"
          onClick={() => onPinnedChange(!pinned)}
          aria-pressed={pinned}
          aria-label={pinned ? '채팅 창 고정 해제' : '채팅 창 고정'}
          title={pinned ? '고정 해제' : '다른 메뉴를 눌러도 유지'}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
            pinned ? 'bg-blue-50 text-[#0064FF]' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <Pin size={15} className={pinned ? 'fill-current' : ''} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="채팅 창 닫기"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={17} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<div className="h-full bg-seenit-canvas" />}>
          <ChatPage displayMode="floating" />
        </Suspense>
      </div>
    </motion.aside>
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
  const academyProfile = useAcademyStore((s) => s.academyProfile);
  const goBackFromClassGroup = useAcademyStore((s) => s.goBackFromClassGroup);
  const goBackFromClassSession = useAcademyStore((s) => s.goBackFromClassSession);
  const goBackFromAcademyStudent = useAcademyStore((s) => s.goBackFromAcademyStudent);
  const [desktopChatOpen, setDesktopChatOpen] = useState(false);
  const [desktopChatPinned, setDesktopChatPinned] = useState(true);
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const syncViewport = (event) => setIsDesktopViewport(event.matches);
    setIsDesktopViewport(media.matches);
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  // 모바일에서 열었던 채팅 탭을 PC에서 복원할 때는 전체 화면 대신 플로팅 창으로 전환한다.
  useEffect(() => {
    if (!isDesktopViewport || activeTab !== 'chat') return;
    setDesktopChatOpen(true);
    setActiveTab('home');
  }, [isDesktopViewport, activeTab, setActiveTab]);

  // PC 플로팅 창을 연 채 모바일 폭으로 전환하면 보이지 않는 창으로 읽음 처리되지 않도록
  // 기존 모바일 전체 화면 채팅으로 자연스럽게 넘긴다.
  useEffect(() => {
    if (isDesktopViewport || !desktopChatOpen) return;
    setDesktopChatOpen(false);
    setActiveTab('chat');
  }, [isDesktopViewport, desktopChatOpen, setActiveTab]);

  useEffect(() => {
    const roleLoaders = role === 'owner'
      ? [loadClinicPage, loadStaffPage]
      : role === 'teacher'
      ? [loadClinicPage]
      : role === 'manager'
      ? [loadClinicPage, loadStaffPage]
      : role === 'assistant'
      ? [loadClinicPage]
      : [];
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
  const workspaceRealtimeStatus = useWorkspaceStore((s) => s.workspaceRealtimeStatus);
  const serverStudentsError = useWorkspaceStore((s) => s.serverStudentsError);
  const serverClassGroupsError = useWorkspaceStore((s) => s.serverClassGroupsError);
  const serverClassSessionsError = useWorkspaceStore((s) => s.serverClassSessionsError);
  const serverLessonRecordsError = useWorkspaceStore((s) => s.serverLessonRecordsError);
  const serverAttendanceRecordsError = useWorkspaceStore((s) => s.serverAttendanceRecordsError);
  const serverClinicRecordsError = useWorkspaceStore((s) => s.serverClinicRecordsError);
  const studentCheckEventsError = useWorkspaceStore((s) => s.studentCheckEventsError);
  const refreshWorkspaceCollaborationState = useWorkspaceStore(
    (s) => s.refreshWorkspaceCollaborationState,
  );
  const startWorkspaceRealtime = useWorkspaceStore((s) => s.startWorkspaceRealtime);
  const [syncRetrying, setSyncRetrying] = useState(false);
  const hasCoreSyncError = Boolean(
    serverStudentsError
    || serverClassGroupsError
    || serverClassSessionsError
    || serverLessonRecordsError
    || serverAttendanceRecordsError
    || serverClinicRecordsError
    || studentCheckEventsError,
  );
  const isRealtimeReconnecting = workspaceRealtimeStatus === 'reconnecting';

  const retryWorkspaceSync = async () => {
    if (syncRetrying) return;
    setSyncRetrying(true);
    try {
      startWorkspaceRealtime();
      await refreshWorkspaceCollaborationState({ reason: 'manual-sync-retry' });
    } finally {
      setSyncRetrying(false);
    }
  };
  const currentAcademy = memberships.find((m) => m.academy_id === currentAcademyId)?.academy || null;
  const clinicEnabled = academyProfile?.clinicRequired
    ?? (currentAcademy?.clinic_required !== false);
  const studentAttendanceEnabled =
    readAttendanceSettings(currentAcademy).studentCheckMethod !== 'disabled';
  const needsAttendanceOnboarding = role === 'owner'
    && isWorkspaceReady
    && !!currentAcademy
    && !currentAcademy.attendance_onboarded_at;
  const needsTuitionPolicyOnboarding = role === 'owner'
    && isWorkspaceReady
    && !!currentAcademy
    && !currentAcademy.tuition_policy_onboarded_at;
  // 사용자가 이번 세션에서 onboarding 모달을 명시적으로 닫은 경우 다시 띄우지 않음.
  // (서버 set 이 실패하더라도 무한 루프 회피.)
  const [attendanceOnboardingDismissed, setAttendanceOnboardingDismissed] = useState(false);
  const [tuitionOnboardingDismissed, setTuitionOnboardingDismissed] = useState(false);
  const showTuitionOnboarding = needsTuitionPolicyOnboarding && !tuitionOnboardingDismissed;

  useEffect(() => {
    setTuitionOnboardingDismissed(false);
  }, [currentAcademyId]);

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
      if (tab.id === 'clinic') {
        return clinicEnabled
          && currentUserCan({ role, staffProfile: myStaffProfile }, 'canEditClinicRecords');
      }
      if (tab.id === 'attendance') {
        return studentAttendanceEnabled
          && currentUserCan({ role, staffProfile: myStaffProfile }, 'canEditAttendance');
      }
      if (tab.id === 'classes') {
        return currentUserCan({ role, staffProfile: myStaffProfile }, 'canEditLessonRecords')
          || currentUserCan({ role, staffProfile: myStaffProfile }, 'canManageClasses');
      }
      if (tab.id === 'payroll') {
        return currentUserCan({ role, staffProfile: myStaffProfile }, 'canViewPayroll');
      }
      if (tab.id === 'students') {
        return currentUserCan({ role, staffProfile: myStaffProfile }, 'canViewStudents');
      }
      if (tab.id === 'payments') {
        // 운영 매니저는 수납 실무만, 원장은 수납과 급여를 별도 탭으로 관리한다.
        if (role === 'owner') return true;
        return currentUserCan({ role, staffProfile: myStaffProfile }, 'canViewPayments');
      }
      if (tab.id === 'staff') {
        return role === 'owner'
          || currentUserCan({ role, staffProfile: myStaffProfile }, 'canManageStaff')
          || currentUserCan({ role, staffProfile: myStaffProfile }, 'canManageStaffPermissions')
          || currentUserCan({ role, staffProfile: myStaffProfile }, 'canRemoveStaff');
      }
      return true;
    });
  }, [baseTabs, role, myStaffProfile, clinicEnabled, studentAttendanceEnabled]);

  // 채팅 안 읽음 — 하단 탭/사이드바 배지.
  const chatMessages = useChatStore((s) => s.messages);
  const chatReads = useChatStore((s) => s.reads);
  const chatUnread = useMemo(
    () => totalUnread({ messages: chatMessages, reads: chatReads }, authUserId),
    [chatMessages, chatReads, authUserId],
  );
  const mobileTabs = useMemo(() => {
    const moreTab = tabs.find((tab) => tab.id === 'more');
    const selected = [];
    const seen = new Set();
    for (const id of [...MOBILE_PRIMARY_TAB_IDS, ...MOBILE_FALLBACK_TAB_IDS]) {
      const tab = tabs.find((item) => item.id === id);
      if (!tab || tab.pilotLocked || seen.has(tab.id) || tab.id === 'more') continue;
      selected.push(tab);
      seen.add(tab.id);
      if (selected.length === 5) break;
    }
    if (moreTab) selected.push(moreTab);
    return selected;
  }, [tabs]);
  const mobileTabIds = useMemo(
    () => new Set(mobileTabs.map((tab) => tab.id)),
    [mobileTabs],
  );
  const mobileOverflowTabs = useMemo(
    () => tabs.filter((tab) => tab.id !== 'more' && !mobileTabIds.has(tab.id)),
    [tabs, mobileTabIds],
  );
  const mobileActiveTab = mobileTabIds.has(activeTab) ? activeTab : 'more';

  // 역할이 바뀌어 현재 activeTab이 해당 역할 탭 목록에 없으면 첫 번째 탭으로 보정.
  // Phase 40 호환 — 이전에 저장된 'work' 는 새 'staff' 로 자동 마이그레이션.
  useEffect(() => {
    const validTabIds = tabs.map((t) => t.id);
    if (activeTab === 'work' && validTabIds.includes('staff')) {
      setActiveTab('staff');
      return;
    }
    if (activeTab === 'settlement' && validTabIds.includes('payments')) {
      setActiveTab('payments');
      return;
    }
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
    // 이전 DB의 assistant 역할도 선생님 화면으로 통합한다.
    if (role === 'assistant') return <TeacherDashboard />;
    if (role === 'manager')   return <OwnerDashboard operationsOnly />;
    return <OwnerDashboard />;
  };

  const renderContent = () => {
    try {
      if (selectedClassSessionId) return <ClassSessionPage />;
      if (activeTab === 'home')       return renderDashboard();
      if (activeTab === 'classes')    return selectedClassGroupId ? <ClassGroupDetailPage /> : <ClassGroupsPage />;
      if (activeTab === 'students')   return selectedAcademyStudentId ? <AcademyStudentDetailPage /> : <AcademyStudentsPage />;
      if (activeTab === 'attendance') return <StudentAttendancePage />;
      if (activeTab === 'clinic') {
        return clinicEnabled ? <ClinicPage /> : renderDashboard();
      }
      if (activeTab === 'payments' || activeTab === 'settlement') {
        return <PilotLockedFeature featureId="payments" onReturn={() => setActiveTab('classes')} />;
      }
      if (activeTab === 'owner-payroll' || activeTab === 'payroll') {
        return <PilotLockedFeature featureId={activeTab} onReturn={() => setActiveTab('classes')} />;
      }
      if (activeTab === 'staff')      return <StaffPage />;
      if (activeTab === 'chat')       return <ChatPage />;
      if (activeTab === 'drive')      return <DrivePage />;
      // Phase 40 호환 — 이전 버전 store 에 'work' 가 저장되어 있어도 staff 로 매핑.
      if (activeTab === 'work')       return <StaffPage />;
      if (activeTab === 'more') {
        return (
          <AcademyMorePage
            mobileNavigationItems={mobileOverflowTabs}
            navigationBadges={{ chat: chatUnread }}
            onNavigate={setActiveTab}
          />
        );
      }

      // 탭이 유효하지 않을 경우 대시보드 렌더
      const validTabIds = tabs.map((t) => t.id);
      if (!validTabIds.includes(activeTab)) return renderDashboard();

      return renderDashboard();
    } catch (err) {
      console.error('[AcademyAppLayout] renderContent error:', err);
      return <FallbackScreen />;
    }
  };

  const handleDesktopTabSelect = (tab) => {
    if (tab.id !== 'chat') return false;
    setDesktopChatOpen(true);
    return true;
  };

  return (
    <div className="min-h-screen bg-seenit-canvas text-seenit-ink md:flex">
      {/* PC 사이드바 — md 이상에서만 표시 */}
      <Sidebar
        tabs={tabs}
        badges={{ chat: chatUnread }}
        onTabSelect={handleDesktopTabSelect}
        activeTabIds={desktopChatOpen ? ['chat'] : []}
      />

      <main className="min-w-0 flex-1">
        <div className="main-content mx-auto w-full max-w-md pb-24 md:max-w-none md:px-8 md:py-6 md:pb-8">
          {currentAcademyId && (hasCoreSyncError || isRealtimeReconnecting) && (
            <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 md:mx-0">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-orange-800">
                  {hasCoreSyncError ? '일부 데이터를 동기화하지 못했어요' : '서버와 다시 연결하고 있어요'}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-orange-600">
                  화면의 오래된 정보로 작업하지 않도록 다시 연결해주세요.
                </p>
              </div>
              <button
                type="button"
                onClick={retryWorkspaceSync}
                disabled={syncRetrying}
                className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-xl bg-orange-600 px-3 text-xs font-bold text-white disabled:opacity-60"
              >
                <RefreshCw size={13} className={syncRetrying ? 'animate-spin' : ''} />
                다시 연결
              </button>
            </div>
          )}
          <Suspense fallback={<div className="h-[60vh]" />}>
            <div
              key={pageKey}
              className="min-h-[calc(100dvh-9rem)] w-full md:min-h-[calc(100vh-6rem)]"
            >
              {renderContent()}
            </div>
          </Suspense>
        </div>
      </main>

      {/* Phase 25 — 자동 hydrate 가 App.jsx 에서 처리되므로 HydratePromptModal 은
          기본 흐름에서 표시하지 않는다. 수동 새로고침은 더보기 → 학원 워크스페이스 패널의
          "서버 데이터 새로고침/불러오기" 버튼으로 진행. */}

      {/* Phase 41 — 출결 onboarding (owner 만, 1회) */}
      {showTuitionOnboarding && (
        <TuitionPolicyOnboardingSheet
          onClose={() => setTuitionOnboardingDismissed(true)}
        />
      )}

      {needsAttendanceOnboarding && !attendanceOnboardingDismissed && !showTuitionOnboarding && (
        <AttendanceSettingsSheet
          kind="onboarding"
          onClose={() => setAttendanceOnboardingDismissed(true)}
        />
      )}

      <AnimatePresence>
        {desktopChatOpen && (
          <DesktopChatWindow
            pinned={desktopChatPinned}
            onPinnedChange={setDesktopChatPinned}
            onClose={() => setDesktopChatOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Bottom Nav — 모바일 전용 (md 이상에서는 좌측 사이드바가 대체).
          Phase 39 — 6개 탭이 들어가도록 아이콘/너비 살짝 축소. */}
      <nav className="md:hidden bottom-nav fixed bottom-0 left-0 right-0 z-30 bg-seenit-surface border-t border-seenit-border-soft shadow-[0_-1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto flex pt-2">
          {mobileTabs.map(({ id, label, Icon, pilotLocked }) => {
            const active = mobileActiveTab === id;
            const badge = id === 'chat'
              ? chatUnread
              : id === 'more' && mobileOverflowTabs.some((tab) => tab.id === 'chat')
                ? chatUnread
                : 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 pb-1 active:scale-[0.98] transition-all ${
                  pilotLocked ? 'opacity-45 grayscale' : ''
                }`}
                aria-label={pilotLocked ? `${label}, 추후 제공 예정` : label}
              >
                <div className={`relative flex items-center justify-center w-9 h-7 rounded-2xl transition-colors ${
                  active && !pilotLocked ? 'bg-seenit-brand-soft' : active ? 'bg-seenit-control' : ''
                }`}>
                  <Icon
                    size={19}
                    className={active && !pilotLocked ? 'text-seenit-brand' : 'text-seenit-subtle'}
                    strokeWidth={active ? 2.5 : 1.8}
                  />
                  {badge > 0 && (
                    <span className="absolute -top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </div>
                <span className={`text-[9.5px] font-medium ${
                  active && !pilotLocked ? 'text-seenit-brand' : 'text-seenit-subtle'
                }`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
