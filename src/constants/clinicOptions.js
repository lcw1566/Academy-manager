export const CLINIC_OPTIONS_BY_SUBJECT = {
  korean: [
    {
      key: 'vocabulary_concept_test',
      title: '어휘·개념 테스트',
      description: '한자어, 필수 문학 용어, 독서 배경지식 단어 시험을 봅니다.',
    },
    {
      key: 'wrong_answer_analysis',
      title: '오답 분석',
      description: '정규 수업 때 틀린 문항의 이유를 쓰고, 지문에서 근거를 찾는 연습을 합니다.',
    },
    {
      key: 'weak_area_supplement',
      title: '취약 영역 보충',
      description: '개인이 유독 틀리는 영역(고전 시가, 현대시, 경제/과학 독서 등)의 추가 지문을 풉니다.',
    },
    {
      key: 'weekly_assignment_check',
      title: '주간 과제 검사',
      description: '한 주 동안 풀어온 문제집의 채점 여부와 풀이 과정을 확인합니다.',
    },
  ],
  math: [
    {
      key: 'wrong_answer_note',
      title: '오답 노트 작성',
      description: '틀린 문제의 개념을 다시 확인하고, 올바른 풀이 과정을 손으로 직접 적습니다.',
    },
    {
      key: 'similar_problem_solving',
      title: '유사 문항 풀이',
      description: '틀린 문제와 유사한 변형 문제를 풀며 완벽히 이해했는지 점검합니다.',
    },
    {
      key: 'weekly_test',
      title: '주간 테스트',
      description: '지난 수업 내용에 대한 핵심 문제 시험을 보고, 통과하지 못하면 재시험을 치릅니다.',
    },
    {
      key: 'qa_session',
      title: '질의응답',
      description: '혼자 풀 때 막혔던 고난도 문항이나 계산 과정의 오류를 1:1로 질문합니다.',
    },
  ],
  english: [
    {
      key: 'vocabulary',
      title: '단어',
      description: '누적된 지정 단어장을 외우고 커트라인을 통과할 때까지 재시험을 봅니다.',
    },
    {
      key: 'reading',
      title: '독해',
      description: '복잡한 핵심 문장의 주어, 동사, 수식어를 끊어 읽으며 직독직해를 연습합니다.',
    },
    {
      key: 'listening',
      title: '듣기',
      description: '오답률이 높거나 상위 등급을 노리는 경우, 듣기 만점을 위해 주기적으로 실전 평가를 합니다.',
    },
    {
      key: 'grammar',
      title: '문법',
      description: '틀린 문제의 정답 근거를 지문 내에서 찾아내는 훈련을 합니다.',
    },
  ],
  default: [
    { key: 'concept_supplement', title: '개념 보충', description: '취약한 개념을 추가로 설명하고 이해를 확인합니다.' },
    { key: 'wrong_answer_review', title: '오답 정리', description: '틀린 문제를 정리하고 올바른 풀이를 확인합니다.' },
    { key: 'assignment_check', title: '과제 검사', description: '제출한 과제의 완성도와 이해도를 점검합니다.' },
    { key: 'test', title: '테스트', description: '학습한 내용에 대한 간단한 테스트를 진행합니다.' },
    { key: 'qa', title: '질의응답', description: '수업 중 이해하지 못한 내용을 질문하고 답합니다.' },
    { key: 'other', title: '기타', description: '위 항목에 해당하지 않는 기타 클리닉 활동입니다.' },
  ],
};

export const SUBJECT_KEYS = {
  korean: '국어',
  math: '수학',
  english: '영어',
  science: '과학',
  social: '사회',
  other: '기타',
};

export function getClinicOptions(subject) {
  const key = subjectToKey(subject);
  return CLINIC_OPTIONS_BY_SUBJECT[key] || CLINIC_OPTIONS_BY_SUBJECT.default;
}

export function subjectToKey(subject) {
  const map = { 국어: 'korean', 수학: 'math', 영어: 'english', 과학: 'science', 사회: 'social' };
  return map[subject] || subject || 'default';
}
