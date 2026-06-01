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

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Repeat, ChevronLeft, ChevronRight, Pencil, Trash2,
  Clock, Search, Users as UsersIcon, GraduationCap, Mail, X as XIcon,
  Loader2, Check, BookOpen, Coffee, AlertTriangle,
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
  getCurrentMonth,
  getWeekDates,
  getKoreanWeekdayFromYMD,
} from '../../../utils/date';
import {
  createAcademyStaffShift,
  updateAcademyStaffShift as updateServerStaffShift,
  deleteAcademyStaffShift as deleteServerStaffShift,
} from '../../../services/supabase/domainApi';
import { updateStaffWorkRule } from '../../../services/supabase/scheduleRulesApi';
import {
  buildRecurringStaffWorkPreview,
  saveRecurringStaffWorkSchedule,
} from '../../../services/staffWorkScheduleService';
import {
  buildShiftTimeline,
  findShiftCoveringTime,
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
} from '../../../utils/staffPermissions';
import StaffInviteWidget from '../more/StaffInviteWidget';

const KOREAN_WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const KO_TO_DOW = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };

const STATUS_LABELS = { scheduled: '예정', completed: '완료', canceled: '취소' };
const STATUS_TONES = {
  scheduled: 'text-blue-700 bg-blue-50',
  completed: 'text-emerald-700 bg-emerald-50',
  canceled: 'text-gray-500 bg-gray-100',
};
const STAFF_ROLE_LABELS = { teacher: '강사', assistant: '보조강사' };

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
function formatTimelineHour(minutes) {
  const h = Math.floor((Number(minutes) || 0) / 60);
  return `${String(h).padStart(2, '0')}:00`;
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
  if (role === 'owner') return <OwnerStaffView />;
  return <MyStaffView />;
}

// ═══════════════════════════════════════════════════════════════════
// Owner 뷰 — 직원 리스트 + 상세
// ═══════════════════════════════════════════════════════════════════
function OwnerStaffView() {
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];

  const academyInvitations = useWorkspaceStore((s) => s.academyInvitations) ?? [];

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | teacher | assistant | pending
  const [selectedKey, setSelectedKey] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState('teacher'); // 'teacher' | 'assistant'
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const todayStr = todayDate();
  const weekDates = useMemo(() => getWeekDates(todayStr), [todayStr]);
  const currentMonth = getCurrentMonth();

  const allStaff = useMemo(() => [
    ...academyTeachers.map((t) => ({ ...t, _role: 'teacher', _kind: 'staff' })),
    ...academyAssistants.map((a) => ({ ...a, _role: 'assistant', _kind: 'staff' })),
  ], [academyTeachers, academyAssistants]);

  const pendingInvitations = useMemo(
    () => (academyInvitations || []).filter((inv) => inv.status === 'pending'),
    [academyInvitations],
  );

  // 직원별 요약 (이번 주 근무 시간, 오늘 근무 수)
  const staffSummaries = useMemo(() => {
    const map = new Map();
    for (const staff of allStaff) {
      map.set(staff.id, { weekMin: 0, monthMin: 0, todayCount: 0, hasShift: false });
    }
    for (const sh of academyStaffShifts) {
      if (!sh.staffId || sh.status === 'canceled') continue;
      const cur = map.get(sh.staffId);
      if (!cur) continue;
      cur.hasShift = true;
      if (weekDates.includes(sh.date)) cur.weekMin += scheduledShiftMinutes(sh);
      if (sh.date?.startsWith(currentMonth)) cur.monthMin += shiftMinutes(sh);
      if (sh.date === todayStr) cur.todayCount += 1;
    }
    return map;
  }, [allStaff, academyStaffShifts, weekDates, currentMonth, todayStr]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = [];
    if (filter === 'pending') {
      for (const inv of pendingInvitations) {
        if (q && !(inv.email || '').toLowerCase().includes(q)) continue;
        items.push({ kind: 'pending', id: inv.id, key: `inv_${inv.id}`, inv });
      }
    } else {
      for (const s of allStaff) {
        if (filter === 'teacher' && s._role !== 'teacher') continue;
        if (filter === 'assistant' && s._role !== 'assistant') continue;
        if (q && !(s.name || '').toLowerCase().includes(q)
              && !(s.email || '').toLowerCase().includes(q)) continue;
        items.push({ kind: 'staff', id: s.id, key: `staff_${s.id}`, staff: s });
      }
      if (filter === 'all') {
        for (const inv of pendingInvitations) {
          if (q && !(inv.email || '').toLowerCase().includes(q)) continue;
          items.push({ kind: 'pending', id: inv.id, key: `inv_${inv.id}`, inv });
        }
      }
    }
    return items;
  }, [allStaff, pendingInvitations, filter, search]);

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
            className="hidden md:flex items-center gap-1.5 bg-[#3182F6] text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-[#1B64DA]"
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
              <div className="grid grid-cols-4 gap-1 bg-[#F2F4F6] rounded-2xl p-1 mb-3">
                {[
                  { id: 'all', label: '전체' },
                  { id: 'teacher', label: '강사' },
                  { id: 'assistant', label: '보조' },
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
                className="md:hidden w-full flex items-center justify-center gap-1.5 mb-3 py-2.5 rounded-xl bg-[#3182F6] text-white text-sm font-bold active:bg-[#1B64DA]"
              >
                <Plus size={14} /> 직원 초대
              </button>

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
              ) : (
                <StaffDetailPanel
                  staff={selectedItem.staff}
                  summary={staffSummaries.get(selectedItem.staff.id)}
                  onBack={handleBackToList}
                />
              )
            ) : (
              <EmptyDetailPanel onAdd={() => setInviteOpen(true)} />
            )}
          </section>
        </div>
      </div>

      {/* 직원 초대 — 이메일 + 역할 선택 */}
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
                직원으로 초대할 이메일을 입력해주세요. 수락 후 역할과 급여 조건을 바로 설정할 수 있어요.
              </p>
            </div>
            <RoleChoice value={inviteRole} onChange={setInviteRole} />
            <StaffInviteWidget role={inviteRole} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 직원/초대 카드 ────────────────────────────────────────────────
function StaffRosterCard({ item, active, summary, onClick }) {
  if (item.kind === 'pending') {
    const inv = item.inv;
    const isAssistant = inv.role === 'assistant';
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
              {isAssistant ? '보조강사' : '강사'} · 초대 대기
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
  const weekHours = formatShiftHoursFromMinutes(summary?.weekMin || 0);
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
        className="px-4 py-2.5 rounded-xl bg-[#3182F6] text-white text-sm font-bold"
      >
        + 직원 초대
      </button>
    </div>
  );
}

function RoleChoice({ value, onChange }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-2">역할</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { id: 'teacher', label: '강사', desc: '수업을 진행해요.' },
          { id: 'assistant', label: '보조강사', desc: '클리닉/관리 업무를 맡아요.' },
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
              {inv.role === 'assistant' ? '보조강사' : '강사'} · 초대 대기 중
            </p>
          </div>
        </div>
        <div className="mt-5 bg-amber-50 rounded-2xl px-4 py-3 flex items-start gap-2">
          <Clock size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            상대가 같은 이메일로 로그인하면 앱 안에서 초대를 수락할 수 있어요.
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
function StaffDetailPanel({ staff, summary, onBack }) {
  const [subTab, setSubTab] = useState('shift');
  const isAssistant = staff?._role === 'assistant';
  const staffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const saveAcademyStaffProfile = useWorkspaceStore((s) => s.saveAcademyStaffProfile);
  const changeLocalStaffRole = useAcademyStore((s) => s.changeLocalStaffRole);
  const showToast = useAcademyStore((s) => s.showToast);
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
                    disabled={roleSaving}
                    className="h-8 rounded-lg border border-[#E5E8EB] bg-white px-2 text-xs font-bold text-[#191F28] focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="teacher">강사</option>
                    <option value="assistant">보조강사</option>
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
            <SummaryStat label="이번 주" value={`${formatShiftHoursFromMinutes(summary.weekMin)}h`} />
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
      {subTab === 'permission' && <StaffPermissionSection staff={staff} />}
    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div className="bg-[#F8F9FA] rounded-xl px-3 py-2.5 text-center">
      <p className="text-base font-extrabold text-[#191F28]">{value}</p>
      <p className="text-[11px] text-[#8B95A1] mt-0.5">{label}</p>
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
  const classSessions = useAcademyStore((s) => s.classSessions) ?? [];
  const classGroups = useAcademyStore((s) => s.classGroups) ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [defaultMode, setDefaultMode] = useState('recurring');
  const [defaultDate, setDefaultDate] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [draggingShiftId, setDraggingShiftId] = useState(null);
  const dragPayloadRef = useRef(null);
  const dropLockRef = useRef(false);

  const todayStr = todayDate();
  const weekDates = useMemo(() => getWeekDates(todayStr), [todayStr]);

  // Phase 44.6 / Phase B — 룰 기반 planned + 기존 shift 머지. 14일 너머 주간 패턴도
  // 보이게. 본인 staff 한 명에 한정.
  const staffWorkRules = useWorkspaceStore((s) => s.staffWorkRules) ?? [];
  const staffWorkExceptions = useWorkspaceStore((s) => s.staffWorkExceptions) ?? [];
  const academyTeachersAll = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistantsAll = useAcademyStore((s) => s.academyAssistants) ?? [];

  const staffShifts = useMemo(() => {
    const weekFrom = weekDates[0];
    const weekTo = weekDates[weekDates.length - 1];
    const plannedRaw = buildPlannedStaffSchedule({
      rules: staffWorkRules,
      exceptions: staffWorkExceptions,
      fromDate: weekFrom,
      toDate: weekTo,
      staffUserId: staff.serverUserId || undefined,
    });
    const plannedShaped = plannedToStaffShiftShape(plannedRaw, {
      academyTeachers: academyTeachersAll,
      academyAssistants: academyAssistantsAll,
    });
    const actualForStaff = academyStaffShifts.filter((sh) => sh.staffId === staff.id);
    return mergePlannedAndActualStaffShifts(plannedShaped, actualForStaff);
  }, [academyStaffShifts, staff.id, staff.serverUserId, staffWorkRules, staffWorkExceptions, academyTeachersAll, academyAssistantsAll, weekDates]);
  const hasAnyShift = staffShifts.some((sh) => sh.status !== 'canceled');

  const weekByDate = useMemo(() => {
    const map = new Map();
    weekDates.forEach((d) => map.set(d, []));
    for (const sh of staffShifts) {
      if (!sh.date || !map.has(sh.date)) continue;
      if (sh.status === 'canceled') continue;
      map.get(sh.date).push(sh);
    }
    for (const d of weekDates) {
      map.get(d).sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''));
    }
    return map;
  }, [staffShifts, weekDates]);

  const classGroupById = useMemo(
    () => new Map((classGroups || []).map((group) => [group.id, group])),
    [classGroups],
  );
  const classesByDate = useMemo(() => {
    const map = new Map();
    weekDates.forEach((d) => map.set(d, []));
    for (const session of classSessions || []) {
      if (!session.date || !map.has(session.date) || session.status === 'canceled') continue;
      const isAssigned = staff._role === 'assistant'
        ? ((Array.isArray(session.assistantIds) ? session.assistantIds : []).includes(staff.id) || session.assistantId === staff.id)
        : ((session.teacherId === staff.id && !session.substituteTeacherId) || session.substituteTeacherId === staff.id);
      if (!isAssigned) continue;
      map.get(session.date).push(session);
    }
    for (const d of weekDates) {
      map.get(d).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    }
    return map;
  }, [classSessions, staff.id, staff._role, weekDates]);
  const calendarRange = useMemo(() => {
    const bounds = [];
    for (const date of weekDates) {
      for (const sh of weekByDate.get(date) || []) {
        const start = hhmmToMin(sh.scheduledStartTime);
        const end = hhmmToMin(sh.scheduledEndTime);
        if (start != null) bounds.push(start);
        if (end != null) bounds.push(end);
      }
      for (const session of classesByDate.get(date) || []) {
        const start = hhmmToMin(session.startTime);
        const end = hhmmToMin(session.endTime);
        if (start != null) bounds.push(start);
        if (end != null) bounds.push(end);
      }
    }
    const min = bounds.length ? Math.min(...bounds) : 9 * 60;
    const max = bounds.length ? Math.max(...bounds) : 22 * 60;
    const startMin = Math.max(0, Math.floor((min - 60) / 60) * 60);
    const endMin = Math.min(24 * 60, Math.ceil((max + 60) / 60) * 60);
    const ticks = [];
    for (let t = startMin; t <= endMin; t += 60) ticks.push(t);
    return {
      startMin,
      endMin,
      ticks,
      height: Math.max(360, Math.round((endMin - startMin) * 0.72)),
    };
  }, [classesByDate, weekByDate, weekDates]);

  const openAddRecurring = () => {
    setEditing(null);
    setDefaultMode('recurring');
    setDefaultDate(todayStr);
    setFormOpen(true);
  };
  const openAddSingle = (date) => {
    setEditing(null);
    setDefaultMode('single');
    setDefaultDate(date || todayStr);
    setFormOpen(true);
  };
  const openEdit = (sh) => {
    setEditing(sh);
    setDefaultMode('single');
    setFormOpen(true);
  };

  const getRuleIdFromPlannedShift = (shift) => {
    if (!shift?.isPlanned) return null;
    if (shift.ruleId) return shift.ruleId;
    const parts = String(shift.id || '').split(':');
    return parts[0] === 'rule' ? parts[1] : null;
  };

  const findMatchingRuleForShift = (shift) => {
    if (!shift?.date || !staff.serverUserId) return null;
    const dow = KO_TO_DOW[getKoreanWeekdayFromYMD(shift.date)];
    return (staffWorkRules || []).find((rule) =>
      rule.is_active
      && rule.staff_user_id === staff.serverUserId
      && rule.day_of_week === dow
      && (rule.start_time || '').slice(0, 5) === (shift.scheduledStartTime || '').slice(0, 5)
      && (rule.end_time || '').slice(0, 5) === (shift.scheduledEndTime || '').slice(0, 5)
      && Number(rule.break_minutes || 0) === Number(shift.breakMinutes || 0)
    ) || null;
  };

  const applyLocalRuleDay = (ruleId, nextDow) => {
    if (!ruleId) return;
    useWorkspaceStore.setState((s) => ({
      staffWorkRules: (s.staffWorkRules || []).map((rule) =>
        rule.id === ruleId ? { ...rule, day_of_week: nextDow } : rule
      ),
    }));
  };

  const handleDropShift = async (shiftId, targetDate) => {
    if (dropLockRef.current) return;
    dropLockRef.current = true;
    const targetDow = KO_TO_DOW[getKoreanWeekdayFromYMD(targetDate)];
    const shift = staffShifts.find((sh) => sh.id === shiftId);
    setDraggingShiftId(null);
    dragPayloadRef.current = null;
    window.setTimeout(() => { dropLockRef.current = false; }, 0);
    if (!shift || !targetDate || shift.date === targetDate || targetDow == null) return;

    const matchingRule = shift.isPlanned ? null : findMatchingRuleForShift(shift);
    const ruleId = shift.isPlanned ? getRuleIdFromPlannedShift(shift) : matchingRule?.id;

    if (ruleId) {
      const prevDow = matchingRule?.day_of_week ?? KO_TO_DOW[getKoreanWeekdayFromYMD(shift.date)];
      applyLocalRuleDay(ruleId, targetDow);
      if (!shift.isPlanned) updateAcademyStaffShift(shift.id, { date: targetDate });
      try {
        await updateStaffWorkRule(ruleId, { day_of_week: targetDow });
        if (!shift.isPlanned && shift.serverId && isAuthenticated && currentAcademyId) {
          await updateServerStaffShift(shift.serverId, { date: targetDate });
          loadServerStaffShifts();
        }
        loadStaffWorkRules?.();
        showToast(`${getKoreanWeekdayFromYMD(targetDate)}요일로 옮겼어요.`);
      } catch (err) {
        applyLocalRuleDay(ruleId, prevDow);
        if (!shift.isPlanned) updateAcademyStaffShift(shift.id, { date: shift.date });
        showToast(err?.message ?? '근무 요일 변경에 실패했어요.', 'error');
      }
      return;
    }

    updateAcademyStaffShift(shift.id, { date: targetDate });
    if (shift.serverId && isAuthenticated && currentAcademyId) {
      try {
        await updateServerStaffShift(shift.serverId, { date: targetDate });
        loadServerStaffShifts();
      } catch (err) {
        console.warn('[supabase] move shift failed', err);
        showToast('요일은 옮겼지만 서버 동기화는 실패했어요.', 'error');
      }
    }
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
      existingShifts: academyStaffShifts,
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
    } else if (result.capped) {
      showToast(`근무 규칙이 저장됐어요. 이후 근무는 반복 규칙에 따라 자동으로 표시돼요.`);
    } else if (result.shiftsSkipped > 0) {
      showToast(`근무 규칙 저장 · 가까운 근무 ${result.shiftsCreated}건 준비 · ${result.shiftsSkipped}건은 중복 건너뜀.`);
    } else {
      showToast(`근무 규칙 저장 · 가까운 근무 ${result.shiftsCreated}건 준비.`);
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

  const handleDelete = async (id) => {
    const target = academyStaffShifts.find((sh) => sh.id === id);
    deleteAcademyStaffShift(id);
    if (target?.serverId && isAuthenticated && currentAcademyId) {
      try { await deleteServerStaffShift(target.serverId); }
      catch (err) { console.warn('[supabase] delete shift failed', err); }
    }
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
            onClick={openAddRecurring}
            className="w-full py-3 rounded-xl bg-[#3182F6] text-white text-sm font-bold flex items-center justify-center gap-1.5"
          >
            <Repeat size={14} /> 근무 시간 설정하기
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-[#F2F4F6] flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-[#191F28]">요일별 근무표</p>
            <p className="text-[11px] text-[#8B95A1] mt-0.5">반복 근무 패턴과 이번 주 배정 수업을 같이 확인해요.</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => openAddSingle(todayStr)}
              className="text-xs font-bold text-[#3182F6] flex items-center gap-1 px-2 py-1.5 rounded-lg active:bg-blue-50"
            >
              <Plus size={11} /> 근무 추가
            </button>
            <button
              type="button"
              onClick={openAddRecurring}
              className="text-xs font-bold text-[#3182F6] flex items-center gap-1 px-2 py-1.5 rounded-lg active:bg-blue-50"
            >
              <Repeat size={11} /> 반복 추가
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[56px_repeat(7,minmax(96px,1fr))] border-b border-[#F2F4F6] bg-[#FBFCFD]">
              <div className="px-2 py-2 text-[10px] font-bold text-[#8B95A1]">시간</div>
              {weekDates.map((date) => {
                const day = getKoreanWeekdayFromYMD(date);
                return (
                  <div
                    key={date}
                    className="px-2 py-2 border-l border-[#F2F4F6]"
                  >
                    <p className="text-xs font-extrabold text-[#191F28]">{day}</p>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-[56px_repeat(7,minmax(96px,1fr))]">
              <div className="relative bg-[#FBFCFD] border-r border-[#F2F4F6]" style={{ height: calendarRange.height }}>
                {calendarRange.ticks.map((tick) => (
                  <div
                    key={tick}
                    className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-[#8B95A1]"
                    style={{ top: `${((tick - calendarRange.startMin) / (calendarRange.endMin - calendarRange.startMin)) * 100}%` }}
                  >
                    {formatTimelineHour(tick)}
                  </div>
                ))}
              </div>
              {weekDates.map((date) => {
                const shifts = weekByDate.get(date) || [];
                const sessions = classesByDate.get(date) || [];
                const positionedSessions = sessions.map((session) => ({
                  session,
                  coveringShift: findShiftCoveringTime(shifts, staff.id, date, session.startTime, session.endTime),
                }));
                const totalRange = calendarRange.endMin - calendarRange.startMin;
                return (
                  <div
                    key={date}
                    className={`relative border-l border-[#F2F4F6] bg-white ${draggingShiftId ? 'bg-blue-50/10' : ''}`}
                    style={{ height: calendarRange.height }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const shiftId = e.dataTransfer.getData('application/x-staff-shift')
                        || e.dataTransfer.getData('text/plain')
                        || dragPayloadRef.current?.shiftId;
                      if (shiftId) handleDropShift(shiftId, date);
                    }}
                  >
                    {calendarRange.ticks.map((tick) => (
                      <div
                        key={tick}
                        className="absolute left-0 right-0 border-t border-[#F2F4F6]"
                        style={{ top: `${((tick - calendarRange.startMin) / totalRange) * 100}%` }}
                      />
                    ))}
                    {shifts.length === 0 && sessions.length === 0 && (
                      <div className="absolute inset-x-2 top-4 rounded-xl border border-dashed border-[#F2F4F6] px-2 py-3 text-center text-[11px] font-semibold text-[#B0B8C1]">
                        근무 없음
                      </div>
                    )}
                    {shifts.map((sh) => {
                      const start = hhmmToMin(sh.scheduledStartTime) ?? calendarRange.startMin;
                      const rawEnd = hhmmToMin(sh.scheduledEndTime) ?? start + 30;
                      const end = Math.max(start + 30, rawEnd);
                      const top = ((Math.max(calendarRange.startMin, start) - calendarRange.startMin) / totalRange) * 100;
                      const height = ((Math.min(calendarRange.endMin, end) - Math.max(calendarRange.startMin, start)) / totalRange) * 100;
                      const shiftTitle = [
                        `근무 ${formatShiftTimeRange(sh.scheduledStartTime, sh.scheduledEndTime)}`,
                        `${formatShiftHoursFromMinutes(scheduledShiftMinutes(sh))}h`,
                        sh.breakMinutes ? `휴게 ${sh.breakMinutes}분` : '',
                        sh.memo || '',
                      ].filter(Boolean).join(' · ');
                      return (
                        <div
                          key={sh.id}
                          title={shiftTitle}
                          draggable
                          onDragStart={(e) => {
                            dragPayloadRef.current = { shiftId: sh.id, sourceDate: date };
                            e.dataTransfer.setData('application/x-staff-shift', sh.id);
                            e.dataTransfer.setData('text/plain', sh.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggingShiftId(sh.id);
                          }}
                          onDragEnd={() => {
                            setDraggingShiftId(null);
                            dragPayloadRef.current = null;
                          }}
                          className={`absolute left-1.5 right-1.5 rounded-xl border border-blue-200 bg-blue-50/70 shadow-sm px-2 py-2 overflow-hidden cursor-grab active:cursor-grabbing ${
                            draggingShiftId === sh.id ? 'opacity-50' : ''
                          }`}
                          style={{ top: `${top}%`, height: `${Math.max(8, height)}%`, minHeight: 96, zIndex: 5 }}
                        >
                          <button
                            type="button"
                            onClick={() => (sh.isPlanned ? null : openEdit(sh))}
                            className="absolute inset-0"
                            aria-label={shiftTitle}
                          />
                          <div className="absolute left-2 top-2 z-10 flex items-center gap-1">
                            <span className="rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-bold text-blue-700 shadow-sm">
                              근무
                            </span>
                            {sh.memo && (
                              <span className="max-w-[80px] truncate rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-[#4E5968] shadow-sm">
                                {sh.memo}
                              </span>
                            )}
                          </div>
                          <div className="absolute right-1.5 top-1.5 z-20 flex items-center gap-1">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap bg-blue-100 text-blue-700">
                              {sh.isPlanned ? '규칙' : STATUS_LABELS[sh.status]}
                            </span>
                            {!sh.isPlanned && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(sh.id)}
                                className="w-5 h-5 text-red-400 bg-white/75 active:bg-red-50 rounded-md flex items-center justify-center"
                                aria-label="근무 삭제"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {positionedSessions.map(({ session, coveringShift }) => {
                      const start = hhmmToMin(session.startTime) ?? calendarRange.startMin;
                      const rawEnd = hhmmToMin(session.endTime) ?? start + 30;
                      const end = Math.max(start + 30, rawEnd);
                      const top = ((Math.max(calendarRange.startMin, start) - calendarRange.startMin) / totalRange) * 100;
                      const height = ((Math.min(calendarRange.endMin, end) - Math.max(calendarRange.startMin, start)) / totalRange) * 100;
                      const group = classGroupById.get(session.classGroupId);
                      const covered = !!coveringShift;
                      const verticalInset = covered ? 8 : 0;
                      const visualTop = verticalInset ? `calc(${top}% + ${verticalInset}px)` : `${top}%`;
                      const visualHeight = verticalInset ? `calc(${Math.max(5, height)}% - ${verticalInset * 2}px)` : `${Math.max(5, height)}%`;
                      const lessonTitle = [
                        `${group?.name || '수업'} ${formatShiftTimeRange(session.startTime, session.endTime)}`,
                        covered ? '근무 시간 내' : '근무 시간 외',
                      ].join(' · ');
                      return (
                        <div
                          key={session.id}
                          title={lessonTitle}
                          aria-label={lessonTitle}
                          className={`absolute rounded-lg border px-2 py-1 shadow-sm overflow-hidden ${
                            covered
                              ? 'left-3 right-3 border-emerald-200 bg-white/95'
                              : 'left-2 right-2 border-amber-200 bg-amber-50'
                          }`}
                          style={{ top: visualTop, height: visualHeight, minHeight: 30, zIndex: 12 }}
                        >
                          <p className={`text-[10px] font-extrabold truncate ${covered ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {group?.name || '수업'}
                          </p>
                          {!covered && (
                            <p className="mt-0.5 text-[9px] font-semibold text-amber-600 truncate">
                              근무 외
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <StaffAssignmentSummary staff={staff} />

      <p className="text-[11px] text-[#8B95A1] leading-relaxed px-1">
        근무표는 배정 가능 시간 확인용이에요. 시급 정산은 승인된 실제 근퇴 기록을 기준으로 계산돼요.
      </p>

      {formOpen && (
        <ShiftFormModal
          initial={editing}
          defaultDate={defaultDate || todayStr}
          defaultMode={defaultMode}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaveSingle={handleSaveSingle}
          onSaveRecurring={handleSaveRecurring}
        />
      )}

      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="근무 일정 삭제"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmDeleteId(null)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">취소</button>
            <button type="button" onClick={() => { handleDelete(confirmDeleteId); setConfirmDeleteId(null); }} className="flex-1 py-3.5 rounded-xl bg-red-500 text-white text-sm font-bold">삭제</button>
          </div>
        }
      >
        <div className="bg-red-50 rounded-2xl px-4 py-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-red-700">선택한 근무 일정을 삭제할까요?</p>
        </div>
      </Modal>
    </div>
  );
}

// ─── 단일/반복 근무 폼 모달 ────────────────────────────────────────
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
  initial, defaultDate, defaultMode = 'recurring',
  onClose, onSaveSingle, onSaveRecurring,
}) {
  const isEdit = !!initial;
  const [mode, setMode] = useState(isEdit ? 'single' : defaultMode);
  const [recurringStartMode, setRecurringStartMode] = useState(isEdit ? 'custom' : 'today');
  const [recurringEndMode, setRecurringEndMode] = useState(initial?.date ? 'until' : 'forever');
  const [form, setForm] = useState({
    date: initial?.date || defaultDate || todayDate(),
    scheduledStartTime: initial?.scheduledStartTime || '',
    scheduledEndTime: initial?.scheduledEndTime || '',
    breakMinutes: initial?.breakMinutes ? String(initial.breakMinutes) : '',
    memo: initial?.memo || '',
    status: initial?.status || 'scheduled',
  });
  const [recurring, setRecurring] = useState({
    weekdays: [],
    startDate: todayDate(),
    endDate: '',
    scheduledStartTime: '',
    scheduledEndTime: '',
    breakMinutes: '',
    memo: '',
  });

  const recurringPreview = useMemo(() => {
    if (mode !== 'recurring') return null;
    if (!recurring.startDate || recurring.weekdays.length === 0) return { dates: [], count: 0 };
    const daysOfWeek = recurring.weekdays.map((d) => KO_TO_DOW[d]).filter((d) => d !== undefined);
    if (daysOfWeek.length === 0) return { dates: [], count: 0 };
    try {
      const preview = buildRecurringStaffWorkPreview({
        weekdays: daysOfWeek,
        effectiveStartDate: recurring.startDate,
        effectiveEndDate: recurring.endDate || null,
        todayYMD: todayDate(),
      });
      return { ...preview, dates: preview.dates.slice(0, 3) };
    } catch { return { dates: [], count: 0 }; }
  }, [mode, recurring.startDate, recurring.endDate, recurring.weekdays]);

  const singleTimeError = useMemo(
    () => validateShiftTime(form),
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
      title={isEdit ? '근무 일정 수정' : (mode === 'recurring' ? '반복 근무 설정' : '단일 근무 추가')}
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
        >
          {mode === 'recurring' && !isEdit ? '근무 규칙 저장' : '저장'}
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
              단일 근무
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
            {recurringPreview ? (
              <div className="bg-blue-50 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Check size={14} className="text-[#3182F6]" />
                  <p className="text-sm font-bold text-[#3182F6]">반복 근무 규칙이 저장돼요</p>
                </div>
                <p className="text-[11px] text-[#4E5968] leading-relaxed">
                  {recurring.weekdays.join(', ')} {formatShiftTimeRange(recurring.scheduledStartTime, recurring.scheduledEndTime)}
                </p>
                <p className="text-[11px] text-[#4E5968] mt-1 leading-relaxed">
                  {recurringEndMode === 'until' && recurring.endDate
                    ? `${recurring.startDate}부터 ${recurring.endDate}까지 반복해요.`
                    : `${recurring.startDate}부터 계속 반복해요.`}
                </p>
                <p className="text-[11px] text-[#8B95A1] mt-1 leading-relaxed">
                  가까운 14일 기준 {recurringPreview.count}개의 근무만 미리 준비돼요.
                  {recurringPreview.dates.length > 0 ? ` 첫 일정: ${recurringPreview.dates.map((d) => formatDateShort(d)).join(', ')}` : ''}
                </p>
                <p className="text-[11px] text-[#8B95A1] mt-1 leading-relaxed">
                  이후 근무는 규칙에 따라 자동으로 표시돼요. 실제 급여는 출퇴근 기록을 기준으로 계산돼요.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400">요일·시간·기간을 선택하면 가까운 14일 준비 일정이 표시돼요.</p>
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
        const ids = Array.isArray(s.assistantIds) ? s.assistantIds : [];
        counts = ids.includes(staff.id) || s.assistantId === staff.id;
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
                <Row label="정산 기준" value="승인된 실제 근퇴 기록" />
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
                  <p className="text-sm font-bold text-blue-700">승인된 실제 근퇴 기록 기준</p>
                  <p className="text-[11px] text-blue-700/80 mt-0.5 leading-relaxed">
                    출근/퇴근 기록을 원장이 승인한 시간만 급여에 반영돼요.
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
          <Row label="승인된 근퇴 시간" value={`${approvedActualHours.toFixed(1)}시간`} />
          {pendingActualHours > 0 && <Row label="승인 대기 근퇴" value={`${pendingActualHours.toFixed(1)}시간`} />}
          <Row label="수업 시간" value={`${lessonHours.toFixed(1)}시간`} />
          <Row label="수업 외 체류" value={`${nonLessonHours.toFixed(1)}시간`} />
        </div>
        <p className="text-[11px] text-[#8B95A1] mt-3 leading-relaxed">
          {form.wageType === 'monthly'
            ? '월급은 근무 시간과 무관하게 고정 지급돼요.'
            : '시급은 승인된 실제 출근·퇴근 기록 시간에 적용돼요. 수업 시간은 업무 참고용이에요.'}
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
function StaffPermissionSection({ staff }) {
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
                onChange={(e) => setPermissions((prev) => ({ ...prev, [key]: e.target.checked }))}
                className="w-4 h-4 rounded accent-blue-600"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving || !staff.serverUserId}
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

  const myGroups = useMemo(() => {
    if (isAssistant) {
      return classGroups.filter((g) => Array.isArray(g.assistantIds) && g.assistantIds.includes(staff.id));
    }
    return classGroups.filter((g) => g.teacherId === staff.id);
  }, [classGroups, staff.id, isAssistant]);

  const myClinicTasks = useMemo(() => {
    if (!isAssistant) return [];
    return clinicTasks.filter((t) => t.assignedToId === staff.id);
  }, [clinicTasks, staff.id, isAssistant]);

  return (
    <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#191F28]">
            {isAssistant ? '담당 클리닉/수업' : '맡고 있는 반'}
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
      role === 'assistant' ? academyAssistants : academyTeachers,
      { userId: authUserId, memberId: myMembership?.id, email: authUserEmail },
    ),
    [academyTeachers, academyAssistants, role, authUserId, myMembership?.id, authUserEmail],
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
      if (role === 'assistant') {
        const ids = Array.isArray(s.assistantIds) ? s.assistantIds : [];
        return ids.includes(myStaff.id) || s.assistantId === myStaff.id;
      }
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
