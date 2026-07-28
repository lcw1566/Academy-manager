function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readErrorStatus(error) {
  const status = Number(error?.status ?? error?.statusCode);
  return Number.isFinite(status) ? status : null;
}

/**
 * 네트워크 단절, Supabase/PostgREST 콜드 스타트, 요청 시간 초과처럼
 * 같은 요청을 잠시 뒤 다시 보내면 회복될 수 있는 오류만 재시도한다.
 */
export function isTransientRequestError(error) {
  if (!error) return false;

  if (Array.isArray(error.failed)) {
    return error.failed.some((item) => isTransientRequestError(item?.error));
  }

  const status = readErrorStatus(error);
  if (status === 408 || status === 425 || status === 429 || (status != null && status >= 500)) {
    return true;
  }

  const code = String(error.code || '').toUpperCase();
  if (['57014', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'].includes(code)) {
    return true;
  }

  const message = `${error.name || ''} ${error.message || error}`.toLowerCase();
  return (
    message.includes('aborterror')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('시간이 초과')
    || message.includes('failed to fetch')
    || message.includes('fetch failed')
    || message.includes('network request failed')
    || message.includes('networkerror')
    || message.includes('load failed')
    || message.includes('connection')
    || message.includes('로그인이 필요')
  );
}

export async function retryAsync(
  operation,
  {
    attempts = 3,
    delays = [350, 900],
    shouldRetry = isTransientRequestError,
    onRetry,
  } = {},
) {
  const maxAttempts = Math.max(1, attempts);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error)) throw error;
      onRetry?.(error, attempt);
      const delay = delays[Math.min(attempt - 1, delays.length - 1)] ?? 0;
      if (delay > 0) await wait(delay);
    }
  }

  throw lastError;
}
