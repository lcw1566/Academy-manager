import { generateClassDates } from '../utils/recurringClass';
import { today as todayDate } from '../utils/date';
import {
  clampGenerationEndDate,
  isGenerationCapped,
} from '../utils/schedule';
import { createAcademyStaffShift } from './supabase/domainApi';
import {
  createStaffWorkRule,
  updateStaffWorkRule,
} from './supabase/scheduleRulesApi';

export function buildRecurringStaffWorkPreview({
  weekdays = [],
  effectiveStartDate,
  effectiveEndDate,
  todayYMD,
} = {}) {
  if (!effectiveStartDate || weekdays.length === 0) {
    return { dates: [], count: 0, capped: false, capEndDate: null };
  }
  const baselineYMD = todayYMD || todayDate();
  const capEndDate = clampGenerationEndDate(effectiveEndDate || null, { todayYMD: baselineYMD });
  const dates = generateClassDates({
    daysOfWeek: weekdays,
    startDate: effectiveStartDate,
    endDate: capEndDate,
    repeatType: '매주',
  });
  return {
    dates,
    count: dates.length,
    capped: isGenerationCapped(effectiveEndDate || null, { todayYMD: baselineYMD }),
    capEndDate,
  };
}

function staffRoleOf(staff) {
  return staff?._role || staff?.staffRole || staff?.role || 'teacher';
}

function isSameStaffShift(shift, staff) {
  if (!shift || !staff) return false;
  if (shift.staffId && staff.id && shift.staffId === staff.id) return true;
  if (shift.staffUserId && staff.serverUserId && shift.staffUserId === staff.serverUserId) return true;
  return false;
}

export async function saveRecurringStaffWorkSchedule({
  academyId,
  staff,
  weekdays = [],
  startTime,
  endTime,
  breakMinutes = 0,
  effectiveStartDate,
  effectiveEndDate,
  memo = '',
  todayYMD,
  existingRules = [],
  existingShifts = [],
  addLocalShift,
  setLocalShiftServerId,
} = {}) {
  const staffRole = staffRoleOf(staff);
  const normalizedBreakMinutes = Number(breakMinutes) || 0;
  const normalizedMemo = memo || '';
  const preview = buildRecurringStaffWorkPreview({
    weekdays,
    effectiveStartDate,
    effectiveEndDate,
    todayYMD,
  });

  let rulesCreated = 0;
  let shiftsCreated = 0;
  let shiftsSkipped = 0;

  const canWriteServer = !!(academyId && staff?.serverUserId);

  if (canWriteServer) {
    const selectedDows = new Set(weekdays);
    const overlappingRules = (existingRules || []).filter(
      (rule) => rule.staff_user_id === staff.serverUserId
        && rule.is_active
        && selectedDows.has(rule.day_of_week),
    );

    for (const rule of overlappingRules) {
      try {
        await updateStaffWorkRule(rule.id, { is_active: false });
      } catch (err) {
        console.warn('[supabase] deactivate work rule failed', err);
      }
    }

    for (const dow of weekdays) {
      try {
        await createStaffWorkRule({
          academyId,
          staff_user_id: staff.serverUserId,
          staff_role: staffRole,
          day_of_week: dow,
          start_time: startTime || '',
          end_time: endTime || '',
          break_minutes: normalizedBreakMinutes,
          effective_start_date: effectiveStartDate,
          effective_end_date: effectiveEndDate || null,
          is_active: true,
          memo: normalizedMemo || null,
        });
        rulesCreated += 1;
      } catch (err) {
        console.warn('[supabase] createStaffWorkRule failed', err);
      }
    }
  }

  const existingKeys = new Set(
    (existingShifts || [])
      .filter((shift) => isSameStaffShift(shift, staff) && shift.status !== 'canceled')
      .map((shift) => `${shift.date}__${(shift.scheduledStartTime || '').slice(0, 5)}`),
  );

  for (const date of preview.dates) {
    const key = `${date}__${(startTime || '').slice(0, 5)}`;
    if (existingKeys.has(key)) {
      shiftsSkipped += 1;
      continue;
    }
    existingKeys.add(key);

    const localShift = addLocalShift?.({
      staffId: staff.id,
      staffRole,
      date,
      scheduledStartTime: startTime || '',
      scheduledEndTime: endTime || '',
      breakMinutes: normalizedBreakMinutes,
      memo: normalizedMemo,
      status: 'scheduled',
    });
    shiftsCreated += 1;

    if (canWriteServer) {
      try {
        const serverShift = await createAcademyStaffShift({
          academyId,
          staff_user_id: staff.serverUserId,
          staff_role: staffRole,
          date,
          scheduled_start_time: startTime || null,
          scheduled_end_time: endTime || null,
          break_minutes: normalizedBreakMinutes,
          status: 'scheduled',
          memo: normalizedMemo || null,
        });
        if (localShift?.id && serverShift?.id) {
          setLocalShiftServerId?.(localShift.id, serverShift.id);
        }
      } catch (err) {
        console.warn('[supabase] recurring create shift failed', err);
      }
    }
  }

  return {
    rulesCreated,
    shiftsCreated,
    shiftsSkipped,
    capped: preview.capped,
    capEndDate: preview.capEndDate,
  };
}
