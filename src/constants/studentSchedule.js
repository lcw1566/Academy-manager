export const STUDENT_EVENT_TYPES = {
  midterm:     { label: '중간고사',   icon: '📝', dot: 'exam' },
  final:       { label: '기말고사',   icon: '📝', dot: 'exam' },
  mock:        { label: '모의고사',   icon: '📄', dot: 'exam' },
  csat:        { label: '수능',       icon: '🎓', dot: 'exam' },
  performance: { label: '수행평가',   icon: '✏️', dot: 'performance' },
  unit:        { label: '단원평가',   icon: '📋', dot: 'exam' },
  school:      { label: '학교 일정',  icon: '🏫', dot: 'school' },
  other:       { label: '기타',       icon: '📌', dot: 'school' },
};

// Legacy types kept for data compatibility (not shown in UI)
export const LEGACY_EVENT_TYPES = {
  consultation: { label: '상담', icon: '💬', dot: 'school' },
  makeup:       { label: '보충 수업', icon: '📚', dot: 'school' },
};

export const EXAM_EVENT_TYPES = ['midterm', 'final', 'mock', 'csat', 'performance', 'unit'];

export const EXAM_TYPES = {
  midterm:     '중간고사',
  final:       '기말고사',
  mock:        '모의고사',
  csat:        '수능',
  performance: '수행평가',
  unit:        '단원평가',
  school:      '학교 일정',
  other:       '기타',
};

export const SUBJECT_OPTIONS = [
  '국어', '수학', '영어', '한국사',
  '물리학', '화학', '생명과학', '지구과학',
  '사회', '역사', '지리', '윤리',
  '경제', '정치와법', '사회문화',
  '음악', '미술', '체육', '정보',
];

export const GRADE_LABELS = {
  A_PLUS: 'A+', A: 'A', B_PLUS: 'B+', B: 'B',
  C_PLUS: 'C+', C: 'C', D_PLUS: 'D+', D: 'D', F: 'F',
};

export const IMPORTANCE_LABELS = {
  high:   { label: '중요', color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-200' },
  medium: { label: '보통', color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
  low:    { label: '낮음', color: 'text-gray-400',   bg: 'bg-gray-50',   border: 'border-gray-200' },
};
