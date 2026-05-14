const evalSentences = {
  focus: {
    great: '수업에 매우 집중하여 참여했습니다.',
    good:  '집중력이 좋았습니다.',
    fair:  '집중도가 조금 아쉬웠습니다.',
    poor:  '집중도 향상이 필요합니다.',
  },
  attitude: {
    great: '수업 태도가 매우 훌륭했습니다.',
    good:  '적극적인 태도로 수업에 임했습니다.',
    fair:  '태도 면에서 조금 더 노력이 필요합니다.',
    poor:  '수업 태도를 개선해야 할 것 같습니다.',
  },
  understanding: {
    great: '오늘 내용을 빠르게 이해했습니다.',
    good:  '전반적으로 잘 이해했습니다.',
    fair:  '일부 개념에 대한 복습이 필요합니다.',
    poor:  '개념 이해를 위한 추가 학습이 필요합니다.',
  },
  homework: {
    great: '숙제를 완벽하게 해왔습니다.',
    good:  '숙제를 성실히 수행해왔습니다.',
    fair:  '숙제 수행이 아쉬웠습니다.',
    poor:  '숙제를 해오지 않았습니다.',
  },
  achievement: {
    great: '오늘 수업 성취도가 매우 높습니다.',
    good:  '목표한 학습 내용을 잘 달성했습니다.',
    fair:  '성취도를 높이기 위한 노력이 더 필요합니다.',
    poor:  '기초부터 다시 다질 필요가 있습니다.',
  },
};

const toneDescriptions = {
  friendly:    '친절하고 따뜻한 톤',
  plain:       '간결하고 담백한 톤',
  praise:      '칭찬과 격려 중심 톤',
  improvement: '보완할 점과 개선 방향 중심 톤',
};

// 시도할 모델 순서 (앞에서부터 순차 시도)
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

async function callGeminiModel(apiKey, model, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `API 오류 (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('빈 응답을 받았습니다.');
  return text.trim();
}

// ─── Gemini API 호출 (모델 순차 fallback) ────────────────────────────────────

export const generateNoticeWithAI = async ({
  studentName, content, materials, homework, nextPlan,
  evaluation, memo, tone = 'friendly', apiKey,
}) => {
  if (!apiKey) throw new Error('API 키가 없습니다.');

  const evalLabels = {
    focus: '집중도', attitude: '수업태도', understanding: '이해도',
    homework: '숙제수행', achievement: '성취도',
  };
  const levelLabels = { poor: '부족', fair: '보통', good: '좋음', great: '매우 좋음' };

  const evalText = Object.entries(evaluation || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${evalLabels[k]}: ${levelLabels[v]}`)
    .join(', ');

  // 개인정보 최소화: 학생 이름과 수업 관련 정보만 포함
  const prompt = `
당신은 학원/과외 선생님이 학부모에게 보내는 수업 알림장을 작성하는 도우미입니다.

아래 수업 정보를 바탕으로 학부모에게 보낼 자연스러운 알림장을 작성해주세요.

[작성 규칙]
- 톤: ${toneDescriptions[tone] || '친절하고 따뜻한 톤'}
- 인사말로 시작하고 감사 인사로 마무리
- 학생 이름을 자연스럽게 사용
- 전문적이지만 딱딱하지 않게
- 대략 3~5문장, 200자 이내
- 이모지 사용 금지
- 존댓말 사용

[수업 정보]
학생 이름: ${studentName}
오늘 배운 내용: ${content || '미입력'}
교재/페이지: ${materials || '미입력'}
숙제: ${homework || '없음'}
다음 수업 계획: ${nextPlan || '미입력'}
평가: ${evalText || '미입력'}
특이사항/메모: ${memo || '없음'}

알림장만 출력하세요. 설명이나 제목은 붙이지 마세요.
`.trim();

  let lastError;
  for (const model of GEMINI_MODELS) {
    try {
      const text = await callGeminiModel(apiKey, model, prompt);
      return text;
    } catch (err) {
      console.error(`[Gemini] ${model} 실패:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('모든 AI 모델 호출에 실패했습니다.');
};

// ─── Mock fallback ────────────────────────────────────────────────────────────

export const generateNotice = ({
  studentName = '학생',
  content = '',
  homework = '',
  evaluation = {},
  memo = '',
  tone = 'friendly',
}) => {
  const name = studentName;
  const lines = [];

  if (tone === 'plain') {
    lines.push('안녕하세요.');
  } else {
    lines.push('안녕하세요, 학부모님.');
  }

  if (content) {
    lines.push(`오늘은 ${content}을(를) 중심으로 수업을 진행했습니다.`);
  }

  const keys = ['focus', 'attitude', 'understanding', 'homework', 'achievement'];

  if (tone === 'praise') {
    const praise = keys
      .filter((k) => evaluation[k] === 'good' || evaluation[k] === 'great')
      .map((k) => evalSentences[k][evaluation[k]]);
    if (praise.length > 0) {
      lines.push(`${name} 학생은 ${praise.slice(0, 2).join(' ')}`);
    } else {
      lines.push(`${name} 학생이 오늘도 열심히 수업에 임해주었습니다.`);
    }
  } else if (tone === 'improvement') {
    const improve = keys
      .filter((k) => evaluation[k] === 'poor' || evaluation[k] === 'fair')
      .map((k) => evalSentences[k][evaluation[k]]);
    if (improve.length > 0) {
      lines.push(`${name} 학생은 ${improve.slice(0, 2).join(' ')}`);
      lines.push('가정에서 꾸준한 복습을 부탁드립니다.');
    }
  } else {
    const evalParts = keys
      .filter((k) => evaluation[k] && evalSentences[k]?.[evaluation[k]])
      .slice(0, 3)
      .map((k) => evalSentences[k][evaluation[k]]);
    if (evalParts.length > 0) {
      lines.push(`${name} 학생은 ${evalParts.join(' ')}`);
    }
  }

  if (memo) lines.push(memo);

  if (homework) {
    lines.push(`오늘 숙제는 ${homework}입니다. 가정에서 확인 부탁드립니다.`);
  } else {
    lines.push('다음 수업도 잘 부탁드립니다.');
  }

  lines.push('감사합니다.');

  return lines.filter(Boolean).join('\n');
};

export const generatePaymentNotice = ({
  month, amount, dueDate, isOverdue = false,
  depositorName = '', bankName = '', bankAccount = '', accountHolder = '',
}) => {
  const monthStr = month ? month.replace('-', '년 ') + '월' : '';
  const amountStr = new Intl.NumberFormat('ko-KR').format(amount) + '원';

  const depositorBlock = depositorName
    ? `입금 시 확인을 위해 입금자명은 아래 양식으로 부탁드립니다.\n입금자명: ${depositorName}`
    : '';

  const bankBlock =
    bankName && bankAccount
      ? `입금 계좌: ${bankName} ${bankAccount}${accountHolder ? ' ' + accountHolder : ''}`
      : '';

  const extra = [depositorBlock, bankBlock].filter(Boolean).join('\n\n');

  if (isOverdue) {
    return [
      '안녕하세요.',
      `${monthStr} 과외비 납부 확인차 연락드립니다.`,
      '',
      `현재 ${amountStr} 수납이 아직 확인되지 않아 안내드립니다.`,
      extra ? '' : null,
      extra || null,
      '',
      '확인 후 편하실 때 회신 부탁드립니다. 감사합니다.',
    ].filter((l) => l !== null).join('\n');
  }

  return [
    '안녕하세요.',
    `${monthStr} 과외비 납부 안내드립니다.`,
    '',
    `이번 달 과외비는 ${amountStr}이며,`,
    `납부 예정일은 ${dueDate}입니다.`,
    extra ? '' : null,
    extra || null,
    '',
    '확인 부탁드립니다. 감사합니다.',
  ].filter((l) => l !== null).join('\n');
};
