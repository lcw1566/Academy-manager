export const CLASS_ACTIVITY_TYPES = [
  { id: 'regular_class', label: '정규 수업' },
  { id: 'one_on_one', label: '1:1 수업' },
  { id: 'special_lecture', label: '특강' },
  { id: 'makeup', label: '보강' },
  { id: 'assessment', label: '시험·평가' },
  { id: 'self_study', label: '자습' },
  { id: 'coaching', label: '상담·코칭' },
  { id: 'other', label: '기타' },
];

export const CLINIC_ACTIVITY_TYPES = [
  { id: 'clinic', label: '클리닉' },
  { id: 'makeup', label: '보강' },
  { id: 'self_study', label: '자습' },
  { id: 'assessment', label: '테스트' },
  { id: 'consulting', label: '상담' },
  { id: 'assignment_check', label: '과제 검사' },
  { id: 'other', label: '기타' },
];

export const CLASS_RECORD_BLOCKS = [
  { id: 'progress', label: '진도', scope: 'common' },
  { id: 'content', label: '수업 내용', scope: 'common' },
  { id: 'homework', label: '공통 숙제', scope: 'common' },
  { id: 'next_plan', label: '다음 계획', scope: 'common' },
  { id: 'teacher_memo', label: '강사 메모', scope: 'common' },
  { id: 'student_evaluation', label: '학생 평가', scope: 'student' },
  { id: 'score', label: '점수', scope: 'student' },
  { id: 'student_memo', label: '학생 메모', scope: 'student' },
  { id: 'support', label: '보완 항목', scope: 'student' },
];

export const DEFAULT_CLASS_RECORD_BLOCKS = [
  'progress',
  'content',
  'homework',
  'next_plan',
  'teacher_memo',
  'student_evaluation',
  'student_memo',
  'support',
];

const CLASS_RECORD_PRESETS = {
  regular_class: DEFAULT_CLASS_RECORD_BLOCKS,
  one_on_one: [
    'progress', 'content', 'homework', 'next_plan',
    'student_evaluation', 'student_memo', 'support',
  ],
  special_lecture: ['progress', 'content', 'homework', 'teacher_memo', 'student_memo'],
  makeup: ['content', 'next_plan', 'student_memo', 'support'],
  assessment: ['content', 'score', 'student_memo', 'support'],
  self_study: ['content', 'homework', 'student_memo'],
  coaching: ['content', 'next_plan', 'teacher_memo', 'student_memo'],
  other: DEFAULT_CLASS_RECORD_BLOCKS,
};

const VALID_RECORD_BLOCK_IDS = new Set(CLASS_RECORD_BLOCKS.map((block) => block.id));

export function normalizeClassRecordBlocks(value) {
  if (!Array.isArray(value)) return [...DEFAULT_CLASS_RECORD_BLOCKS];
  return [...new Set(value.filter((id) => VALID_RECORD_BLOCK_IDS.has(id)))];
}

export function getClassRecordPreset(activityType) {
  return [...(CLASS_RECORD_PRESETS[activityType] || DEFAULT_CLASS_RECORD_BLOCKS)];
}

export function getActivityLabel(options, activityType, activityName = '') {
  if (activityType === 'other' && String(activityName || '').trim()) {
    return String(activityName).trim();
  }
  return options.find((option) => option.id === activityType)?.label || options[0]?.label || '';
}

export function getClassCompletionLabel(activityType) {
  if (activityType === 'assessment') return '평가 완료';
  if (activityType === 'self_study') return '자습 완료';
  if (activityType === 'coaching' || activityType === 'other') return '기록 완료';
  return '수업 완료';
}
