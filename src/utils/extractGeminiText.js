/**
 * Gemini API 응답에서 텍스트를 안전하게 추출합니다.
 * - candidates[0].content.parts 배열의 모든 part.text를 join
 * - 단일 part여도 동일하게 처리 (parts[0]만 읽는 버그 방지)
 */
export function extractGeminiText(response) {
  if (!response) return '';

  // 일부 SDK wrapping에서 response.text로 직접 제공하는 경우
  if (typeof response.text === 'string') {
    return response.text.trim();
  }

  const parts = response.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    return parts.map((part) => part.text || '').join('').trim();
  }

  return '';
}

/**
 * finishReason별 사용자 메시지 반환
 */
export function getFinishReasonMessage(finishReason) {
  const messages = {
    MAX_TOKENS:  'AI 답변이 길어 중간에 끊겼어요. 다시 생성해보세요.',
    SAFETY:      '일부 표현이 AI 안전 기준에 걸려 알림장을 완성하지 못했어요. 표현을 조금 바꿔 다시 시도해주세요.',
    RECITATION:  '저작권 보호 문구와 유사해 답변이 제한되었어요. 수업 내용을 조금 더 요약해서 다시 시도해주세요.',
  };
  return messages[finishReason] || null;
}
