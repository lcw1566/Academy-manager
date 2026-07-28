import {
  createAcademyStaffShift,
} from './supabase/domainApi';
import useAcademyStore from '../store/useAcademyStore';
import useWorkspaceStore from '../store/useWorkspaceStore';
import {
  formatDateToYMD,
  getDaysInMonth,
  nextMonth,
} from '../utils/date';

export function isMonthEnd(date = new Date()) {
  const ymd = formatDateToYMD(date);
  const month = ymd.slice(0, 7);
  return Number(ymd.slice(8, 10)) === getDaysInMonth(month);
}

function autoGenerationKey(academyId, targetMonth) {
  return `monthly-schedule-generated:${academyId}:${targetMonth}`;
}

function wasGenerated(academyId, targetMonth) {
  if (!academyId || !targetMonth || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(autoGenerationKey(academyId, targetMonth)) === '1';
  } catch {
    return false;
  }
}

function markGenerated(academyId, targetMonth) {
  if (!academyId || !targetMonth || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(autoGenerationKey(academyId, targetMonth), '1');
  } catch {
    /* ignore */
  }
}

async function syncStaffShifts({ academyId, targetMonth }) {
  const academyState = useAcademyStore.getState();
  const workspaceState = useWorkspaceStore.getState();
  const created = academyState.ensureStaffShiftsForMonth?.({
    month: targetMonth,
    rules: workspaceState.staffWorkRules || [],
    exceptions: workspaceState.staffWorkExceptions || [],
    academyTeachers: academyState.academyTeachers || [],
    academyAssistants: academyState.academyAssistants || [],
    academyManagers: academyState.academyManagers || [],
  }) || [];

  for (const shift of created) {
    if (!shift.staffUserId) continue;
    const serverShift = await createAcademyStaffShift({
      academyId,
      staff_user_id: shift.staffUserId,
      staff_role: shift.staffRole || 'teacher',
      date: shift.date,
      scheduled_start_time: shift.scheduledStartTime || null,
      scheduled_end_time: shift.scheduledEndTime || null,
      break_minutes: Number(shift.breakMinutes) || 0,
      status: shift.status || 'scheduled',
      memo: shift.memo || null,
    });
    if (serverShift?.id) {
      academyState.setStaffShiftServerId?.(shift.id, serverShift.id);
    }
  }

  return created.length;
}

export async function runMonthEndScheduleGeneration({
  academyId,
  now = new Date(),
  force = false,
} = {}) {
  if (!academyId) return { skipped: true, reason: 'no-academy' };
  if (!force && !isMonthEnd(now)) return { skipped: true, reason: 'not-month-end' };

  const targetMonth = nextMonth(formatDateToYMD(now).slice(0, 7));
  if (!force && wasGenerated(academyId, targetMonth)) {
    return { skipped: true, reason: 'already-generated', targetMonth };
  }

  // 수업 회차는 SQL 046의 날짜 범위 실체화가 담당한다. 월말 로컬 생성과 함께
  // 실행하면 동시 접속에서 중복될 수 있으므로 이 자동화는 근무표만 유지한다.
  const classSessionsCreated = 0;
  const staffShiftsCreated = await syncStaffShifts({
    academyId,
    targetMonth,
  });

  markGenerated(academyId, targetMonth);
  return {
    skipped: false,
    targetMonth,
    classSessionsCreated,
    staffShiftsCreated,
  };
}
