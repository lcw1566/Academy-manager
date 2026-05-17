export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '0원';
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
};

export const attendanceStatusMap = {
  present: { label: '출석', color: 'text-green-700', bg: 'bg-green-50', activeBg: 'bg-green-500', activeText: 'text-white' },
  late:    { label: '지각', color: 'text-orange-700', bg: 'bg-orange-50', activeBg: 'bg-orange-500', activeText: 'text-white' },
  absent:  { label: '결석', color: 'text-red-700', bg: 'bg-red-50', activeBg: 'bg-red-500', activeText: 'text-white' },
  makeup:  { label: '보강필요', color: 'text-yellow-700', bg: 'bg-yellow-50', activeBg: 'bg-yellow-500', activeText: 'text-white' },
};

export const paymentStatusMap = {
  paid:    { label: '완료', color: 'text-green-700', bg: 'bg-green-50' },
  pending: { label: '예정', color: 'text-blue-700', bg: 'bg-blue-50' },
  unpaid:  { label: '미납', color: 'text-red-700', bg: 'bg-red-50' },
  partial: { label: '부분납', color: 'text-orange-700', bg: 'bg-orange-50' },
  exempt:  { label: '면제', color: 'text-gray-600', bg: 'bg-gray-100' },
};

export const evaluationLabels = {
  focus: '집중도',
  attitude: '수업태도',
  understanding: '이해도',
  homework: '숙제수행',
  achievement: '성취도',
};

export const evaluationLevels = [
  { key: 'poor', label: '부족' },
  { key: 'fair', label: '보통' },
  { key: 'good', label: '좋음' },
  { key: 'great', label: '매우 좋음' },
];

export const evaluationLevelColors = {
  poor:  { active: 'bg-red-500 text-white', inactive: 'bg-red-50 text-red-700' },
  fair:  { active: 'bg-orange-500 text-white', inactive: 'bg-orange-50 text-orange-700' },
  good:  { active: 'bg-blue-500 text-white', inactive: 'bg-blue-50 text-blue-700' },
  great: { active: 'bg-green-500 text-white', inactive: 'bg-green-50 text-green-700' },
};

export const roleMap = {
  tutor: '과외 선생님',
  director: '원장',
  owner: '학원 원장',
  teacher: '학원 강사',
  assistant: '보조강사',
};

export const classTypeColors = {
  '정기 과외': 'bg-blue-50 text-blue-700',
  '그룹 과외': 'bg-purple-50 text-purple-700',
  '단발 수업': 'bg-gray-100 text-gray-600',
  '보강': 'bg-yellow-50 text-yellow-700',
  '상담': 'bg-green-50 text-green-700',
  '과외': 'bg-blue-50 text-blue-700',
  '그룹수업': 'bg-purple-50 text-purple-700',
};

export function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

export function normalizePhoneNumber(value) {
  return value.replace(/\D/g, '');
}

// 원장도 담당 강사로 배정 가능. teacherId === 'owner'면 원장 이름 사용.
export const OWNER_TEACHER_ID = 'owner';

export function getTeacherDisplayName(teacherId, teachers, academyProfile) {
  if (!teacherId) return '담당 강사 없음';
  if (teacherId === OWNER_TEACHER_ID) {
    return academyProfile?.ownerName?.trim() || '원장';
  }
  const teacher = teachers?.find((t) => t.id === teacherId);
  return teacher?.name || '담당 강사 없음';
}
