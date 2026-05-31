// WorkSchedulePage — Pre-Phase 34
//
// 학원 모드 전용 "근무" 탭 페이지.
//
// 역할별 진입:
//   - owner   : 전체 staff 근무 일정 (오늘 / 이번 주) + "근무 추가" 버튼
//   - teacher : 본인 근무만 (오늘 / 이번 주 / 이번 달 합계) + 출/퇴근
//   - assistant : 본인 근무만 (동일)
//
// 데이터 모델은 기존 academyStaffShifts 를 그대로 사용한다 (Phase 30).
// staffId 는 academyTeachers / academyAssistants 의 로컬 id.
//
// 근무 추가 모달:
//   1) 강사/보조강사 선택 (검색 가능)
//   2) 날짜
//   3) 예정 시작/종료 + 휴게 분
//   4) 메모 (옵션)
// 저장 → 로컬 + (서버 user 매핑되어 있으면) Supabase write-through.
//
// 근무는 수업과는 별도. 한 명이 15:00–21:00 근무 안에 17:00–18:00 수업이 있어도
// 근무 일정은 한 row 로 관리할 수 있다 — "근무 시간 ≠ 수업 시간".

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Pencil, Trash2, Clock, LogIn, LogOut as LogOutIcon, Search,
  AlertTriangle, ChevronRight, Loader2, BookOpen, Coffee, CalendarOff,
  Users as UsersIcon, Repeat, Calendar as CalendarIcon, Check, Info,
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
import {
  buildRecurringStaffWorkPreview,
  saveRecurringStaffWorkSchedule,
} from '../../../services/staffWorkScheduleService';
import {
  buildShiftTimeline,
  hhmmToMin,
} from '../../../utils/shiftCoverage';
import {
  buildPlannedStaffSchedule,
  mergePlannedAndActualStaffShifts,
  plannedToStaffShiftShape,
} from '../../../utils/schedule';

const KOREAN_WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const KO_TO_DOW = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };

const STATUS_LABELS = {
  scheduled: '예정',
  completed: '완료',
  canceled: '취소',
};

const STATUS_TONES = {
  scheduled: 'text-blue-700 bg-blue-50',
  completed: 'text-emerald-700 bg-emerald-50',
  canceled: 'text-gray-500 bg-gray-100',
};

function nowHHmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatClock(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function formatShiftTimeRange(start, end) {
  const s = formatClock(start);
  const e = formatClock(end);
  if (!s && !e) return '';
  return `${s || '-'} - ${e || '-'}`;
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

function scheduledShiftMinutes(sh) {
  const start = hhmmToMin(sh?.scheduledStartTime);
  const end = hhmmToMin(sh?.scheduledEndTime);
  if (start == null || end == null || end <= start) return 0;
  return Math.max(0, end - start - (Number(sh.breakMinutes) || 0));
}

function formatShiftHoursFromMinutes(minutes) {
  const hours = (Number(minutes) || 0) / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export default function WorkSchedulePage() {
  const role = useAcademyStore((s) => s.role);
  if (role === 'owner') return <OwnerWorkView />;
  return <StaffWorkView />;
}

// ─── Owner: 직원별 근무 관리 ──────────────────────────────────────
function OwnerWorkView() {
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const addAcademyStaffShift = useAcademyStore((s) => s.addAcademyStaffShift);
  const updateAcademyStaffShift = useAcademyStore((s) => s.updateAcademyStaffShift);
  const deleteAcademyStaffShift = useAcademyStore((s) => s.deleteAcademyStaffShift);
  const setStaffShiftServerId = useAcademyStore((s) => s.setStaffShiftServerId);
  const showToast = useAcademyStore((s) => s.showToast);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerStaffShifts = useWorkspaceStore((s) => s.loadServerStaffShifts);
  const loadStaffWorkRules = useWorkspaceStore((s) => s.loadStaffWorkRules);
  const staffWorkRules = useWorkspaceStore((s) => s.staffWorkRules) ?? [];
  const staffWorkExceptions = useWorkspaceStore((s) => s.staffWorkExceptions) ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [defaultDate, setDefaultDate] = useState(null);
  const [defaultStaffId, setDefaultStaffId] = useState(null);
  const [defaultMode, setDefaultMode] = useState('recurring');
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const todayStr = todayDate();
  const weekDates = useMemo(() => getWeekDates(todayStr), [todayStr]);
  const currentMonth = getCurrentMonth();

  const allStaff = useMemo(() => [
    ...academyTeachers.map((t) => ({ ...t, _role: 'teacher' })),
    ...academyAssistants.map((a) => ({ ...a, _role: 'assistant' })),
  ], [academyTeachers, academyAssistants]);

  const [selectedStaffId, setSelectedStaffId] = useState(() => allStaff[0]?.id || '');

  // staffId 로 lookup 하기 위한 map
  const staffMap = useMemo(() => {
    const m = new Map();
    allStaff.forEach((s) => m.set(s.id, s));
    return m;
  }, [allStaff]);

  const visibleStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allStaff.filter((s) => {
      if (roleFilter !== 'all' && s._role !== roleFilter) return false;
      if (!q) return true;
      return (s.name || '').toLowerCase().includes(q)
        || (s.email || '').toLowerCase().includes(q);
    });
  }, [allStaff, roleFilter, search]);

  const selectedStaff = useMemo(
    () => staffMap.get(selectedStaffId) || visibleStaff[0] || allStaff[0] || null,
    [staffMap, selectedStaffId, visibleStaff, allStaff],
  );

  const selectedStaffActualShifts = useMemo(
    () => (selectedStaff ? academyStaffShifts.filter((sh) => sh.staffId === selectedStaff.id) : []),
    [academyStaffShifts, selectedStaff],
  );

  const selectedStaffShifts = useMemo(() => {
    if (!selectedStaff) return [];
    const plannedRaw = buildPlannedStaffSchedule({
      rules: staffWorkRules,
      exceptions: staffWorkExceptions,
      fromDate: weekDates[0],
      toDate: weekDates[weekDates.length - 1],
      staffUserId: selectedStaff.serverUserId || undefined,
    });
    const plannedShaped = plannedToStaffShiftShape(plannedRaw, {
      academyTeachers,
      academyAssistants,
    });
    return mergePlannedAndActualStaffShifts(plannedShaped, selectedStaffActualShifts);
  }, [selectedStaff, selectedStaffActualShifts, staffWorkRules, staffWorkExceptions, weekDates, academyTeachers, academyAssistants]);

  const selectedWeekShiftsByDate = useMemo(() => {
    const map = new Map();
    weekDates.forEach((d) => map.set(d, []));
    for (const sh of selectedStaffShifts) {
      if (!sh.date || !map.has(sh.date)) continue;
      if (sh.status === 'canceled') continue;
      map.get(sh.date).push(sh);
    }
    for (const d of weekDates) {
      map.get(d).sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''));
    }
    return map;
  }, [selectedStaffShifts, weekDates]);

  const selectedSummary = useMemo(() => {
    let weekPlannedMin = 0;
    let weekActualMin = 0;
    let monthActualMin = 0;
    let completedCount = 0;
    let missedCount = 0;
    const nowMin = (() => {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    })();
    for (const sh of selectedStaffShifts) {
      if (sh.status === 'canceled') continue;
      if (weekDates.includes(sh.date)) weekPlannedMin += scheduledShiftMinutes(sh);
      if (weekDates.includes(sh.date)) weekActualMin += shiftMinutes(sh);
    }
    for (const sh of selectedStaffActualShifts) {
      if (sh.status === 'canceled') continue;
      if (sh.date?.startsWith(currentMonth)) monthActualMin += shiftMinutes(sh);
      if (sh.status === 'completed') completedCount += 1;
      if (sh.date === todayStr && sh.status === 'scheduled' && !sh.actualStartTime) {
        const start = hhmmToMin(sh.scheduledStartTime);
        if (start != null && start < nowMin) missedCount += 1;
      }
    }
    return { weekPlannedMin, weekActualMin, monthActualMin, completedCount, missedCount };
  }, [selectedStaffShifts, selectedStaffActualShifts, weekDates, currentMonth, todayStr]);

  const staffSummaries = useMemo(() => {
    const map = new Map();
    for (const staff of allStaff) {
      map.set(staff.id, { weekMin: 0, monthMin: 0, todayCount: 0, missedCount: 0 });
    }
    const plannedRaw = buildPlannedStaffSchedule({
      rules: staffWorkRules,
      exceptions: staffWorkExceptions,
      fromDate: weekDates[0],
      toDate: weekDates[weekDates.length - 1],
    });
    const plannedWeekShifts = plannedToStaffShiftShape(plannedRaw, {
      academyTeachers,
      academyAssistants,
    });
    const actualWeekShifts = academyStaffShifts.filter((sh) => weekDates.includes(sh.date));
    const weekShifts = mergePlannedAndActualStaffShifts(plannedWeekShifts, actualWeekShifts);
    const nowMin = (() => {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    })();
    for (const sh of weekShifts) {
      if (!sh.staffId || sh.status === 'canceled') continue;
      const cur = map.get(sh.staffId);
      if (!cur) continue;
      if (weekDates.includes(sh.date)) cur.weekMin += scheduledShiftMinutes(sh);
      if (sh.date === todayStr) cur.todayCount += 1;
      if (sh.date === todayStr && sh.status === 'scheduled' && !sh.actualStartTime) {
        const start = hhmmToMin(sh.scheduledStartTime);
        if (start != null && start < nowMin) cur.missedCount += 1;
      }
    }
    for (const sh of academyStaffShifts) {
      if (!sh.staffId || sh.status === 'canceled') continue;
      const cur = map.get(sh.staffId);
      if (!cur) continue;
      if (sh.date?.startsWith(currentMonth)) cur.monthMin += shiftMinutes(sh);
    }
    return map;
  }, [allStaff, academyStaffShifts, weekDates, currentMonth, todayStr, staffWorkRules, staffWorkExceptions, academyTeachers, academyAssistants]);

  const weeklyPattern = useMemo(() => {
    return weekDates
      .map((date) => {
        const list = selectedWeekShiftsByDate.get(date) || [];
        if (list.length === 0) return null;
        return `${getKoreanWeekdayFromYMD(date)} ${list.map((sh) => formatShiftTimeRange(sh.scheduledStartTime, sh.scheduledEndTime)).join(', ')}`;
      })
      .filter(Boolean)
      .join(' · ');
  }, [selectedWeekShiftsByDate, weekDates]);

  const openAddShift = (dateSeed, staffIdSeed = selectedStaff?.id || null, modeSeed = 'recurring') => {
    setEditing(null);
    setDefaultDate(dateSeed || todayStr);
    setDefaultStaffId(staffIdSeed);
    setDefaultMode(modeSeed);
    setFormOpen(true);
  };

  // 반복 근무 저장: 주간 규칙을 저장하고, 가까운 14일 근무만 미리 준비한다.
  const handleSaveRecurring = async (data) => {
    if (!data.staffId || !data.weekdays?.length || !data.startDate) return;
    const timeError = validateShiftTime({
      startTime: data.scheduledStartTime,
      endTime: data.scheduledEndTime,
      breakMinutes: data.breakMinutes,
    });
    if (timeError) {
      showToast(timeError, 'error');
      return;
    }
    const staff = staffMap.get(data.staffId);
    if (!staff) return;
    const daysOfWeek = data.weekdays.map((d) => KO_TO_DOW[d]).filter((d) => d !== undefined);
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
    setEditing(null);
    setDefaultStaffId(null);
    if (result.shiftsCreated === 0 && result.rulesCreated === 0) {
      showToast(`이미 등록된 근무 ${result.shiftsSkipped}건이라 추가하지 않았어요.`, 'error');
    } else if (result.capped) {
      showToast('근무 규칙이 저장됐어요. 이후 근무는 반복 규칙에 따라 자동으로 표시돼요.');
    } else if (result.shiftsSkipped > 0) {
      showToast(`근무 규칙 저장 · 가까운 근무 ${result.shiftsCreated}건 준비 · ${result.shiftsSkipped}건은 중복으로 건너뜀.`);
    } else {
      showToast(`근무 규칙 저장 · 가까운 근무 ${result.shiftsCreated}건 준비.`);
    }
  };

  const handleSave = async (data) => {
    if (!data.staffId) return;
    const timeError = validateShiftTime({
      startTime: data.scheduledStartTime,
      endTime: data.scheduledEndTime,
      breakMinutes: data.breakMinutes,
    });
    if (timeError) {
      showToast(timeError, 'error');
      return;
    }
    const staff = staffMap.get(data.staffId);
    if (!staff) return;
    const staffRole = staff._role;
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
      setEditing(null);
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
          showToast('변경사항은 저장됐지만 동기화에 실패했어요.', 'error');
        }
      }
      return;
    }
    const created = addAcademyStaffShift({
      staffId: data.staffId,
      staffRole,
      date: data.date,
      scheduledStartTime: data.scheduledStartTime || '',
      scheduledEndTime: data.scheduledEndTime || '',
      breakMinutes: Number(data.breakMinutes) || 0,
      memo: data.memo || '',
      status: 'scheduled',
    });
    setFormOpen(false);
    setEditing(null);
    if (staff.serverUserId && isAuthenticated && currentAcademyId) {
      try {
        const sr = await createAcademyStaffShift({
          academyId: currentAcademyId,
          staff_user_id: staff.serverUserId,
          staff_role: staffRole,
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
        showToast('변경사항은 저장됐지만 동기화에 실패했어요.', 'error');
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

  const openEdit = (sh) => {
    setEditing(sh);
    setFormOpen(true);
  };

  return (
    <div className="md:bg-[#F2F4F6] md:min-h-screen">
      <Header
        title="근무"
        right={
          <button
            type="button"
            onClick={() => openAddShift(todayStr, selectedStaff?.id || null, 'recurring')}
            className="hidden md:flex items-center gap-1.5 bg-[#3182F6] text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-[#1B64DA]"
          >
            <Plus size={14} /> 근무 추가
          </button>
        }
      />
      <div className="pt-14 md:pt-0 pb-12 md:pb-8">
        <div className="px-4 pt-4 md:grid md:grid-cols-[320px_1fr] lg:grid-cols-[340px_1fr] md:gap-6">
          <aside className="md:sticky md:top-6 md:self-start">
            <div className="md:bg-white md:rounded-2xl md:p-3 md:shadow-sm">
              <div className="hidden md:flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#F2F4F6] mb-3">
                <Search size={14} className="text-[#8B95A1]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="직원 이름 검색"
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                />
              </div>
              <div className="hidden md:grid grid-cols-3 gap-1 bg-[#F2F4F6] rounded-2xl p-1 mb-3">
                {[
                  { id: 'all', label: '전체' },
                  { id: 'teacher', label: '강사' },
                  { id: 'assistant', label: '보조' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRoleFilter(item.id)}
                    className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                      roleFilter === item.id ? 'bg-white text-[#3182F6] shadow-sm' : 'text-[#8B95A1]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {visibleStaff.length === 0 ? (
                <div className="py-8 text-center">
                  <UsersIcon size={20} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">표시할 직원이 없어요.</p>
                </div>
              ) : (
                <div className="-mx-4 px-4 md:mx-0 md:px-0 flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                  {visibleStaff.map((staff) => (
                    <StaffRosterCard
                      key={staff.id}
                      staff={staff}
                      active={selectedStaff?.id === staff.id}
                      summary={staffSummaries.get(staff.id)}
                      onClick={() => setSelectedStaffId(staff.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>

          <section className="mt-4 md:mt-0 min-w-0">
            {selectedStaff ? (
              <>
                <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 ${
                          selectedStaff._role === 'assistant' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-[#3182F6]'
                        }`}>
                          {(selectedStaff.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-bold text-[#191F28] truncate">{selectedStaff.name || '(이름 없음)'}</p>
                          <p className="text-xs text-[#8B95A1] mt-0.5">
                            {selectedStaff._role === 'assistant' ? '보조강사' : '강사'}
                            {selectedStaff.email ? ` · ${selectedStaff.email}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAddShift(todayStr, selectedStaff.id, 'recurring')}
                      className="hidden md:inline-flex items-center gap-1.5 bg-[#3182F6] text-white text-sm font-bold px-4 py-2.5 rounded-xl active:bg-[#1B64DA] flex-shrink-0"
                    >
                      <Repeat size={14} /> 반복 근무
                    </button>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 md:flex md:items-start md:gap-8 lg:gap-12">
                    <MetricCard label="이번 주 예정" value={formatShiftHoursFromMinutes(selectedSummary.weekPlannedMin)} unit="시간" />
                    <MetricCard label="이번 주 완료" value={formatShiftHoursFromMinutes(selectedSummary.weekActualMin)} unit="시간" tone="blue" />
                    <MetricCard label="이번 달 완료" value={formatShiftHoursFromMinutes(selectedSummary.monthActualMin)} unit="시간" />
                    <MetricCard label="미출근" value={`${selectedSummary.missedCount}`} unit="건" tone={selectedSummary.missedCount > 0 ? 'amber' : 'gray'} />
                  </div>

                  <div className="mt-5 pt-4 border-t border-[#E5E8EB] flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#4E5968] mb-1">이번 주 근무 패턴</p>
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
                        <p className="text-sm font-semibold text-[#8B95A1] leading-relaxed">
                          아직 등록된 근무가 없어요
                        </p>
                      )}
                    </div>
                    <div className="relative group flex-shrink-0">
                      <button
                        type="button"
                        aria-label="반복 근무 안내"
                        className="w-9 h-9 flex items-center justify-center rounded-full text-[#8B95A1] active:bg-white md:hover:bg-white"
                      >
                        <Info size={16} />
                      </button>
                      <div className="pointer-events-none absolute right-0 top-10 z-10 hidden w-64 rounded-2xl bg-[#191F28] px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg group-hover:block">
                        학원처럼 매주 같은 시간에 근무하는 경우, 반복 근무로 한 번에 등록할 수 있어요.
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openAddShift(todayStr, selectedStaff.id, 'recurring')}
                    className="md:hidden w-full min-h-[44px] mt-3 flex items-center justify-center gap-1.5 bg-[#3182F6] text-white text-sm font-bold py-3 rounded-xl active:bg-[#1B64DA]"
                  >
                    <Repeat size={14} /> 반복 근무 추가
                  </button>
                </div>

                <div className="mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 md:px-5 py-4 border-b border-[#F2F4F6] flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#191F28]">요일별 근무</p>
                      <p className="text-[11px] text-[#8B95A1] mt-0.5">
                        {formatDateShort(weekDates[0])} ~ {formatDateShort(weekDates[6])}
                      </p>
                    </div>
                    <p className="text-xs font-bold text-[#3182F6]">
                      월 {formatShiftHoursFromMinutes(selectedSummary.monthActualMin)}시간 완료
                    </p>
                  </div>
                  <div className="divide-y divide-[#F2F4F6]">
                    {weekDates.map((date) => {
                      const list = selectedWeekShiftsByDate.get(date) || [];
                      const isTodayDate = date === todayStr;
                      return (
                        <StaffDaySchedule
                          key={date}
                          date={date}
                          isTodayDate={isTodayDate}
                          shifts={list}
                          staff={selectedStaff}
                          onAdd={() => openAddShift(date, selectedStaff.id, 'single')}
                          onEdit={openEdit}
                          onDelete={(id) => setConfirmDeleteId(id)}
                        />
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl p-8 md:p-10 shadow-sm text-center">
                <CalendarOff size={22} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-[#191F28]">등록된 직원이 없어요.</p>
                <p className="text-xs text-[#8B95A1] mt-1">구성원 관리에서 강사나 보조강사를 먼저 등록해주세요.</p>
              </div>
            )}
            <p className="text-[11px] text-[#8B95A1] leading-relaxed mt-5 px-1">
              직원별 근무표는 급여 계산의 기준이 돼요. 출퇴근 기록이 없더라도 상태가 완료인 근무는 예정 시간으로 계산돼요.
            </p>
          </section>
        </div>
      </div>

      <button
        type="button"
        onClick={() => openAddShift(todayStr, selectedStaff?.id || null, 'single')}
        className="md:hidden fixed right-5 bottom-24 z-20 w-14 h-14 rounded-full bg-[#3182F6] text-white shadow-[0_10px_30px_rgba(49,130,246,0.35)] flex items-center justify-center active:scale-95 transform-gpu"
        aria-label="근무 추가"
      >
        <Plus size={24} />
      </button>

      {formOpen && (
        <ShiftFormModal
          initial={editing}
          defaultDate={defaultDate || todayStr}
          defaultStaffId={defaultStaffId}
          defaultMode={defaultMode}
          teachers={academyTeachers}
          assistants={academyAssistants}
          onClose={() => {
            setFormOpen(false); setEditing(null);
            setDefaultDate(null); setDefaultStaffId(null); setDefaultMode('recurring');
          }}
          onSave={handleSave}
          onSaveRecurring={handleSaveRecurring}
        />
      )}

      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="근무 일정 삭제"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmDeleteId(null)}
              className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">취소</button>
            <button type="button" onClick={() => { handleDelete(confirmDeleteId); setConfirmDeleteId(null); }}
              className="flex-1 py-3.5 rounded-xl bg-red-500 text-white text-sm font-bold">삭제</button>
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

// Phase 39 — 강사 필터 bar.
//   값: 'all' | 'teacher' | 'assistant' | staffId
//   "전체 / 강사 / 보조강사" 칩 + 개별 강사 검색 시트.
function StaffFilterBar({ value, onChange, teachers = [], assistants = [] }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const allStaff = useMemo(() => [
    ...teachers.map((t) => ({ ...t, _role: 'teacher' })),
    ...assistants.map((a) => ({ ...a, _role: 'assistant' })),
  ], [teachers, assistants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allStaff;
    return allStaff.filter((s) => (s.name || '').toLowerCase().includes(q));
  }, [allStaff, search]);

  const selectedIndividual = allStaff.find((s) => s.id === value);
  const isIndividual = !!selectedIndividual;
  const chips = [
    { id: 'all', label: '전체' },
    { id: 'teacher', label: '강사' },
    { id: 'assistant', label: '보조강사' },
  ];

  return (
    <div className="px-4 pt-3 md:pt-4 flex items-center gap-2 overflow-x-auto">
      {chips.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={`flex-shrink-0 text-xs md:text-sm font-bold px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-colors ${
              active ? 'bg-[#3182F6] text-white' : 'bg-white text-[#4E5968] border border-[#E5E8EB]'
            }`}
          >
            {c.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className={`flex-shrink-0 flex items-center gap-1.5 text-xs md:text-sm font-bold px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-colors ${
          isIndividual ? 'bg-[#3182F6] text-white' : 'bg-white text-[#4E5968] border border-[#E5E8EB]'
        }`}
      >
        <UsersIcon size={12} />
        {isIndividual ? selectedIndividual.name : '강사 선택'}
      </button>
      {isIndividual && (
        <button
          type="button"
          onClick={() => onChange('all')}
          className="flex-shrink-0 text-[10px] md:text-xs font-semibold text-[#8B95A1] px-2"
        >
          해제
        </button>
      )}

      {pickerOpen && (
        <Modal isOpen onClose={() => { setPickerOpen(false); setSearch(''); }} title="강사 선택">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50">
              <Search size={14} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름으로 검색"
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
            </div>
            <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">등록된 강사가 없어요.</p>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onChange(s.id); setPickerOpen(false); setSearch(''); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:bg-gray-50"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      s._role === 'assistant' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {(s.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{s.name || '(이름 없음)'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s._role === 'assistant' ? '보조강사' : '강사'}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SelectedStaffSummary({ staff, monthlyMin, weeklyCount, todayScheduled, todayMissed }) {
  const isAssistant = staff?._role === 'assistant';
  return (
    <div className="mx-4 md:mx-6 mt-3 md:mt-4 bg-white rounded-2xl px-4 md:px-5 py-4 shadow-sm flex items-center gap-3">
      <div className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 ${
        isAssistant ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-[#3182F6]'
      }`}>
        {(staff?.name || '?').charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm md:text-base font-bold text-[#191F28] truncate">{staff?.name || '(이름 없음)'}</p>
        <p className="text-[11px] md:text-xs text-[#8B95A1] mt-0.5">
          {isAssistant ? '보조강사' : '강사'}
          <span className="mx-1.5 text-[#D1D6DB]">·</span>
          이번 달 <span className="font-semibold text-[#191F28]">{(monthlyMin / 60).toFixed(1)}시간</span>
          <span className="mx-1.5 text-[#D1D6DB]">·</span>
          이번 주 {weeklyCount}건
        </p>
      </div>
      <div className="hidden md:flex flex-col items-end text-[11px] text-[#8B95A1]">
        <span>오늘 예정 <span className="font-bold text-[#191F28]">{todayScheduled}</span></span>
        <span>미출근 <span className={`font-bold ${todayMissed > 0 ? 'text-amber-600' : 'text-[#191F28]'}`}>{todayMissed}</span></span>
      </div>
    </div>
  );
}

function StaffRosterCard({ staff, active, summary, onClick }) {
  const isAssistant = staff?._role === 'assistant';
  const weekHours = formatShiftHoursFromMinutes(summary?.weekMin || 0);
  const monthHours = formatShiftHoursFromMinutes(summary?.monthMin || 0);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-shrink-0 w-[168px] md:w-full min-h-[72px] text-left rounded-2xl px-3 py-3 bg-white transition-colors ${
        active ? 'text-[#3182F6]' : 'text-[#191F28] active:bg-[#F8F9FA] md:hover:bg-[#F8F9FA]'
      }`}
    >
      {active && (
        <span className="hidden md:block absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-[#3182F6]" />
      )}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
          active
            ? 'bg-blue-50 text-[#3182F6]'
            : isAssistant
            ? 'bg-purple-50 text-purple-600'
            : 'bg-blue-50 text-[#3182F6]'
        }`}>
          {(staff?.name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold truncate ${active ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
            {staff?.name || '(이름 없음)'}
          </p>
          <p className="text-[11px] mt-0.5 text-[#8B95A1]">
            {isAssistant ? '보조강사' : '강사'} · 이번 주 {weekHours}시간
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-[#8B95A1]">
        <span>오늘 {summary?.todayCount || 0}건</span>
        <span>월 완료 {monthHours}시간</span>
      </div>
      {(summary?.missedCount || 0) > 0 && (
        <p className="mt-1 text-[11px] font-bold text-amber-600">
          미출근 {summary.missedCount}건 확인 필요
        </p>
      )}
    </button>
  );
}

function StaffDaySchedule({ date, isTodayDate, shifts, staff, onAdd, onEdit, onDelete }) {
  const [openActionId, setOpenActionId] = useState(null);
  const canSwipeActions = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  return (
    <div className={`group/day px-4 md:px-5 py-3 md:py-4 ${isTodayDate ? 'bg-blue-50/30' : 'bg-white'}`}>
      <div className="flex items-start gap-3">
        <div className="w-14 md:w-16 flex-shrink-0 pt-1">
          <p className={`text-sm font-bold ${isTodayDate ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
            {getKoreanWeekdayFromYMD(date)}
          </p>
          <p className="text-[11px] text-[#8B95A1] mt-0.5">{date.slice(5)}</p>
          {isTodayDate && (
            <span className="inline-flex mt-1 text-[10px] font-bold bg-blue-50 text-[#3182F6] px-1.5 py-0.5 rounded-full">
              오늘
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {shifts.length === 0 ? (
            <div className="min-h-[44px] flex items-center justify-between gap-3">
              <p className="text-sm text-[#B0B8C1]">근무 없음</p>
              <button
                type="button"
                onClick={onAdd}
                className="md:hidden w-11 h-11 flex items-center justify-center rounded-full bg-blue-50 text-[#3182F6] active:bg-blue-100"
                aria-label={`${date} 근무 추가`}
              >
                <Plus size={18} />
              </button>
              <button
                type="button"
                onClick={onAdd}
                className="hidden md:inline-flex opacity-0 group-hover/day:opacity-100 items-center gap-1 text-xs font-bold text-[#3182F6] px-2 py-2 rounded-lg hover:bg-blue-50"
              >
                <Plus size={12} /> 이 요일 근무 추가
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {shifts.map((sh) => (
                <div key={sh.id} className="relative overflow-hidden rounded-2xl bg-[#F8F9FA] md:bg-white">
                  <div className="absolute inset-y-0 right-0 flex md:hidden">
                    <button
                      type="button"
                      onClick={() => onEdit(sh)}
                      className="w-12 h-full bg-blue-50 text-[#3182F6] flex items-center justify-center"
                      aria-label={`${staff?.name || '직원'} 근무 수정`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(sh.id)}
                      className="w-12 h-full bg-red-50 text-red-500 flex items-center justify-center"
                      aria-label={`${staff?.name || '직원'} 근무 삭제`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <motion.div
                    drag={canSwipeActions ? 'x' : false}
                    dragDirectionLock
                    dragElastic={0.06}
                    dragConstraints={{ left: -96, right: 0 }}
                    onDragEnd={(_, info) => canSwipeActions && setOpenActionId(info.offset.x < -44 ? sh.id : null)}
                    animate={{ x: canSwipeActions && openActionId === sh.id ? -96 : 0 }}
                    className="rounded-2xl bg-white px-3 py-3 flex items-center gap-3 shadow-none md:shadow-none"
                  >
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
                        예정 {formatShiftHoursFromMinutes(scheduledShiftMinutes(sh))}시간
                        {sh.breakMinutes ? ` · 휴게 ${sh.breakMinutes}분` : ''}
                        {(sh.actualStartTime || sh.actualEndTime) ? ` · 실제 ${formatShiftTimeRange(sh.actualStartTime, sh.actualEndTime)}` : ''}
                      </p>
                      {sh.memo && <p className="text-[11px] text-[#8B95A1] mt-1 truncate">{sh.memo}</p>}
                    </div>
                    <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
                      <div className="w-16 text-right mr-1">
                        <p className="text-sm font-bold text-[#191F28]">{formatShiftHoursFromMinutes(scheduledShiftMinutes(sh))}시간</p>
                        <p className="text-[10px] text-[#8B95A1] mt-0.5">예정</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onEdit(sh)}
                        className="w-9 h-9 flex items-center justify-center text-[#3182F6] hover:bg-blue-50 rounded-xl"
                        aria-label={`${staff?.name || '직원'} 근무 수정`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(sh.id)}
                        className="w-9 h-9 flex items-center justify-center text-red-400 hover:bg-red-50 rounded-xl"
                        aria-label={`${staff?.name || '직원'} 근무 삭제`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                </div>
              ))}
              <button
                type="button"
                onClick={onAdd}
                className="md:hidden self-start min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-[#3182F6] px-3 rounded-xl bg-blue-50 active:bg-blue-100"
              >
                <Plus size={12} /> 같은 요일에 추가
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, unit, tone = 'default' }) {
  const valueTone =
    tone === 'amber' ? 'text-amber-600'
    : tone === 'blue' ? 'text-[#3182F6]'
    : tone === 'emerald' ? 'text-emerald-600'
    : tone === 'gray' ? 'text-[#8B95A1]'
    : 'text-[#191F28]';
  return (
    <div className="min-w-0 rounded-2xl bg-[#F8F9FA] md:bg-transparent px-3 py-3 md:px-0 md:py-0">
      <p className="text-[11px] md:text-xs font-semibold text-[#8B95A1] mb-1">{label}</p>
      <p className={`text-3xl md:text-[38px] md:leading-[44px] font-extrabold ${valueTone}`}>
        {value}
        {unit && <span className="text-xs md:text-sm font-medium text-[#8B95A1] ml-1">{unit}</span>}
      </p>
    </div>
  );
}

function ShiftCard({ shift, staff, onEdit, onDelete }) {
  const isAssistant = staff?._role === 'assistant';
  const roleLabel = isAssistant ? '보조강사' : '강사';
  const initial = (staff?.name || '?').charAt(0).toUpperCase();
  return (
    <div className="bg-white rounded-2xl px-4 md:px-5 py-4 shadow-sm flex items-center gap-3 md:gap-4">
      <div className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
        isAssistant ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-[#3182F6]'
      }`}>
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm md:text-base font-bold text-[#191F28] truncate">{staff?.name || '(삭제된 강사)'}</p>
          <span className="text-[10px] font-semibold text-[#8B95A1]">{roleLabel}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_TONES[shift.status]}`}>
            {STATUS_LABELS[shift.status]}
          </span>
        </div>
        <p className="text-sm md:text-sm font-semibold text-[#4E5968]">
          {formatShiftTimeRange(shift.scheduledStartTime, shift.scheduledEndTime)}
          {shift.breakMinutes ? <span className="text-xs text-[#8B95A1] ml-2 font-normal">휴게 {shift.breakMinutes}분</span> : null}
        </p>
        {(shift.actualStartTime || shift.actualEndTime) && (
          <p className="text-xs text-emerald-600 mt-0.5">
            실제 {formatShiftTimeRange(shift.actualStartTime, shift.actualEndTime)}
          </p>
        )}
        {shift.memo && <p className="text-xs text-[#8B95A1] mt-1 truncate">{shift.memo}</p>}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="p-2 text-[#3182F6] active:bg-blue-50 rounded-lg flex-shrink-0"
        aria-label="수정"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="p-2 text-red-400 active:bg-red-50 rounded-lg flex-shrink-0"
        aria-label="삭제"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ─── Staff: 본인 근무 + 출/퇴근 ───────────────────────────────────
function StaffWorkView() {
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
  const staffWorkRules = useWorkspaceStore((s) => s.staffWorkRules) ?? [];
  const staffWorkExceptions = useWorkspaceStore((s) => s.staffWorkExceptions) ?? [];
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

  const myShifts = useMemo(() => {
    if (!myStaff) return [];
    const plannedRaw = buildPlannedStaffSchedule({
      rules: staffWorkRules,
      exceptions: staffWorkExceptions,
      fromDate: weekDates[0],
      toDate: weekDates[weekDates.length - 1],
      staffUserId: myStaff.serverUserId || undefined,
    });
    const plannedShaped = plannedToStaffShiftShape(plannedRaw, { academyTeachers, academyAssistants });
    const actualForStaff = academyStaffShifts.filter((sh) => sh.staffId === myStaff.id);
    return mergePlannedAndActualStaffShifts(plannedShaped, actualForStaff);
  }, [academyStaffShifts, myStaff, staffWorkRules, staffWorkExceptions, weekDates, academyTeachers, academyAssistants]);

  const todayShift = useMemo(() => {
    const list = myShifts
      .filter((sh) => sh.date === todayStr && sh.status !== 'canceled')
      .sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''));
    return list[0] || null;
  }, [myShifts, todayStr]);

  const weekShiftsByDate = useMemo(() => {
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

  // 오늘 배정된 본인 lesson 세션들 (취소 제외).
  const todayMySessions = useMemo(() => {
    if (!myStaff) return [];
    return classSessions.filter((s) => {
      if (s.date !== todayStr || s.status === 'canceled') return false;
      if (role === 'assistant') {
        const ids = Array.isArray(s.assistantIds) ? s.assistantIds : [];
        return ids.includes(myStaff.id) || s.assistantId === myStaff.id;
      }
      const isMainAndNoSub = s.teacherId === myStaff.id && !s.substituteTeacherId;
      const isSub = s.substituteTeacherId === myStaff.id;
      return isMainAndNoSub || isSub;
    });
  }, [classSessions, myStaff, role, todayStr]);

  // Toss-style timeline: shift 안에서 lesson / gap 행으로 분해.
  const todayTimeline = useMemo(
    () => buildShiftTimeline(todayShift, todayMySessions),
    [todayShift, todayMySessions],
  );

  // 오늘 총 근무/수업/대기 시간 (분 → 시간).
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
      <Header title="근무" />
      <div className="pt-14 md:pt-0 pb-12 md:pb-8 bg-[#F2F4F6] min-h-screen">
        {/* 오늘 요약 + 출/퇴근 */}
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

              {/* 오늘 타임라인 (lesson / gap) */}
              {todayTimeline.length > 0 && (
                <div className="mt-3 bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 pt-4 pb-2">
                    <p className="text-xs font-bold text-[#191F28]">타임라인</p>
                    <p className="text-[11px] text-[#8B95A1] mt-0.5">수업과 비어 있는 근무 시간을 같이 보여줘요.</p>
                  </div>
                  <div className="flex flex-col">
                    {todayTimeline.map((row, idx) => (
                      <TimelineRow
                        key={`${row.startTime}_${idx}`}
                        row={row}
                        classGroups={classGroups}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 이번 주 근무 */}
        <div className="px-4 pt-5">
          <p className="text-sm font-bold text-gray-700 mb-2">이번 주 근무</p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {weekDates.map((d) => {
              const list = weekShiftsByDate.get(d) || [];
              const isTodayDate = d === todayStr;
              return (
                <div
                  key={d}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${isTodayDate ? 'bg-blue-50/40' : ''}`}
                >
                  <div className="w-12 flex-shrink-0">
                    <p className={`text-xs font-bold ${isTodayDate ? 'text-blue-600' : 'text-gray-700'}`}>
                      {d.slice(5)}
                    </p>
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

        {/* 이번 달 합계 */}
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
          {isLesson ? (
            <BookOpen size={12} className="text-[#3182F6]" />
          ) : (
            <Coffee size={12} className="text-[#8B95A1]" />
          )}
          <p className={`text-sm font-bold truncate ${isLesson ? 'text-[#191F28]' : 'text-[#4E5968]'}`}>
            {titles}
          </p>
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

// ─── 근무 추가/수정 모달 ─────────────────────────────────────────
// initial 이 있으면 수정 모드 (staffId 고정 + 단일 근무 only), 없으면 신규 모드.
// Phase 39 — 신규 모드는 mode='single' | 'recurring' 선택. 신규 default = 'recurring'.
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
  initial, defaultDate, defaultStaffId,
  defaultMode = 'recurring',
  teachers = [], assistants = [],
  onClose, onSave, onSaveRecurring,
}) {
  const isEdit = !!initial;
  const [mode, setMode] = useState(isEdit ? 'single' : defaultMode);
  const [recurringStartMode, setRecurringStartMode] = useState(isEdit ? 'custom' : 'today');
  const [recurringEndMode, setRecurringEndMode] = useState('forever');
  const [form, setForm] = useState({
    staffId: initial?.staffId || defaultStaffId || '',
    // Phase 38 — owner 가 특정 요일 chip 에서 "+근무 추가" 누른 경우 그 날짜로 시드.
    date: initial?.date || defaultDate || todayDate(),
    scheduledStartTime: initial?.scheduledStartTime || '',
    scheduledEndTime: initial?.scheduledEndTime || '',
    breakMinutes: initial?.breakMinutes ? String(initial.breakMinutes) : '',
    memo: initial?.memo || '',
    status: initial?.status || 'scheduled',
  });
  // Phase 39 — 반복 근무 폼.
  const [recurringForm, setRecurringForm] = useState({
    weekdays: [],
    startDate: todayDate(),
    endDate: '',
    scheduledStartTime: '',
    scheduledEndTime: '',
    breakMinutes: '',
    memo: '',
  });
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const allStaff = useMemo(() => [
    ...teachers.map((t) => ({ ...t, _role: 'teacher' })),
    ...assistants.map((a) => ({ ...a, _role: 'assistant' })),
  ], [teachers, assistants]);
  const selectedStaff = allStaff.find((s) => s.id === form.staffId);
  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allStaff;
    return allStaff.filter((s) => (s.name || '').toLowerCase().includes(q)
      || (s.email || '').toLowerCase().includes(q));
  }, [allStaff, search]);

  const computedMinutes = useMemo(() => {
    if (!form.scheduledStartTime || !form.scheduledEndTime) return 0;
    return shiftMinutes({
      status: 'completed',
      scheduledStartTime: form.scheduledStartTime,
      scheduledEndTime: form.scheduledEndTime,
      breakMinutes: Number(form.breakMinutes) || 0,
    });
  }, [form.scheduledStartTime, form.scheduledEndTime, form.breakMinutes]);

  const singleTimeError = useMemo(
    () => validateShiftTime({
      startTime: form.scheduledStartTime,
      endTime: form.scheduledEndTime,
      breakMinutes: form.breakMinutes,
    }),
    [form.scheduledStartTime, form.scheduledEndTime, form.breakMinutes],
  );

  // Phase 39 — 반복 모드 미리보기.
  const recurringPreview = useMemo(() => {
    if (mode !== 'recurring') return null;
    if (!recurringForm.startDate || recurringForm.weekdays.length === 0) {
      return { dates: [], count: 0 };
    }
    const daysOfWeek = recurringForm.weekdays.map((d) => KO_TO_DOW[d]).filter((d) => d !== undefined);
    if (daysOfWeek.length === 0) return { dates: [], count: 0 };
    try {
      const preview = buildRecurringStaffWorkPreview({
        weekdays: daysOfWeek,
        effectiveStartDate: recurringForm.startDate,
        effectiveEndDate: recurringForm.endDate || null,
        todayYMD: todayDate(),
      });
      return { ...preview, dates: preview.dates.slice(0, 3) };
    } catch {
      return { dates: [], count: 0 };
    }
  }, [mode, recurringForm.startDate, recurringForm.endDate, recurringForm.weekdays]);

  const recurringTimeError = useMemo(
    () => validateShiftTime({
      startTime: recurringForm.scheduledStartTime,
      endTime: recurringForm.scheduledEndTime,
      breakMinutes: recurringForm.breakMinutes,
    }),
    [recurringForm.scheduledStartTime, recurringForm.scheduledEndTime, recurringForm.breakMinutes],
  );
  const showSingleTimeError = !!(form.scheduledStartTime || form.scheduledEndTime || form.breakMinutes) && !!singleTimeError;
  const showRecurringTimeError = !!(
    recurringForm.scheduledStartTime ||
    recurringForm.scheduledEndTime ||
    recurringForm.breakMinutes
  ) && !!recurringTimeError;

  const canSaveSingle = !!form.staffId && !!form.date && !singleTimeError;
  const canSaveRecurring =
    !!form.staffId
    && recurringForm.weekdays.length > 0
    && !!recurringForm.startDate
    && !!recurringForm.scheduledStartTime
    && !!recurringForm.scheduledEndTime
    && !recurringTimeError
    && (recurringEndMode !== 'until' || !!recurringForm.endDate)
    && !(recurringEndMode === 'until' && recurringForm.endDate && recurringForm.endDate < recurringForm.startDate);
  const canSave = mode === 'single' ? canSaveSingle : canSaveRecurring;

  const toggleRecurringWeekday = (d) => {
    setRecurringForm((f) => {
      const has = f.weekdays.includes(d);
      const next = has ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d];
      return { ...f, weekdays: next };
    });
  };

  const handleSave = () => {
    if (!canSave) return;
    if (mode === 'recurring') {
      onSaveRecurring?.({
        staffId: form.staffId,
        weekdays: recurringForm.weekdays,
        startDate: recurringForm.startDate,
        endDate: recurringEndMode === 'until' ? recurringForm.endDate : '',
        scheduledStartTime: recurringForm.scheduledStartTime,
        scheduledEndTime: recurringForm.scheduledEndTime,
        breakMinutes: recurringForm.breakMinutes,
        memo: recurringForm.memo,
      });
      return;
    }
    onSave(form);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? '근무 일정 수정' : (mode === 'recurring' ? '반복 근무 추가' : '단일 근무 추가')}
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
        >
          {mode === 'recurring' && !isEdit
            ? '근무 규칙 저장'
            : '저장'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Phase 39 — 모드 토글 (수정 모드에선 숨김) */}
        {!isEdit && (
          <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
            <button
              type="button"
              onClick={() => setMode('recurring')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-colors ${
                mode === 'recurring' ? 'bg-white text-[#3182F6] shadow-sm' : 'text-gray-500'
              }`}
            >
              <Repeat size={13} /> 반복 근무
            </button>
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-colors ${
                mode === 'single' ? 'bg-white text-[#3182F6] shadow-sm' : 'text-gray-500'
              }`}
            >
              <CalendarIcon size={13} /> 단일 근무
            </button>
          </div>
        )}

        {/* 강사 선택 */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">대상 *</label>
          {isEdit ? (
            <div className="px-3 py-2.5 rounded-xl bg-gray-50 text-sm text-gray-700">
              {selectedStaff
                ? `${selectedStaff._role === 'assistant' ? '보조강사' : '강사'} · ${selectedStaff.name}`
                : '(삭제된 강사)'}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setStaffPickerOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 active:bg-gray-50 text-left"
            >
              <div className="flex-1 min-w-0">
                {selectedStaff ? (
                  <span className="text-sm text-gray-800">
                    {selectedStaff._role === 'assistant' ? '보조강사' : '강사'} · {selectedStaff.name}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">강사를 선택해주세요</span>
                )}
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </button>
          )}
        </div>

        {/* ─── 단일 근무 폼 ─── */}
        {mode === 'single' && (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">날짜 *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">예정 시작</label>
                <input
                  type="time"
                  value={form.scheduledStartTime}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledStartTime: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">예정 종료</label>
                <input
                  type="time"
                  value={form.scheduledEndTime}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledEndTime: e.target.value }))}
                  className="input"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
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
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">근무 시간 (계산)</label>
                <div className="input flex items-center text-sm text-gray-700">
                  {(computedMinutes / 60).toFixed(1)}시간
                </div>
              </div>
            </div>
            {showSingleTimeError && (
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
                        form.status === id
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-500'
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
              <textarea
                value={form.memo}
                onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                rows={2}
                placeholder="관련 수업, 클리닉, 특이사항 등"
                className="input resize-none"
              />
            </div>
          </>
        )}

        {/* ─── 반복 근무 폼 ─── */}
        {mode === 'recurring' && (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">반복 요일 *</label>
              <div className="grid grid-cols-7 gap-1.5">
                {KOREAN_WEEKDAYS.map((d) => {
                  const active = recurringForm.weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleRecurringWeekday(d)}
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
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">예정 시작 *</label>
                <input
                  type="time"
                  value={recurringForm.scheduledStartTime}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, scheduledStartTime: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">예정 종료 *</label>
                <input
                  type="time"
                  value={recurringForm.scheduledEndTime}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, scheduledEndTime: e.target.value }))}
                  className="input"
                />
              </div>
            </div>
            {showRecurringTimeError && (
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
                    setRecurringForm((f) => ({ ...f, startDate: todayDate() }));
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
              <input
                type="date"
                value={recurringForm.startDate}
                onChange={(e) => setRecurringForm((f) => ({ ...f, startDate: e.target.value }))}
                className="input"
              />
            )}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">언제까지 반복할까요?</label>
              <div className="grid grid-cols-2 gap-2">
                <ChoiceCard
                  active={recurringEndMode === 'forever'}
                  title="계속 반복"
                  onClick={() => {
                    setRecurringEndMode('forever');
                    setRecurringForm((f) => ({ ...f, endDate: '' }));
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
                <input
                  type="date"
                  value={recurringForm.endDate}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="input"
                />
                {recurringForm.endDate && recurringForm.endDate < recurringForm.startDate && (
                  <p className="text-[11px] text-red-500 mt-1.5">반복을 끝내는 날은 처음 적용되는 날보다 뒤여야 해요.</p>
                )}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">휴게(분)</label>
              <input
                type="number"
                value={recurringForm.breakMinutes}
                onChange={(e) => setRecurringForm((f) => ({ ...f, breakMinutes: e.target.value }))}
                placeholder="0"
                className="input"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
              <textarea
                value={recurringForm.memo}
                onChange={(e) => setRecurringForm((f) => ({ ...f, memo: e.target.value }))}
                rows={2}
                placeholder="관련 수업, 특이사항 등"
                className="input resize-none"
              />
            </div>

            {/* 미리보기 */}
            {recurringPreview ? (
              <div className="bg-blue-50 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Check size={14} className="text-[#3182F6]" />
                  <p className="text-sm font-bold text-[#3182F6]">
                    반복 근무 규칙이 저장돼요
                  </p>
                </div>
                <p className="text-[11px] text-[#4E5968] leading-relaxed">
                  {recurringForm.weekdays.join(', ')} {formatShiftTimeRange(recurringForm.scheduledStartTime, recurringForm.scheduledEndTime)}
                </p>
                <p className="text-[11px] text-[#4E5968] mt-1 leading-relaxed">
                  {recurringEndMode === 'until' && recurringForm.endDate
                    ? `${recurringForm.startDate}부터 ${recurringForm.endDate}까지 반복해요.`
                    : `${recurringForm.startDate}부터 계속 반복해요.`}
                </p>
                <p className="text-[11px] text-[#8B95A1] mt-1">
                  가까운 14일 기준 {recurringPreview.count}개의 근무만 미리 준비돼요.
                  {recurringPreview.dates.length > 0 ? ` 첫 일정: ${recurringPreview.dates.map((d) => formatDateShort(d)).join(', ')}` : ''}
                </p>
                <p className="text-[11px] text-[#8B95A1] mt-1">
                  이후 근무는 규칙에 따라 자동으로 표시돼요. 실제 급여는 출퇴근 기록을 기준으로 계산돼요.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400">
                요일·시간·기간을 선택하면 가까운 14일 준비 일정이 표시돼요.
              </p>
            )}
          </>
        )}

        <p className="text-[11px] text-gray-400 leading-relaxed">
          한 근무 안에 여러 수업이 포함돼도 한 줄로 등록하세요. 실제 급여는 출퇴근 기록을 기준으로 계산돼요.
        </p>
      </div>

      {/* 강사 선택 서브 모달 */}
      {staffPickerOpen && (
        <Modal
          isOpen
          onClose={() => setStaffPickerOpen(false)}
          title="대상 선택"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50">
              <Search size={14} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름 또는 이메일로 검색"
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
            </div>
            <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
              {filteredStaff.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">등록된 강사가 없어요.</p>
              ) : (
                filteredStaff.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, staffId: s.id }));
                      setStaffPickerOpen(false);
                      setSearch('');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:bg-gray-50"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      s._role === 'assistant' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {(s.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{s.name || '(이름 없음)'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s._role === 'assistant' ? '보조강사' : '강사'}
                        {s.email ? ` · ${s.email}` : ''}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
