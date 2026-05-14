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
  teacher: '강사',
};

export const classTypeColors = {
  '과외': 'bg-blue-50 text-blue-700',
  '그룹수업': 'bg-purple-50 text-purple-700',
  '보강': 'bg-yellow-50 text-yellow-700',
  '상담': 'bg-green-50 text-green-700',
};
