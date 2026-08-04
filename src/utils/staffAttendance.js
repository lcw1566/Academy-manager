const PAYABLE_STATUSES = new Set(['completed', 'approved']);
const PENDING_STATUSES = new Set(['pending']);

export function timeToMinutes(value) {
  if (!value) return null;
  const [hour, minute] = String(value).slice(0, 5).split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return (hour * 60) + minute;
}

// 자정을 넘긴 근무도 다음 날 퇴근으로 계산한다. 24시간 이상 근무는 이 모델에서
// 표현하지 않으며, 출퇴근 한 쌍이 모두 있어야만 급여 시간으로 인정한다.
export function staffAttendanceMinutes(log) {
  if (!log || log.is_void === true) return 0;
  const start = timeToMinutes(log.actual_start_time ?? log.actualStartTime);
  const end = timeToMinutes(log.actual_end_time ?? log.actualEndTime);
  if (start === null || end === null) return 0;
  const elapsed = end >= start ? end - start : (24 * 60) - start + end;
  const breakMinutes = Math.max(
    0,
    Number(log.break_minutes ?? log.breakMinutes) || 0,
  );
  return Math.max(0, elapsed - breakMinutes);
}

export function isPayableStaffAttendance(log) {
  return !!log && log.is_void !== true && PAYABLE_STATUSES.has(log.status);
}

export function isPendingStaffAttendance(log) {
  return !!log && log.is_void !== true && PENDING_STATUSES.has(log.status);
}

export function sumStaffAttendanceHours(
  logs = [],
  { staffUserId, month, mode = 'payable' } = {},
) {
  if (!staffUserId || !month) return 0;
  let totalMinutes = 0;
  for (const log of logs) {
    if (!log || log.staff_user_id !== staffUserId) continue;
    if (!log.work_date?.startsWith(month)) continue;
    if (mode === 'payable' && !isPayableStaffAttendance(log)) continue;
    if (mode === 'pending' && !isPendingStaffAttendance(log)) continue;
    totalMinutes += staffAttendanceMinutes(log);
  }
  return totalMinutes / 60;
}
