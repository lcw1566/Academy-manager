export const TASK_TYPE_LABELS = {
  homework: '숙제 검사',
  wrong_answer: '오답 풀이',
  vocabulary: '단어 테스트',
  reading: '본문 암기',
  grammar: '문법 보충',
  concept: '개념 보충',
  test_retry: '재시험',
  absence_makeup: '보강',
  other: '기타',
};

export const WAGE_TYPE_LABELS = {
  hourly: '시급',
  monthly: '월급',
};

export const STATUS_LABELS = {
  active: '재직 중',
  leave: '휴직',
  inactive: '퇴사',
};

export const SUBJECT_LABELS = {
  korean: '국어',
  math: '수학',
  english: '영어',
  science: '과학',
  social: '사회',
  other: '기타',
};

export const CLINIC_SUBJECT_FILTERS = [
  { id: 'all', label: '전체' },
  { id: '국어', label: '국어' },
  { id: '수학', label: '수학' },
  { id: '영어', label: '영어' },
  { id: 'other', label: '기타' },
];

export const DATE_FILTER_OPTIONS = [
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
  { id: 'all', label: '전체' },
];
