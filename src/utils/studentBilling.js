import {
  ACADEMY_SUBJECT_OPTIONS,
  getTuitionRateForLevel,
} from '../constants/academySettings.js';
import { getDaysInMonth } from './date.js';

export function getStudentTuitionLevel(schoolType = '', grade = '') {
  const prefix = {
    elementary: '초',
    middle: '중',
    high: '고',
  }[schoolType];
  if (!prefix) return '';
  const gradeNumber = String(grade || '').match(/[1-6]/)?.[0];
  return gradeNumber ? `${prefix}${gradeNumber}` : prefix === '초' ? '초등' : prefix === '중' ? '중등' : '고등';
}

export function calculateSuggestedStudentTuition({
  tuitionRates = {},
  tuitionPolicy = 'school_level',
  schoolType = '',
  grade = '',
  subjectIds = [],
} = {}) {
  const level = getStudentTuitionLevel(schoolType, grade);
  if (!level) return 0;
  // 이전 버전의 반별 설정 값이 남아 있어도 새 학생 중심 가격표는 학교별
  // 기본 금액을 사용한다.
  const effectivePolicy = tuitionPolicy === 'class' ? 'school_level' : tuitionPolicy;

  const hasStoredSubjectRates = tuitionRates?.subject_mode === undefined
    && tuitionRates?.subject_rates
    && typeof tuitionRates.subject_rates === 'object';
  const subjectMode = tuitionRates?.subject_mode === true || hasStoredSubjectRates;
  if (!subjectMode) {
    return getTuitionRateForLevel(tuitionRates, effectivePolicy, level);
  }

  return [...new Set(subjectIds || [])].reduce((total, subjectId) => {
    const subject = ACADEMY_SUBJECT_OPTIONS.find((option) => option.id === subjectId);
    if (!subject) return total;
    return total + getTuitionRateForLevel(
      tuitionRates,
      effectivePolicy,
      level,
      subject.id,
    );
  }, 0);
}

function monthRange(month) {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  if (!year || !monthNumber) return null;
  const lastDay = getDaysInMonth(year, monthNumber);
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function resolveAdditionalAmount(group, studentAliases) {
  if (group.billingMode === 'perStudent' && group.studentBillings) {
    for (const studentId of studentAliases) {
      if (!Object.prototype.hasOwnProperty.call(group.studentBillings, studentId)) continue;
      const value = group.studentBillings[studentId];
      if (value && typeof value === 'object') {
        return Math.max(0, Number(
          value.additionalFeeAmount ?? value.monthlyFee ?? value.monthly_fee ?? 0,
        ) || 0);
      }
      return Math.max(0, Number(value) || 0);
    }
  }
  return Math.max(0, Number(group.additionalFeeAmount ?? group.monthlyFee) || 0);
}

function sessionBelongsToStudent(session, studentAliases) {
  const ids = Array.isArray(session.studentIds) ? session.studentIds : [];
  return ids.some((id) => studentAliases.has(id));
}

export function calculateStudentMonthlyCharge({
  student,
  groups = [],
  sessions = [],
  month,
} = {}) {
  const range = monthRange(month);
  if (!student || !range) {
    return { amount: 0, baseAmount: 0, additionalAmount: 0, additions: [] };
  }

  const effectiveFrom = student.tuitionEffectiveFrom || student.enrollmentDate || '';
  const effectiveTo = student.tuitionEffectiveTo || '';
  const studentApplies = (!effectiveFrom || effectiveFrom <= range.end)
    && (!effectiveTo || effectiveTo >= range.start)
    && !['paused', 'inactive'].includes(student.status);
  if (!studentApplies) {
    return { amount: 0, baseAmount: 0, additionalAmount: 0, additions: [] };
  }
  const baseAmount = Math.max(0, Number(student.baseTuition) || 0);
  const studentAliases = new Set([student.id, student.serverId].filter(Boolean));
  const additions = [];

  for (const group of groups || []) {
    if (group.feePolicy !== 'additional') continue;
    if (group.status === 'ended' && group.endDate && group.endDate < range.start) continue;
    if (group.startDate && group.startDate > range.end) continue;
    if (group.endDate && group.endDate < range.start) continue;
    const assigned = (group.studentIds || []).some((id) => studentAliases.has(id));
    if (!assigned) continue;

    const amountPerUnit = resolveAdditionalAmount(group, studentAliases);
    if (amountPerUnit <= 0) continue;

    const studentSessions = (sessions || [])
      .filter((session) => (
        session.classGroupId === group.id
        && session.status !== 'canceled'
        && sessionBelongsToStudent(session, studentAliases)
        && (!effectiveFrom || session.date >= effectiveFrom)
        && (!effectiveTo || session.date <= effectiveTo)
      ))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const monthSessions = studentSessions.filter(
      (session) => session.date >= range.start && session.date <= range.end,
    );
    if (monthSessions.length === 0) continue;

    const feeType = group.additionalFeeType || 'monthly';
    let amount = 0;
    if (feeType === 'per_session') {
      amount = amountPerUnit * monthSessions.length;
    } else if (feeType === 'one_time') {
      // 과거 회차를 아직 불러오지 않은 상태에서도 다음 달에 일회성 비용이
      // 다시 붙지 않도록 반/학생 적용 시작일을 함께 기준으로 삼는다.
      const billingStartDate = [group.startDate, effectiveFrom]
        .filter(Boolean)
        .sort()
        .at(-1) || '';
      const firstDate = billingStartDate < range.start
        ? billingStartDate
        : (studentSessions[0]?.date || billingStartDate);
      if (firstDate >= range.start && firstDate <= range.end) amount = amountPerUnit;
    } else {
      amount = amountPerUnit;
    }
    if (amount <= 0) continue;

    additions.push({
      classGroupId: group.id,
      name: group.name || '추가 수업',
      feeType,
      unitAmount: amountPerUnit,
      sessionCount: monthSessions.length,
      amount,
    });
  }

  const additionalAmount = additions.reduce((total, item) => total + item.amount, 0);
  return {
    amount: baseAmount + additionalAmount,
    baseAmount,
    additionalAmount,
    additions,
  };
}
