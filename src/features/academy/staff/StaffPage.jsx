// StaffPage — Phase 40
//
// "직원" 탭의 진입점. 기존 work 탭(WorkSchedulePage)을 통합한 인사·근무 페이지.
//
// 역할별 진입:
//   - owner : 전체 직원 리스트 + 상세 (3 서브탭: 근무 / 계약 / 권한)
//             초대 진입점 (+ 직원 초대), 대기 중인 초대 카드.
//   - teacher / assistant : 본인 근무 + 출퇴근 + 본인 계약/배정 요약.
//
// 데이터 모델은 그대로 사용한다 (SQL 변경 없음):
//   - academyTeachers / academyAssistants (로컬 staff entries)
//   - academy_staff_profiles (서버 — 과목/시급/권한)
//   - academy_invitations    (서버 — pending)
//   - academy_member_profiles (서버 — 이메일/이름/연락처)
//   - academyStaffShifts     (로컬 근무표)

import { useEffect, useMemo, useState } from 'react';
import {
  Plus, ChevronLeft, ChevronRight, Pencil,
  Clock, Users as UsersIcon, GraduationCap, Mail, X as XIcon,
  Loader2, Check, BookOpen, Coffee,
  LogIn, LogOut as LogOutIcon, ShieldCheck,
  UserMinus,
} from 'lucide-react';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import { ListSearchFilterBar, ListFilterChips } from '../../../components/filters/ListFilters';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import {
  today as todayDate,
  formatDateShort,
  formatMonth,
  addDaysYMD,
  getCurrentMonth,
  getMonthDates,
  getKoreaHHMM,
  getDaysInMonth,
  getWeekDates,
  getKoreanWeekdayFromYMD,
  nextMonth,
  prevMonth,
} from '../../../utils/date';
import {
  createAcademyStaffShift,
  updateAcademyStaffShift as updateServerStaffShift,
  deleteAcademyStaffShift as deleteServerStaffShift,
} from '../../../services/supabase/domainApi';
import {
  manageAcademyStaffAccess, removeAcademyMember,
} from '../../../services/supabase/workspaceApi';
import {
  buildRecurringStaffWorkPreview,
  saveAlternatingStaffWorkSchedule,
  saveRecurringStaffWorkSchedule,
} from '../../../services/staffWorkScheduleService';
import {
  buildShiftTimeline,
  hhmmToMin,
} from '../../../utils/shiftCoverage';
import {
  buildPlannedStaffSchedule, mergePlannedAndActualStaffShifts, plannedToStaffShiftShape,
} from '../../../utils/schedule';
import {
  PERMISSION_LABELS,
  PERMISSION_KEYS,
  resolvePermissions,
  currentUserCan,
  getJobTitlePolicy,
  normalizeJobTitlePermissions,
  OWNER_DELEGATED_PERMISSION_KEYS,
} from '../../../utils/staffPermissions';
import StaffInviteWidget from '../more/StaffInviteWidget';

const KOREAN_WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const KO_TO_DOW = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
const DOW_TO_KO = ['일', '월', '화', '수', '목', '금', '토'];

const STATUS_LABELS = { scheduled: '예정', completed: '완료', canceled: '취소' };
const STATUS_TONES = {
  scheduled: 'text-blue-700 bg-blue-50',
  completed: 'text-emerald-700 bg-emerald-50',
  canceled: 'text-gray-500 bg-gray-100',
};
const STAFF_ROLE_LABELS = {
  owner: '원장',
  teacher: '선생님',
  assistant: '선생님',
  manager: '운영 매니저',
};
function getStaffJobTitle(staff) {
  return String(
    staff?.jobTitle
    || staff?.job_title
    || STAFF_ROLE_LABELS[staff?._role]
    || '직원',
  ).trim();
}
const INVITATION_STATUS_META = {
  pending: {
    label: '수락 대기',
    description: '아직 상대방이 초대를 수락하지 않았어요.',
    tone: 'bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
  accepted: {
    label: '수락 완료',
    description: '상대방이 초대를 수락했어요.',
    tone: 'bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  canceled: {
    label: '취소됨',
    description: '취소한 초대예요.',
    tone: 'bg-gray-100 text-gray-500',
    dot: 'bg-gray-400',
  },
};

const SUB_TABS = [
  { id: 'shift',      label: '근무' },
  { id: 'contract',   label: '급여' },
  { id: 'permission', label: '권한' },
];
const PILOT_LOCKED_PERMISSION_KEYS = new Set([
  'canViewPayroll',
  'canViewPayments',
  'canManagePayments',
  // 공유 드라이브는 모든 활성 직원에게 공통 제공한다.
  'canManageDrive',
]);
const ACTIVE_PERMISSION_KEYS = PERMISSION_KEYS.filter(
  (key) => !PILOT_LOCKED_PERMISSION_KEYS.has(key),
);

function formatClock(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}
function nowHHmm() {
  return getKoreaHHMM();
}
function formatShiftTimeRange(start, end) {
  const s = formatClock(start);
  const e = formatClock(end);
  if (!s && !e) return '';
  return `${s || '-'} - ${e || '-'}`;
}
function scheduledShiftMinutes(sh) {
  const start = hhmmToMin(sh?.scheduledStartTime);
  const end = hhmmToMin(sh?.scheduledEndTime);
  if (start == null || end == null || end <= start) return 0;
  return Math.max(0, end - start - (Number(sh.breakMinutes) || 0));
}
function scheduledShiftGrossMinutes(sh) {
  const start = hhmmToMin(sh?.scheduledStartTime);
  const end = hhmmToMin(sh?.scheduledEndTime);
  if (start == null || end == null || end <= start) return 0;
  return Math.max(0, end - start);
}
function shiftMinutes(sh) {
  const start = sh.actualStartTime || (sh.status === 'completed' ? sh.scheduledStartTime : null);
  const end = sh.actualEndTime || (sh.status === 'completed' ? sh.scheduledEndTime : null);
  if (!start || !end) return 0;
  const [sh1, sm1] = start.split(':').map(Number);
  const [sh2, sm2] = end.split(':').map(Number);
  if (Number.isNaN(sh1) || Number.isNaN(sh2)) return 0;
  const m = sh2 * 60 + sm2 - (sh1 * 60 + sm1) - (sh.breakMinutes || 0);
  return m > 0 ? m : 0;
}
function formatShiftHoursFromMinutes(minutes) {
  const hours = (Number(minutes) || 0) / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
function formatInvitationDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
function monthStart(month) {
  return `${month}-01`;
}
function monthEnd(month) {
  const [year, m] = String(month || '').split('-').map(Number);
  if (!year || !m) return '';
  const last = getDaysInMonth(year, m);
  return `${month}-${String(last).padStart(2, '0')}`;
}
function minYMD(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return a < b ? a : b;
}
function maxYMD(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return a > b ? a : b;
}
function formatWeekOfMonthLabel(anchorYMD) {
  if (!anchorYMD) return '';
  const [year, month, day] = anchorYMD.split('-').map(Number);
  if (!year || !month || !day) return '';
  const weekNo = Math.floor((day - 1) / 7) + 1;
  const names = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'];
  return `${month}월 ${names[weekNo - 1] || `${weekNo}번째`} 주`;
}
function isPlannedShiftException(sh) {
  return !!(sh?.isPlanned && sh?.exceptionType);
}
function validateShiftTime({ startTime, endTime, breakMinutes = 0 } = {}) {
  if (!startTime || !endTime) return '시작 시간과 종료 시간을 입력해주세요.';
  const start = hhmmToMin(startTime);
  const end = hhmmToMin(endTime);
  if (start == null || end == null) return '근무 시간을 다시 확인해주세요.';
  if (end <= start) return '종료 시간은 시작 시간보다 늦어야 해요.';
  const breakMin = Number(breakMinutes) || 0;
  if (breakMin < 0) return '휴게 시간은 0분 이상이어야 해요.';
  if (breakMin >= end - start) return '휴게 시간은 전체 근무 시간보다 짧아야 해요.';
  return '';
}

// ─── 메인 진입점 ──────────────────────────────────────────────────
export default function StaffPage() {
  const role = useAcademyStore((s) => s.role);
  const authUserId = useAuthStore((s) => s.user?.id);
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const myStaffProfile = academyStaffProfiles.find((profile) => profile.user_id === authUserId) || null;
  const canManageStaff = role === 'owner' || currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canManageStaff',
  );
  const canManageStaffAccess = role === 'owner' || currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canManageStaffPermissions',
  );
  const canRemoveStaff = role === 'owner' || currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canRemoveStaff',
  );
  if (canManageStaff || canManageStaffAccess || canRemoveStaff) {
    return <OwnerStaffView
      canInviteStaff={canManageStaff}
      canInviteManagers={role === 'owner'}
      canManageStaffAccess={canManageStaffAccess}
      canManageSensitiveAccess={role === 'owner'}
      canRemoveStaff={canRemoveStaff}
    />;
  }
  return <MyStaffView />;
}

// ═══════════════════════════════════════════════════════════════════
// Owner 뷰 — 직원 리스트 + 상세
// ═══════════════════════════════════════════════════════════════════
function OwnerStaffView({
  canInviteStaff = false,
  canInviteManagers = false,
  canManageStaffAccess = false,
  canManageSensitiveAccess = false,
  canRemoveStaff = false,
}) {
  const authUserId = useAuthStore((s) => s.user?.id);
  const authUserEmail = useAuthStore((s) => s.user?.email);
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const academyManagers = useAcademyStore((s) => s.academyManagers) ?? [];
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];

  const profile = useWorkspaceStore((s) => s.profile);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const academyMemberProfiles = useWorkspaceStore((s) => s.academyMemberProfiles) ?? [];
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const academyInvitations = useWorkspaceStore((s) => s.academyInvitations) ?? [];
  const loadAcademyInvitations = useWorkspaceStore((s) => s.loadAcademyInvitations);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | owner | title:{직책}
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitationStatusOpen, setInvitationStatusOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const todayStr = todayDate();
  const weekDates = useMemo(() => getWeekDates(todayStr), [todayStr]);
  const currentMonth = getCurrentMonth();

  const allStaff = useMemo(() => {
    const currentMembership = memberships.find(
      (membership) => membership.academy_id === currentAcademyId,
    );
    const ownerUserId = currentMembership?.academy?.owner_id || null;
    const directoryProfiles = academyMemberProfiles.slice();
    if (
      ownerUserId
      && !directoryProfiles.some((memberProfile) => memberProfile.user_id === ownerUserId)
    ) {
      directoryProfiles.push({
        user_id: ownerUserId,
        display_name: ownerUserId === authUserId ? profile?.display_name : '학원 원장',
        email: ownerUserId === authUserId ? (profile?.email || authUserEmail) : '',
        phone: ownerUserId === authUserId ? profile?.phone : '',
        membership_role: 'owner',
        membership_status: 'active',
      });
    }
    if (
      authUserId
      && !directoryProfiles.some((memberProfile) => memberProfile.user_id === authUserId)
    ) {
      directoryProfiles.push({
        user_id: authUserId,
        display_name: profile?.display_name,
        email: profile?.email || authUserEmail,
        phone: profile?.phone,
        membership_role: currentMembership?.role,
        membership_status: currentMembership?.status,
      });
    }
    const importantMembers = directoryProfiles
      .map((memberProfile) => {
        const staffProfile = academyStaffProfiles.find(
          (candidate) => candidate.user_id === memberProfile.user_id,
        );
        const memberRole = memberProfile.membership_role
          || staffProfile?.role
          || (memberProfile.user_id === ownerUserId ? 'owner' : null)
          || (memberProfile.user_id === authUserId ? currentMembership?.role : null);
        const normalizedRole = memberRole === 'assistant' ? 'teacher' : memberRole;
        if (!['owner', 'teacher', 'manager'].includes(normalizedRole)) {
          return null;
        }
        return {
          id: `${normalizedRole}_${memberProfile.user_id}`,
          serverUserId: memberProfile.user_id,
          academyMemberId: staffProfile?.member_id || null,
          email: memberProfile.email || '',
          name: memberProfile.display_name || memberProfile.email || (
            normalizedRole === 'owner' ? '학원 원장' : '내 계정'
          ),
          phone: memberProfile.phone || '',
          jobTitle: staffProfile?.job_title || STAFF_ROLE_LABELS[normalizedRole],
          subject: staffProfile?.subject || '',
          subjects: staffProfile?.subjects || [],
          wageType: staffProfile?.wage_type || 'hourly',
          hourlyWage: staffProfile?.hourly_wage || 0,
          monthlySalary: staffProfile?.monthly_salary || 0,
          memo: staffProfile?.memo || '',
          permissions: staffProfile?.permissions || {},
          academyJobTitlePermissions: staffProfile?.academy_job_title_permissions,
          status: staffProfile?.status || 'active',
          _role: normalizedRole,
          _sourceRole: memberRole,
          _kind: 'staff',
          _isCurrentUser: memberProfile.user_id === authUserId,
          _isDirectoryEntry: true,
        };
      })
      .filter(Boolean);

    const seen = new Set();
    return [
      ...academyTeachers.map((staff) => ({ ...staff, _role: 'teacher', _sourceRole: 'teacher', _kind: 'staff' })),
      // SQL 043 적용 전 로컬에 남은 보조강사도 하나의 선생님 목록으로 표시한다.
      ...academyAssistants.map((staff) => ({ ...staff, _role: 'teacher', _sourceRole: 'assistant', _kind: 'staff' })),
      // 역할을 바꿀 수 있는지와 목록에서 볼 수 있는지는 별개다. 운영 매니저로
      // 접속해도 본인을 포함한 매니저 구성원은 목록에 계속 표시한다.
      ...academyManagers.map((staff) => ({ ...staff, _role: 'manager', _sourceRole: 'manager', _kind: 'staff' })),
      // 원장은 academy_staff_profiles 대상이 아니므로 멤버십 디렉터리에서 보강한다.
      // 로컬 배열 로딩이 늦을 때는 현재 로그인 사용자도 같은 방식으로 보강한다.
      ...importantMembers,
    ].filter((staff) => {
      if (staff.status === 'inactive') return false;
      const key = staff.serverUserId || staff.academyMemberId
        || String(staff.email || '').trim().toLowerCase()
        || `${staff._sourceRole}_${staff.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((staff) => ({
      ...staff,
      _isCurrentUser: staff.serverUserId === authUserId,
    }));
  }, [
    academyTeachers,
    academyAssistants,
    academyManagers,
    academyMemberProfiles,
    academyStaffProfiles,
    memberships,
    currentAcademyId,
    authUserId,
    authUserEmail,
    profile,
  ]);

  const pendingInvitations = useMemo(
    () => (academyInvitations || []).filter((inv) => inv.status === 'pending'),
    [academyInvitations],
  );
  const latestInvitations = useMemo(() => {
    const seen = new Set();
    return (academyInvitations || [])
      .slice()
      .sort((a, b) => (
        (b.created_at || '').localeCompare(a.created_at || '')
        || (b.updated_at || '').localeCompare(a.updated_at || '')
      ))
      .filter((invitation) => {
        const key = String(invitation.email || invitation.id || '').trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [academyInvitations]);
  const acceptedInvitationCount = latestInvitations.filter((inv) => inv.status === 'accepted').length;
  const currentAcademy = memberships.find(
    (membership) => membership.academy_id === currentAcademyId,
  )?.academy;
  const jobTitleFilters = useMemo(
    () => Object.keys(normalizeJobTitlePermissions(currentAcademy?.job_title_permissions)),
    [currentAcademy?.job_title_permissions],
  );
  useEffect(() => {
    if (filter.startsWith('title:') && !jobTitleFilters.includes(filter.slice(6))) {
      setFilter('all');
    }
  }, [filter, jobTitleFilters]);

  // 직원별 요약 (이번 주 근무 시간, 오늘 근무 수)
  const staffSummaries = useMemo(() => {
    const map = new Map();
    const staffIdByUserId = new Map();
    for (const staff of allStaff) {
      map.set(staff.id, {
        weekMin: 0,
        weekGrossMin: 0,
        weekBreakMin: 0,
        monthMin: 0,
        todayCount: 0,
        hasShift: false,
      });
      if (staff.serverUserId) staffIdByUserId.set(staff.serverUserId, staff.id);
    }
    for (const sh of academyStaffShifts) {
      if (sh.status === 'canceled') continue;
      const resolvedStaffId = sh.staffId || staffIdByUserId.get(sh.staffUserId);
      if (!resolvedStaffId) continue;
      const cur = map.get(resolvedStaffId);
      if (!cur) continue;
      cur.hasShift = true;
      if (weekDates.includes(sh.date)) {
        const grossMin = scheduledShiftGrossMinutes(sh);
        const netMin = scheduledShiftMinutes(sh);
        cur.weekGrossMin += grossMin;
        cur.weekMin += netMin;
        cur.weekBreakMin += Math.max(0, grossMin - netMin);
      }
      if (sh.date?.startsWith(currentMonth)) cur.monthMin += shiftMinutes(sh);
      if (sh.date === todayStr) cur.todayCount += 1;
    }
    return map;
  }, [allStaff, academyStaffShifts, weekDates, currentMonth, todayStr]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = [];
    for (const s of allStaff) {
      if (filter === 'owner' && s._role !== 'owner') continue;
      if (filter.startsWith('title:') && getStaffJobTitle(s) !== filter.slice(6)) continue;
      if (q && !(s.name || '').toLowerCase().includes(q)
            && !(s.email || '').toLowerCase().includes(q)) continue;
      items.push({ kind: 'staff', id: s.id, key: `staff_${s.id}`, staff: s });
    }
    return items;
  }, [allStaff, filter, search]);

  const selectedItem = useMemo(() => {
    if (!selectedKey) return visibleItems[0] || null;
    return visibleItems.find((it) => it.key === selectedKey) || visibleItems[0] || null;
  }, [selectedKey, visibleItems]);

  const handleSelect = (item) => {
    setSelectedKey(item.key);
    setMobileDetailOpen(true);
  };

  const handleBackToList = () => setMobileDetailOpen(false);
  const openInvitationStatus = () => {
    setInvitationStatusOpen(true);
    loadAcademyInvitations?.();
  };

  return (
    <div className="w-full">
      <Header
        title="직원"
        right={canInviteStaff ? (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="hidden md:flex items-center gap-1.5 bg-[#0064FF] text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-[#0050CC]"
          >
            <Plus size={14} /> 직원 초대
          </button>
        ) : null}
      />
      <div className="pt-14 pb-6 md:pt-0">
        <div className="px-4 pt-4 md:grid md:grid-cols-[320px_1fr] lg:grid-cols-[340px_1fr] md:gap-6">
          {/* 좌측: 직원 리스트 */}
          <aside
            className={`md:sticky md:top-6 md:self-start ${
              mobileDetailOpen ? 'hidden md:block' : 'block'
            }`}
          >
            <div className="md:bg-white md:rounded-2xl md:p-3 md:shadow-sm">
              {canInviteStaff && <button
                type="button"
                onClick={openInvitationStatus}
                className="mb-3 flex w-full items-center justify-between rounded-2xl bg-[#F8FAFC] px-3 py-3 text-left active:bg-[#F2F4F6]"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Mail size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-extrabold text-[#191F28]">보낸 초대 현황</span>
                    <span className="mt-0.5 block text-[11px] font-semibold text-[#8B95A1]">
                      대기 {pendingInvitations.length}명 · 완료 {acceptedInvitationCount}명
                    </span>
                  </span>
                </span>
                <ChevronRight size={15} className="flex-shrink-0 text-[#B0B8C1]" />
              </button>}

              <ListSearchFilterBar
                searchValue={search}
                onSearchChange={setSearch}
                placeholder="이름 또는 이메일 검색"
                filterCount={filter === 'all' ? 0 : 1}
                filtersOpen={filtersOpen}
                onToggleFilters={() => setFiltersOpen((open) => !open)}
                onResetFilters={() => setFilter('all')}
                resultText={`${visibleItems.length}명`}
                className="mb-3"
              >
                <ListFilterChips
                  value={filter}
                  onChange={setFilter}
                  ariaLabel="직원 직책 필터"
                  options={[
                    { value: 'all', label: '전체' },
                    { value: 'owner', label: '원장' },
                    ...jobTitleFilters.map((title) => ({
                      value: `title:${title}`,
                      label: title,
                    })),
                  ]}
                />
              </ListSearchFilterBar>

              {canInviteStaff && <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="md:hidden w-full flex items-center justify-center gap-1.5 mb-3 py-2.5 rounded-xl bg-[#0064FF] text-white text-sm font-bold active:bg-[#0050CC]"
              >
                <Plus size={14} /> 직원 초대
              </button>}

              {visibleItems.length === 0 ? (
                <div className="py-8 text-center">
                  <UsersIcon size={20} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">표시할 직원이 없어요.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {visibleItems.map((item) => (
                    <StaffRosterCard
                      key={item.key}
                      item={item}
                      active={selectedItem?.key === item.key}
                      summary={item.kind === 'staff' ? staffSummaries.get(item.staff.id) : null}
                      onClick={() => handleSelect(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* 우측: 상세 (sub-tab 포함) */}
          <section
            className={`mt-4 md:mt-0 min-w-0 ${
              mobileDetailOpen ? 'block' : 'hidden md:block'
            }`}
          >
            {selectedItem ? (
              selectedItem.staff._role === 'owner' ? (
                <OwnerMemberDetailPanel
                  staff={selectedItem.staff}
                  onBack={handleBackToList}
                />
              ) : (
                <StaffDetailPanel
                  staff={selectedItem.staff}
                  summary={staffSummaries.get(selectedItem.staff.id)}
                  onBack={handleBackToList}
                  canManageAccess={canManageStaffAccess}
                  canManageSensitiveAccess={canManageSensitiveAccess}
                  canManageWork={canInviteStaff}
                  canRemoveMember={canRemoveStaff}
                  onRemoved={() => {
                    setSelectedKey(null);
                    setMobileDetailOpen(false);
                  }}
                />
              )
            ) : (
              <EmptyDetailPanel
                onAdd={canInviteStaff ? () => setInviteOpen(true) : null}
              />
            )}
          </section>
        </div>
      </div>

      {/* 직원 초대 — 직책에 학원 기본 권한이 연결된다. */}
      {inviteOpen && canInviteStaff && (
        <Modal
          isOpen
          onClose={() => setInviteOpen(false)}
          title="직원 초대"
          footer={
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="w-full bg-gray-100 text-gray-700 font-bold py-3.5 rounded-xl"
            >
              닫기
            </button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="bg-blue-50 rounded-2xl px-4 py-3">
              <p className="text-xs text-blue-700 leading-relaxed">
                이메일과 직책을 선택하세요. 직책의 기본 권한은 학원 설정에서
                바꿀 수 있고, 초대 후에는 직원별로 조정할 수 있어요.
              </p>
            </div>
            <StaffInviteWidget canInviteManagers={canInviteManagers} />
          </div>
        </Modal>
      )}

      {invitationStatusOpen && (
        <InvitationStatusModal
          invitations={latestInvitations}
          onClose={() => setInvitationStatusOpen(false)}
        />
      )}
    </div>
  );
}

function InvitationStatusModal({
  invitations,
  onClose,
}) {
  const cancelAcademyInvitationById = useWorkspaceStore((s) => s.cancelAcademyInvitationById);
  const showToast = useAcademyStore((s) => s.showToast);
  const [cancellingId, setCancellingId] = useState(null);
  const pendingCount = invitations.filter((invitation) => invitation.status === 'pending').length;
  const acceptedCount = invitations.filter((invitation) => invitation.status === 'accepted').length;
  const handleCancel = async (invitation) => {
    if (!invitation?.id || cancellingId) return;
    setCancellingId(invitation.id);
    try {
      await cancelAcademyInvitationById(invitation.id);
      showToast('초대를 취소했어요.');
    } catch (err) {
      showToast(err?.message ?? '초대 취소에 실패했어요.', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="보낸 초대 현황"
      footer={(
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-[#F2F4F6] py-3.5 text-sm font-bold text-[#333D4B]"
        >
          확인
        </button>
      )}
    >
      <div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-amber-50 px-4 py-3">
            <p className="text-[11px] font-bold text-amber-700">수락 대기</p>
            <p className="mt-1 text-xl font-extrabold text-amber-700">{pendingCount}명</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3">
            <p className="text-[11px] font-bold text-emerald-700">수락 완료</p>
            <p className="mt-1 text-xl font-extrabold text-emerald-700">{acceptedCount}명</p>
          </div>
        </div>

        <div className="mt-4 flex items-center">
          <p className="text-xs font-bold text-[#6B7684]">최근 초대</p>
        </div>

        {invitations.length === 0 ? (
          <div className="mt-3 rounded-2xl bg-[#F8FAFC] px-4 py-8 text-center">
            <Mail size={18} className="mx-auto text-[#B0B8C1]" />
            <p className="mt-2 text-sm font-bold text-[#6B7684]">보낸 초대가 없어요.</p>
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {invitations.map((invitation) => {
              const meta = INVITATION_STATUS_META[invitation.status]
                || INVITATION_STATUS_META.canceled;
              const statusTime = invitation.status === 'pending'
                ? invitation.created_at
                : invitation.updated_at;
              return (
                <div
                  key={invitation.id}
                  className="rounded-2xl border border-[#E5E8EB] bg-white px-3.5 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-[#191F28]">
                        {invitation.email}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-[#8B95A1]">
                        {invitation.job_title || STAFF_ROLE_LABELS[invitation.role] || '직원'}
                        {statusTime ? ` · ${formatInvitationDate(statusTime)}` : ''}
                      </p>
                    </div>
                    <span className={`flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${meta.tone}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#6B7684]">
                    {meta.description}
                  </p>
                  {invitation.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleCancel(invitation)}
                      disabled={Boolean(cancellingId)}
                      className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600 disabled:opacity-50"
                    >
                      {cancellingId === invitation.id ? '취소 중…' : '초대 취소'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-3 text-[10px] leading-relaxed text-[#8B95A1]">
          상대방이 앱에서 수락하면 완료 상태가 자동으로 반영돼요.
        </p>
      </div>
    </Modal>
  );
}

// ─── 직원 카드 ────────────────────────────────────────────────────
function StaffRosterCard({ item, active, summary, onClick }) {
  const staff = item.staff;
  const isOwner = staff._role === 'owner';
  const weekHours = formatShiftHoursFromMinutes(summary?.weekGrossMin ?? summary?.weekMin ?? 0);
  const netWeekHours = formatShiftHoursFromMinutes(summary?.weekMin || 0);
  const hasShift = summary?.hasShift;
  const statusBadge = isOwner
    ? { label: '전체 권한', tone: 'bg-blue-50 text-blue-700' }
    : !hasShift
    ? { label: '근무 미설정', tone: 'bg-amber-50 text-amber-700' }
    : { label: '근무 설정', tone: 'bg-emerald-50 text-emerald-700' };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-left rounded-2xl px-3 py-3 bg-white transition-colors ${
        active ? 'text-[#3182F6]' : 'text-[#191F28] active:bg-[#F8F9FA]'
      }`}
    >
      {active && (
        <span className="hidden md:block absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-[#3182F6]" />
      )}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 bg-blue-50 text-[#3182F6]">
          {(staff.name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold truncate ${active ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
            {staff.name || '(이름 없음)'}
          </p>
          <p className="text-[11px] mt-0.5 text-[#8B95A1]">
            {getStaffJobTitle(staff)}
            {staff._isCurrentUser ? ' · 나' : ''}
            {!isOwner ? ` · 이번 주 ${weekHours}시간` : ''}
            {!isOwner && summary?.weekBreakMin > 0 ? ` · 휴게 제외 ${netWeekHours}시간` : ''}
          </p>
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusBadge.tone}`}>
          {statusBadge.label}
        </span>
      </div>
    </button>
  );
}

function OwnerMemberDetailPanel({ staff, onBack }) {
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="md:hidden flex items-center gap-1 text-sm font-semibold text-[#4E5968]"
      >
        <ChevronLeft size={16} /> 목록으로
      </button>
      <div className="rounded-2xl bg-white p-4 shadow-sm md:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-base font-bold text-[#3182F6]">
            {(staff.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-lg font-bold text-[#191F28]">
                {staff.name || '학원 원장'}
              </p>
              {staff._isCurrentUser && (
                <span className="rounded-full bg-[#F2F4F6] px-2 py-1 text-[10px] font-bold text-[#6B7684]">
                  나
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-[#8B95A1]">
              {staff.email || staff.phone || '원장 계정'}
              {staff.email && staff.phone ? ` · ${staff.phone}` : ''}
            </p>
            <span className="mt-3 inline-flex rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700">
              원장
            </span>
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-[#3182F6]" />
          <p className="text-sm font-bold text-[#191F28]">권한</p>
        </div>
        <p className="mt-3 text-sm font-bold text-[#191F28]">모든 학원 관리 권한</p>
        <p className="mt-1 text-xs leading-5 text-[#8B95A1]">
          원장 권한은 학원 소유권과 연결되어 있어 직원 권한 화면에서 변경할 수 없어요.
        </p>
      </div>
    </div>
  );
}

// ─── 빈 상세 패널 ──────────────────────────────────────────────────
function EmptyDetailPanel({ onAdd }) {
  return (
    <div className="bg-white rounded-2xl p-8 md:p-10 shadow-sm text-center">
      <UsersIcon size={22} className="text-gray-300 mx-auto mb-2" />
      <p className="text-sm font-semibold text-[#191F28]">등록된 직원이 없어요.</p>
      <p className="text-xs text-[#8B95A1] mt-1 mb-4">선생님을 초대해보세요.</p>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="px-4 py-2.5 rounded-xl bg-[#0064FF] text-white text-sm font-bold active:bg-[#0050CC]"
        >
          + 직원 초대
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 직원 상세 패널 (sub-tabs: 근무/계약/권한)
// ═══════════════════════════════════════════════════════════════════
function StaffDetailPanel({
  staff,
  summary,
  onBack,
  canManageAccess = false,
  canManageSensitiveAccess = false,
  canManageWork = false,
  canRemoveMember = false,
  onRemoved,
}) {
  const [subTab, setSubTab] = useState('shift');
  const isAssistant = false;
  const staffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const loadAcademyMemberProfiles = useWorkspaceStore((s) => s.loadAcademyMemberProfiles);
  const loadAcademyStaffProfiles = useWorkspaceStore((s) => s.loadAcademyStaffProfiles);
  const changeLocalStaffRole = useAcademyStore((s) => s.changeLocalStaffRole);
  const showToast = useAcademyStore((s) => s.showToast);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademy = memberships.find(
    (membership) => membership.academy_id === currentAcademyId,
  )?.academy;
  const jobTitlePermissions = normalizeJobTitlePermissions(
    currentAcademy?.job_title_permissions,
  );
  const serverProfile = useMemo(
    () => staff.serverUserId ? staffProfiles.find((p) => p.user_id === staff.serverUserId) : null,
    [staffProfiles, staff.serverUserId],
  );
  const [jobTitleEditing, setJobTitleEditing] = useState(false);
  const [jobTitleDraft, setJobTitleDraft] = useState(
    serverProfile?.job_title || getStaffJobTitle(staff),
  );
  const [jobTitleSaving, setJobTitleSaving] = useState(false);
  const titlePolicy = getJobTitlePolicy(
    jobTitlePermissions,
    serverProfile?.job_title || getStaffJobTitle(staff),
    staff._role,
  );
  const targetPermissions = resolvePermissions(
    staff._role,
    serverProfile?.permissions || staff.permissions || {},
    titlePolicy.permissions,
  );
  const targetHasDelegatedAccess = [...OWNER_DELEGATED_PERMISSION_KEYS]
    .some((key) => targetPermissions[key]);
  const targetIsProtected = staff._isCurrentUser
    || (targetHasDelegatedAccess && !canManageSensitiveAccess);
  const canEditJobTitle = canManageAccess && !targetIsProtected;
  const canRemoveTarget = canRemoveMember && !targetIsProtected;
  const detailTabs = useMemo(
    () => (canManageWork
      ? SUB_TABS
      : SUB_TABS.filter((tab) => tab.id === 'permission')),
    [canManageWork],
  );
  const deactivateLocalStaff = useAcademyStore((s) => s.deactivateLocalStaff);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeLastWorkDate, setRemoveLastWorkDate] = useState(todayDate());

  useEffect(() => {
    setJobTitleDraft(serverProfile?.job_title || getStaffJobTitle(staff));
    setJobTitleEditing(false);
    setRemoveLastWorkDate(todayDate());
  }, [staff?.id, staff?._role, staff?.jobTitle, serverProfile?.job_title]);

  useEffect(() => {
    if (!detailTabs.some((tab) => tab.id === subTab)) {
      setSubTab(detailTabs[0]?.id || 'permission');
    }
  }, [detailTabs, subTab]);

  const handleJobTitleSave = async () => {
    const nextTitle = jobTitleDraft.trim();
    if (!nextTitle) {
      showToast('직책을 입력해주세요.', 'error');
      return;
    }
    if (nextTitle.length > 40) {
      showToast('직책은 40자 이내로 입력해주세요.', 'error');
      return;
    }
    if (!canEditJobTitle || !staff.serverUserId) {
      showToast('계정 연결이 완료된 직원만 직책을 저장할 수 있어요.', 'error');
      return;
    }
    setJobTitleSaving(true);
    const previousRole = staff._role;
    try {
      const nextPolicy = getJobTitlePolicy(jobTitlePermissions, nextTitle, staff._role);
      await manageAcademyStaffAccess({
        academyId: currentAcademyId,
        userId: staff.serverUserId,
        jobTitle: nextTitle,
        // 직책을 바꾸면 이전 직책의 개인 예외가 새 직책에 섞이지 않게 초기화한다.
        permissions: nextTitle === (serverProfile?.job_title || getStaffJobTitle(staff))
          ? (serverProfile?.permissions || staff.permissions || {})
          : {},
      });
      await Promise.all([
        loadAcademyMemberProfiles?.(),
        loadAcademyStaffProfiles?.(),
      ]);
      if (nextPolicy.role !== previousRole) {
        changeLocalStaffRole?.(
          staff.id,
          staff._sourceRole || previousRole,
          nextPolicy.role,
          { source: staff.source || 'server' },
        );
      }
      showToast('직책을 변경했어요.');
      setJobTitleEditing(false);
    } catch (err) {
      await Promise.allSettled([
        loadAcademyMemberProfiles?.(),
        loadAcademyStaffProfiles?.(),
      ]);
      showToast(err?.message ?? '직책 저장에 실패했어요.', 'error');
    } finally {
      setJobTitleSaving(false);
    }
  };

  const handleRemoveMember = async () => {
    if (removing || !canRemoveTarget || !staff.serverUserId) return;
    setRemoving(true);
    try {
      const result = await removeAcademyMember({
        academyId: currentAcademyId,
        userId: staff.serverUserId,
        lastWorkDate: removeLastWorkDate,
      });
      deactivateLocalStaff?.(staff.id, staff._sourceRole || staff._role);
      await Promise.all([
        loadAcademyMemberProfiles?.(),
        loadAcademyStaffProfiles?.(),
      ]);
      const assignedCount = Number(result?.assigned_class_count) || 0;
      const openLogCount = Number(result?.exit_payroll?.open_log_count) || 0;
      showToast(openLogCount > 0
        ? `직원을 내보냈어요. 미퇴근 기록 ${openLogCount}건은 최종 급여 전에 확인이 필요해요.`
        : assignedCount > 0
          ? `직원을 내보냈어요. 담당 반 ${assignedCount}개는 새 선생님을 지정해주세요.`
          : '직원을 내보냈고 퇴사 월 급여 초안을 보존했어요.');
      setRemoveConfirmOpen(false);
      onRemoved?.();
    } catch (error) {
      showToast(error?.message || '직원을 내보내지 못했어요.', 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="md:hidden flex items-center gap-1 text-sm font-semibold text-[#4E5968]"
      >
        <ChevronLeft size={16} /> 목록으로
      </button>

      {/* 헤더 카드 */}
      <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 ${
            isAssistant ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-[#3182F6]'
          }`}>
            {(staff.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-[#191F28] truncate">{staff.name || '(이름 없음)'}</p>
            <p className="text-xs text-[#8B95A1] mt-0.5 truncate">
              {staff.email || staff.phone ? '' : STAFF_ROLE_LABELS[staff._role]}
              {staff.email ? staff.email : ''}
              {staff.phone ? ` · ${staff.phone}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-[#8B95A1]">직책</span>
              {jobTitleEditing ? (
                <>
                  <select
                    value={jobTitleDraft}
                    onChange={(event) => setJobTitleDraft(event.target.value)}
                    disabled={jobTitleSaving}
                    className="h-8 min-w-32 rounded-lg border border-[#E5E8EB] bg-white px-2 text-xs font-bold text-[#191F28] focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {!jobTitlePermissions[jobTitleDraft] && jobTitleDraft && (
                      <option value={jobTitleDraft}>{jobTitleDraft} (기존)</option>
                    )}
                    {Object.keys(jobTitlePermissions).map((title) => (
                      <option key={title} value={title}>{title}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleJobTitleSave}
                    disabled={jobTitleSaving}
                    className="flex h-8 items-center gap-1 rounded-lg bg-[#3182F6] px-2.5 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {jobTitleSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setJobTitleDraft(serverProfile?.job_title || getStaffJobTitle(staff));
                      setJobTitleEditing(false);
                    }}
                    disabled={jobTitleSaving}
                    className="h-8 rounded-lg bg-[#F2F4F6] px-2.5 text-xs font-bold text-[#4E5968] disabled:opacity-60"
                  >
                    취소
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setJobTitleEditing(true)}
                  disabled={!canEditJobTitle}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-[#F2F4F6] px-2.5 text-xs font-bold text-[#333D4B] disabled:cursor-default"
                >
                  {serverProfile?.job_title || getStaffJobTitle(staff)}
                  {canEditJobTitle && <Pencil size={11} />}
                </button>
              )}
            </div>
          </div>
        </div>
        {summary && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <SummaryStat
              label="이번 주 근무"
              value={`${formatShiftHoursFromMinutes(summary.weekGrossMin ?? summary.weekMin)}h`}
              hint={summary.weekBreakMin > 0
                ? `휴게 ${formatShiftHoursFromMinutes(summary.weekBreakMin)}h 제외 시 ${formatShiftHoursFromMinutes(summary.weekMin)}h`
                : '휴게 없음'}
            />
            <SummaryStat label="이번 달" value={`${formatShiftHoursFromMinutes(summary.monthMin)}h`} />
            <SummaryStat label="오늘 근무" value={`${summary.todayCount}건`} />
          </div>
        )}
      </div>

      {/* sub-tabs */}
      <div className="bg-white rounded-2xl p-1 shadow-sm flex gap-1">
        {detailTabs.map((tab) => {
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-colors ${
                active ? 'bg-[#F2F4F6] text-[#3182F6]' : 'text-[#8B95A1]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* sub-tab 본문 */}
      {subTab === 'shift' && canManageWork && <StaffShiftSection staff={staff} />}
      {subTab === 'contract'   && <PayrollLockedPanel />}
      {subTab === 'permission' && <StaffPermissionSection
        staff={staff}
        canEdit={canManageAccess && !targetIsProtected}
        canEditSensitive={canManageSensitiveAccess}
      />}

      {canRemoveTarget && (
        <div className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm md:p-5">
          <p className="text-sm font-bold text-[#191F28]">직원 관리</p>
          <p className="mt-1 text-xs leading-5 text-[#8B95A1]">
            내보내면 이 학원의 데이터 접근 권한과 반복 근무 일정이 즉시 종료돼요.
          </p>
          <button
            type="button"
            onClick={() => setRemoveConfirmOpen(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-3 text-sm font-bold text-red-600 active:bg-red-100"
          >
            <UserMinus size={16} /> 학원에서 내보내기
          </button>
        </div>
      )}

      {removeConfirmOpen && (
        <Modal
          isOpen
          onClose={removing ? undefined : () => setRemoveConfirmOpen(false)}
          title="직원을 내보낼까요?"
          footer={(
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRemoveConfirmOpen(false)}
                disabled={removing}
                className="rounded-2xl bg-[#F2F4F6] py-3.5 text-sm font-bold text-[#4E5968] disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleRemoveMember}
                disabled={removing}
                className="flex items-center justify-center gap-2 rounded-2xl bg-red-500 py-3.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {removing && <Loader2 size={15} className="animate-spin" />}
                내보내기
              </button>
            </div>
          )}
        >
          <div className="space-y-3">
            <p className="text-base font-extrabold text-[#191F28]">{staff.name || '이 직원'}</p>
            <p className="text-sm leading-6 text-[#6B7684]">
              과거 수업·클리닉·근무 기록은 그대로 보존돼요. 현재 담당 반은 자동으로
              다른 선생님에게 넘어가지 않으니 내보낸 뒤 담당자를 확인해주세요.
            </p>
            <label className="block rounded-2xl bg-[#F7F8FA] p-4">
              <span className="mb-2 block text-xs font-bold text-[#4E5968]">마지막 근무일</span>
              <input
                type="date"
                value={removeLastWorkDate}
                max={todayDate()}
                onChange={(event) => setRemoveLastWorkDate(event.target.value)}
                className="h-11 w-full rounded-xl border border-[#D1D6DB] bg-white px-3 text-sm font-bold text-[#191F28] outline-none focus:border-[#3182F6]"
              />
              <span className="mt-2 block text-[11px] leading-5 text-[#8B95A1]">
                이 날짜까지의 근퇴 기록으로 검토 대기 상태의 최종 급여 초안을 남겨요.
              </span>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryStat({ label, value, hint }) {
  return (
    <div className="bg-[#F8F9FA] rounded-xl px-3 py-2.5 text-center">
      <p className="text-base font-extrabold text-[#191F28]">{value}</p>
      <p className="text-[11px] text-[#8B95A1] mt-0.5">{label}</p>
      {hint && <p className="text-[10px] text-[#8B95A1] mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

function PayrollLockedPanel() {
  return (
    <div className="rounded-2xl border border-[#E5E8EB] bg-white px-5 py-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F2F4F6] text-[#8B95A1]">
        <Clock size={21} />
      </div>
      <p className="mt-4 text-base font-extrabold text-[#191F28]">급여 기능을 준비하고 있어요</p>
      <p className="mt-1 text-sm leading-6 text-[#8B95A1]">
        근무 기록과 급여 계산을 충분히 검증한 뒤 제공할 예정이에요.
      </p>
      <span className="mt-4 inline-flex rounded-full bg-[#F2F4F6] px-3 py-1 text-xs font-bold text-[#6B7684]">
        파일럿 이후 제공 예정
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sub-tab: 근무 (Shift)
// ═══════════════════════════════════════════════════════════════════
function StaffShiftSection({ staff }) {
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const addAcademyStaffShift = useAcademyStore((s) => s.addAcademyStaffShift);
  const updateAcademyStaffShift = useAcademyStore((s) => s.updateAcademyStaffShift);
  const deleteAcademyStaffShift = useAcademyStore((s) => s.deleteAcademyStaffShift);
  const setStaffShiftServerId = useAcademyStore((s) => s.setStaffShiftServerId);
  const showToast = useAcademyStore((s) => s.showToast);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerStaffShifts = useWorkspaceStore((s) => s.loadServerStaffShifts);
  const loadStaffWorkRules = useWorkspaceStore((s) => s.loadStaffWorkRules);
  const loadStaffWorkExceptions = useWorkspaceStore((s) => s.loadStaffWorkExceptions);
  const createStaffWorkExceptionLocal = useWorkspaceStore((s) => s.createStaffWorkExceptionLocal);
  const updateStaffWorkExceptionLocal = useWorkspaceStore((s) => s.updateStaffWorkExceptionLocal);
  const deleteStaffWorkExceptionLocal = useWorkspaceStore((s) => s.deleteStaffWorkExceptionLocal);
  const classSessions = useAcademyStore((s) => s.classSessions) ?? [];
  const classGroups = useAcademyStore((s) => s.classGroups) ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [defaultMode, setDefaultMode] = useState('recurring');
  const [defaultDate, setDefaultDate] = useState(null);
  const [recurringPreset, setRecurringPreset] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [weekAnchor, setWeekAnchor] = useState(todayDate());
  const [calendarMode, setCalendarMode] = useState('month');
  const [exceptionTarget, setExceptionTarget] = useState(null);

  const todayStr = todayDate();
  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);
  const monthFrom = monthStart(selectedMonth);
  const monthTo = monthEnd(selectedMonth);
  const rangeFrom = minYMD(monthFrom, weekDates[0]);
  const rangeTo = maxYMD(monthTo, weekDates[6]);
  const monthDates = useMemo(
    () => getMonthDates(monthFrom).filter(Boolean),
    [monthFrom],
  );
  const monthCalendarDates = useMemo(
    () => getMonthDates(monthFrom),
    [monthFrom],
  );
  const calendarDataDates = useMemo(
    () => Array.from(new Set([...monthDates, ...weekDates])).filter(Boolean),
    [monthDates, weekDates],
  );

  useEffect(() => {
    if (!rangeFrom || !rangeTo) return;
    loadStaffWorkExceptions?.({ fromDate: rangeFrom, toDate: rangeTo });
  }, [loadStaffWorkExceptions, rangeFrom, rangeTo]);

  // Phase 44.6 / Phase B — 룰 기반 planned + 기존 shift 머지. 14일 너머 주간 패턴도
  // 보이게. 본인 staff 한 명에 한정.
  const staffWorkRules = useWorkspaceStore((s) => s.staffWorkRules) ?? [];
  const staffWorkExceptions = useWorkspaceStore((s) => s.staffWorkExceptions) ?? [];
  const academyTeachersAll = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistantsAll = useAcademyStore((s) => s.academyAssistants) ?? [];

  const staffShifts = useMemo(() => {
    const plannedRaw = buildPlannedStaffSchedule({
      rules: staffWorkRules,
      exceptions: staffWorkExceptions,
      fromDate: rangeFrom,
      toDate: rangeTo,
      staffUserId: staff.serverUserId || undefined,
    });
    const plannedShaped = plannedToStaffShiftShape(plannedRaw, {
      academyTeachers: academyTeachersAll,
      academyAssistants: academyAssistantsAll,
    });
    const actualForStaff = academyStaffShifts.filter((sh) => sh.staffId === staff.id);
    return mergePlannedAndActualStaffShifts(plannedShaped, actualForStaff);
  }, [academyStaffShifts, staff.id, staff.serverUserId, staffWorkRules, staffWorkExceptions, academyTeachersAll, academyAssistantsAll, rangeFrom, rangeTo]);
  const hasAnyShift = staffShifts.some((sh) => sh.status !== 'canceled');

  const monthByDate = useMemo(() => {
    const map = new Map();
    calendarDataDates.forEach((d) => map.set(d, []));
    for (const sh of staffShifts) {
      if (!sh.date || !map.has(sh.date)) continue;
      if (sh.status === 'canceled') continue;
      map.get(sh.date).push(sh);
    }
    for (const d of calendarDataDates) {
      map.get(d).sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''));
    }
    return map;
  }, [staffShifts, calendarDataDates]);

  const monthWorkSummary = useMemo(() => {
    let grossMin = 0;
    let netMin = 0;
    let count = 0;
    let exceptionCount = 0;
    for (const sh of staffShifts) {
      if (sh.status === 'canceled') continue;
      if (!sh.date?.startsWith(selectedMonth)) continue;
      count += 1;
      grossMin += scheduledShiftGrossMinutes(sh);
      netMin += scheduledShiftMinutes(sh);
      if (isPlannedShiftException(sh)) exceptionCount += 1;
    }
    return {
      grossMin,
      netMin,
      breakMin: Math.max(0, grossMin - netMin),
      count,
      exceptionCount,
    };
  }, [staffShifts, selectedMonth]);

  const classGroupById = useMemo(
    () => new Map((classGroups || []).map((group) => [group.id, group])),
    [classGroups],
  );
  const classesByDate = useMemo(() => {
    const map = new Map();
    calendarDataDates.forEach((d) => map.set(d, []));
    for (const session of classSessions || []) {
      if (!session.date || !map.has(session.date) || session.status === 'canceled') continue;
      const isAssigned = staff._role === 'assistant'
        ? false
        : ((session.teacherId === staff.id && !session.substituteTeacherId) || session.substituteTeacherId === staff.id);
      if (!isAssigned) continue;
      map.get(session.date).push(session);
    }
    for (const d of calendarDataDates) {
      map.get(d).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    }
    return map;
  }, [classSessions, staff.id, staff._role, calendarDataDates]);

  const buildRecurringPreset = (sourceShift = null) => {
    const staffRules = (staffWorkRules || []).filter((rule) =>
      rule.is_active && rule.staff_user_id === staff.serverUserId
    );
    const sourceRuleId = getRuleIdFromPlannedShift(sourceShift);
    const sourceRule = sourceRuleId
      ? staffRules.find((rule) => rule.id === sourceRuleId)
      : null;
    const presetFromRules = (rules = []) => {
      if (rules.length === 0) return null;
      const first = rules[0];
      return {
        weekdays: rules
          .map((rule) => DOW_TO_KO[rule.day_of_week])
          .filter(Boolean)
          .sort((a, b) => KOREAN_WEEKDAYS.indexOf(a) - KOREAN_WEEKDAYS.indexOf(b)),
        scheduledStartTime: (first.start_time || '').slice(0, 5),
        scheduledEndTime: (first.end_time || '').slice(0, 5),
        breakMinutes: first.break_minutes ? String(first.break_minutes) : '',
      };
    };
    const alternatingRules = staffRules.filter(
      (rule) => Number(rule.repeat_interval_weeks) === 2,
    );
    if (
      alternatingRules.length > 0
      && (!sourceRule || Number(sourceRule.repeat_interval_weeks) === 2)
    ) {
      const weekARules = alternatingRules.filter(
        (rule) => Number(rule.rotation_week_index || 0) === 0,
      );
      const weekBRules = alternatingRules.filter(
        (rule) => Number(rule.rotation_week_index || 0) === 1,
      );
      const anchorRule = weekARules[0] || weekBRules[0];
      const commonStartDate = weekARules[0]?.effective_start_date
        || (weekBRules[0]?.effective_start_date
          ? addDaysYMD(weekBRules[0].effective_start_date, -7)
          : todayStr);
      return {
        ...(presetFromRules(weekARules) || {
          weekdays: [],
          scheduledStartTime: '',
          scheduledEndTime: '',
          breakMinutes: '',
        }),
        startDate: commonStartDate,
        endDate: anchorRule?.effective_end_date || '',
        repeatIntervalWeeks: 2,
        alternateWeek: presetFromRules(weekBRules) || {
          weekdays: [],
          scheduledStartTime: '',
          scheduledEndTime: '',
          breakMinutes: '',
        },
        memo: anchorRule?.memo || '',
      };
    }
    const keyOfRule = (rule) => [
      (rule.start_time || '').slice(0, 5),
      (rule.end_time || '').slice(0, 5),
      Number(rule.break_minutes || 0),
      rule.effective_start_date || '',
      rule.effective_end_date || '',
      Number(rule.repeat_interval_weeks) === 2 ? 2 : 1,
      rule.memo || '',
    ].join('__');
    const targetKey = sourceRule ? keyOfRule(sourceRule) : null;
    const groups = new Map();
    for (const rule of staffRules) {
      const key = keyOfRule(rule);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(rule);
    }
    const pickedRules = targetKey && groups.has(targetKey)
      ? groups.get(targetKey)
      : [...groups.values()].sort((a, b) => b.length - a.length)[0];

    if (pickedRules?.length) {
      const first = pickedRules[0];
      const weekdays = pickedRules
        .map((rule) => DOW_TO_KO[rule.day_of_week])
        .filter(Boolean)
        .sort((a, b) => KOREAN_WEEKDAYS.indexOf(a) - KOREAN_WEEKDAYS.indexOf(b));
      return {
        weekdays,
        startDate: first.effective_start_date || todayStr,
        endDate: first.effective_end_date || '',
        repeatIntervalWeeks: Number(first.repeat_interval_weeks) === 2 ? 2 : 1,
        scheduledStartTime: (first.start_time || '').slice(0, 5),
        scheduledEndTime: (first.end_time || '').slice(0, 5),
        breakMinutes: first.break_minutes ? String(first.break_minutes) : '',
        alternateWeek: {
          weekdays: [],
          scheduledStartTime: '',
          scheduledEndTime: '',
          breakMinutes: '',
        },
        memo: first.memo || '',
      };
    }

    if (sourceShift) {
      return {
        weekdays: [getKoreanWeekdayFromYMD(sourceShift.date)].filter(Boolean),
        startDate: sourceShift.date || todayStr,
        endDate: '',
        repeatIntervalWeeks: 1,
        scheduledStartTime: sourceShift.scheduledStartTime || '',
        scheduledEndTime: sourceShift.scheduledEndTime || '',
        breakMinutes: sourceShift.breakMinutes ? String(sourceShift.breakMinutes) : '',
        alternateWeek: {
          weekdays: [],
          scheduledStartTime: '',
          scheduledEndTime: '',
          breakMinutes: '',
        },
        memo: sourceShift.memo || '',
      };
    }

    return null;
  };

  const openManageShifts = (sourceShift = null) => {
    setEditing(null);
    setDefaultMode('recurring');
    setDefaultDate(sourceShift?.date || todayStr);
    setRecurringPreset(buildRecurringPreset(sourceShift));
    setFormOpen(true);
  };
  const getRuleIdFromPlannedShift = (shift) => {
    if (!shift?.isPlanned) return null;
    if (shift.ruleId) return shift.ruleId;
    const parts = String(shift.id || '').split(':');
    return parts[0] === 'rule' ? parts[1] : null;
  };

  const handleSaveRecurring = async (data) => {
    const isAlternating = Number(data.repeatIntervalWeeks) === 2;
    const weekATimeError = validateShiftTime({
      startTime: data.scheduledStartTime,
      endTime: data.scheduledEndTime,
      breakMinutes: data.breakMinutes,
    });
    if (weekATimeError) { showToast(`A주: ${weekATimeError}`, 'error'); return; }
    const weekBHasDays = isAlternating && (data.alternateWeek?.weekdays || []).length > 0;
    const weekBTimeError = weekBHasDays
      ? validateShiftTime({
        startTime: data.alternateWeek?.scheduledStartTime,
        endTime: data.alternateWeek?.scheduledEndTime,
        breakMinutes: data.alternateWeek?.breakMinutes,
      })
      : '';
    if (weekBTimeError) { showToast(`B주: ${weekBTimeError}`, 'error'); return; }
    const daysOfWeek = (data.weekdays || []).map((d) => KO_TO_DOW[d]).filter((d) => d !== undefined);
    const alternateDaysOfWeek = (data.alternateWeek?.weekdays || [])
      .map((d) => KO_TO_DOW[d])
      .filter((d) => d !== undefined);
    if (daysOfWeek.length === 0) return;
    const selectedDowSet = new Set([...daysOfWeek, ...alternateDaysOfWeek]);
    const overlappingRules = (staffWorkRules || []).filter((rule) =>
      rule.is_active
      && rule.staff_user_id === staff.serverUserId
      && (isAlternating || selectedDowSet.has(rule.day_of_week))
    );
    const shouldReplaceShift = (shift) => {
      if (!shift || shift.status !== 'scheduled') return false;
      if (shift.actualStartTime || shift.actualEndTime) return false;
      if (!(shift.staffId === staff.id || shift.staffUserId === staff.serverUserId)) return false;
      if (!shift.date || shift.date < data.startDate) return false;
      if (data.endDate && shift.date > data.endDate) return false;
      const dow = KO_TO_DOW[getKoreanWeekdayFromYMD(shift.date)];
      if (!isAlternating && !selectedDowSet.has(dow)) return false;
      return overlappingRules.some((rule) =>
        rule.day_of_week === dow
        && (rule.start_time || '').slice(0, 5) === (shift.scheduledStartTime || '').slice(0, 5)
        && (rule.end_time || '').slice(0, 5) === (shift.scheduledEndTime || '').slice(0, 5)
        && Number(rule.break_minutes || 0) === Number(shift.breakMinutes || 0)
      );
    };
    const shiftsToReplace = overlappingRules.length > 0
      ? academyStaffShifts.filter(shouldReplaceShift)
      : [];
    const replaceIds = new Set(shiftsToReplace.map((shift) => shift.id));
    for (const shift of shiftsToReplace) {
      deleteAcademyStaffShift(shift.id);
      if (shift.serverId && isAuthenticated && currentAcademyId) {
        try { await deleteServerStaffShift(shift.serverId); }
        catch (err) { console.warn('[supabase] delete replaced recurring shift failed', err); }
      }
    }
    const commonSaveOptions = {
      academyId: isAuthenticated ? currentAcademyId : null,
      staff,
      effectiveStartDate: data.startDate,
      effectiveEndDate: data.endDate || null,
      memo: data.memo,
      todayYMD: todayStr,
      existingRules: staffWorkRules,
      existingShifts: academyStaffShifts.filter((shift) => !replaceIds.has(shift.id)),
      addLocalShift: addAcademyStaffShift,
      setLocalShiftServerId: setStaffShiftServerId,
    };
    const result = isAlternating
      ? await saveAlternatingStaffWorkSchedule({
        ...commonSaveOptions,
        weekA: {
          weekdays: daysOfWeek,
          startTime: data.scheduledStartTime,
          endTime: data.scheduledEndTime,
          breakMinutes: data.breakMinutes,
        },
        weekB: {
          weekdays: alternateDaysOfWeek,
          startTime: data.alternateWeek?.scheduledStartTime,
          endTime: data.alternateWeek?.scheduledEndTime,
          breakMinutes: data.alternateWeek?.breakMinutes,
        },
      })
      : await saveRecurringStaffWorkSchedule({
        ...commonSaveOptions,
        weekdays: daysOfWeek,
        startTime: data.scheduledStartTime,
        endTime: data.scheduledEndTime,
        breakMinutes: data.breakMinutes,
        repeatIntervalWeeks: 1,
      });
    if (staff.serverUserId && isAuthenticated && currentAcademyId) {
      loadServerStaffShifts();
      loadStaffWorkRules?.();
    }

    setFormOpen(false);
    if (result.shiftsCreated === 0 && result.rulesCreated === 0) {
      showToast(`이미 등록된 ${result.shiftsSkipped}건이라 추가하지 않았어요.`, 'error');
    } else {
      showToast('근무표가 저장됐어요.');
    }
  };

  const handleSaveSingle = async (data) => {
    const timeError = validateShiftTime({
      startTime: data.scheduledStartTime,
      endTime: data.scheduledEndTime,
      breakMinutes: data.breakMinutes,
    });
    if (timeError) { showToast(timeError, 'error'); return; }
    if (editing) {
      updateAcademyStaffShift(editing.id, {
        date: data.date,
        scheduledStartTime: data.scheduledStartTime || '',
        scheduledEndTime: data.scheduledEndTime || '',
        breakMinutes: Number(data.breakMinutes) || 0,
        memo: data.memo || '',
        status: data.status || editing.status,
      });
      setFormOpen(false);
      if (editing.serverId && isAuthenticated && currentAcademyId) {
        try {
          await updateServerStaffShift(editing.serverId, {
            date: data.date,
            scheduled_start_time: data.scheduledStartTime || null,
            scheduled_end_time: data.scheduledEndTime || null,
            break_minutes: Number(data.breakMinutes) || 0,
            memo: data.memo || null,
            status: data.status || editing.status,
          });
        } catch (err) {
          console.warn('[supabase] update shift failed', err);
        }
      }
      return;
    }
    const created = addAcademyStaffShift({
      staffId: staff.id,
      staffRole: staff._role,
      date: data.date,
      scheduledStartTime: data.scheduledStartTime || '',
      scheduledEndTime: data.scheduledEndTime || '',
      breakMinutes: Number(data.breakMinutes) || 0,
      memo: data.memo || '',
      status: 'scheduled',
    });
    setFormOpen(false);
    if (staff.serverUserId && isAuthenticated && currentAcademyId) {
      try {
        const sr = await createAcademyStaffShift({
          academyId: currentAcademyId,
          staff_user_id: staff.serverUserId,
          staff_role: staff._role,
          date: data.date,
          scheduled_start_time: data.scheduledStartTime || null,
          scheduled_end_time: data.scheduledEndTime || null,
          break_minutes: Number(data.breakMinutes) || 0,
          status: 'scheduled',
          memo: data.memo || null,
        });
        if (sr?.id) setStaffShiftServerId(created.id, sr.id);
        loadServerStaffShifts();
      } catch (err) {
        console.warn('[supabase] create shift failed', err);
      }
    }
  };

  const handleSaveException = async (data) => {
    if (!staff.serverUserId) {
      showToast('서버 계정과 연결된 직원만 월별 예외를 저장할 수 있어요.', 'error');
      return;
    }
    const exceptionId = data.exceptionId || exceptionTarget?.shift?.exceptionId || exceptionTarget?.exceptionId || null;
    if (data.type === 'reset') {
      if (exceptionId) {
        await deleteStaffWorkExceptionLocal?.(exceptionId);
        await loadStaffWorkExceptions?.({ fromDate: monthFrom, toDate: monthTo });
        showToast('이 날짜의 예외를 되돌렸어요.');
      }
      setExceptionTarget(null);
      return;
    }

    if (data.type !== 'cancel') {
      const timeError = validateShiftTime({
        startTime: data.startTime,
        endTime: data.endTime,
        breakMinutes: data.breakMinutes,
      });
      if (timeError) { showToast(timeError, 'error'); return; }
    }

    const payload = {
      staff_user_id: staff.serverUserId,
      date: data.date,
      type: data.type,
      start_time: data.type === 'cancel' ? null : data.startTime,
      end_time: data.type === 'cancel' ? null : data.endTime,
      break_minutes: data.type === 'cancel' ? null : Number(data.breakMinutes) || 0,
      memo: data.memo || null,
    };

    if (exceptionId) await updateStaffWorkExceptionLocal?.(exceptionId, payload);
    else await createStaffWorkExceptionLocal?.(payload);
    await loadStaffWorkExceptions?.({ fromDate: monthFrom, toDate: monthTo });
    showToast('월별 근무 예외가 저장됐어요.');
    setExceptionTarget(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {!hasAnyShift && (
        <div className="bg-blue-50 rounded-2xl p-5">
          <p className="text-sm font-bold text-[#191F28] mb-1">아직 정해진 근무 시간이 없어요</p>
          <p className="text-xs text-[#4E5968] leading-relaxed mb-3">
            수업 배정과 시급 정산을 위해 먼저 주간 근무 시간을 설정해주세요.
          </p>
          <button
            type="button"
            onClick={() => openManageShifts()}
            className="w-full py-3 rounded-xl bg-[#3182F6] text-white text-sm font-bold flex items-center justify-center gap-1.5"
          >
            <Pencil size={14} /> 근무 시간 설정하기
          </button>
        </div>
      )}

      <StaffScheduleCalendar
        selectedMonth={selectedMonth}
        calendarMode={calendarMode}
        monthWorkSummary={monthWorkSummary}
        monthCalendarDates={monthCalendarDates}
        weekDates={weekDates}
        monthByDate={monthByDate}
        classesByDate={classesByDate}
        classGroupById={classGroupById}
        todayStr={todayStr}
        weekAnchor={weekAnchor}
        onPrevPeriod={() => {
          if (calendarMode === 'month') setSelectedMonth((m) => prevMonth(m));
          else setWeekAnchor((d) => addDaysYMD(d, -7));
        }}
        onNextPeriod={() => {
          if (calendarMode === 'month') setSelectedMonth((m) => nextMonth(m));
          else setWeekAnchor((d) => addDaysYMD(d, 7));
        }}
        onCalendarModeChange={setCalendarMode}
        onEditTemplate={() => openManageShifts()}
        onSelectDay={(target) => setExceptionTarget(target)}
      />

      <StaffAssignmentSummary staff={staff} />

      <p className="text-[11px] text-[#8B95A1] leading-relaxed px-1">
        근무표는 배정 가능 시간 확인용이에요. 시급 정산은 저장된 실제 근퇴 기록을 기준으로 계산돼요.
      </p>

      {formOpen && (
        <ShiftFormModal
          initial={editing}
          defaultDate={defaultDate || todayStr}
          defaultMode={defaultMode}
          initialRecurring={recurringPreset}
          onClose={() => { setFormOpen(false); setEditing(null); setRecurringPreset(null); }}
          onSaveSingle={handleSaveSingle}
          onSaveRecurring={handleSaveRecurring}
        />
      )}

      {exceptionTarget && (
        <StaffWorkDayDrawer
          target={exceptionTarget}
          classGroupById={classGroupById}
          onClose={() => setExceptionTarget(null)}
          onSave={handleSaveException}
        />
      )}
    </div>
  );
}

// ─── 단일/반복 근무 폼 모달 ────────────────────────────────────────
function StaffScheduleCalendar({
  selectedMonth,
  calendarMode,
  monthWorkSummary,
  monthCalendarDates,
  weekDates,
  monthByDate,
  classesByDate,
  classGroupById,
  todayStr,
  weekAnchor,
  onPrevPeriod,
  onNextPeriod,
  onCalendarModeChange,
  onEditTemplate,
  onSelectDay,
}) {
  const dates = calendarMode === 'week' ? weekDates : monthCalendarDates;
  const periodLabel = calendarMode === 'month'
    ? formatMonth(selectedMonth)
    : formatWeekOfMonthLabel(weekAnchor);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 md:px-5 py-4 border-b border-[#F2F4F6]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#191F28]">근무 캘린더</p>
            <p className="text-[11px] text-[#8B95A1] mt-0.5">
              날짜를 눌러 이 날만 휴무, 시간 변경, 추가 근무를 처리해요.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onPrevPeriod}
              className="w-9 h-9 rounded-xl bg-[#F2F4F6] text-[#4E5968] flex items-center justify-center"
              aria-label={calendarMode === 'month' ? '이전 달' : '이전 주'}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-[112px] text-center">
              <p className="text-sm font-extrabold text-[#191F28]">{periodLabel}</p>
            </div>
            <button
              type="button"
              onClick={onNextPeriod}
              className="w-9 h-9 rounded-xl bg-[#F2F4F6] text-[#4E5968] flex items-center justify-center"
              aria-label={calendarMode === 'month' ? '다음 달' : '다음 주'}
            >
              <ChevronRight size={16} />
            </button>
            <div className="flex rounded-xl bg-[#F2F4F6] p-1">
              {[
                { id: 'month', label: '월간' },
                { id: 'week', label: '주간' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onCalendarModeChange(item.id)}
                  className={`h-8 px-3 rounded-lg text-xs font-bold ${
                    calendarMode === item.id
                      ? 'bg-white text-[#3182F6] shadow-sm'
                      : 'text-[#8B95A1]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onEditTemplate}
              className="h-9 px-3 rounded-xl bg-blue-50 text-[#3182F6] text-xs font-bold flex items-center gap-1.5"
            >
              <Pencil size={12} /> 기본 일정
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <SummaryStat label="월 근무" value={`${formatShiftHoursFromMinutes(monthWorkSummary.grossMin)}h`} />
          <SummaryStat
            label="급여 기준"
            value={`${formatShiftHoursFromMinutes(monthWorkSummary.netMin)}h`}
            hint={monthWorkSummary.breakMin > 0 ? `휴게 ${formatShiftHoursFromMinutes(monthWorkSummary.breakMin)}h 제외` : '휴게 없음'}
          />
          <SummaryStat label="변경일" value={`${monthWorkSummary.exceptionCount}건`} />
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="w-full">
          <div className="grid grid-cols-7 bg-[#FBFCFD] border-b border-[#F2F4F6]">
            {DOW_TO_KO.map((day) => (
              <div key={day} className="min-w-0 px-1 py-2 text-center text-[10px] font-extrabold text-[#8B95A1] md:px-3 md:text-left md:text-[11px]">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dates.map((date, idx) => {
              if (!date) {
                return <div key={`blank-${idx}`} className="min-w-0 min-h-[92px] border-r border-b border-[#F2F4F6] bg-[#FBFCFD] md:min-h-[120px]" />;
              }
              const shifts = monthByDate.get(date) || [];
              const sessions = classesByDate.get(date) || [];
              return (
                <CalendarCell
                  key={date}
                  date={date}
                  shifts={shifts}
                  sessions={sessions}
                  classGroupById={classGroupById}
                  todayStr={todayStr}
                  onClick={() => onSelectDay({ date, shifts, sessions })}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarCell({ date, shifts, sessions, classGroupById, todayStr, onClick }) {
  const isTodayRow = date === todayStr;
  const hasShift = shifts.length > 0;
  const hasException = shifts.some(isPlannedShiftException);
  const grossMin = shifts.reduce((sum, sh) => sum + scheduledShiftGrossMinutes(sh), 0);
  const netMin = shifts.reduce((sum, sh) => sum + scheduledShiftMinutes(sh), 0);
  const firstShift = shifts[0] || null;
  const uncoveredSessions = sessions.filter((session) =>
    !shifts.some((shift) => {
      const s = hhmmToMin(shift.scheduledStartTime);
      const e = hhmmToMin(shift.scheduledEndTime);
      const ls = hhmmToMin(session.startTime);
      const le = hhmmToMin(session.endTime);
      return s != null && e != null && ls != null && le != null && ls >= s && le <= e;
    })
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 min-h-[92px] overflow-hidden border-r border-b border-[#F2F4F6] p-1.5 text-left transition-colors hover:bg-blue-50/40 md:min-h-[120px] md:p-3 ${
        isTodayRow ? 'bg-blue-50/40' : 'bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-1 md:gap-2">
        <div>
          <p className={`text-xs font-extrabold md:text-sm ${isTodayRow ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
            {Number(date.slice(8))}
          </p>
          <p className="text-[9px] font-semibold text-[#8B95A1] md:text-[10px]">{getKoreanWeekdayFromYMD(date)}</p>
        </div>
        {hasException && (
          <span className="rounded-full bg-amber-100 px-1 py-0.5 text-[8px] font-bold text-amber-700 md:px-2 md:text-[10px]">
            변경
          </span>
        )}
      </div>

      {hasShift ? (
        <div className={`mt-2 rounded-lg px-1.5 py-1.5 md:mt-3 md:rounded-xl md:px-2.5 md:py-2 ${hasException ? 'bg-amber-50 border border-amber-100' : 'bg-blue-50 border border-blue-100'}`}>
          <p className="truncate text-[9px] font-extrabold text-[#191F28] md:text-[11px]">
            {formatShiftTimeRange(firstShift?.scheduledStartTime, firstShift?.scheduledEndTime)}
          </p>
          <p className="mt-0.5 text-[9px] font-semibold text-[#8B95A1] md:text-[10px]">
            근무 {formatShiftHoursFromMinutes(grossMin)}h
            {grossMin !== netMin ? <span className="hidden md:inline">{` · 휴게 제외 ${formatShiftHoursFromMinutes(netMin)}h`}</span> : ''}
          </p>
          {sessions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 md:mt-2">
              {sessions.slice(0, 2).map((session) => {
                const group = classGroupById.get(session.classGroupId);
                return (
                  <span
                    key={session.id}
                    className={`max-w-full truncate rounded-md px-1 py-0.5 text-[8px] font-bold md:px-1.5 md:text-[9px] ${
                      uncoveredSessions.some((s) => s.id === session.id)
                        ? 'bg-red-50 text-red-600'
                        : 'bg-white text-emerald-700'
                    }`}
                  >
                    {group?.name || '수업'} {formatClock(session.startTime)}
                  </span>
                );
              })}
              {sessions.length > 2 && (
                <span className="rounded-md bg-white px-1 py-0.5 text-[8px] font-bold text-[#8B95A1] md:px-1.5 md:text-[9px]">
                  +{sessions.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[9px] font-semibold text-[#B0B8C1] md:mt-4 md:text-[11px]">근무 없음</p>
      )}

      {uncoveredSessions.length > 0 && (
        <p className="mt-1.5 text-[8px] font-bold text-red-500 md:mt-2 md:text-[10px]">
          근무 밖 수업 {uncoveredSessions.length}건
        </p>
      )}
    </button>
  );
}

function StaffWorkDayDrawer({ target, classGroupById, onClose, onSave }) {
  const shifts = target?.shifts || [];
  const sessions = target?.sessions || [];
  const [selectedShiftId, setSelectedShiftId] = useState(shifts[0]?.id || '');
  const selectedShift = shifts.find((shift) => shift.id === selectedShiftId) || shifts[0] || null;
  const [action, setAction] = useState(shifts.length > 0 ? 'summary' : 'extra');
  const [form, setForm] = useState({
    startTime: selectedShift?.scheduledStartTime || '',
    endTime: selectedShift?.scheduledEndTime || '',
    breakMinutes: selectedShift?.breakMinutes ? String(selectedShift.breakMinutes) : '',
    memo: selectedShift?.memo || '',
  });

  useEffect(() => {
    setForm({
      startTime: selectedShift?.scheduledStartTime || '',
      endTime: selectedShift?.scheduledEndTime || '',
      breakMinutes: selectedShift?.breakMinutes ? String(selectedShift.breakMinutes) : '',
      memo: selectedShift?.memo || '',
    });
  }, [selectedShift?.id]);

  const save = () => {
    onSave?.({
      type: action === 'summary' ? 'change' : action,
      exceptionId: selectedShift?.exceptionId || null,
      date: target.date,
      startTime: form.startTime,
      endTime: form.endTime,
      breakMinutes: form.breakMinutes,
      memo: form.memo,
    });
  };

  const reset = () => {
    onSave?.({
      type: 'reset',
      exceptionId: selectedShift?.exceptionId || null,
      date: target.date,
    });
  };

  const needsForm = action === 'change' || action === 'extra';

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-end md:items-stretch md:justify-end">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="닫기" />
      <aside className="relative w-full md:w-[420px] max-h-[92vh] md:max-h-none bg-white rounded-t-3xl md:rounded-none shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#F2F4F6] px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-[#191F28]">{formatDateShort(target.date)} 근무</p>
            <p className="text-xs text-[#8B95A1] mt-1">이 날짜에만 적용되는 변경을 관리해요.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#F2F4F6] text-[#4E5968] flex items-center justify-center"
            aria-label="닫기"
          >
            <XIcon size={17} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="rounded-2xl bg-[#F8F9FA] px-4 py-4">
            <p className="text-xs font-bold text-[#8B95A1] mb-2">오늘 일정</p>
            {shifts.length === 0 ? (
              <p className="text-sm font-bold text-[#191F28]">등록된 근무가 없어요.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {shifts.map((shift) => (
                  <button
                    key={shift.id}
                    type="button"
                    onClick={() => setSelectedShiftId(shift.id)}
                    className={`rounded-xl px-3 py-2 text-left border ${
                      selectedShift?.id === shift.id ? 'border-[#3182F6] bg-white' : 'border-transparent bg-white/70'
                    }`}
                  >
                    <p className="text-sm font-extrabold text-[#191F28]">
                      {formatShiftTimeRange(shift.scheduledStartTime, shift.scheduledEndTime)}
                    </p>
                    <p className="text-[11px] text-[#8B95A1] mt-0.5">
                      {isPlannedShiftException(shift) ? '이 달 예외 반영' : shift.isPlanned ? '기본 일정' : STATUS_LABELS[shift.status]}
                      {shift.breakMinutes ? ` · 휴게 ${shift.breakMinutes}분` : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {sessions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#E5E8EB] flex flex-col gap-1.5">
                {sessions.map((session) => {
                  const group = classGroupById.get(session.classGroupId);
                  return (
                    <p key={session.id} className="text-xs font-bold text-emerald-700">
                      {group?.name || '수업'} · {formatShiftTimeRange(session.startTime, session.endTime)}
                    </p>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'cancel', label: '휴무' },
              { id: 'change', label: '시간 수정' },
              { id: 'extra', label: '추가 근무' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setAction(item.id)}
                className={`py-3 rounded-2xl text-sm font-bold border ${
                  action === item.id
                    ? 'border-[#3182F6] bg-blue-50 text-[#3182F6]'
                    : 'border-[#E5E8EB] bg-white text-[#4E5968]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {needsForm && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">시작</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">종료</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">휴게(분)</label>
                <input
                  type="number"
                  value={form.breakMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, breakMinutes: e.target.value }))}
                  placeholder="0"
                  className="input"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
            <textarea
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              rows={2}
              placeholder="사유, 대타, 보강 메모 등"
              className="input resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            {selectedShift?.exceptionId && (
              <button
                type="button"
                onClick={reset}
                className="flex-1 py-3.5 rounded-xl bg-[#F2F4F6] text-[#4E5968] text-sm font-bold"
              >
                예외 해제
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={action === 'summary'}
              className="flex-1 py-3.5 rounded-xl bg-[#3182F6] text-white text-sm font-bold disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ChoiceCard({ active, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left active:opacity-80 ${
        active ? 'border-[#3182F6] bg-blue-50' : 'border-gray-200 bg-white'
      }`}
    >
      <p className={`text-sm font-bold ${active ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>{title}</p>
      {subtitle && <p className="text-[11px] text-[#8B95A1] mt-0.5">{subtitle}</p>}
    </button>
  );
}

function summarizeRecurringPattern({
  weekdays = [],
  scheduledStartTime,
  scheduledEndTime,
  breakMinutes,
} = {}) {
  const start = hhmmToMin(scheduledStartTime);
  const end = hhmmToMin(scheduledEndTime);
  if (start == null || end == null || end <= start || weekdays.length === 0) return null;
  const breakMin = Number(breakMinutes) || 0;
  const dailyGrossMin = end - start;
  const dailyNetMin = Math.max(0, dailyGrossMin - breakMin);
  return {
    weeklyGrossMin: dailyGrossMin * weekdays.length,
    weeklyNetMin: dailyNetMin * weekdays.length,
    weeklyBreakMin: breakMin * weekdays.length,
  };
}

function ShiftFormModal({
  initial, defaultDate, defaultMode = 'recurring', initialRecurring,
  onClose, onSaveSingle, onSaveRecurring,
}) {
  const isEdit = !!initial;
  const [mode, setMode] = useState(isEdit ? 'single' : defaultMode);
  const [recurringStartMode, setRecurringStartMode] = useState(
    initialRecurring?.startDate && initialRecurring.startDate !== todayDate() ? 'custom' : 'today',
  );
  const [recurringEndMode, setRecurringEndMode] = useState(initialRecurring?.endDate ? 'until' : 'forever');
  const [form, setForm] = useState({
    date: initial?.date || defaultDate || todayDate(),
    scheduledStartTime: initial?.scheduledStartTime || '',
    scheduledEndTime: initial?.scheduledEndTime || '',
    breakMinutes: initial?.breakMinutes ? String(initial.breakMinutes) : '',
    memo: initial?.memo || '',
    status: initial?.status || 'scheduled',
  });
  const [recurring, setRecurring] = useState({
    weekdays: initialRecurring?.weekdays || [],
    startDate: initialRecurring?.startDate || todayDate(),
    endDate: initialRecurring?.endDate || '',
    repeatIntervalWeeks: Number(initialRecurring?.repeatIntervalWeeks) === 2 ? 2 : 1,
    scheduledStartTime: initialRecurring?.scheduledStartTime || '',
    scheduledEndTime: initialRecurring?.scheduledEndTime || '',
    breakMinutes: initialRecurring?.breakMinutes || '',
    memo: initialRecurring?.memo || '',
  });
  const [alternateWeek, setAlternateWeek] = useState({
    weekdays: initialRecurring?.alternateWeek?.weekdays || [],
    scheduledStartTime: initialRecurring?.alternateWeek?.scheduledStartTime || '',
    scheduledEndTime: initialRecurring?.alternateWeek?.scheduledEndTime || '',
    breakMinutes: initialRecurring?.alternateWeek?.breakMinutes || '',
  });

  const recurringPreview = useMemo(() => {
    if (mode !== 'recurring') return null;
    if (!recurring.startDate || recurring.weekdays.length === 0) return null;
    const daysOfWeek = recurring.weekdays.map((d) => KO_TO_DOW[d]).filter((d) => d !== undefined);
    if (daysOfWeek.length === 0) return null;
    try {
      const preview = buildRecurringStaffWorkPreview({
        weekdays: daysOfWeek,
        effectiveStartDate: recurring.startDate,
        effectiveEndDate: recurring.endDate || null,
        repeatIntervalWeeks: recurring.repeatIntervalWeeks,
        todayYMD: todayDate(),
      });
      if (recurring.repeatIntervalWeeks !== 2 || alternateWeek.weekdays.length === 0) {
        return { ...preview, dates: preview.dates.slice(0, 4) };
      }
      const alternateDaysOfWeek = alternateWeek.weekdays
        .map((d) => KO_TO_DOW[d])
        .filter((d) => d !== undefined);
      const alternatePreview = buildRecurringStaffWorkPreview({
        weekdays: alternateDaysOfWeek,
        effectiveStartDate: addDaysYMD(recurring.startDate, 7),
        effectiveEndDate: recurring.endDate || null,
        repeatIntervalWeeks: 2,
        todayYMD: todayDate(),
      });
      return {
        ...preview,
        dates: [...preview.dates, ...alternatePreview.dates].sort().slice(0, 4),
        alternateDates: alternatePreview.dates,
      };
    } catch { return null; }
  }, [
    mode,
    recurring.startDate,
    recurring.endDate,
    recurring.weekdays,
    recurring.repeatIntervalWeeks,
    alternateWeek.weekdays,
  ]);

  const recurringSummary = useMemo(
    () => summarizeRecurringPattern(recurring),
    [
      recurring.scheduledStartTime,
      recurring.scheduledEndTime,
      recurring.breakMinutes,
      recurring.weekdays,
    ],
  );
  const alternateSummary = useMemo(
    () => summarizeRecurringPattern(alternateWeek),
    [
      alternateWeek.scheduledStartTime,
      alternateWeek.scheduledEndTime,
      alternateWeek.breakMinutes,
      alternateWeek.weekdays,
    ],
  );

  const singleTimeError = useMemo(
    () => validateShiftTime({
      startTime: form.scheduledStartTime,
      endTime: form.scheduledEndTime,
      breakMinutes: form.breakMinutes,
    }),
    [form.scheduledStartTime, form.scheduledEndTime, form.breakMinutes],
  );
  const recurringTimeError = useMemo(
    () => validateShiftTime({
      startTime: recurring.scheduledStartTime,
      endTime: recurring.scheduledEndTime,
      breakMinutes: recurring.breakMinutes,
    }),
    [recurring.scheduledStartTime, recurring.scheduledEndTime, recurring.breakMinutes],
  );
  const alternateTimeError = useMemo(
    () => alternateWeek.weekdays.length > 0
      ? validateShiftTime({
        startTime: alternateWeek.scheduledStartTime,
        endTime: alternateWeek.scheduledEndTime,
        breakMinutes: alternateWeek.breakMinutes,
      })
      : '',
    [
      alternateWeek.weekdays.length,
      alternateWeek.scheduledStartTime,
      alternateWeek.scheduledEndTime,
      alternateWeek.breakMinutes,
    ],
  );

  const canSaveSingle = !!form.date && !singleTimeError;
  const canSaveRecurring = recurring.weekdays.length > 0 && !!recurring.startDate
    && !recurringTimeError
    && (recurring.repeatIntervalWeeks !== 2 || !alternateTimeError)
    && (recurringEndMode !== 'until' || !!recurring.endDate)
    && !(recurringEndMode === 'until' && recurring.endDate && recurring.endDate < recurring.startDate);
  const canSave = mode === 'single' ? canSaveSingle : canSaveRecurring;

  const toggleWeekday = (d) => {
    setRecurring((f) => {
      const has = f.weekdays.includes(d);
      return { ...f, weekdays: has ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] };
    });
  };
  const toggleAlternateWeekday = (d) => {
    setAlternateWeek((current) => {
      const has = current.weekdays.includes(d);
      return {
        ...current,
        weekdays: has
          ? current.weekdays.filter((weekday) => weekday !== d)
          : [...current.weekdays, d],
      };
    });
  };

  const handleSave = () => {
    if (!canSave) return;
    if (mode === 'recurring') {
      onSaveRecurring?.({
        weekdays: recurring.weekdays,
        startDate: recurring.startDate,
        endDate: recurringEndMode === 'until' ? recurring.endDate : '',
        repeatIntervalWeeks: recurring.repeatIntervalWeeks,
        scheduledStartTime: recurring.scheduledStartTime,
        scheduledEndTime: recurring.scheduledEndTime,
        breakMinutes: recurring.breakMinutes,
        memo: recurring.memo,
        alternateWeek,
      });
    } else {
      onSaveSingle?.(form);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? '근무 일정 수정' : '근무 수정'}
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
        >
          {mode === 'recurring' && !isEdit ? '근무 저장' : '저장'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {!isEdit && (
          <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
            <button
              type="button"
              onClick={() => setMode('recurring')}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${
                mode === 'recurring' ? 'bg-white text-[#3182F6] shadow-sm' : 'text-gray-500'
              }`}
            >
              반복 근무
            </button>
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${
                mode === 'single' ? 'bg-white text-[#3182F6] shadow-sm' : 'text-gray-500'
              }`}
            >
              하루만 변경
            </button>
          </div>
        )}

        {mode === 'single' && (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">날짜 *</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">예정 시작</label>
                <input type="time" value={form.scheduledStartTime} onChange={(e) => setForm((f) => ({ ...f, scheduledStartTime: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">예정 종료</label>
                <input type="time" value={form.scheduledEndTime} onChange={(e) => setForm((f) => ({ ...f, scheduledEndTime: e.target.value }))} className="input" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">휴게(분)</label>
              <input type="number" value={form.breakMinutes} onChange={(e) => setForm((f) => ({ ...f, breakMinutes: e.target.value }))} placeholder="0" className="input" />
            </div>
            {form.scheduledStartTime && form.scheduledEndTime && singleTimeError && (
              <p className="text-[11px] text-red-500 -mt-1">{singleTimeError}</p>
            )}
            {isEdit && (
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">상태</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(STATUS_LABELS).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, status: id }))}
                      className={`py-2.5 rounded-xl text-sm font-bold border-2 ${
                        form.status === id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
              <textarea value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} rows={2} placeholder="특이사항 등" className="input resize-none" />
            </div>
          </>
        )}

        {mode === 'recurring' && (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">반복 주기</label>
              <div className="grid grid-cols-2 gap-2">
                <ChoiceCard
                  active={recurring.repeatIntervalWeeks === 1}
                  title="매주 같아요"
                  subtitle="같은 일정 반복"
                  onClick={() => setRecurring((f) => ({ ...f, repeatIntervalWeeks: 1 }))}
                />
                <ChoiceCard
                  active={recurring.repeatIntervalWeeks === 2}
                  title="한 주마다 달라요"
                  subtitle="A주·B주 교대"
                  onClick={() => setRecurring((f) => ({ ...f, repeatIntervalWeeks: 2 }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                {recurring.repeatIntervalWeeks === 2 ? 'A주 요일 *' : '반복 요일 *'}
              </label>
              <div className="grid grid-cols-7 gap-1.5">
                {KOREAN_WEEKDAYS.map((d) => {
                  const active = recurring.weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleWeekday(d)}
                      className={`py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                        active ? 'border-[#3182F6] bg-[#3182F6] text-white' : 'border-gray-200 bg-white text-gray-500'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">예정 시작 *</label>
                <input type="time" value={recurring.scheduledStartTime} onChange={(e) => setRecurring((f) => ({ ...f, scheduledStartTime: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">예정 종료 *</label>
                <input type="time" value={recurring.scheduledEndTime} onChange={(e) => setRecurring((f) => ({ ...f, scheduledEndTime: e.target.value }))} className="input" />
              </div>
            </div>
            {recurring.scheduledStartTime && recurring.scheduledEndTime && recurringTimeError && (
              <p className="text-[11px] text-red-500 -mt-1">{recurringTimeError}</p>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                {recurring.repeatIntervalWeeks === 2 ? 'A주 휴게(분)' : '휴게(분)'}
              </label>
              <input type="number" value={recurring.breakMinutes} onChange={(e) => setRecurring((f) => ({ ...f, breakMinutes: e.target.value }))} placeholder="0" className="input" />
            </div>

            {recurring.repeatIntervalWeeks === 2 && (
              <div className="rounded-2xl bg-[#F8FAFC] p-3.5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-extrabold text-[#191F28]">B주 일정</p>
                  <p className="text-[10px] font-semibold text-[#8B95A1]">
                    요일을 고르지 않으면 휴무
                  </p>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {KOREAN_WEEKDAYS.map((d) => {
                    const active = alternateWeek.weekdays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleAlternateWeekday(d)}
                        className={`py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                          active
                            ? 'border-[#3182F6] bg-[#3182F6] text-white'
                            : 'border-gray-200 bg-white text-gray-500'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                {alternateWeek.weekdays.length > 0 && (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">시작 *</label>
                        <input
                          type="time"
                          value={alternateWeek.scheduledStartTime}
                          onChange={(event) => setAlternateWeek((current) => ({
                            ...current,
                            scheduledStartTime: event.target.value,
                          }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">종료 *</label>
                        <input
                          type="time"
                          value={alternateWeek.scheduledEndTime}
                          onChange={(event) => setAlternateWeek((current) => ({
                            ...current,
                            scheduledEndTime: event.target.value,
                          }))}
                          className="input"
                        />
                      </div>
                    </div>
                    {alternateTimeError && (
                      <p className="mt-1.5 text-[11px] text-red-500">{alternateTimeError}</p>
                    )}
                    <div className="mt-3">
                      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">휴게(분)</label>
                      <input
                        type="number"
                        value={alternateWeek.breakMinutes}
                        onChange={(event) => setAlternateWeek((current) => ({
                          ...current,
                          breakMinutes: event.target.value,
                        }))}
                        placeholder="0"
                        className="input"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                {recurring.repeatIntervalWeeks === 2 ? 'A주는 언제 시작하나요?' : '언제부터 적용할까요?'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <ChoiceCard
                  active={recurringStartMode === 'today'}
                  title={recurring.repeatIntervalWeeks === 2 ? '이번 주부터' : '오늘부터'}
                  onClick={() => {
                    setRecurringStartMode('today');
                    setRecurring((f) => ({ ...f, startDate: todayDate() }));
                  }}
                />
                <ChoiceCard
                  active={recurringStartMode === 'custom'}
                  title="직접 선택"
                  onClick={() => setRecurringStartMode('custom')}
                />
              </div>
            </div>
            {recurringStartMode === 'custom' && (
              <div>
                <input type="date" value={recurring.startDate} onChange={(e) => setRecurring((f) => ({ ...f, startDate: e.target.value }))} className="input" />
                {recurring.repeatIntervalWeeks === 2 && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#8B95A1]">
                    선택한 날짜가 포함된 주를 A주로 계산하고 다음 주부터 B주와 번갈아 반복해요.
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">언제까지 반복할까요?</label>
              <div className="grid grid-cols-2 gap-2">
                <ChoiceCard
                  active={recurringEndMode === 'forever'}
                  title="계속 반복"
                  onClick={() => {
                    setRecurringEndMode('forever');
                    setRecurring((f) => ({ ...f, endDate: '' }));
                  }}
                />
                <ChoiceCard
                  active={recurringEndMode === 'until'}
                  title="특정 날짜까지"
                  onClick={() => setRecurringEndMode('until')}
                />
              </div>
            </div>
            {recurringEndMode === 'until' && (
              <div>
                <input type="date" value={recurring.endDate} onChange={(e) => setRecurring((f) => ({ ...f, endDate: e.target.value }))} className="input" />
                {recurring.endDate && recurring.endDate < recurring.startDate && (
                  <p className="text-[11px] text-red-500 mt-1.5">반복을 끝내는 날은 처음 적용되는 날보다 뒤여야 해요.</p>
                )}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
              <textarea value={recurring.memo} onChange={(e) => setRecurring((f) => ({ ...f, memo: e.target.value }))} rows={2} placeholder="특이사항 등" className="input resize-none" />
            </div>
            {recurringPreview && recurringSummary ? (
              <div className="bg-blue-50 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Check size={14} className="text-[#3182F6]" />
                  <p className="text-sm font-bold text-[#3182F6]">이 패턴으로 근무표에 표시돼요</p>
                </div>
                <p className="text-[11px] text-[#4E5968] leading-relaxed">
                  {recurring.repeatIntervalWeeks === 2 ? 'A주 · ' : '매주 '}
                  {recurring.weekdays.join(', ')} {formatShiftTimeRange(recurring.scheduledStartTime, recurring.scheduledEndTime)}
                </p>
                {recurring.repeatIntervalWeeks === 2 && (
                  <p className="mt-1 text-[11px] text-[#4E5968] leading-relaxed">
                    B주 · {alternateWeek.weekdays.length > 0
                      ? `${alternateWeek.weekdays.join(', ')} ${formatShiftTimeRange(alternateWeek.scheduledStartTime, alternateWeek.scheduledEndTime)}`
                      : '휴무'}
                  </p>
                )}
                {recurringSummary && recurring.repeatIntervalWeeks === 1 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-white/70 px-3 py-2">
                      <p className="text-[10px] font-semibold text-[#8B95A1]">
                        주 근무
                      </p>
                      <p className="text-sm font-extrabold text-[#191F28]">
                        {formatShiftHoursFromMinutes(recurringSummary.weeklyGrossMin)}h
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/70 px-3 py-2">
                      <p className="text-[10px] font-semibold text-[#8B95A1]">
                        휴게 제외
                      </p>
                      <p className="text-sm font-extrabold text-[#191F28]">
                        {formatShiftHoursFromMinutes(
                          recurringSummary.weeklyNetMin,
                        )}h
                      </p>
                    </div>
                  </div>
                )}
                {recurring.repeatIntervalWeeks === 2 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-white/70 px-3 py-2">
                      <p className="text-[10px] font-semibold text-[#8B95A1]">A주 근무</p>
                      <p className="text-sm font-extrabold text-[#191F28]">
                        {formatShiftHoursFromMinutes(recurringSummary?.weeklyNetMin || 0)}h
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/70 px-3 py-2">
                      <p className="text-[10px] font-semibold text-[#8B95A1]">B주 근무</p>
                      <p className="text-sm font-extrabold text-[#191F28]">
                        {formatShiftHoursFromMinutes(alternateSummary?.weeklyNetMin || 0)}h
                      </p>
                    </div>
                  </div>
                )}
                {recurringSummary?.weeklyBreakMin > 0 && (
                  <p className="text-[11px] text-[#4E5968] mt-2 leading-relaxed">
                    근무하는 주에 휴게 {formatShiftHoursFromMinutes(recurringSummary.weeklyBreakMin)}h를 제외해요.
                  </p>
                )}
                <p className="text-[11px] text-[#8B95A1] mt-2 leading-relaxed">
                  {recurringEndMode === 'until' && recurring.endDate
                    ? `${recurring.startDate}부터 ${recurring.endDate}까지 반복돼요.`
                    : `${recurring.startDate}부터 계속 반복돼요.`}
                  {recurring.repeatIntervalWeeks === 2 ? ' A주와 B주가 한 주마다 번갈아 적용돼요.' : ''}
                  {recurringPreview.dates.length > 0 ? ` 다음 일정: ${recurringPreview.dates.map((d) => formatDateShort(d)).join(', ')}` : ''}
                </p>
                <p className="text-[11px] text-[#8B95A1] mt-1 leading-relaxed">
                  실제 근무 기록은 출근·퇴근 시간을 기준으로 따로 저장돼요.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400">요일과 시간을 선택하면 주 근무시간이 바로 계산돼요.</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sub-tab: 계약 (wage / payroll)
// ═══════════════════════════════════════════════════════════════════
function StaffContractSection({ staff }) {
  const staffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const memberProfiles = useWorkspaceStore((s) => s.academyMemberProfiles) ?? [];
  const staffAttendanceLogs = useWorkspaceStore((s) => s.staffAttendanceLogs) ?? [];
  const saveAcademyStaffProfile = useWorkspaceStore((s) => s.saveAcademyStaffProfile);
  const showToast = useAcademyStore((s) => s.showToast);
  const classSessions = useAcademyStore((s) => s.classSessions) ?? [];
  const computeStaffActualHoursForMonth = useAcademyStore((s) => s.computeStaffActualHoursForMonth);
  const computeStaffHoursFromLogs = useAcademyStore((s) => s.computeStaffHoursFromLogs);
  const updateTeacher = useAcademyStore((s) => s.updateTeacher);
  const updateAssistant = useAcademyStore((s) => s.updateAssistant);
  const updateManager = useAcademyStore((s) => s.updateManager);

  // 서버 매핑이 있는 경우 server profile, 없으면 로컬 staff 값 사용.
  const serverProfile = useMemo(
    () => staff.serverUserId ? staffProfiles.find((p) => p.user_id === staff.serverUserId) : null,
    [staffProfiles, staff.serverUserId],
  );
  const memberProfile = useMemo(
    () => staff.serverUserId ? memberProfiles.find((p) => p.user_id === staff.serverUserId) : null,
    [memberProfiles, staff.serverUserId],
  );

  const initialWageType = serverProfile?.wage_type || staff.wageType || 'hourly';
  const initialHourlyWage = serverProfile?.hourly_wage ?? staff.hourlyWage ?? 0;
  const initialMonthlySalary = serverProfile?.monthly_salary ?? staff.monthlySalary ?? 0;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    wageType: initialWageType,
    hourlyWage: String(initialHourlyWage || ''),
    monthlySalary: String(initialMonthlySalary || ''),
  });
  const [saving, setSaving] = useState(false);

  const currentMonth = getCurrentMonth();
  const approvedActualHours = useMemo(
    () => staff.serverUserId
      ? computeStaffHoursFromLogs(staff.serverUserId, currentMonth, staffAttendanceLogs, { approvedOnly: true })
      : computeStaffActualHoursForMonth(staff.id, currentMonth),
    [computeStaffActualHoursForMonth, computeStaffHoursFromLogs, staff.id, staff.serverUserId, currentMonth, staffAttendanceLogs],
  );
  const pendingActualHours = useMemo(
    () => staff.serverUserId
      ? computeStaffHoursFromLogs(staff.serverUserId, currentMonth, staffAttendanceLogs, { approvedOnly: false })
      : 0,
    [computeStaffHoursFromLogs, staff.serverUserId, currentMonth, staffAttendanceLogs],
  );
  const lessonMinutes = useMemo(() => {
    let m = 0;
    for (const s of classSessions) {
      if (s.status !== 'completed') continue;
      if (!s.date?.startsWith(currentMonth)) continue;
      const lStart = hhmmToMin(s.startTime);
      const lEnd = hhmmToMin(s.endTime);
      if (lStart == null || lEnd == null || lEnd <= lStart) continue;
      const isAssistant = staff._role === 'assistant';
      let counts = false;
      if (isAssistant) {
        counts = false;
      } else {
        counts = (s.teacherId === staff.id && !s.substituteTeacherId) || s.substituteTeacherId === staff.id;
      }
      if (counts) m += lEnd - lStart;
    }
    return m;
  }, [classSessions, staff.id, staff._role, currentMonth]);
  const lessonHours = lessonMinutes / 60;
  const nonLessonHours = Math.max(0, approvedActualHours - lessonHours);

  const hourlyWageNum = Number(form.hourlyWage) || 0;
  const monthlySalaryNum = Number(form.monthlySalary) || 0;

  const estimatedPay = useMemo(() => {
    if (form.wageType === 'monthly') return monthlySalaryNum;
    return Math.round(approvedActualHours * hourlyWageNum);
  }, [form.wageType, hourlyWageNum, monthlySalaryNum, approvedActualHours]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // 로컬 staff 항목 우선 업데이트 (cross-mode 호환)
      const localPatch = {
        wageType: form.wageType,
        hourlyWage: hourlyWageNum,
        monthlySalary: monthlySalaryNum,
        hourlyMode: 'actualAttendance',
      };
      if (staff._role === 'assistant') updateAssistant(staff.id, localPatch);
      else if (staff._role === 'manager') updateManager(staff.id, localPatch);
      else updateTeacher(staff.id, localPatch);

      // 서버 매핑된 staff 면 server profile 도 업데이트
      if (staff.serverUserId && saveAcademyStaffProfile) {
        await saveAcademyStaffProfile({
          userId: staff.serverUserId,
          role: staff._role,
          subjects: serverProfile?.subjects || [],
          wageType: form.wageType,
          hourlyWage: hourlyWageNum,
          monthlySalary: monthlySalaryNum,
          memo: serverProfile?.memo || null,
          status: 'active',
          permissions: serverProfile?.permissions || {},
          scope: {
            ...(serverProfile?.scope && typeof serverProfile.scope === 'object' ? serverProfile.scope : {}),
            hourlyMode: 'actualAttendance',
          },
        });
      }
      showToast('계약 정보가 저장되었습니다.');
      setEditing(false);
    } catch (err) {
      showToast(err?.message ?? '저장에 실패했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-[#191F28]">급여 설정</p>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-bold text-[#3182F6] px-2 py-1.5 rounded-lg active:bg-blue-50"
            >
              수정
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-xs font-bold text-white bg-[#3182F6] px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-60"
            >
              {saving && <Loader2 size={11} className="animate-spin" />} 저장
            </button>
          )}
        </div>
        {!editing ? (
          <div className="flex flex-col gap-2">
            <Row label="급여 방식" value={form.wageType === 'monthly' ? '월급' : '시급'} />
            {form.wageType === 'hourly' && (
              <>
                <Row label="시급" value={`${hourlyWageNum.toLocaleString()}원`} />
                <Row label="정산 기준" value="저장된 실제 근퇴 기록" />
              </>
            )}
            {form.wageType === 'monthly' && (
              <Row label="월급" value={`${monthlySalaryNum.toLocaleString()}원`} />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'hourly', label: '시급' },
                { id: 'monthly', label: '월급' },
              ].map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, wageType: w.id }))}
                  className={`py-2.5 rounded-xl text-sm font-bold border-2 ${
                    form.wageType === w.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            {form.wageType === 'hourly' ? (
              <>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.hourlyWage}
                  onChange={(e) => setForm((f) => ({ ...f, hourlyWage: e.target.value.replace(/[^\d]/g, '') }))}
                  placeholder="시급 (원)"
                  className="input"
                />
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2.5">
                  <p className="text-sm font-bold text-blue-700">저장된 실제 근퇴 기록 기준</p>
                  <p className="text-[11px] text-blue-700/80 mt-0.5 leading-relaxed">
                    직원이 출근/퇴근을 찍은 시간이 급여 계산에 바로 반영돼요.
                  </p>
                </div>
              </>
            ) : (
              <input
                type="number"
                inputMode="numeric"
                value={form.monthlySalary}
                onChange={(e) => setForm((f) => ({ ...f, monthlySalary: e.target.value.replace(/[^\d]/g, '') }))}
                placeholder="월급 (원)"
                className="input"
              />
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm">
        <p className="text-sm font-bold text-[#191F28] mb-3">이번 달 예상 급여</p>
        <p className="text-3xl font-extrabold text-[#3182F6] mb-3">
          {estimatedPay.toLocaleString()}<span className="text-base text-[#8B95A1] font-medium ml-1">원</span>
        </p>
        <div className="flex flex-col gap-2 pt-3 border-t border-[#F2F4F6]">
          <Row label="저장된 근퇴 시간" value={`${approvedActualHours.toFixed(1)}시간`} />
          {pendingActualHours > 0 && <Row label="미확정 근퇴" value={`${pendingActualHours.toFixed(1)}시간`} />}
          <Row label="수업 시간" value={`${lessonHours.toFixed(1)}시간`} />
          <Row label="수업 외 체류" value={`${nonLessonHours.toFixed(1)}시간`} />
        </div>
        <p className="text-[11px] text-[#8B95A1] mt-3 leading-relaxed">
          {form.wageType === 'monthly'
            ? '월급은 근무 시간과 무관하게 고정 지급돼요.'
            : '시급은 저장된 실제 출근·퇴근 기록 시간에 적용돼요. 수업 시간은 업무 참고용이에요.'}
        </p>
      </div>

      {memberProfile && (
        <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm">
          <p className="text-sm font-bold text-[#191F28] mb-3">계정 정보</p>
          <div className="flex flex-col gap-2">
            <Row label="이름" value={memberProfile.display_name || '-'} />
            <Row label="이메일" value={memberProfile.email || '-'} />
            <Row label="연락처" value={memberProfile.phone || '-'} />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-[#8B95A1]">{label}</span>
      <span className="text-sm font-semibold text-[#191F28] truncate ml-2">{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sub-tab: 권한
// ═══════════════════════════════════════════════════════════════════
function StaffPermissionSection({ staff, canEdit = false, canEditSensitive = false }) {
  const staffProfiles = useWorkspaceStore((state) => state.academyStaffProfiles) ?? [];
  const currentAcademyId = useWorkspaceStore((state) => state.currentAcademyId);
  const loadAcademyMemberProfiles = useWorkspaceStore((state) => state.loadAcademyMemberProfiles);
  const loadAcademyStaffProfiles = useWorkspaceStore((state) => state.loadAcademyStaffProfiles);
  const showToast = useAcademyStore((state) => state.showToast);
  const serverProfile = staffProfiles.find((profile) => profile.user_id === staff.serverUserId) || null;
  const policies = normalizeJobTitlePermissions(
    serverProfile?.academy_job_title_permissions || staff.academyJobTitlePermissions,
  );
  const jobTitle = serverProfile?.job_title || getStaffJobTitle(staff);
  const titlePolicy = getJobTitlePolicy(policies, jobTitle, staff._role);
  const savedOverrides = serverProfile?.permissions || staff.permissions || {};
  const [draftOverrides, setDraftOverrides] = useState(savedOverrides);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftOverrides(serverProfile?.permissions || staff.permissions || {});
  }, [staff.id, staff.permissions, serverProfile?.permissions]);

  const effectivePermissions = resolvePermissions(
    staff._role,
    draftOverrides,
    titlePolicy.permissions,
  );
  const hasOverrides = ACTIVE_PERMISSION_KEYS.some(
    (key) => typeof draftOverrides[key] === 'boolean',
  );
  const hasChanges = JSON.stringify(draftOverrides) !== JSON.stringify(savedOverrides);

  const toggle = (key) => {
    if (!canEdit || (OWNER_DELEGATED_PERMISSION_KEYS.has(key) && !canEditSensitive)) return;
    setDraftOverrides((current) => ({
      ...current,
      [key]: !effectivePermissions[key],
    }));
  };

  const resetToTitle = () => setDraftOverrides({});

  const save = async () => {
    if (!canEdit || !staff.serverUserId || saving) return;
    setSaving(true);
    try {
      await manageAcademyStaffAccess({
        academyId: currentAcademyId,
        userId: staff.serverUserId,
        jobTitle,
        permissions: draftOverrides,
      });
      await Promise.all([
        loadAcademyMemberProfiles?.(),
        loadAcademyStaffProfiles?.(),
      ]);
      showToast('개인 권한을 저장했어요.');
    } catch (error) {
      showToast(error?.message || '권한을 저장하지 못했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-[#3182F6]" />
            <p className="text-sm font-bold text-[#191F28]">{jobTitle} 기본 권한</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#8B95A1]">
            {titlePolicy.role === 'manager'
              ? '학원 전체 운영 범위를 기준으로 적용돼요.'
              : '학생 관리는 전체, 수업 기록은 담당 반을 기준으로 적용돼요.'}
          </p>
        </div>
        {hasOverrides && (
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600">
            개인 설정
          </span>
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        {ACTIVE_PERMISSION_KEYS.map((key) => {
          const overridden = typeof draftOverrides[key] === 'boolean';
          const enabled = effectivePermissions[key];
          const sensitive = OWNER_DELEGATED_PERMISSION_KEYS.has(key);
          const rowEditable = canEdit && (!sensitive || canEditSensitive);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              disabled={!rowEditable}
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-[#F8F9FA] px-3 py-3 text-left disabled:cursor-default"
            >
              <span>
                <span className="block text-sm font-medium text-[#333D4B]">{PERMISSION_LABELS[key]}</span>
                {overridden && <span className="mt-0.5 block text-[10px] font-bold text-blue-600">개인별 조정</span>}
                {sensitive && !canEditSensitive && (
                  <span className="mt-0.5 block text-[10px] font-bold text-[#8B95A1]">원장만 부여·회수</span>
                )}
              </span>
              <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border ${
                enabled
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-[#D1D6DB] bg-white text-transparent'
              }`}>
                <Check size={14} strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>

      {canEdit && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={resetToTitle}
            disabled={!hasOverrides || saving}
            className="h-11 rounded-xl bg-[#F2F4F6] text-xs font-bold text-[#4E5968] disabled:opacity-40"
          >
            직책 기본값
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!hasChanges || saving}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-xs font-bold text-white disabled:bg-blue-300"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            저장
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 근무 탭 안에서 함께 보여주는 배정 요약
// ═══════════════════════════════════════════════════════════════════
function StaffAssignmentSummary({ staff }) {
  const classGroups = useAcademyStore((s) => s.classGroups) ?? [];
  const clinicTasks = useAcademyStore((s) => s.clinicTasks) ?? [];

  const isAssistant = staff._role === 'assistant';
  const myGroups = useMemo(() => {
    if (isAssistant) return [];
    return classGroups.filter((group) => (
      group.teacherId === staff.id
      || (staff.serverUserId && group.teacherUserId === staff.serverUserId)
    ));
  }, [classGroups, staff.id, staff.serverUserId, isAssistant]);

  const myClinicTasks = useMemo(() => {
    if (!isAssistant) return [];
    return clinicTasks.filter((t) => t.assignedToId === staff.id);
  }, [clinicTasks, staff.id, isAssistant]);

  return (
    <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#191F28]">
            {isAssistant ? '담당 클리닉' : '맡고 있는 반'}
          </p>
          <p className="text-[11px] text-[#8B95A1] mt-1">
            배정 정보는 근무표와 함께 확인해요.
          </p>
        </div>
        {isAssistant ? (
          <p className="text-2xl font-extrabold text-[#3182F6] whitespace-nowrap">{myClinicTasks.length}
            <span className="text-sm text-[#8B95A1] ml-1 font-medium">개</span>
          </p>
        ) : (
          <p className="text-2xl font-extrabold text-[#3182F6] whitespace-nowrap">{myGroups.length}
            <span className="text-sm text-[#8B95A1] ml-1 font-medium">개</span>
          </p>
        )}
      </div>
      {myGroups.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {myGroups.map((g) => (
            <span key={g.id} className="text-xs font-semibold bg-[#F2F4F6] text-[#191F28] px-2.5 py-1 rounded-full">
              {g.name}
            </span>
          ))}
        </div>
      )}
      {isAssistant && myClinicTasks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {myClinicTasks.slice(0, 8).map((task) => (
            <span key={task.id} className="text-xs font-semibold bg-[#F2F4F6] text-[#191F28] px-2.5 py-1 rounded-full">
              {task.title || task.studentName || '클리닉'}
            </span>
          ))}
          {myClinicTasks.length > 8 && (
            <span className="text-xs font-semibold bg-[#F2F4F6] text-[#8B95A1] px-2.5 py-1 rounded-full">
              +{myClinicTasks.length - 8}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 강사/보조강사 본인 뷰
// ═══════════════════════════════════════════════════════════════════
function MyStaffView() {
  const role = useAcademyStore((s) => s.role);
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const academyManagers = useAcademyStore((s) => s.academyManagers) ?? [];
  const classSessions = useAcademyStore((s) => s.classSessions) ?? [];
  const classGroups = useAcademyStore((s) => s.classGroups) ?? [];
  const updateAcademyStaffShift = useAcademyStore((s) => s.updateAcademyStaffShift);
  const computeStaffHoursForMonth = useAcademyStore((s) => s.computeStaffHoursForMonth);
  const showToast = useAcademyStore((s) => s.showToast);

  const authUserId = useAuthStore((s) => s.user?.id);
  const authUserEmail = useAuthStore((s) => s.user?.email);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerStaffShifts = useWorkspaceStore((s) => s.loadServerStaffShifts);
  const myMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );

  const myStaff = useMemo(
    () => findLocalStaffForUser(
      role === 'assistant' ? academyAssistants : role === 'manager' ? academyManagers : academyTeachers,
      { userId: authUserId, memberId: myMembership?.id, email: authUserEmail },
    ),
    [academyTeachers, academyAssistants, academyManagers, role, authUserId, myMembership?.id, authUserEmail],
  );

  const [busy, setBusy] = useState(false);
  const todayStr = todayDate();
  const currentMonth = getCurrentMonth();
  const weekDates = useMemo(() => getWeekDates(todayStr), [todayStr]);

  const myShifts = useMemo(
    () => (myStaff ? academyStaffShifts.filter((sh) => sh.staffId === myStaff.id) : []),
    [academyStaffShifts, myStaff],
  );
  const todayShift = useMemo(() => {
    const list = myShifts
      .filter((sh) => sh.date === todayStr && sh.status !== 'canceled')
      .sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''));
    return list[0] || null;
  }, [myShifts, todayStr]);

  const weekByDate = useMemo(() => {
    const map = new Map();
    weekDates.forEach((d) => map.set(d, []));
    for (const sh of myShifts) {
      if (!sh.date || !map.has(sh.date)) continue;
      if (sh.status === 'canceled') continue;
      map.get(sh.date).push(sh);
    }
    for (const d of weekDates) {
      map.get(d).sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''));
    }
    return map;
  }, [myShifts, weekDates]);

  const totalHours = useMemo(
    () => (myStaff?.id ? computeStaffHoursForMonth(myStaff.id, currentMonth) : 0),
    [computeStaffHoursForMonth, myStaff?.id, currentMonth],
  );

  const todayMySessions = useMemo(() => {
    if (!myStaff) return [];
    return classSessions.filter((s) => {
      if (s.date !== todayStr || s.status === 'canceled') return false;
      if (role === 'assistant') return false;
      const isMain = s.teacherId === myStaff.id && !s.substituteTeacherId;
      const isSub = s.substituteTeacherId === myStaff.id;
      return isMain || isSub;
    });
  }, [classSessions, myStaff, role, todayStr]);

  const todayTimeline = useMemo(
    () => buildShiftTimeline(todayShift, todayMySessions),
    [todayShift, todayMySessions],
  );

  const todaySummary = useMemo(() => {
    let workMin = 0;
    let lessonMin = 0;
    if (todayShift) {
      const s = hhmmToMin(todayShift.scheduledStartTime);
      const e = hhmmToMin(todayShift.scheduledEndTime);
      if (s != null && e != null && e > s) workMin = e - s - (todayShift.breakMinutes || 0);
    }
    for (const row of todayTimeline) {
      if (row.type === 'lesson') lessonMin += row.durationMin;
    }
    const gapMin = Math.max(0, workMin - lessonMin);
    return { workMin, lessonMin, gapMin };
  }, [todayShift, todayTimeline]);

  const writeThrough = async (serverId, patch) => {
    if (!serverId || !isAuthenticated || !currentAcademyId) return;
    try {
      await updateServerStaffShift(serverId, patch);
      loadServerStaffShifts();
    } catch (err) {
      console.warn('[supabase] clock action failed', err);
    }
  };

  const handleClockIn = async () => {
    if (!todayShift || busy) return;
    setBusy(true);
    const time = nowHHmm();
    updateAcademyStaffShift(todayShift.id, { actualStartTime: time });
    showToast('출근 시간을 기록했어요.');
    await writeThrough(todayShift.serverId, { actual_start_time: time });
    setBusy(false);
  };

  const handleClockOut = async () => {
    if (!todayShift || busy) return;
    setBusy(true);
    const time = nowHHmm();
    updateAcademyStaffShift(todayShift.id, { actualEndTime: time, status: 'completed' });
    showToast('퇴근 시간을 기록했어요.');
    await writeThrough(todayShift.serverId, { actual_end_time: time, status: 'completed' });
    setBusy(false);
  };

  const clockedIn = !!todayShift?.actualStartTime;
  const clockedOut = !!todayShift?.actualEndTime;

  return (
    <div>
      <Header title="직원" />
      <div className="pt-14 md:pt-0 pb-12 md:pb-8 bg-[#F2F4F6] min-h-screen">
        <div className="px-4 pt-4">
          <p className="text-xs font-semibold text-[#8B95A1] mb-2">오늘 · {formatDateShort(todayStr)}</p>
          {!todayShift ? (
            <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
              <Clock size={20} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">오늘 근무 일정이 없어요.</p>
              <p className="text-[11px] text-gray-400 mt-1">원장이 일정을 등록하면 여기에 표시돼요.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl px-5 py-5 shadow-sm">
                <p className="text-xs text-[#4E5968] mb-1">오늘 총 상주</p>
                <p className="text-3xl font-bold text-[#191F28] leading-tight">
                  {(todaySummary.workMin / 60).toFixed(1)}
                  <span className="text-base text-[#8B95A1] font-medium ml-1">시간</span>
                </p>
                <p className="text-xs text-[#4E5968] mt-2">
                  수업 <span className="font-semibold text-[#3182F6]">{(todaySummary.lessonMin / 60).toFixed(1)}시간</span>
                  <span className="mx-1.5 text-[#D1D6DB]">·</span>
                  공강/대기 <span className="font-semibold text-[#4E5968]">{(todaySummary.gapMin / 60).toFixed(1)}시간</span>
                </p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#F2F4F6]">
                  <Clock size={12} className="text-[#8B95A1]" />
                  <p className="text-xs text-[#4E5968]">
                    예정 {formatShiftTimeRange(todayShift.scheduledStartTime, todayShift.scheduledEndTime)}
                    {todayShift.breakMinutes ? ` · 휴게 ${todayShift.breakMinutes}분` : ''}
                  </p>
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_TONES[todayShift.status]}`}>
                    {STATUS_LABELS[todayShift.status]}
                  </span>
                </div>
                {(clockedIn || clockedOut) && (
                  <p className="text-xs text-[#4E5968] mt-2">
                    {clockedIn && `출근 ${formatClock(todayShift.actualStartTime)}`}
                    {clockedIn && clockedOut && ' · '}
                    {clockedOut && `퇴근 ${formatClock(todayShift.actualEndTime)}`}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    disabled={clockedIn || busy}
                    onClick={handleClockIn}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[#3182F6] text-white text-sm font-bold disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                    {clockedIn ? '출근 완료' : '출근'}
                  </button>
                  <button
                    type="button"
                    disabled={!clockedIn || clockedOut || busy}
                    onClick={handleClockOut}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[#F2F4F6] text-[#191F28] text-sm font-bold disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <LogOutIcon size={14} />}
                    {clockedOut ? '퇴근 완료' : '퇴근'}
                  </button>
                </div>
              </div>

              {todayTimeline.length > 0 && (
                <div className="mt-3 bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 pt-4 pb-2">
                    <p className="text-xs font-bold text-[#191F28]">타임라인</p>
                    <p className="text-[11px] text-[#8B95A1] mt-0.5">수업과 비어 있는 근무 시간을 같이 보여줘요.</p>
                  </div>
                  <div className="flex flex-col">
                    {todayTimeline.map((row, idx) => (
                      <TimelineRow key={`${row.startTime}_${idx}`} row={row} classGroups={classGroups} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 pt-5">
          <p className="text-sm font-bold text-gray-700 mb-2">이번 주 근무</p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {weekDates.map((d) => {
              const list = weekByDate.get(d) || [];
              const isToday = d === todayStr;
              return (
                <div
                  key={d}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${isToday ? 'bg-blue-50/40' : ''}`}
                >
                  <div className="w-12 flex-shrink-0">
                    <p className={`text-xs font-bold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{d.slice(5)}</p>
                    <p className="text-[10px] text-gray-400">{getKoreanWeekdayFromYMD(d)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    {list.length === 0 ? (
                      <p className="text-xs text-gray-300">근무 없음</p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {list.map((sh) => (
                          <p key={sh.id} className="text-xs text-gray-700">
                            {formatShiftTimeRange(sh.scheduledStartTime, sh.scheduledEndTime)}
                            {sh.actualStartTime ? ` · 실제 ${formatShiftTimeRange(sh.actualStartTime, sh.actualEndTime)}` : ''}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-4 pt-5">
          <div className="bg-white rounded-2xl px-4 py-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">이번 달 합계 근무시간</p>
              <p className="text-xs text-gray-400 mt-0.5">{currentMonth}</p>
            </div>
            <p className="text-2xl font-bold text-blue-600">{totalHours.toFixed(1)}<span className="text-sm text-gray-400 font-normal ml-1">시간</span></p>
          </div>
        </div>

        {!myStaff && (
          <div className="mx-4 mt-5 bg-white rounded-2xl p-5 shadow-sm text-center">
            <p className="text-sm font-bold text-gray-700 mb-1">연결된 선생님 정보가 없어요</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              원장이 본 계정을 선생님으로 등록하면 여기에 일정이 표시돼요.
            </p>
          </div>
        )}

        <p className="text-[11px] text-gray-400 leading-relaxed mt-5 px-4">
          시급 계산은 이 근무 합계 시간을 기준으로 해요. actual 시간이 비어 있고 상태가 "완료" 인 경우 예정 시간을 사용해요.
        </p>
      </div>
    </div>
  );
}

function TimelineRow({ row, classGroups }) {
  const isLesson = row.type === 'lesson';
  const hours = (row.durationMin / 60).toFixed(1);
  const titles = isLesson
    ? (row.sessions || []).map((s) => classGroups.find((g) => g.id === s.classGroupId)?.name || '수업').join(', ')
    : '비어 있는 근무 시간';
  return (
    <div className={`flex items-center gap-3 px-5 py-3 border-t border-[#F2F4F6] ${isLesson ? '' : 'bg-[#F8F9FA]'}`}>
      <div className="w-16 flex-shrink-0">
        <p className="text-xs font-bold text-[#191F28]">{row.startTime}</p>
        <p className="text-[10px] text-[#8B95A1]">~ {row.endTime}</p>
      </div>
      <div className={`w-1 h-10 rounded-full flex-shrink-0 ${isLesson ? 'bg-[#3182F6]' : 'bg-[#D1D6DB]'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isLesson ? <BookOpen size={12} className="text-[#3182F6]" /> : <Coffee size={12} className="text-[#8B95A1]" />}
          <p className={`text-sm font-bold truncate ${isLesson ? 'text-[#191F28]' : 'text-[#4E5968]'}`}>{titles}</p>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            isLesson ? 'bg-blue-50 text-[#3182F6]' : 'bg-[#F2F4F6] text-[#8B95A1]'
          }`}>
            {isLesson ? '수업' : '대기'}
          </span>
          <p className="text-[11px] text-[#8B95A1]">{hours}시간</p>
        </div>
      </div>
    </div>
  );
}
