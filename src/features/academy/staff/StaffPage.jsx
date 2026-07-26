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

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, ChevronLeft, ChevronRight, Pencil,
  Clock, Search, Users as UsersIcon, GraduationCap, Mail, X as XIcon,
  Loader2, Check, BookOpen, Coffee,
  LogIn, LogOut as LogOutIcon, ShieldCheck,
} from 'lucide-react';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
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
  assignAcademyMemberRole,
  listAcademyRoleAssignmentCandidates,
  updateAcademyMemberRole,
} from '../../../services/supabase/workspaceApi';
import {
  buildRecurringStaffWorkPreview,
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
  PERMISSION_DEFAULTS,
  PERMISSION_LABELS,
  PERMISSION_KEYS,
  resolvePermissions,
  currentUserCan,
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
const STAFF_ROLE_LABELS = { teacher: '강사', assistant: '보조강사', manager: '운영 매니저' };

const SUB_TABS = [
  { id: 'shift',      label: '근무' },
  { id: 'contract',   label: '계약' },
  { id: 'permission', label: '권한' },
];

function formatClock(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}
function nowHHmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
function monthStart(month) {
  return `${month}-01`;
}
function monthEnd(month) {
  const [year, m] = String(month || '').split('-').map(Number);
  if (!year || !m) return '';
  const last = new Date(year, m, 0).getDate();
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
  const canManageStaffPermissions = role === 'owner' || currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canManageStaffPermissions',
  );
  if (canManageStaff) {
    return <OwnerStaffView
      canInviteManagers={role === 'owner'}
      canManageStaffPermissions={canManageStaffPermissions}
    />;
  }
  return <MyStaffView />;
}

// ═══════════════════════════════════════════════════════════════════
// Owner 뷰 — 직원 리스트 + 상세
// ═══════════════════════════════════════════════════════════════════
function OwnerStaffView({ canInviteManagers = false, canManageStaffPermissions = false }) {
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const academyManagers = useAcademyStore((s) => s.academyManagers) ?? [];
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];

  const academyInvitations = useWorkspaceStore((s) => s.academyInvitations) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const refreshWorkspaceCollaborationState = useWorkspaceStore(
    (s) => s.refreshWorkspaceCollaborationState,
  );

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | teacher | assistant | manager | pending
  const [selectedKey, setSelectedKey] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [roleCandidates, setRoleCandidates] = useState([]);
  const [isRoleCandidatesLoading, setIsRoleCandidatesLoading] = useState(false);

  const loadRoleCandidates = useCallback(async () => {
    if (!currentAcademyId) {
      setRoleCandidates([]);
      return [];
    }
    setIsRoleCandidatesLoading(true);
    try {
      const list = await listAcademyRoleAssignmentCandidates(currentAcademyId);
      setRoleCandidates(list);
      return list;
    } catch (err) {
      // SQL 026 미적용 같은 서버 상태는 기존 초대 기능을 막지 않도록 콘솔에만 남긴다.
      console.warn('[staff] role-assignment candidates failed', err);
      setRoleCandidates([]);
      return [];
    } finally {
      setIsRoleCandidatesLoading(false);
    }
  }, [currentAcademyId]);

  // 초대 수락 시 invitation/membership 실시간 갱신이 일어나면 후보도 다시 읽는다.
  useEffect(() => {
    loadRoleCandidates();
  }, [loadRoleCandidates, academyInvitations]);

  const todayStr = todayDate();
  const weekDates = useMemo(() => getWeekDates(todayStr), [todayStr]);
  const currentMonth = getCurrentMonth();

  const allStaff = useMemo(() => [
    ...academyTeachers.map((t) => ({ ...t, _role: 'teacher', _kind: 'staff' })),
    ...academyAssistants.map((a) => ({ ...a, _role: 'assistant', _kind: 'staff' })),
    ...(canInviteManagers ? academyManagers.map((m) => ({ ...m, _role: 'manager', _kind: 'staff' })) : []),
  ], [academyTeachers, academyAssistants, academyManagers, canInviteManagers]);

  const pendingInvitations = useMemo(
    () => (academyInvitations || []).filter((inv) => inv.status === 'pending'),
    [academyInvitations],
  );

  // 직원별 요약 (이번 주 근무 시간, 오늘 근무 수)
  const staffSummaries = useMemo(() => {
    const map = new Map();
    for (const staff of allStaff) {
      map.set(staff.id, {
        weekMin: 0,
        weekGrossMin: 0,
        weekBreakMin: 0,
        monthMin: 0,
        todayCount: 0,
        hasShift: false,
      });
    }
    for (const sh of academyStaffShifts) {
      if (!sh.staffId || sh.status === 'canceled') continue;
      const cur = map.get(sh.staffId);
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
    if (filter === 'pending') {
      for (const candidate of roleCandidates) {
        const matches = [candidate.display_name, candidate.email, candidate.phone]
          .some((value) => (value || '').toLowerCase().includes(q));
        if (q && !matches) continue;
        items.push({
          kind: 'candidate', id: candidate.member_id,
          key: `candidate_${candidate.member_id}`, candidate,
        });
      }
      for (const inv of pendingInvitations) {
        if (q && !(inv.email || '').toLowerCase().includes(q)) continue;
        items.push({ kind: 'pending', id: inv.id, key: `inv_${inv.id}`, inv });
      }
    } else {
      for (const s of allStaff) {
        if (filter === 'teacher' && s._role !== 'teacher') continue;
        if (filter === 'assistant' && s._role !== 'assistant') continue;
        if (filter === 'manager' && s._role !== 'manager') continue;
        if (q && !(s.name || '').toLowerCase().includes(q)
              && !(s.email || '').toLowerCase().includes(q)) continue;
        items.push({ kind: 'staff', id: s.id, key: `staff_${s.id}`, staff: s });
      }
      if (filter === 'all') {
        for (const candidate of roleCandidates) {
          const matches = [candidate.display_name, candidate.email, candidate.phone]
            .some((value) => (value || '').toLowerCase().includes(q));
          if (q && !matches) continue;
          items.push({
            kind: 'candidate', id: candidate.member_id,
            key: `candidate_${candidate.member_id}`, candidate,
          });
        }
        for (const inv of pendingInvitations) {
          if (q && !(inv.email || '').toLowerCase().includes(q)) continue;
          items.push({ kind: 'pending', id: inv.id, key: `inv_${inv.id}`, inv });
        }
      }
    }
    return items;
  }, [allStaff, pendingInvitations, roleCandidates, filter, search]);

  const selectedItem = useMemo(() => {
    if (!selectedKey) return visibleItems[0] || null;
    return visibleItems.find((it) => it.key === selectedKey) || visibleItems[0] || null;
  }, [selectedKey, visibleItems]);

  const handleSelect = (item) => {
    setSelectedKey(item.key);
    setMobileDetailOpen(true);
  };

  const handleBackToList = () => setMobileDetailOpen(false);

  return (
    <div className="md:bg-[#F2F4F6] md:min-h-screen">
      <Header
        title="직원"
        right={
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="hidden md:flex items-center gap-1.5 bg-[#0064FF] text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-[#0050CC]"
          >
            <Plus size={14} /> 직원 초대
          </button>
        }
      />
      <div className="pt-14 md:pt-0 pb-12 md:pb-8">
        <div className="px-4 pt-4 md:grid md:grid-cols-[320px_1fr] lg:grid-cols-[340px_1fr] md:gap-6">
          {/* 좌측: 직원 리스트 */}
          <aside
            className={`md:sticky md:top-6 md:self-start ${
              mobileDetailOpen ? 'hidden md:block' : 'block'
            }`}
          >
            <div className="md:bg-white md:rounded-2xl md:p-3 md:shadow-sm">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#F2F4F6] mb-3">
                <Search size={14} className="text-[#8B95A1]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="이름 또는 이메일 검색"
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                />
              </div>
              <div className={`grid ${canInviteManagers ? 'grid-cols-5' : 'grid-cols-4'} gap-1 bg-[#F2F4F6] rounded-2xl p-1 mb-3`}>
                {[
                  { id: 'all', label: '전체' },
                  { id: 'teacher', label: '강사' },
                  { id: 'assistant', label: '보조' },
                  ...(canInviteManagers ? [{ id: 'manager', label: '운영' }] : []),
                  { id: 'pending', label: '대기' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                      filter === item.id ? 'bg-white text-[#3182F6] shadow-sm' : 'text-[#8B95A1]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="md:hidden w-full flex items-center justify-center gap-1.5 mb-3 py-2.5 rounded-xl bg-[#0064FF] text-white text-sm font-bold active:bg-[#0050CC]"
              >
                <Plus size={14} /> 직원 초대
              </button>

              {isRoleCandidatesLoading && (filter === 'all' || filter === 'pending') && (
                <div className="mb-2 px-1 text-[11px] text-[#8B95A1] flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> 역할 배정 대기자를 확인하고 있어요.
                </div>
              )}

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
              selectedItem.kind === 'pending' ? (
                <PendingInvitationDetail
                  inv={selectedItem.inv}
                  onBack={handleBackToList}
                />
              ) : selectedItem.kind === 'candidate' ? (
                <RoleAssignmentDetail
                  candidate={selectedItem.candidate}
                  canAssignManager={canInviteManagers}
                  onBack={handleBackToList}
                  onAssigned={async () => {
                    await refreshWorkspaceCollaborationState?.({ reason: 'staff-role-assigned' });
                    await loadRoleCandidates();
                    setSelectedKey(null);
                  }}
                />
              ) : (
                <StaffDetailPanel
                  staff={selectedItem.staff}
                  summary={staffSummaries.get(selectedItem.staff.id)}
                  onBack={handleBackToList}
                  canManageManager={canInviteManagers}
                  canManageStaffPermissions={canManageStaffPermissions}
                />
              )
            ) : (
              <EmptyDetailPanel onAdd={() => setInviteOpen(true)} />
            )}
          </section>
        </div>
      </div>

      {/* 직원 초대 — 역할을 먼저 정하고, 직원은 수락만 하면 바로 참여 */}
      {inviteOpen && (
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
                역할과 이메일을 선택해 초대하세요. 상대방은 초대를 수락하면
                선택한 역할로 바로 학원에 참여해요.
              </p>
            </div>
            <StaffInviteWidget canInviteManagers={canInviteManagers} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 직원/초대 카드 ────────────────────────────────────────────────
function StaffRosterCard({ item, active, summary, onClick }) {
  if (item.kind === 'candidate') {
    const candidate = item.candidate;
    const name = candidate.display_name || candidate.email || '(이름 없음)';
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
          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0 text-sm font-bold text-orange-600">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold truncate ${active ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
              {name}
            </p>
            <p className="text-[11px] text-[#8B95A1] mt-0.5 truncate">
              {candidate.email || '이메일 없음'} · 역할 배정 대기
            </p>
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700">
            배정 필요
          </span>
        </div>
      </button>
    );
  }
  if (item.kind === 'pending') {
    const inv = item.inv;
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
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Mail size={15} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold truncate ${active ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
              {inv.email}
            </p>
            <p className="text-[11px] text-[#8B95A1] mt-0.5">
              {inv.role === 'pending' ? '직원 · 역할 미지정' : `${STAFF_ROLE_LABELS[inv.role] || '직원'} · 초대 대기`}
            </p>
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
            대기
          </span>
        </div>
      </button>
    );
  }
  const staff = item.staff;
  const isAssistant = staff?._role === 'assistant';
  const weekHours = formatShiftHoursFromMinutes(summary?.weekGrossMin ?? summary?.weekMin ?? 0);
  const netWeekHours = formatShiftHoursFromMinutes(summary?.weekMin || 0);
  const hasShift = summary?.hasShift;
  const statusBadge = !hasShift
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
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
          isAssistant ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-[#3182F6]'
        }`}>
          {(staff.name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold truncate ${active ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
            {staff.name || '(이름 없음)'}
          </p>
          <p className="text-[11px] mt-0.5 text-[#8B95A1]">
            {isAssistant ? '보조강사' : '강사'} · 이번 주 {weekHours}시간
            {summary?.weekBreakMin > 0 ? ` · 휴게 제외 ${netWeekHours}시간` : ''}
          </p>
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusBadge.tone}`}>
          {statusBadge.label}
        </span>
      </div>
    </button>
  );
}

// ─── 빈 상세 패널 ──────────────────────────────────────────────────
function EmptyDetailPanel({ onAdd }) {
  return (
    <div className="bg-white rounded-2xl p-8 md:p-10 shadow-sm text-center">
      <UsersIcon size={22} className="text-gray-300 mx-auto mb-2" />
      <p className="text-sm font-semibold text-[#191F28]">등록된 직원이 없어요.</p>
      <p className="text-xs text-[#8B95A1] mt-1 mb-4">강사·보조강사를 초대해보세요.</p>
      <button
        type="button"
        onClick={onAdd}
        className="px-4 py-2.5 rounded-xl bg-[#0064FF] text-white text-sm font-bold active:bg-[#0050CC]"
      >
        + 직원 초대
      </button>
    </div>
  );
}

function RoleChoice({ value, onChange, allowManager = false }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-2">역할</p>
      <div className={`grid ${allowManager ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
        {[
          { id: 'teacher', label: '강사', desc: '수업을 진행해요.' },
          { id: 'assistant', label: '보조강사', desc: '클리닉/관리 업무를 맡아요.' },
          ...(allowManager ? [{ id: 'manager', label: '운영 매니저', desc: '데스크 운영을 관리해요.' }] : []),
        ].map((item) => {
          const active = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`rounded-2xl border px-3 py-3 text-left active:opacity-80 ${
                active ? 'border-[#3182F6] bg-blue-50' : 'border-gray-200 bg-white'
              }`}
            >
              <p className={`text-sm font-bold ${active ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
                {item.label}
              </p>
              <p className="text-[11px] text-[#8B95A1] mt-0.5">{item.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── 수락 후 역할 배정 대기 직원 ─────────────────────────────────
function RoleAssignmentDetail({ candidate, canAssignManager = false, onBack, onAssigned }) {
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const saveAcademyStaffProfile = useWorkspaceStore((s) => s.saveAcademyStaffProfile);
  const showToast = useAcademyStore((s) => s.showToast);
  const [role, setRole] = useState('teacher');
  const [saving, setSaving] = useState(false);
  const name = candidate?.display_name || candidate?.email || '(이름 없음)';

  const handleAssign = async () => {
    if (!currentAcademyId || !candidate?.user_id || !candidate?.member_id || saving) return;
    setSaving(true);
    try {
      // 프로필을 먼저 준비해 역할 활성화 직후에도 근무/권한 설정이 일관되게 보이게 한다.
      await saveAcademyStaffProfile({
        academyId: currentAcademyId,
        userId: candidate.user_id,
        memberId: candidate.member_id,
        role,
        subjects: [],
        wageType: 'hourly',
        hourlyWage: 0,
        monthlySalary: 0,
        memo: null,
        status: 'active',
        permissions: {},
        scope: {},
      });
      await assignAcademyMemberRole({
        academyId: currentAcademyId,
        userId: candidate.user_id,
        role,
      });
      try {
        await onAssigned?.();
      } catch (err) {
        console.warn('[staff] post-assignment refresh failed', err);
      }
      showToast(`${name}님에게 ${STAFF_ROLE_LABELS[role]} 역할을 배정했어요.`);
    } catch (err) {
      showToast(err?.message ?? '역할 배정에 실패했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="md:hidden flex items-center gap-1 text-sm font-semibold text-[#4E5968] mb-3"
      >
        <ChevronLeft size={16} /> 목록으로
      </button>
      <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-base font-bold text-orange-600 flex-shrink-0">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-[#191F28] truncate">{name}</p>
            <p className="text-xs text-[#8B95A1] mt-0.5 truncate">
              {candidate.email || '이메일 정보 없음'}
              {candidate.phone ? ` · ${candidate.phone}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-orange-50 px-4 py-3 flex items-start gap-2">
          <Clock size={14} className="text-orange-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-orange-700 leading-relaxed">
            초대 수락은 완료됐어요. 아래 역할을 배정하면 이 직원이 바로 학원 기능을 사용할 수 있어요.
          </p>
        </div>

        <div className="mt-5">
          <RoleChoice value={role} onChange={setRole} allowManager={canAssignManager} />
        </div>

        <button
          type="button"
          onClick={handleAssign}
          disabled={saving}
          className="mt-5 w-full py-3 rounded-xl bg-[#0064FF] text-white text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? '역할 배정 중…' : `${STAFF_ROLE_LABELS[role]}로 역할 배정`}
        </button>
      </div>
    </div>
  );
}

// ─── 대기 중인 초대 상세 ───────────────────────────────────────────
function PendingInvitationDetail({ inv, onBack }) {
  const [cancelling, setCancelling] = useState(false);
  const cancelAcademyInvitationById = useWorkspaceStore((s) => s.cancelAcademyInvitationById);
  const showToast = useAcademyStore((s) => s.showToast);

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await cancelAcademyInvitationById(inv.id);
      showToast('초대를 취소했어요.');
    } catch (err) {
      showToast(err?.message ?? '초대 취소에 실패했어요.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="md:hidden flex items-center gap-1 text-sm font-semibold text-[#4E5968] mb-3"
      >
        <ChevronLeft size={16} /> 목록으로
      </button>
      <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Mail size={18} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-[#191F28] truncate">{inv.email}</p>
            <p className="text-xs text-[#8B95A1] mt-0.5">
              {inv.role === 'pending'
                ? '직원 · 초대 대기 중'
                : `${STAFF_ROLE_LABELS[inv.role] || '직원'} · 초대 대기 중`}
            </p>
          </div>
        </div>
        <div className="mt-5 bg-amber-50 rounded-2xl px-4 py-3 flex items-start gap-2">
          <Clock size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            상대가 같은 이메일로 로그인하면 앱 안에서 초대를 수락할 수 있어요.
            {inv.role === 'pending'
              ? ' 이전 방식의 초대라 수락 뒤 역할을 한 번 정해야 해요.'
              : ` 수락하면 바로 ${STAFF_ROLE_LABELS[inv.role] || '직원'}로 참여해요.`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          className="mt-4 w-full py-3 rounded-xl bg-red-50 text-red-600 text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {cancelling ? <Loader2 size={13} className="animate-spin" /> : <XIcon size={13} />}
          초대 취소
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 직원 상세 패널 (sub-tabs: 근무/계약/권한)
// ═══════════════════════════════════════════════════════════════════
function StaffDetailPanel({
  staff, summary, onBack, canManageManager = false, canManageStaffPermissions = false,
}) {
  const [subTab, setSubTab] = useState('shift');
  const isAssistant = staff?._role === 'assistant';
  const staffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const saveAcademyStaffProfile = useWorkspaceStore((s) => s.saveAcademyStaffProfile);
  const changeLocalStaffRole = useAcademyStore((s) => s.changeLocalStaffRole);
  const showToast = useAcademyStore((s) => s.showToast);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const serverProfile = useMemo(
    () => staff.serverUserId ? staffProfiles.find((p) => p.user_id === staff.serverUserId) : null,
    [staffProfiles, staff.serverUserId],
  );
  const [roleEditing, setRoleEditing] = useState(false);
  const [roleDraft, setRoleDraft] = useState(staff?._role || 'teacher');
  const [roleSaving, setRoleSaving] = useState(false);

  useEffect(() => {
    setRoleDraft(staff?._role || 'teacher');
    setRoleEditing(false);
  }, [staff?.id, staff?._role]);

  const handleRoleSave = async () => {
    if (!staff?.id || roleDraft === staff._role) {
      setRoleEditing(false);
      return;
    }
    const previousRole = staff._role;
    setRoleSaving(true);
    try {
      // academy_members.role 이 실제 앱 권한의 source of truth다.
      // 운영 매니저는 강사/보조강사의 세부 권한만 조정하고 역할 자체는 원장만 바꾼다.
      if (staff.serverUserId && currentAcademyId) {
        await updateAcademyMemberRole({
          academyId: currentAcademyId,
          userId: staff.serverUserId,
          role: roleDraft,
        });
      }
      changeLocalStaffRole?.(staff.id, previousRole, roleDraft, { source: staff.source || 'server' });
      if (staff.serverUserId && saveAcademyStaffProfile) {
        await saveAcademyStaffProfile({
          userId: staff.serverUserId,
          role: roleDraft,
          subjects: serverProfile?.subjects || staff.subjects || [],
          wageType: serverProfile?.wage_type || staff.wageType || 'hourly',
          hourlyWage: serverProfile?.hourly_wage ?? staff.hourlyWage ?? 0,
          monthlySalary: serverProfile?.monthly_salary ?? staff.monthlySalary ?? 0,
          memo: serverProfile?.memo ?? staff.memo ?? null,
          status: serverProfile?.status || staff.status || 'active',
          permissions: serverProfile?.permissions || staff.permissions || {},
          scope: serverProfile?.scope || staff.scope || {},
        });
      }
      showToast('역할이 저장되었습니다.');
      setRoleEditing(false);
    } catch (err) {
      changeLocalStaffRole?.(staff.id, roleDraft, previousRole, { source: staff.source || 'server' });
      setRoleDraft(previousRole);
      showToast(err?.message ?? '역할 저장에 실패했어요.', 'error');
    } finally {
      setRoleSaving(false);
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
              <span className="text-[11px] font-bold text-[#8B95A1]">역할</span>
              {roleEditing ? (
                <>
                  <select
                    value={roleDraft}
                    onChange={(e) => setRoleDraft(e.target.value)}
                  disabled={roleSaving || !canManageManager}
                    className="h-8 rounded-lg border border-[#E5E8EB] bg-white px-2 text-xs font-bold text-[#191F28] focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="teacher">강사</option>
                    <option value="assistant">보조강사</option>
                    {canManageManager && <option value="manager">운영 매니저</option>}
                  </select>
                  <button
                    type="button"
                    onClick={handleRoleSave}
                    disabled={roleSaving}
                    className="h-8 px-2.5 rounded-lg bg-[#3182F6] text-white text-xs font-bold flex items-center gap-1 disabled:opacity-60"
                  >
                    {roleSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRoleDraft(staff._role); setRoleEditing(false); }}
                    disabled={roleSaving}
                    className="h-8 px-2.5 rounded-lg bg-[#F2F4F6] text-[#4E5968] text-xs font-bold disabled:opacity-60"
                  >
                    취소
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setRoleEditing(true)}
                  disabled={!canManageManager}
                  className={`h-8 rounded-lg px-2.5 text-xs font-bold flex items-center gap-1.5 ${
                    isAssistant ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {STAFF_ROLE_LABELS[staff._role] || '강사'}
                  <Pencil size={11} />
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
        {SUB_TABS.map((tab) => {
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
      {subTab === 'shift'      && <StaffShiftSection staff={staff} />}
      {subTab === 'contract'   && <StaffContractSection staff={staff} />}
      {subTab === 'permission' && <StaffPermissionSection
        staff={staff}
        canManageManager={canManageManager}
        canManageStaffPermissions={canManageStaffPermissions}
      />}
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
    const keyOfRule = (rule) => [
      (rule.start_time || '').slice(0, 5),
      (rule.end_time || '').slice(0, 5),
      Number(rule.break_minutes || 0),
      rule.effective_start_date || '',
      rule.effective_end_date || '',
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
        scheduledStartTime: (first.start_time || '').slice(0, 5),
        scheduledEndTime: (first.end_time || '').slice(0, 5),
        breakMinutes: first.break_minutes ? String(first.break_minutes) : '',
        memo: first.memo || '',
      };
    }

    if (sourceShift) {
      return {
        weekdays: [getKoreanWeekdayFromYMD(sourceShift.date)].filter(Boolean),
        startDate: sourceShift.date || todayStr,
        endDate: '',
        scheduledStartTime: sourceShift.scheduledStartTime || '',
        scheduledEndTime: sourceShift.scheduledEndTime || '',
        breakMinutes: sourceShift.breakMinutes ? String(sourceShift.breakMinutes) : '',
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
    const timeError = validateShiftTime({
      startTime: data.scheduledStartTime,
      endTime: data.scheduledEndTime,
      breakMinutes: data.breakMinutes,
    });
    if (timeError) { showToast(timeError, 'error'); return; }
    const daysOfWeek = (data.weekdays || []).map((d) => KO_TO_DOW[d]).filter((d) => d !== undefined);
    if (daysOfWeek.length === 0) return;
    const selectedDowSet = new Set(daysOfWeek);
    const overlappingRules = (staffWorkRules || []).filter((rule) =>
      rule.is_active
      && rule.staff_user_id === staff.serverUserId
      && selectedDowSet.has(rule.day_of_week)
    );
    const shouldReplaceShift = (shift) => {
      if (!shift || shift.status !== 'scheduled') return false;
      if (shift.actualStartTime || shift.actualEndTime) return false;
      if (!(shift.staffId === staff.id || shift.staffUserId === staff.serverUserId)) return false;
      if (!shift.date || shift.date < data.startDate) return false;
      if (data.endDate && shift.date > data.endDate) return false;
      const dow = KO_TO_DOW[getKoreanWeekdayFromYMD(shift.date)];
      if (!selectedDowSet.has(dow)) return false;
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
    const result = await saveRecurringStaffWorkSchedule({
      academyId: isAuthenticated ? currentAcademyId : null,
      staff,
      weekdays: daysOfWeek,
      startTime: data.scheduledStartTime,
      endTime: data.scheduledEndTime,
      breakMinutes: data.breakMinutes,
      effectiveStartDate: data.startDate,
      effectiveEndDate: data.endDate || null,
      memo: data.memo,
      todayYMD: todayStr,
      existingRules: staffWorkRules,
      existingShifts: academyStaffShifts.filter((shift) => !replaceIds.has(shift.id)),
      addLocalShift: addAcademyStaffShift,
      setLocalShiftServerId: setStaffShiftServerId,
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

      <div className="overflow-hidden md:overflow-x-auto">
        <div className="w-full md:min-w-[760px]">
          <div className="grid grid-cols-7 bg-[#FBFCFD] border-b border-[#F2F4F6]">
            {DOW_TO_KO.map((day) => (
              <div key={day} className="px-1 py-2 text-center text-[10px] font-extrabold text-[#8B95A1] md:px-3 md:text-left md:text-[11px]">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dates.map((date, idx) => {
              if (!date) {
                return <div key={`blank-${idx}`} className="min-h-[92px] border-r border-b border-[#F2F4F6] bg-[#FBFCFD] md:min-h-[120px]" />;
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
      className={`min-h-[92px] border-r border-b border-[#F2F4F6] p-1.5 text-left transition-colors hover:bg-blue-50/40 md:min-h-[120px] md:p-3 ${
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
            {formatShiftHoursFromMinutes(grossMin)}h
            {grossMin !== netMin ? <span className="hidden md:inline">{` · 급여 ${formatShiftHoursFromMinutes(netMin)}h`}</span> : ''}
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
    scheduledStartTime: initialRecurring?.scheduledStartTime || '',
    scheduledEndTime: initialRecurring?.scheduledEndTime || '',
    breakMinutes: initialRecurring?.breakMinutes || '',
    memo: initialRecurring?.memo || '',
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
        todayYMD: todayDate(),
      });
      return { ...preview, dates: preview.dates.slice(0, 3) };
    } catch { return null; }
  }, [mode, recurring.startDate, recurring.endDate, recurring.weekdays]);

  const recurringSummary = useMemo(() => {
    const start = hhmmToMin(recurring.scheduledStartTime);
    const end = hhmmToMin(recurring.scheduledEndTime);
    if (start == null || end == null || end <= start || recurring.weekdays.length === 0) {
      return null;
    }
    const breakMin = Number(recurring.breakMinutes) || 0;
    const dailyGrossMin = end - start;
    const dailyNetMin = Math.max(0, dailyGrossMin - breakMin);
    const count = recurring.weekdays.length;
    return {
      count,
      dailyGrossMin,
      dailyNetMin,
      weeklyGrossMin: dailyGrossMin * count,
      weeklyNetMin: dailyNetMin * count,
      weeklyBreakMin: breakMin * count,
    };
  }, [
    recurring.scheduledStartTime,
    recurring.scheduledEndTime,
    recurring.breakMinutes,
    recurring.weekdays,
  ]);

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

  const canSaveSingle = !!form.date && !singleTimeError;
  const canSaveRecurring = recurring.weekdays.length > 0 && !!recurring.startDate
    && !recurringTimeError
    && (recurringEndMode !== 'until' || !!recurring.endDate)
    && !(recurringEndMode === 'until' && recurring.endDate && recurring.endDate < recurring.startDate);
  const canSave = mode === 'single' ? canSaveSingle : canSaveRecurring;

  const toggleWeekday = (d) => {
    setRecurring((f) => {
      const has = f.weekdays.includes(d);
      return { ...f, weekdays: has ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] };
    });
  };

  const handleSave = () => {
    if (!canSave) return;
    if (mode === 'recurring') {
      onSaveRecurring?.({
        weekdays: recurring.weekdays,
        startDate: recurring.startDate,
        endDate: recurringEndMode === 'until' ? recurring.endDate : '',
        scheduledStartTime: recurring.scheduledStartTime,
        scheduledEndTime: recurring.scheduledEndTime,
        breakMinutes: recurring.breakMinutes,
        memo: recurring.memo,
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
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">반복 요일 *</label>
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
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">언제부터 적용할까요?</label>
              <div className="grid grid-cols-2 gap-2">
                <ChoiceCard
                  active={recurringStartMode === 'today'}
                  title="오늘부터"
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
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">휴게(분)</label>
              <input type="number" value={recurring.breakMinutes} onChange={(e) => setRecurring((f) => ({ ...f, breakMinutes: e.target.value }))} placeholder="0" className="input" />
            </div>
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
                  {recurring.weekdays.join(', ')} {formatShiftTimeRange(recurring.scheduledStartTime, recurring.scheduledEndTime)}
                </p>
                {recurringSummary && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-white/70 px-3 py-2">
                      <p className="text-[10px] font-semibold text-[#8B95A1]">주 근무</p>
                      <p className="text-sm font-extrabold text-[#191F28]">
                        {formatShiftHoursFromMinutes(recurringSummary.weeklyGrossMin)}h
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/70 px-3 py-2">
                      <p className="text-[10px] font-semibold text-[#8B95A1]">휴게 제외</p>
                      <p className="text-sm font-extrabold text-[#191F28]">
                        {formatShiftHoursFromMinutes(recurringSummary.weeklyNetMin)}h
                      </p>
                    </div>
                  </div>
                )}
                {recurringSummary?.weeklyBreakMin > 0 && (
                  <p className="text-[11px] text-[#4E5968] mt-2 leading-relaxed">
                    휴게 {formatShiftHoursFromMinutes(recurringSummary.weeklyBreakMin)}h가 빠져서 급여 기준 시간은 {formatShiftHoursFromMinutes(recurringSummary.weeklyNetMin)}h예요.
                  </p>
                )}
                <p className="text-[11px] text-[#8B95A1] mt-2 leading-relaxed">
                  {recurringEndMode === 'until' && recurring.endDate
                    ? `${recurring.startDate}부터 ${recurring.endDate}까지 반복돼요.`
                    : `${recurring.startDate}부터 계속 반복돼요.`}
                  {recurringPreview.dates.length > 0 ? ` 다음 일정: ${recurringPreview.dates.map((d) => formatDateShort(d)).join(', ')}` : ''}
                </p>
                <p className="text-[11px] text-[#8B95A1] mt-1 leading-relaxed">
                  실제 급여는 이 예정표가 아니라 저장된 출퇴근 기록을 기준으로 계산돼요.
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
function StaffPermissionSection({
  staff, canManageManager = false, canManageStaffPermissions = false,
}) {
  const staffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const saveAcademyStaffProfile = useWorkspaceStore((s) => s.saveAcademyStaffProfile);
  const showToast = useAcademyStore((s) => s.showToast);

  const serverProfile = useMemo(
    () => staff.serverUserId ? staffProfiles.find((p) => p.user_id === staff.serverUserId) : null,
    [staffProfiles, staff.serverUserId],
  );

  const initial = useMemo(() => {
    if (serverProfile?.permissions && typeof serverProfile.permissions === 'object'
        && Object.keys(serverProfile.permissions).length > 0) {
      return { ...resolvePermissions(staff._role, serverProfile.permissions) };
    }
    return { ...PERMISSION_DEFAULTS[staff._role] };
  }, [serverProfile, staff._role]);

  const [permissions, setPermissions] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(
    () => PERMISSION_KEYS.some((k) => !!permissions[k] !== !!initial[k]),
    [permissions, initial],
  );

  const handleSave = async () => {
    if (!staff.serverUserId) {
      showToast('서버 계정에 연결되지 않은 직원은 권한을 저장할 수 없어요.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveAcademyStaffProfile({
        userId: staff.serverUserId,
        role: staff._role,
        subjects: serverProfile?.subjects || [],
        wageType: serverProfile?.wage_type || staff.wageType || 'hourly',
        hourlyWage: serverProfile?.hourly_wage || staff.hourlyWage || 0,
        monthlySalary: serverProfile?.monthly_salary || staff.monthlySalary || 0,
        memo: serverProfile?.memo || null,
        status: 'active',
        permissions,
        scope: serverProfile?.scope || {},
      });
      showToast('권한이 저장되었습니다.');
    } catch (err) {
      showToast(err?.message ?? '권한 저장에 실패했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={15} className="text-[#3182F6]" />
          <p className="text-sm font-bold text-[#191F28]">기능 권한</p>
        </div>
        <div className="flex flex-col gap-1">
          {PERMISSION_KEYS.map((key) => (
            <label key={key} className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-[#191F28]">{PERMISSION_LABELS[key]}</span>
              <input
                type="checkbox"
                checked={!!permissions[key]}
                disabled={!canManageStaffPermissions || (staff._role === 'manager' && !canManageManager)}
                onChange={(e) => setPermissions((prev) => ({ ...prev, [key]: e.target.checked }))}
                className="w-4 h-4 rounded accent-blue-600"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving || !staff.serverUserId || !canManageStaffPermissions || (staff._role === 'manager' && !canManageManager)}
          className="mt-3 w-full py-3 rounded-xl bg-[#3182F6] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          {staff.serverUserId ? '권한 저장' : '서버 계정 연결 후 저장 가능'}
        </button>
        <p className="text-[11px] text-[#8B95A1] mt-2 leading-relaxed">
          기본값은 역할별로 설정돼 있어요. 권한 변경은 앱 안 UI 노출/숨김에 즉시 반영됩니다.
        </p>
      </div>
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
  const isManager = staff._role === 'manager';

  const myGroups = useMemo(() => {
    if (isAssistant || isManager) return [];
    return classGroups.filter((g) => g.teacherId === staff.id);
  }, [classGroups, staff.id, isAssistant, isManager]);

  const myClinicTasks = useMemo(() => {
    if (!isAssistant) return [];
    return clinicTasks.filter((t) => t.assignedToId === staff.id);
  }, [clinicTasks, staff.id, isAssistant]);

  return (
    <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#191F28]">
            {isAssistant ? '담당 클리닉' : isManager ? '운영 담당' : '맡고 있는 반'}
          </p>
          <p className="text-[11px] text-[#8B95A1] mt-1">
            {isManager ? '학생·수납·직원 운영 권한은 권한 탭에서 관리해요.' : '배정 정보는 근무표와 함께 확인해요.'}
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
            <p className="text-sm font-bold text-gray-700 mb-1">연결된 강사 정보가 없어요</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              원장이 본 계정과 연결된 강사/보조강사 항목을 만들면 여기에 일정이 표시돼요.
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
