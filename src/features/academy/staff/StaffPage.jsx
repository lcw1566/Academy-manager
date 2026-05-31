// StaffPage — Phase 40
//
// "스태프" 탭의 진입점. 기존 work 탭(WorkSchedulePage)을 통합한 인사·근무 페이지.
//
// 역할별 진입:
//   - owner : 전체 직원 리스트 + 상세 (4 서브탭: 근무 / 계약 / 권한 / 배정)
//             초대 진입점 (+ 직원 추가), 대기 중인 초대 카드.
//   - teacher / assistant : 본인 근무 + 출퇴근 + 본인 계약/배정 요약.
//
// 데이터 모델은 그대로 사용한다 (SQL 변경 없음):
//   - academyTeachers / academyAssistants (로컬 staff entries)
//   - academy_staff_profiles (서버 — 과목/시급/권한)
//   - academy_invitations    (서버 — pending)
//   - academy_member_profiles (서버 — 이메일/이름/연락처)
//   - academyStaffShifts     (로컬 근무표)

import { useMemo, useState } from 'react';
import {
  Plus, Repeat, ChevronLeft, ChevronRight, Pencil, Trash2,
  Clock, Search, Users as UsersIcon, GraduationCap, Mail, X as XIcon,
  CalendarOff, Loader2, Check, BookOpen, Coffee, AlertTriangle,
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
// Phase 44.6 / Phase B — academy_staff_work_rules write-through.
import {
  createStaffWorkRule,
  listStaffWorkRules,
  updateStaffWorkRule,
} from '../../../services/supabase/scheduleRulesApi';
import {
  buildShiftTimeline,
  hhmmToMin,
} from '../../../utils/shiftCoverage';
import { generateClassDates } from '../../../utils/recurringClass';
// Phase 44.5 / Phase A — 미래 row 사전 생성 14일 cap.
import {
  clampGenerationEndDate, isGenerationCapped, FUTURE_GENERATION_WINDOW_DAYS,
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

const SUB_TABS = [
  { id: 'shift',      label: '근무' },
  { id: 'contract',   label: '계약' },
  { id: 'permission', label: '권한' },
  { id: 'assignment', label: '배정' },
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
  const [inviteRole, setInviteRole] = useState(null); // null | 'teacher' | 'assistant'
  const [addRoleSheetOpen, setAddRoleSheetOpen] = useState(false);
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
        title="스태프"
        right={
          <button
            type="button"
            onClick={() => setAddRoleSheetOpen(true)}
            className="hidden md:flex items-center gap-1.5 bg-[#3182F6] text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-[#1B64DA]"
          >
            <Plus size={14} /> 직원 추가
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
                onClick={() => setAddRoleSheetOpen(true)}
                className="md:hidden w-full flex items-center justify-center gap-1.5 mb-3 py-2.5 rounded-xl bg-[#3182F6] text-white text-sm font-bold active:bg-[#1B64DA]"
              >
                <Plus size={14} /> 직원 추가
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
              <EmptyDetailPanel onAdd={() => setAddRoleSheetOpen(true)} />
            )}
          </section>
        </div>
      </div>

      {/* 직원 추가 — 역할 선택 sheet */}
      {addRoleSheetOpen && (
        <AddStaffRoleSheet
          onClose={() => setAddRoleSheetOpen(false)}
          onPick={(r) => { setAddRoleSheetOpen(false); setInviteRole(r); }}
        />
      )}

      {/* 직원 추가 — 이메일 초대 모달 */}
      {inviteRole && (
        <Modal
          isOpen
          onClose={() => setInviteRole(null)}
          title={`${inviteRole === 'assistant' ? '보조강사' : '강사'} 초대`}
          footer={
            <button
              type="button"
              onClick={() => setInviteRole(null)}
              className="w-full bg-gray-100 text-gray-700 font-bold py-3.5 rounded-xl"
            >
              닫기
            </button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="bg-blue-50 rounded-2xl px-4 py-3">
              <p className="text-xs text-blue-700 leading-relaxed">
                상대가 같은 이메일로 로그인하면 앱 안에서 초대를 수락할 수 있어요.
                수락 후에 과목·시급·근무 시간을 설정합니다.
              </p>
            </div>
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
        + 직원 추가
      </button>
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
// 직원 상세 패널 (sub-tabs: 근무/계약/권한/배정)
// ═══════════════════════════════════════════════════════════════════
function StaffDetailPanel({ staff, summary, onBack }) {
  const [subTab, setSubTab] = useState('shift');
  const isAssistant = staff?._role === 'assistant';

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
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 ${
            isAssistant ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-[#3182F6]'
          }`}>
            {(staff.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-[#191F28] truncate">{staff.name || '(이름 없음)'}</p>
            <p className="text-xs text-[#8B95A1] mt-0.5 truncate">
              {isAssistant ? '보조강사' : '강사'}
              {staff.email ? ` · ${staff.email}` : ''}
              {staff.phone ? ` · ${staff.phone}` : ''}
            </p>
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
      {subTab === 'assignment' && <StaffAssignmentSection staff={staff} />}
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

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [defaultMode, setDefaultMode] = useState('recurring');
  const [defaultDate, setDefaultDate] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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

  const weeklyPattern = useMemo(() => {
    return weekDates
      .map((date) => {
        const list = weekByDate.get(date) || [];
        if (list.length === 0) return null;
        return `${getKoreanWeekdayFromYMD(date)} ${list.map((sh) => formatShiftTimeRange(sh.scheduledStartTime, sh.scheduledEndTime)).join(', ')}`;
      })
      .filter(Boolean)
      .join(' · ');
  }, [weekByDate, weekDates]);

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

  const handleSaveRecurring = async (data) => {
    const timeError = validateShiftTime(data);
    if (timeError) { showToast(timeError, 'error'); return; }
    const daysOfWeek = (data.weekdays || []).map((d) => KO_TO_DOW[d]).filter((d) => d !== undefined);
    if (daysOfWeek.length === 0) return;
    // Phase 44.5 / Phase A — 사전 생성은 today+14일 까지. data.endDate 자체는 보존.
    const capped = isGenerationCapped(data.endDate || null, { todayYMD: todayStr });
    const cappedEndDate = clampGenerationEndDate(data.endDate || null, { todayYMD: todayStr });
    const dates = generateClassDates({
      daysOfWeek,
      startDate: data.startDate,
      endDate: cappedEndDate,
      repeatType: '매주',
    });
    if (dates.length === 0) return;
    const existingKeys = new Set(
      academyStaffShifts
        .filter((sh) => sh.staffId === staff.id && sh.status !== 'canceled')
        .map((sh) => `${sh.date}__${sh.scheduledStartTime || ''}`),
    );
    let created = 0;
    let skipped = 0;
    for (const date of dates) {
      const key = `${date}__${data.scheduledStartTime || ''}`;
      if (existingKeys.has(key)) { skipped += 1; continue; }
      existingKeys.add(key);
      const localShift = addAcademyStaffShift({
        staffId: staff.id,
        staffRole: staff._role,
        date,
        scheduledStartTime: data.scheduledStartTime || '',
        scheduledEndTime: data.scheduledEndTime || '',
        breakMinutes: Number(data.breakMinutes) || 0,
        memo: data.memo || '',
        status: 'scheduled',
      });
      created += 1;
      if (staff.serverUserId && isAuthenticated && currentAcademyId) {
        try {
          const sr = await createAcademyStaffShift({
            academyId: currentAcademyId,
            staff_user_id: staff.serverUserId,
            staff_role: staff._role,
            date,
            scheduled_start_time: data.scheduledStartTime || null,
            scheduled_end_time: data.scheduledEndTime || null,
            break_minutes: Number(data.breakMinutes) || 0,
            status: 'scheduled',
            memo: data.memo || null,
          });
          if (sr?.id) setStaffShiftServerId(localShift.id, sr.id);
        } catch (err) {
          console.warn('[supabase] recurring create shift failed', err);
        }
      }
    }
    if (staff.serverUserId && isAuthenticated && currentAcademyId) loadServerStaffShifts();

    // Phase 44.6 / Phase B — academy_staff_work_rules INSERT (best-effort).
    // 편집 패턴: 동일 staff_user_id 의 기존 active rule 중에서 day_of_week 가
    // 새 입력과 겹치는 것들을 deactivate → 새로 INSERT. 효과: 같은 요일을 다시
    // 등록하면 옛 rule 은 자연스럽게 비활성화되고 새 rule 만 활성 상태로 남는다.
    if (staff.serverUserId && isAuthenticated && currentAcademyId) {
      try {
        const newDows = new Set(daysOfWeek);
        let existing = [];
        try {
          existing = await listStaffWorkRules(currentAcademyId);
        } catch (err) {
          console.warn('[supabase] listStaffWorkRules failed', err);
        }
        const toDeactivate = existing.filter(
          (r) => r.staff_user_id === staff.serverUserId
            && r.is_active
            && newDows.has(r.day_of_week),
        );
        for (const r of toDeactivate) {
          try { await updateStaffWorkRule(r.id, { is_active: false }); }
          catch (err) { console.warn('[supabase] deactivate work rule failed', err); }
        }
        for (const dow of daysOfWeek) {
          try {
            await createStaffWorkRule({
              academyId: currentAcademyId,
              staff_user_id: staff.serverUserId,
              staff_role: staff._role,
              day_of_week: dow,
              start_time: data.scheduledStartTime || '',
              end_time: data.scheduledEndTime || '',
              break_minutes: Number(data.breakMinutes) || 0,
              effective_start_date: data.startDate,
              effective_end_date: data.endDate || null,
              is_active: true,
              memo: data.memo || null,
            });
          } catch (err) {
            console.warn('[supabase] createStaffWorkRule failed', err);
          }
        }
        try {
          await useWorkspaceStore.getState().loadStaffWorkRules?.();
        } catch { /* ignore */ }
      } catch (err) {
        console.warn('[supabase] reapply staff work rules failed', err);
      }
    }

    setFormOpen(false);
    if (created === 0) {
      showToast(`이미 등록된 ${skipped}건이라 추가하지 않았어요.`, 'error');
    } else if (capped) {
      // Phase 44.7 — 룰 기반 렌더가 들어왔으므로 안내 문구 갱신.
      showToast(`근무 규칙이 저장됐어요. 이후 근무는 반복 규칙에 따라 자동으로 표시돼요.`);
    } else if (skipped > 0) {
      showToast(`근무 ${created}건 추가 · ${skipped}건은 중복 건너뜀.`);
    } else {
      showToast(`근무 ${created}건이 추가됐어요.`);
    }
  };

  const handleSaveSingle = async (data) => {
    const timeError = validateShiftTime(data);
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

      {hasAnyShift && (
        <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-[#191F28]">이번 주 근무 패턴</p>
            <button
              type="button"
              onClick={openAddRecurring}
              className="text-xs font-bold text-[#3182F6] flex items-center gap-1 px-2 py-1 rounded-lg active:bg-blue-50"
            >
              <Repeat size={11} /> 반복 추가
            </button>
          </div>
          {weeklyPattern ? (
            <div className="flex flex-wrap gap-1.5">
              {weeklyPattern.split(' · ').map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full bg-[#F2F4F6] px-2.5 py-1 text-xs font-bold text-[#191F28]"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#8B95A1]">이번 주 등록된 근무가 없어요.</p>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-[#F2F4F6] flex items-center justify-between">
          <p className="text-sm font-bold text-[#191F28]">요일별 근무</p>
          <p className="text-[11px] text-[#8B95A1]">{formatDateShort(weekDates[0])} ~ {formatDateShort(weekDates[6])}</p>
        </div>
        <div className="divide-y divide-[#F2F4F6]">
          {weekDates.map((date) => {
            const list = weekByDate.get(date) || [];
            const isToday = date === todayStr;
            return (
              <div key={date} className={`px-4 md:px-5 py-3 ${isToday ? 'bg-blue-50/30' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-14 flex-shrink-0 pt-1">
                    <p className={`text-sm font-bold ${isToday ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
                      {getKoreanWeekdayFromYMD(date)}
                    </p>
                    <p className="text-[11px] text-[#8B95A1] mt-0.5">{date.slice(5)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    {list.length === 0 ? (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-[#B0B8C1]">근무 없음</p>
                        <button
                          type="button"
                          onClick={() => openAddSingle(date)}
                          className="text-xs font-bold text-[#3182F6] px-2 py-1.5 rounded-lg active:bg-blue-50"
                        >
                          + 추가
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {list.map((sh) => (
                          <div key={sh.id} className="bg-[#F8F9FA] rounded-xl px-3 py-2.5 flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-[#191F28]">
                                  {formatShiftTimeRange(sh.scheduledStartTime, sh.scheduledEndTime)}
                                </p>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_TONES[sh.status]}`}>
                                  {STATUS_LABELS[sh.status]}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#8B95A1] mt-0.5">
                                {formatShiftHoursFromMinutes(scheduledShiftMinutes(sh))}시간
                                {sh.breakMinutes ? ` · 휴게 ${sh.breakMinutes}분` : ''}
                                {sh.memo ? ` · ${sh.memo}` : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openEdit(sh)}
                              className="p-2 text-[#3182F6] active:bg-blue-50 rounded-lg"
                              aria-label="근무 수정"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(sh.id)}
                              className="p-2 text-red-400 active:bg-red-50 rounded-lg"
                              aria-label="근무 삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-[#8B95A1] leading-relaxed px-1">
        시급 정산은 이 근무 합계 시간을 기준으로 해요. 한 근무 안에 여러 수업이 들어 있어도 한 줄로 등록하세요.
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
function ShiftFormModal({
  initial, defaultDate, defaultMode = 'recurring',
  onClose, onSaveSingle, onSaveRecurring,
}) {
  const isEdit = !!initial;
  const [mode, setMode] = useState(isEdit ? 'single' : defaultMode);
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
    startDate: defaultDate || todayDate(),
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
      const dates = generateClassDates({
        daysOfWeek,
        startDate: recurring.startDate,
        endDate: recurring.endDate || null,
        repeatType: '매주',
      });
      return { dates: dates.slice(0, 3), count: dates.length };
    } catch { return { dates: [], count: 0 }; }
  }, [mode, recurring.startDate, recurring.endDate, recurring.weekdays]);

  const singleTimeError = useMemo(
    () => validateShiftTime(form),
    [form.scheduledStartTime, form.scheduledEndTime, form.breakMinutes],
  );
  const recurringTimeError = useMemo(
    () => validateShiftTime(recurring),
    [recurring.scheduledStartTime, recurring.scheduledEndTime, recurring.breakMinutes],
  );

  const canSaveSingle = !!form.date && !singleTimeError;
  const canSaveRecurring = recurring.weekdays.length > 0 && !!recurring.startDate
    && !recurringTimeError && (recurringPreview?.count ?? 0) > 0;
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
        endDate: recurring.endDate || '',
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
          {mode === 'recurring' && !isEdit ? `${recurringPreview?.count || 0}건 저장` : '저장'}
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">시작일 *</label>
                <input type="date" value={recurring.startDate} onChange={(e) => setRecurring((f) => ({ ...f, startDate: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">종료일</label>
                <input type="date" value={recurring.endDate} onChange={(e) => setRecurring((f) => ({ ...f, endDate: e.target.value }))} className="input" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">휴게(분)</label>
              <input type="number" value={recurring.breakMinutes} onChange={(e) => setRecurring((f) => ({ ...f, breakMinutes: e.target.value }))} placeholder="0" className="input" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
              <textarea value={recurring.memo} onChange={(e) => setRecurring((f) => ({ ...f, memo: e.target.value }))} rows={2} placeholder="특이사항 등" className="input resize-none" />
            </div>
            {recurringPreview && recurringPreview.count > 0 ? (
              <div className="bg-blue-50 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Check size={14} className="text-[#3182F6]" />
                  <p className="text-sm font-bold text-[#3182F6]">총 {recurringPreview.count}개의 근무가 생성돼요</p>
                </div>
                <p className="text-[11px] text-[#4E5968]">
                  첫 {Math.min(3, recurringPreview.dates.length)}개: {recurringPreview.dates.map((d) => formatDateShort(d)).join(', ')}
                  {recurringPreview.count > 3 ? ' …' : ''}
                </p>
                <p className="text-[11px] text-[#8B95A1] mt-1">같은 시작 시간이 이미 있는 날짜는 자동으로 건너뛰어요.</p>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400">요일·시간·기간을 선택하면 생성될 근무 수가 표시돼요.</p>
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
  const saveAcademyStaffProfile = useWorkspaceStore((s) => s.saveAcademyStaffProfile);
  const showToast = useAcademyStore((s) => s.showToast);
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const classSessions = useAcademyStore((s) => s.classSessions) ?? [];
  const computeStaffHoursForMonth = useAcademyStore((s) => s.computeStaffHoursForMonth);
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
  const initialHourlyMode = serverProfile?.scope?.hourlyMode === 'lessonHours' ? 'lessonHours'
    : (staff.hourlyMode === 'lessonHours' ? 'lessonHours' : 'shiftHours');

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    wageType: initialWageType,
    hourlyWage: String(initialHourlyWage || ''),
    monthlySalary: String(initialMonthlySalary || ''),
    hourlyMode: initialHourlyMode,
  });
  const [saving, setSaving] = useState(false);

  const currentMonth = getCurrentMonth();
  const shiftHours = useMemo(
    () => computeStaffHoursForMonth(staff.id, currentMonth),
    [computeStaffHoursForMonth, staff.id, currentMonth],
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
  const gapHours = Math.max(0, shiftHours - lessonHours);

  const hourlyWageNum = Number(form.hourlyWage) || 0;
  const monthlySalaryNum = Number(form.monthlySalary) || 0;

  const estimatedPay = useMemo(() => {
    if (form.wageType === 'monthly') return monthlySalaryNum;
    const basis = form.hourlyMode === 'lessonHours' ? lessonHours : shiftHours;
    return Math.round(basis * hourlyWageNum);
  }, [form.wageType, form.hourlyMode, hourlyWageNum, monthlySalaryNum, lessonHours, shiftHours]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // 로컬 staff 항목 우선 업데이트 (cross-mode 호환)
      const localPatch = {
        wageType: form.wageType,
        hourlyWage: hourlyWageNum,
        monthlySalary: monthlySalaryNum,
        hourlyMode: form.hourlyMode,
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
            hourlyMode: form.hourlyMode,
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
                <Row label="정산 기준" value={form.hourlyMode === 'lessonHours' ? '수업 시간 기준' : '근무 시간 기준'} />
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
                <div className="flex flex-col gap-2">
                  {[
                    { id: 'shiftHours', label: '근무 시간 기준', desc: '학원 머무는 시간 전체로 정산해요.' },
                    { id: 'lessonHours', label: '수업 시간 기준', desc: '완료된 수업 시간만 정산해요.' },
                  ].map((opt) => {
                    const active = form.hourlyMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, hourlyMode: opt.id }))}
                        className={`w-full text-left rounded-2xl border px-3 py-2.5 ${
                          active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <p className={`text-sm font-bold ${active ? 'text-blue-700' : 'text-gray-800'}`}>{opt.label}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</p>
                      </button>
                    );
                  })}
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
          <Row label="총 근무시간" value={`${shiftHours.toFixed(1)}시간`} />
          <Row label="수업 시간" value={`${lessonHours.toFixed(1)}시간`} />
          <Row label="대기/공강" value={`${gapHours.toFixed(1)}시간`} />
        </div>
        <p className="text-[11px] text-[#8B95A1] mt-3 leading-relaxed">
          {form.wageType === 'monthly'
            ? '월급은 근무 시간과 무관하게 고정 지급돼요.'
            : form.hourlyMode === 'lessonHours'
              ? '수업 시간 기준으로 시급이 적용돼요.'
              : '근무 시간 기준으로 시급이 적용돼요.'}
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
// Sub-tab: 배정 (assignment)
// ═══════════════════════════════════════════════════════════════════
function StaffAssignmentSection({ staff }) {
  const classGroups = useAcademyStore((s) => s.classGroups) ?? [];
  const classSessions = useAcademyStore((s) => s.classSessions) ?? [];
  const clinicTasks = useAcademyStore((s) => s.clinicTasks) ?? [];

  const isAssistant = staff._role === 'assistant';
  const todayStr = todayDate();

  const myGroups = useMemo(() => {
    if (isAssistant) {
      return classGroups.filter((g) => Array.isArray(g.assistantIds) && g.assistantIds.includes(staff.id));
    }
    return classGroups.filter((g) => g.teacherId === staff.id);
  }, [classGroups, staff.id, isAssistant]);

  const upcomingSessions = useMemo(() => {
    return classSessions
      .filter((s) => {
        if (s.status === 'canceled') return false;
        if (!s.date || s.date < todayStr) return false;
        if (isAssistant) {
          const ids = Array.isArray(s.assistantIds) ? s.assistantIds : [];
          return ids.includes(staff.id) || s.assistantId === staff.id;
        }
        const isMain = s.teacherId === staff.id && !s.substituteTeacherId;
        const isSub = s.substituteTeacherId === staff.id;
        return isMain || isSub;
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''))
      .slice(0, 8);
  }, [classSessions, staff.id, isAssistant, todayStr]);

  const myClinicTasks = useMemo(() => {
    if (!isAssistant) return [];
    return clinicTasks.filter((t) => t.assignedToId === staff.id);
  }, [clinicTasks, staff.id, isAssistant]);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm">
        <p className="text-sm font-bold text-[#191F28] mb-3">
          {isAssistant ? '담당 클리닉/수업' : '맡고 있는 반'}
        </p>
        {isAssistant ? (
          <p className="text-2xl font-extrabold text-[#3182F6]">{myClinicTasks.length}
            <span className="text-sm text-[#8B95A1] ml-1 font-medium">개 클리닉</span>
          </p>
        ) : (
          <p className="text-2xl font-extrabold text-[#3182F6]">{myGroups.length}
            <span className="text-sm text-[#8B95A1] ml-1 font-medium">개 반</span>
          </p>
        )}
        {myGroups.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {myGroups.map((g) => (
              <span key={g.id} className="text-xs font-semibold bg-[#F2F4F6] text-[#191F28] px-2.5 py-1 rounded-full">
                {g.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-[#F2F4F6] flex items-center justify-between">
          <p className="text-sm font-bold text-[#191F28]">예정된 수업</p>
          <p className="text-[11px] text-[#8B95A1]">최근 8건</p>
        </div>
        {upcomingSessions.length === 0 ? (
          <div className="px-4 md:px-5 py-6 text-center">
            <CalendarOff size={18} className="text-gray-300 mx-auto mb-1" />
            <p className="text-xs text-[#8B95A1]">예정된 수업이 없어요.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#F2F4F6]">
            {upcomingSessions.map((s) => {
              const g = classGroups.find((cg) => cg.id === s.classGroupId);
              return (
                <div key={s.id} className="px-4 md:px-5 py-3 flex items-center gap-3">
                  <BookOpen size={14} className="text-[#3182F6]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#191F28] truncate">{g?.name || '수업'}</p>
                    <p className="text-[11px] text-[#8B95A1]">
                      {s.date} · {formatShiftTimeRange(s.startTime, s.endTime)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 직원 추가 — 역할 선택 sheet ─────────────────────────────────
function AddStaffRoleSheet({ onClose, onPick }) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="어떤 직원을 추가할까요?"
    >
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onPick('teacher')}
          className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 text-left bg-blue-50 active:opacity-80"
        >
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
            <GraduationCap size={18} className="text-[#3182F6]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#191F28]">강사</p>
            <p className="text-xs text-[#4E5968] mt-0.5">수업을 진행하는 직원이에요.</p>
          </div>
          <ChevronRight size={14} className="text-[#8B95A1]" />
        </button>
        <button
          type="button"
          onClick={() => onPick('assistant')}
          className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 text-left bg-purple-50 active:opacity-80"
        >
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
            <UsersIcon size={18} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#191F28]">보조강사</p>
            <p className="text-xs text-[#4E5968] mt-0.5">클리닉/관리 업무를 맡는 직원이에요.</p>
          </div>
          <ChevronRight size={14} className="text-[#8B95A1]" />
        </button>
      </div>
      <p className="text-[11px] text-[#8B95A1] mt-3 leading-relaxed">
        이메일로 초대를 보내요. 상대가 같은 이메일로 로그인하면 앱 안에서 수락할 수 있어요.
      </p>
    </Modal>
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
      <Header title="스태프" />
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
