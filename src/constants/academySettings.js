export const ACADEMY_TYPE_OPTIONS = [
  {
    id: 'core_subjects',
    label: '국영수 중심',
    description: '국어·영어·수학 정규 수업과 클리닉을 함께 운영해요.',
  },
  {
    id: 'english',
    label: '영어 전문',
    description: '단어, 구문, 독해 기록을 클리닉 기본값으로 쓰기 좋아요.',
  },
  {
    id: 'math',
    label: '수학 전문',
    description: '오답, 유사 문항, 개념 보충 기록을 자주 남기는 학원이에요.',
  },
  {
    id: 'all_subjects',
    label: '전과목·종합',
    description: '여러 과목과 반을 폭넓게 운영하는 학원이에요.',
  },
  {
    id: 'other',
    label: '기타',
    description: '학원 방식에 맞춰 직접 세팅해갈 수 있어요.',
  },
];

export const ACADEMY_SUBJECT_OPTIONS = [
  { id: 'korean', label: '국어' },
  { id: 'english', label: '영어' },
  { id: 'math', label: '수학' },
  { id: 'science', label: '과학' },
  { id: 'social', label: '사회' },
  { id: 'essay', label: '논술' },
  { id: 'coding', label: '코딩' },
  { id: 'other', label: '기타' },
];

export const CLINIC_REQUIRED_OPTIONS = [
  {
    value: true,
    label: '클리닉 필수',
    description: '수업 후 보완·자습 기록을 기본 운영 흐름으로 사용해요.',
  },
  {
    value: false,
    label: '필요할 때만',
    description: '보완이 필요한 학생에게만 클리닉 기록을 남겨요.',
  },
];

export const TUITION_POLICY_OPTIONS = [
  { id: 'school_level', label: '학교급별', description: '초등·중등·고등 기준' },
  { id: 'grade', label: '학년별', description: '초1·중2·고3 기준' },
  { id: 'class', label: '반별', description: '반마다 직접 설정' },
];

export const DEFAULT_ACADEMY_SETTINGS = {
  academyType: 'core_subjects',
  academySubjects: ['korean', 'english', 'math'],
  clinicRequired: true,
  tuitionPolicy: 'class',
};

export function inferAcademyTypeFromSubjects(subjects = []) {
  const set = new Set(Array.isArray(subjects) ? subjects : []);
  if (set.size === 1 && set.has('english')) return 'english';
  if (set.size === 1 && set.has('math')) return 'math';
  if (set.has('korean') && set.has('english') && set.has('math') && set.size <= 3) return 'core_subjects';
  if (set.size >= 4) return 'all_subjects';
  return 'other';
}

export function getAcademyTypeLabel(type) {
  return ACADEMY_TYPE_OPTIONS.find((option) => option.id === type)?.label || '국영수 중심';
}

export function getClinicRequiredLabel(required) {
  return required === false ? '클리닉 선택 운영' : '클리닉 필수 운영';
}

export function getAcademySubjectsLabel(subjects = []) {
  const list = Array.isArray(subjects) ? subjects : [];
  if (list.length === 0) return '과목 미설정';
  const labels = list
    .map((id) => ACADEMY_SUBJECT_OPTIONS.find((option) => option.id === id)?.label)
    .filter(Boolean);
  if (labels.length === 0) return '과목 미설정';
  if (labels.length <= 3) return labels.join(' · ');
  return `${labels.slice(0, 3).join(' · ')} 외 ${labels.length - 3}`;
}

export function getTuitionPolicyLabel(policy) {
  return TUITION_POLICY_OPTIONS.find((option) => option.id === policy)?.label || '반별';
}

export function getSchoolLevelKey(level = '') {
  const value = String(level).trim();
  if (value.startsWith('초')) return '초등';
  if (value.startsWith('중')) return '중등';
  if (value.startsWith('고')) return '고등';
  return value ? '기타' : '';
}
