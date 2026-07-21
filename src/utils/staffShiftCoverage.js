import {
  buildPlannedStaffSchedule,
  mergePlannedAndActualStaffShifts,
  plannedToStaffShiftShape,
} from './schedule';
import { findShiftCoveringTime } from './shiftCoverage';

function inRange(ymd, fromDate, toDate) {
  if (!ymd) return false;
  if (fromDate && ymd < fromDate) return false;
  if (toDate && ymd > toDate) return false;
  return true;
}

export function buildEffectiveStaffShifts({
  actualShifts = [],
  rules = [],
  exceptions = [],
  fromDate,
  toDate,
  academyTeachers = [],
  academyAssistants = [],
  academyManagers = [],
  staffUserId,
} = {}) {
  const actualInRange = (actualShifts || []).filter((sh) => inRange(sh.date, fromDate, toDate));
  const planned = buildPlannedStaffSchedule({
    rules,
    exceptions,
    fromDate,
    toDate,
    staffUserId,
  });
  const shaped = plannedToStaffShiftShape(planned, {
    academyTeachers,
    academyAssistants,
    academyManagers,
  });
  return mergePlannedAndActualStaffShifts(shaped, actualInRange);
}

export function getUncoveredStaffSessions({ shifts = [], staffId, sessions = [] } = {}) {
  if (!staffId) return [];
  return (sessions || []).filter((sess) => !findShiftCoveringTime(
    shifts,
    staffId,
    sess.date,
    sess.startTime,
    sess.endTime,
  ));
}
