const ERROR_TRANSLATIONS = [
  [/invalid login credentials/gi, '이메일 또는 비밀번호가 올바르지 않아요.'],
  [/email not confirmed/gi, '이메일 인증이 완료되지 않았어요. 인증 메일을 확인해주세요.'],
  [/user is banned|user banned/gi, '이 계정은 현재 로그인이 제한되어 있어요. 관리자에게 문의해주세요.'],
  [/user is disabled|account is disabled/gi, '이 계정은 현재 비활성화되어 있어요. 관리자에게 문의해주세요.'],
  [/login request.*timed out|request timeout/gi, '로그인 요청 시간이 초과됐어요. 네트워크를 확인하고 다시 시도해주세요.'],
  [/user already registered/gi, '이미 가입된 이메일이에요.'],
  [/email address .* invalid|invalid email/gi, '올바른 이메일 주소를 입력해주세요.'],
  [/password should be at least (\d+) characters/gi, '비밀번호는 최소 $1자 이상이어야 해요.'],
  [/signup is disabled/gi, '현재 회원가입을 이용할 수 없어요.'],
  [/email rate limit exceeded/gi, '인증 메일 요청이 너무 많아요. 잠시 후 다시 시도해주세요.'],
  [/too many requests|rate limit exceeded/gi, '요청이 너무 많아요. 잠시 후 다시 시도해주세요.'],
  [/network request failed|failed to fetch|fetch failed/gi, '네트워크 연결을 확인하고 다시 시도해주세요.'],
  [/jwt expired|token has expired|invalid jwt/gi, '로그인 시간이 만료됐어요. 다시 로그인해주세요.'],
  [/new password should be different from the old password/gi, '새 비밀번호는 기존 비밀번호와 다르게 입력해주세요.'],
  [/current password is incorrect|invalid current password/gi, '현재 비밀번호가 올바르지 않아요.'],
  [/reauthentication needed|reauthentication required|requires reauthentication/gi, '보안을 위해 다시 로그인한 뒤 변경해주세요.'],
  [/database error saving new user/gi, '회원 정보를 저장하지 못했어요. 잠시 후 다시 시도해주세요.'],
  [/user not found/gi, '해당 계정을 찾을 수 없어요.'],
  [/permission denied/gi, '이 작업을 수행할 권한이 없어요.'],
  [/new row violates row-level security policy.*$/gi, '이 정보를 저장할 권한이 없어요.'],
  [/row-level security policy.*$/gi, '데이터 접근 권한을 확인해주세요.'],
  [/column .* does not exist/gi, '필요한 데이터베이스 업데이트가 적용되지 않았어요.'],
  [/function .* does not exist/gi, '필요한 서버 기능이 적용되지 않았어요.'],
  [/duplicate key value violates unique constraint/gi, '이미 등록된 정보예요.'],
];

export function localizeUserMessage(message, fallback = '요청을 처리하지 못했어요.') {
  const source = String(message || '').trim();
  if (!source) return fallback;
  const translated = ERROR_TRANSLATIONS.reduce(
    (translated, [pattern, replacement]) => translated.replace(pattern, replacement),
    source,
  );
  if (translated === source && /[A-Za-z]{3,}/.test(source) && !/[가-힣]/.test(source)) {
    return fallback;
  }
  return translated;
}

export function localizeError(error, fallback) {
  return localizeUserMessage(error?.message || error, fallback);
}
