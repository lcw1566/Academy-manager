// 가장 최신 항목을 위에 추가한다. 실제 사용자가 알아야 하는 변경만 공지하고,
// 단순 버그 수정이나 내부 배포에는 새 항목을 만들지 않는다.
export const PRODUCT_UPDATES = [
  {
    id: '2026-09-04-feedback-clinic',
    publishedAt: '2026-09-04T09:00:00+09:00',
    expiresAt: '2026-10-05T00:00:00+09:00',
    dateLabel: '2026. 9. 4.',
    title: '클리닉 화면과 의견 보내기가 새로워졌어요',
    summary: '오늘 할 일은 더 빠르게 확인하고, 불편한 점은 씨닛 안에서 바로 알려주세요.',
    items: [
      '클리닉에서는 선택한 날짜의 일정과 기록만 볼 수 있어요.',
      '날짜 좌우 버튼이나 모바일 스와이프로 하루씩 이동할 수 있어요.',
      'PC 좌측 상단과 모바일 의견 아이콘에서 버그와 개선 아이디어를 보낼 수 있어요.',
    ],
    // roles 또는 modes를 생략하면 모든 역할과 모드에 표시한다.
  },
];

function timestampOf(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isProductUpdateEligible(update, {
  role,
  mode,
  userCreatedAt,
  now = Date.now(),
} = {}) {
  if (!update?.id) return false;
  if (update.roles?.length && !update.roles.includes(role)) return false;
  if (update.modes?.length && !update.modes.includes(mode)) return false;

  const publishedAt = timestampOf(update.publishedAt);
  if (publishedAt == null || publishedAt > now) return false;

  const expiresAt = timestampOf(update.expiresAt);
  if (expiresAt != null && expiresAt <= now) return false;

  // 이미 업데이트가 반영된 뒤 가입한 사용자는 과거 변경 안내를 볼 필요가 없다.
  const accountCreatedAt = timestampOf(userCreatedAt);
  if (accountCreatedAt != null && accountCreatedAt >= publishedAt) return false;

  return true;
}
