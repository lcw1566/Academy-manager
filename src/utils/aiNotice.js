import { extractGeminiText, getFinishReasonMessage } from './extractGeminiText';

if (import.meta.env.DEV && !import.meta.env.VITE_GEMINI_API_KEY) {
  console.warn('[Gemini] Missing VITE_GEMINI_API_KEY — API key must be set in the UI or .env.local');
}

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

// 시도할 모델 순서 (VITE_GEMINI_MODEL이 설정된 경우 앞에 추가)
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

// SAFETY/RECITATION은 다른 모델로 재시도해도 의미 없음
const FATAL_FINISH_REASONS = ['SAFETY', 'RECITATION'];

function getModels() {
  const envModel = import.meta.env.VITE_GEMINI_MODEL;
  if (envModel && !GEMINI_MODELS.includes(envModel)) {
    return [envModel, ...GEMINI_MODELS];
  }
  return GEMINI_MODELS;
}

// HTTP 상태 코드 → 사용자 메시지
function getHttpErrorMessage(status) {
  const messages = {
    401: 'API 키가 올바르지 않은 것 같아요. 키를 다시 확인해주세요.',
    403: '사용 권한이 없거나 키에 제한이 설정되어 있어요.',
    404: '모델을 찾을 수 없어요.',
    429: '무료 사용량을 초과했어요. 잠시 후 다시 시도해주세요.',
  };
  return messages[status] || `API 오류 (${status})`;
}

/**
 * 단일 Gemini 모델 호출
 * @returns {{ text: string, finishReason: string }}
 */
async function callGeminiModel(apiKey, model, prompt) {
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 1024,
          },
        }),
      }
    );
  } catch (networkErr) {
    if (import.meta.env.DEV) {
      console.error('[Gemini] Network/CORS error:', { model, error: networkErr.message });
    }
    const err = new Error('브라우저에서 직접 연결하지 못했어요. 네트워크 환경을 확인해주세요.');
    err.isCors = true;
    throw err;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const apiMessage = body?.error?.message || '';
    const userMsg = getHttpErrorMessage(res.status);
    if (import.meta.env.DEV) {
      console.error('[Gemini] generate notice failed', { model, status: res.status, message: userMsg, apiMessage });
    }
    const err = new Error(userMsg);
    err.status = res.status;
    err.apiMessage = apiMessage;
    throw err;
  }

  const data = await res.json();

  if (import.meta.env.DEV) {
    console.log('[Gemini] model:', model);
    console.log('[Gemini] prompt length:', prompt.length);
    console.log('[Gemini] raw response:', data);
    console.log('[Gemini] finishReason:', data.candidates?.[0]?.finishReason);
    console.log('[Gemini] usageMetadata:', data.usageMetadata);
  }

  const finishReason = data.candidates?.[0]?.finishReason ?? 'STOP';
  const text = extractGeminiText(data);

  if (import.meta.env.DEV) {
    console.log('[Gemini] extracted text length:', text.length);
    console.log('[Gemini] extracted text:', text);
  }

  return { text, finishReason };
}

// ─── Gemini API 호출 (모델 순차 fallback) ────────────────────────────────────

export const generateNoticeWithAI = async ({
  studentName, content, materials, homework, nextPlan,
  evaluation, memo, tone = 'friendly', apiKey,
}) => {
  const resolvedKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!resolvedKey) throw new Error('API 키가 없습니다.');

  const evalLabels = {
    focus: '집중도', attitude: '수업태도', understanding: '이해도',
    homework: '숙제수행', achievement: '성취도',
  };
  const levelLabels = { poor: '부족', fair: '보통', good: '좋음', great: '매우 좋음' };

  const evalText = Object.entries(evaluation || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${evalLabels[k]}: ${levelLabels[v]}`)
    .join(', ');

  const prompt = `너는 과외 선생님이 학부모에게 보내는 수업 알림장을 작성하는 도우미다.

아래 정보를 바탕으로 학부모에게 바로 보낼 수 있는 자연스러운 한국어 알림장을 작성해라.

작성 조건:
- ${toneDescriptions[tone] || '친절하고 따뜻한 톤'}으로 작성
- 4~6문장으로 완성
- 문장이 중간에 끊기지 않게 반드시 완성된 문장으로 마무리
- 마지막 문장은 반드시 "감사합니다."로 끝낼 것
- 제목, 마크다운 기호, 불릿(·/-/*), 따옴표 사용 금지
- 자연스러운 구어체 존댓말 사용
- 전화번호, 주소, 계좌번호 같은 개인정보 포함 금지

수업 정보:
학생: ${studentName}
과목: ${content ? '' : '미입력'}
오늘 배운 내용: ${content || '미입력'}
교재/페이지: ${materials || '미입력'}
숙제: ${homework || '없음'}
다음 수업 계획: ${nextPlan || '미입력'}
평가: ${evalText || '미입력'}
특이사항: ${memo || '없음'}

알림장 본문만 출력하라. 설명, 제목, 라벨 없이 바로 본문으로 시작하라.`.trim();

  let lastError;
  const models = getModels();

  for (const model of models) {
    try {
      const { text, finishReason } = await callGeminiModel(resolvedKey, model, prompt);

      if (FATAL_FINISH_REASONS.includes(finishReason)) {
        throw new Error(getFinishReasonMessage(finishReason) || '알림장 생성에 실패했습니다.');
      }

      if (finishReason === 'MAX_TOKENS') {
        const err = new Error(getFinishReasonMessage('MAX_TOKENS'));
        err.finishReason = 'MAX_TOKENS';
        lastError = err;
        if (import.meta.env.DEV) {
          console.warn(`[Gemini] ${model} MAX_TOKENS hit, trying next model...`);
        }
        continue;
      }

      if (!text) {
        lastError = new Error('빈 응답을 받았습니다.');
        continue;
      }

      return text;
    } catch (err) {
      // 콘텐츠 정책 위반 — 재시도해도 달라지지 않음
      if (FATAL_FINISH_REASONS.some((r) => err.message === getFinishReasonMessage(r))) {
        throw err;
      }

      // 키/권한/한도 오류 — 다른 모델로 재시도해도 의미 없음
      if (err.status === 401 || err.status === 403 || err.status === 429 || err.isCors) {
        throw err;
      }

      // 404 모델 없음 — 다음 모델로 시도
      if (err.status === 404) {
        if (import.meta.env.DEV) {
          console.warn(`[Gemini] ${model} not found (404), trying next model...`);
        }
        lastError = err;
        continue;
      }

      if (import.meta.env.DEV) {
        console.error(`[Gemini] ${model} 실패:`, err.message);
      }
      lastError = err;
    }
  }

  throw lastError || new Error('모든 AI 모델 호출에 실패했습니다.');
};

// ─── 연결 테스트 ──────────────────────────────────────────────────────────────

export const testGeminiConnection = async (apiKey) => {
  const resolvedKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!resolvedKey) throw new Error('API 키가 없습니다. 키를 입력하거나 저장 후 테스트해주세요.');

  const testPrompt = "테스트입니다. '연결 성공'이라고만 답해주세요.";
  const models = getModels();
  let lastError;

  for (const model of models) {
    try {
      const { text } = await callGeminiModel(resolvedKey, model, testPrompt);
      return { model, text };
    } catch (err) {
      // 키/권한/한도/CORS — 재시도 의미 없음
      if (err.status === 401 || err.status === 403 || err.status === 429 || err.isCors) throw err;
      lastError = err;
      if (err.status !== 404) break;
    }
  }

  throw lastError || new Error('연결 테스트에 실패했습니다.');
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
  const lines = [];

  lines.push(tone === 'plain' ? '안녕하세요.' : '안녕하세요, 학부모님.');

  if (content) {
    lines.push(`오늘은 ${content}을(를) 중심으로 수업을 진행했습니다.`);
  }

  const keys = ['focus', 'attitude', 'understanding', 'homework', 'achievement'];

  if (tone === 'praise') {
    const praise = keys
      .filter((k) => evaluation[k] === 'good' || evaluation[k] === 'great')
      .map((k) => evalSentences[k][evaluation[k]]);
    if (praise.length > 0) {
      lines.push(`${studentName} 학생은 ${praise.slice(0, 2).join(' ')}`);
    } else {
      lines.push(`${studentName} 학생이 오늘도 열심히 수업에 임해주었습니다.`);
    }
  } else if (tone === 'improvement') {
    const improve = keys
      .filter((k) => evaluation[k] === 'poor' || evaluation[k] === 'fair')
      .map((k) => evalSentences[k][evaluation[k]]);
    if (improve.length > 0) {
      lines.push(`${studentName} 학생은 ${improve.slice(0, 2).join(' ')}`);
      lines.push('가정에서 꾸준한 복습을 부탁드립니다.');
    }
  } else {
    const evalParts = keys
      .filter((k) => evaluation[k] && evalSentences[k]?.[evaluation[k]])
      .slice(0, 3)
      .map((k) => evalSentences[k][evaluation[k]]);
    if (evalParts.length > 0) {
      lines.push(`${studentName} 학생은 ${evalParts.join(' ')}`);
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
