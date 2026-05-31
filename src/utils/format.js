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

// Phase 44 — 4번째 옵션 teacherUserId (auth.users.id) 추가.
//   - 우선순위: OWNER_TEACHER_ID > teacherUserId 매칭 > local teacherId 매칭.
//   - cross-device 에서 학원장이 만든 반을 강사 폰이 hydrate 했을 때,
//     local academyTeachers 가 동일 user 를 다른 id 로 가질 수 있으므로
//     serverUserId 우선 매칭이 안정적.
export function getTeacherDisplayName(teacherId, teachers, academyProfile, teacherUserId = null) {
  if (teacherId === OWNER_TEACHER_ID) {
    return academyProfile?.ownerName?.trim() || '원장';
  }
  if (teacherUserId && Array.isArray(teachers)) {
    const t = teachers.find((x) => x?.serverUserId === teacherUserId);
    if (t?.name) return t.name;
  }
  if (teacherId && Array.isArray(teachers)) {
    const t = teachers.find((x) => x?.id === teacherId);
    if (t?.name) return t.name;
  }
  return '담당 강사 없음';
}

// ─── Membership ↔ App role mapping ──────────────────────────────
// academy_members.role 값 → useAcademyStore.role 앱 모드 값.
// 현재는 1:1 매핑이지만 별도 함수로 두어 향후 분기(예: assistant→owner 임시
// 위임)가 생길 때 한 곳에서 처리 가능하게 한다.
export function membershipRoleToAppRole(role) {
  if (role === 'owner') return 'owner';
  if (role === 'teacher') return 'teacher';
  if (role === 'assistant') return 'assistant';
  return null;
}

// 앱 모드(또는 academy_members role) 값에 대한 짧은 한글 라벨.
// roleMap 과 분리: roleMap 은 직책 라벨, appRoleToLabel 은 메시지 내 짧은 라벨.
export function appRoleToLabel(role) {
  if (role === 'owner') return '원장';
  if (role === 'teacher') return '강사';
  if (role === 'assistant') return '보조강사';
  if (role === 'tutor') return '과외 선생님';
  return '';
}
