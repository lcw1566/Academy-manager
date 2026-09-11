import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarClock, ChevronDown, Clock3, LogIn, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import Header from '../../../components/Header';
import ScheduleCalendar from '../../../components/calendar/ScheduleCalendar';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import {
  addDaysYMD,
  formatMonth,
  getCurrentMonth,
  getDaysInMonth,
  getTodayYMD,
  prevMonth,
} from '../../../utils/date';
import {
  buildPlannedStaffSchedule,
  mergePlannedAndActualStaffShifts,
  plannedToStaffShiftShape,
} from '../../../utils/schedule';
import {
  isPayableStaffAttendance,
  isPendingStaffAttendance,
  staffAttendanceMinutes,
} from '../../../utils/staffAttendance';

const MONTH_COUNT = 6;

function recentMonths() {
  const months = [];
  let month = getCurrentMonth();
  for (let index = 0; index < MONTH_COUNT; index += 1) {
    months.push(month);
    month = prevMonth(month);
  }
  return months;
}

function monthRange(month) {
  return {
    fromDate: `${month}-01`,
    toDate: `${month}-${String(getDaysInMonth(month)).padStart(2, '0')}`,
  };
}

function hours(minutes) {
  const value = Math.max(0, Number(minutes) || 0) / 60;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function clock(value) {
  return value ? String(value).slice(0, 5) : '-';
}

function statusMeta(log) {
  if (isPayableStaffAttendance(log)) {
    return { label: '급여 반영', className: 'bg-seenit-success-soft text-seenit-success' };
  }
  if (log.status === 'rejected' || log.is_void === true) {
    return { label: '제외', className: 'bg-seenit-danger-soft text-seenit-danger' };
  }
  return { label: log.actual_end_time ? '확인 대기' : '퇴근 필요', className: 'bg-seenit-warning-soft text-seenit-warning' };
}

export default function MyWorkPage() {
  const academyTeachers = useAcademyStore((state) => state.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((state) => state.academyAssistants) ?? [];
  const academyManagers = useAcademyStore((state) => state.academyManagers) ?? [];
  const academyStaffShifts = useAcademyStore((state) => state.academyStaffShifts) ?? [];
  const authUserId = useAuthStore((state) => state.user?.id);
  const authUserEmail = useAuthStore((state) => state.user?.email);
  const memberships = useWorkspaceStore((state) => state.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((state) => state.currentAcademyId);
  const logs = useWorkspaceStore((state) => state.staffAttendanceLogs) ?? [];
  const staffWorkRules = useWorkspaceStore((state) => state.staffWorkRules) ?? [];
  const staffWorkExceptions = useWorkspaceStore((state) => state.staffWorkExceptions) ?? [];
  const loadLogs = useWorkspaceStore((state) => state.loadStaffAttendanceLogs);
  const loadRules = useWorkspaceStore((state) => state.loadStaffWorkRules);
  const loadExceptions = useWorkspaceStore((state) => state.loadStaffWorkExceptions);
  const loadShifts = useWorkspaceStore((state) => state.loadServerStaffShifts);
  const isLoading = useWorkspaceStore((state) => state.isStaffAttendanceLogsLoading);
  const error = useWorkspaceStore((state) => state.staffAttendanceLogsError);
  const months = useMemo(recentMonths, []);
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(getTodayYMD);
  const [pickerOpen, setPickerOpen] = useState(false);

  const membership = useMemo(
    () => memberships.find((item) => item.academy_id === currentAcademyId) || null,
    [currentAcademyId, memberships],
  );
  const staff = useMemo(
    () => findLocalStaffForUser(
      [...academyTeachers, ...academyAssistants, ...academyManagers],
      { userId: authUserId, memberId: membership?.id, email: authUserEmail },
    ),
    [academyAssistants, academyManagers, academyTeachers, authUserEmail, authUserId, membership?.id],
  );
  const staffUserId = staff?.serverUserId || authUserId;
  const calendarRange = useMemo(() => ({
    fromDate: addDaysYMD(selectedScheduleDate, -45),
    toDate: addDaysYMD(selectedScheduleDate, 75),
  }), [selectedScheduleDate]);

  useEffect(() => {
    if (!staffUserId) return;
    void loadLogs?.({ ...monthRange(selectedMonth), limit: 120 });
  }, [loadLogs, selectedMonth, staffUserId]);

  useEffect(() => {
    if (!staffUserId) return;
    void Promise.all([
      loadRules?.(),
      loadExceptions?.(calendarRange),
      loadShifts?.(),
    ]);
  }, [calendarRange, loadExceptions, loadRules, loadShifts, staffUserId]);

  const workSchedules = useMemo(() => {
    if (!staffUserId) return [];
    const planned = buildPlannedStaffSchedule({
      rules: staffWorkRules,
      exceptions: staffWorkExceptions,
      ...calendarRange,
      staffUserId,
    });
    const plannedShifts = plannedToStaffShiftShape(planned, {
      academyTeachers,
      academyAssistants,
      academyManagers,
    });
    const actualShifts = academyStaffShifts.filter((shift) => (
      shift.status !== 'canceled'
      && shift.date >= calendarRange.fromDate
      && shift.date <= calendarRange.toDate
      && (shift.staffUserId === staffUserId || (staff?.id && shift.staffId === staff.id))
    ));
    return mergePlannedAndActualStaffShifts(plannedShifts, actualShifts).map((shift) => ({
      id: shift.id,
      date: shift.date,
      startTime: shift.scheduledStartTime || shift.startTime,
      endTime: shift.scheduledEndTime || shift.endTime,
      title: '근무',
      subtitle: shift.breakMinutes ? `휴게 ${shift.breakMinutes}분` : '휴게 없음',
      badge: shift.plannedExceptionType === 'extra'
        ? '추가 근무'
        : shift.plannedExceptionType === 'change' ? '변경 근무' : shift.isPlanned ? '예정' : '등록됨',
      tone: {
        card: 'border-seenit-brand/25 bg-seenit-brand-soft',
        title: 'text-seenit-ink',
        time: 'text-seenit-brand',
        dot: 'bg-seenit-brand',
      },
    }));
  }, [academyAssistants, academyManagers, academyStaffShifts, academyTeachers, calendarRange, staff?.id, staffUserId, staffWorkExceptions, staffWorkRules]);

  const monthLogs = useMemo(
    () => logs
      .filter((log) => log.staff_user_id === staffUserId && log.work_date?.startsWith(selectedMonth))
      .sort((left, right) => (right.work_date || '').localeCompare(left.work_date || '')),
    [logs, selectedMonth, staffUserId],
  );
  const summary = useMemo(() => {
    let confirmedMinutes = 0;
    let pendingMinutes = 0;
    let openCount = 0;
    monthLogs.forEach((log) => {
      const minutes = staffAttendanceMinutes(log);
      if (isPayableStaffAttendance(log)) confirmedMinutes += minutes;
      else if (isPendingStaffAttendance(log)) pendingMinutes += minutes;
      if (log.actual_start_time && !log.actual_end_time && log.is_void !== true) openCount += 1;
    });
    return { confirmedMinutes, pendingMinutes, openCount };
  }, [monthLogs]);

  return (
    <div>
      <Header title="근무" />
      <div className="pt-14 pb-8 md:pt-0">
        <section className="relative px-4 pt-4 md:pt-0">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setPickerOpen((open) => !open)}
            className="pressable-surface inline-flex h-11 items-center gap-2 rounded-2xl border border-seenit-border-soft bg-seenit-surface px-4 text-sm font-bold text-seenit-ink shadow-sm"
          >
            <CalendarClock size={16} className="text-seenit-brand" />
            {formatMonth(selectedMonth)}
            <ChevronDown size={15} className={`text-seenit-muted transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
          </motion.button>
          {pickerOpen && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="absolute left-4 top-full z-20 mt-2 grid w-[250px] grid-cols-2 gap-1 rounded-2xl border border-seenit-border-soft bg-seenit-surface p-2 shadow-xl">
              {months.map((month) => (
                <button
                  key={month}
                  type="button"
                  onClick={() => { setSelectedMonth(month); setPickerOpen(false); }}
                  className={`pressable-surface rounded-xl px-3 py-2.5 text-left text-sm font-bold ${month === selectedMonth ? 'bg-seenit-brand-soft text-seenit-brand' : 'text-seenit-secondary'}`}
                >
                  {formatMonth(month)}
                </button>
              ))}
            </motion.div>
          )}
        </section>

        <section className="mt-4 grid grid-cols-3 gap-2 px-4">
          <WorkMetric label="확정 근무" value={`${hours(summary.confirmedMinutes)}시간`} tone="brand" />
          <WorkMetric label="미확정" value={`${hours(summary.pendingMinutes)}시간`} tone="warning" />
          <WorkMetric label="퇴근 필요" value={`${summary.openCount}건`} tone={summary.openCount ? 'danger' : 'default'} />
        </section>

        <ScheduleCalendar
          selectedDate={selectedScheduleDate}
          onSelectDate={setSelectedScheduleDate}
          schedules={workSchedules}
          title="내 근무 스케줄"
          emptyText="예정된 근무가 없어요"
          defaultMode="month"
          className="mt-5"
        />

        <section className="mt-5 px-4">
          <div className="mb-2 px-1">
            <h2 className="text-base font-bold text-seenit-ink">내 근무 기록</h2>
            <p className="mt-0.5 text-xs text-seenit-subtle">출퇴근 시간과 급여 반영 여부를 확인해요.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-seenit-border-soft bg-seenit-surface shadow-sm">
            {isLoading && monthLogs.length === 0 ? (
              <div className="p-8 text-center text-sm font-medium text-seenit-subtle">근무 기록을 불러오는 중이에요.</div>
            ) : error ? (
              <div className="p-8 text-center">
                <p className="text-sm font-bold text-seenit-danger">근무 기록을 불러오지 못했어요.</p>
                <button type="button" onClick={() => loadLogs?.({ ...monthRange(selectedMonth), limit: 120 })} className="mt-3 text-xs font-bold text-seenit-brand">다시 시도</button>
              </div>
            ) : monthLogs.length === 0 ? (
              <div className="p-8 text-center text-sm font-medium text-seenit-subtle">이 달의 근무 기록이 없어요.</div>
            ) : monthLogs.map((log) => <WorkLogRow key={log.id || `${log.work_date}-${log.actual_start_time}`} log={log} />)}
          </div>
        </section>
      </div>
    </div>
  );
}

function WorkMetric({ label, value, tone = 'default' }) {
  const toneClass = tone === 'brand'
    ? 'text-seenit-brand'
    : tone === 'warning'
      ? 'text-seenit-warning'
      : tone === 'danger' ? 'text-seenit-danger' : 'text-seenit-ink';
  return (
    <div className="rounded-2xl border border-seenit-border-soft bg-seenit-surface px-3 py-3 shadow-sm">
      <p className="text-[11px] font-semibold text-seenit-subtle">{label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function WorkLogRow({ log }) {
  const meta = statusMeta(log);
  return (
    <div className="flex items-center gap-3 border-b border-seenit-border-soft px-4 py-3 last:border-0">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-seenit-control text-seenit-secondary">
        {log.actual_end_time ? <BadgeCheck size={17} /> : <Clock3 size={17} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-seenit-ink">{log.work_date}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-seenit-subtle">
          <LogIn size={11} /> {clock(log.actual_start_time)}
          <span className="mx-0.5">·</span>
          <LogOut size={11} /> {clock(log.actual_end_time)}
          {log.break_minutes ? ` · 휴게 ${log.break_minutes}분` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-seenit-ink">{hours(staffAttendanceMinutes(log))}시간</p>
        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>{meta.label}</span>
      </div>
    </div>
  );
}
