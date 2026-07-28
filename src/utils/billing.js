import { generateClassDates } from './recurringClass';
import { getDaysInMonth } from './date';

/**
 * Calculate duration in decimal hours between two HH:MM times.
 * e.g., '19:00' and '20:30' → 1.5
 */
export function calculateDurationHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff / 60 : 0;
}

/**
 * Prorated monthly fee: monthlyFee × actual / full
 * e.g., 400,000 × 5/8 = 250,000
 */
export function calculateMonthlyProratedFee({ monthlyFee, fullMonthSessionCount, actualSessionCount }) {
  if (!monthlyFee || fullMonthSessionCount <= 0) return monthlyFee || 0;
  if (actualSessionCount >= fullMonthSessionCount) return monthlyFee;
  return Math.round(monthlyFee * actualSessionCount / fullMonthSessionCount);
}

/**
 * Hourly fee: hourlyRate × hours × sessions
 * e.g., 30,000 × 1.5 × 5 = 225,000
 */
export function calculateHourlyFee({ hourlyRate, durationHours, sessionCount }) {
  if (!hourlyRate || !durationHours || !sessionCount) return 0;
  return Math.round(hourlyRate * durationHours * sessionCount);
}

/**
 * Count sessions for a group in a given month (YYYY-MM).
 * Uses date string arithmetic — no timezone issues.
 */
export function calculateMonthSessionCount({ yearMonth, daysOfWeek, startDate, endDate, repeatType }) {
  if (!daysOfWeek?.length || !yearMonth) return 0;

  const [year, month] = yearMonth.split('-').map(Number);
  const monthStart = `${yearMonth}-01`;
  const lastDay = getDaysInMonth(year, month);
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

  const effectiveStart = !startDate || startDate < monthStart ? monthStart : startDate;
  const effectiveEnd = !endDate || endDate > monthEnd ? monthEnd : endDate;

  if (effectiveStart > effectiveEnd) return 0;

  try {
    return generateClassDates({
      daysOfWeek,
      startDate: effectiveStart,
      endDate: effectiveEnd,
      repeatType: repeatType || '매주',
    }).length;
  } catch {
    return 0;
  }
}

/**
 * Full month session count (from day 1) — used to compute proration denominator.
 */
export function calculateFullMonthSessionCount({ yearMonth, daysOfWeek, endDate, repeatType }) {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = getDaysInMonth(year, month);
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

  return calculateMonthSessionCount({
    yearMonth,
    daysOfWeek,
    startDate: `${yearMonth}-01`,
    endDate: endDate || monthEnd,
    repeatType,
  });
}

/**
 * Resolve billing config for a specific student in a group.
 * Priority: studentBillings[studentId] → defaultBilling → legacy top-level fields
 */
export function resolveStudentBilling(group, studentId) {
  if (group.billingMode === 'perStudent' && studentId && group.studentBillings?.[studentId]) {
    return group.studentBillings[studentId];
  }
  if (group.defaultBilling) {
    return group.defaultBilling;
  }
  // Legacy fallback — group itself has billing fields at top level
  return {
    billingType: group.billingType || 'monthly',
    monthlyFee: group.monthlyFee || 0,
    hourlyRate: group.hourlyRate || 0,
    paymentDay: group.paymentDay || 10,
  };
}

/**
 * Check whether any student in this group has a non-zero fee configured.
 */
export function groupHasPayment(group) {
  if (group.billingMode === 'perStudent' && group.studentBillings) {
    return Object.values(group.studentBillings).some((b) =>
      b.billingType === 'hourly' ? (b.hourlyRate || 0) > 0 : (b.monthlyFee || 0) > 0
    );
  }
  const billing = group.defaultBilling || group;
  const billingType = billing.billingType || 'monthly';
  return billingType === 'hourly' ? (billing.hourlyRate || 0) > 0 : (billing.monthlyFee || 0) > 0;
}

/**
 * Generate payment amount & metadata for a given group + month + student.
 * Handles both monthly and hourly billing, and first-month proration.
 * Now supports per-student billing via resolveStudentBilling.
 */
export function generatePaymentForMonth({ group, classes, month, studentId }) {
  const billing = resolveStudentBilling(group, studentId);

  const monthClasses = (classes || []).filter(
    (c) => c.repeatGroupId === group.id && c.date.startsWith(month)
  );
  const sessionCount = monthClasses.length;

  const [year, monthNum] = month.split('-').map(Number);
  const lastDay = getDaysInMonth(year, monthNum);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

  if (billing.billingType === 'hourly') {
    const durationHours = calculateDurationHours(group.startTime, group.endTime);
    const hourlyRate = billing.hourlyRate || 0;
    const amount = calculateHourlyFee({ hourlyRate, durationHours, sessionCount });
    return {
      billingType: 'hourly',
      hourlyRate,
      durationHours,
      calculatedSessionCount: sessionCount,
      fullMonthSessionCount: sessionCount,
      isProrated: false,
      amount,
    };
  }

  // Monthly billing
  const monthlyFee = billing.monthlyFee || 0;
  const fullMonthSessionCount = calculateFullMonthSessionCount({
    yearMonth: month,
    daysOfWeek: group.daysOfWeek,
    endDate: group.endDate || monthEnd,
    repeatType: group.repeatType,
  });

  const isStartMonth = group.startDate?.startsWith(month);
  const isProrated =
    isStartMonth &&
    group.startDate > monthStart &&
    sessionCount < fullMonthSessionCount &&
    fullMonthSessionCount > 0;

  const amount = isProrated
    ? calculateMonthlyProratedFee({ monthlyFee, fullMonthSessionCount, actualSessionCount: sessionCount })
    : monthlyFee;

  return {
    billingType: 'monthly',
    originalMonthlyFee: monthlyFee,
    calculatedSessionCount: sessionCount,
    fullMonthSessionCount,
    isProrated,
    amount,
  };
}

/**
 * Human-readable billing description for payment cards.
 */
export function formatBillingDetail(payment) {
  if (!payment) return '';
  if (payment.billingType === 'hourly') {
    const rate = payment.hourlyRate?.toLocaleString('ko-KR') || '';
    const hours = payment.durationHours || '';
    const count = payment.calculatedSessionCount || '';
    return `${rate}원 × ${hours}시간 × ${count}회`;
  }
  if (payment.isProrated && payment.fullMonthSessionCount) {
    const full = payment.originalMonthlyFee?.toLocaleString('ko-KR') || '';
    const cnt = payment.calculatedSessionCount || '';
    const fullCnt = payment.fullMonthSessionCount || '';
    return `월 ${full}원 중 ${cnt}/${fullCnt}회 기준`;
  }
  return payment.billingType === 'monthly' ? '월 수업료' : '';
}
