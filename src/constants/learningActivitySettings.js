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
  { id: 'content', type: 'long_text', label: '수업 내용', scope: 'common', system: true },
  { id: 'homework', type: 'short_text', label: '공통 숙제', scope: 'common', system: true },
  { id: 'next_plan', type: 'short_text', label: '다음 계획', scope: 'common', system: true },
  { id: 'teacher_memo', type: 'long_text', label: '강사 메모', scope: 'common', system: true },
  { id: 'student_evaluation', type: 'evaluation', label: '학생 평가', scope: 'student', system: true },
  { id: 'score', type: 'score', label: '점수', scope: 'student', system: true },
  { id: 'student_memo', type: 'long_text', label: '학생 메모', scope: 'student', system: true },
  { id: 'support', type: 'support', label: '보완 항목', scope: 'student', system: true },
];

export const CUSTOM_RECORD_BLOCK_TYPES = [
  { id: 'short_text', label: '짧은 글' },
  { id: 'long_text', label: '긴 글' },
  { id: 'number', label: '숫자' },
  { id: 'checkbox', label: '체크' },
  { id: 'select', label: '선택' },
];

export const DEFAULT_CLASS_RECORD_BLOCKS = [
  'content',
  'homework',
  'next_plan',
  'student_memo',
  'support',
];

const CLASS_RECORD_PRESETS = {
  regular_class: DEFAULT_CLASS_RECORD_BLOCKS,
  one_on_one: DEFAULT_CLASS_RECORD_BLOCKS,
  special_lecture: ['content', 'homework', 'next_plan', 'student_memo'],
  makeup: ['content', 'next_plan', 'student_memo', 'support'],
  assessment: ['content', 'score', 'student_memo', 'support'],
  self_study: ['content', 'homework', 'student_memo'],
  coaching: ['content', 'next_plan', 'student_memo'],
  other: DEFAULT_CLASS_RECORD_BLOCKS,
};

const VALID_RECORD_BLOCK_IDS = new Set(CLASS_RECORD_BLOCKS.map((block) => block.id));
const RECORD_BLOCK_BY_ID = new Map(CLASS_RECORD_BLOCKS.map((block) => [block.id, block]));

export function normalizeClassRecordBlocks(value) {
  if (!Array.isArray(value)) return [...DEFAULT_CLASS_RECORD_BLOCKS];
  return [...new Set(
    value
      .map((id) => (id === 'progress' ? 'content' : id))
      .filter((id) => VALID_RECORD_BLOCK_IDS.has(id)),
  )];
}

function normalizeSchemaBlock(block, index) {
  if (typeof block === 'string') {
    const systemBlock = RECORD_BLOCK_BY_ID.get(block === 'progress' ? 'content' : block);
    return systemBlock ? { ...systemBlock } : null;
  }
  if (!block || typeof block !== 'object') return null;
  const normalizedId = block.id === 'progress' ? 'content' : block.id;
  const systemBlock = RECORD_BLOCK_BY_ID.get(normalizedId);
  if (systemBlock) return { ...systemBlock, required: block.required === true };
  const type = CUSTOM_RECORD_BLOCK_TYPES.some((option) => option.id === block.type)
    ? block.type
    : 'short_text';
  const label = String(block.label || '').trim();
  if (!label) return null;
  return {
    id: String(block.id || `custom_${index}`),
    type,
    label,
    scope: block.scope === 'student' ? 'student' : 'common',
    system: false,
    required: block.required === true,
    options: type === 'select'
      ? [...new Set((Array.isArray(block.options) ? block.options : []).map((item) => String(item).trim()).filter(Boolean))]
      : [],
  };
}

export function normalizeRecordSchema(value, fallbackBlockIds = DEFAULT_CLASS_RECORD_BLOCKS) {
  const source = Array.isArray(value) ? value : fallbackBlockIds;
  const seen = new Set();
  return source
    .map(normalizeSchemaBlock)
    .filter((block) => {
      if (!block || seen.has(block.id)) return false;
      seen.add(block.id);
      return true;
    });
}

export function recordSchemaToBlockIds(schema) {
  return normalizeRecordSchema(schema)
    .filter((block) => block.system && VALID_RECORD_BLOCK_IDS.has(block.id))
    .map((block) => block.id);
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
