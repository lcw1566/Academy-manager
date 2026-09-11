import { spawnSync } from 'node:child_process';

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function parseEnvOutput(output) {
  const values = {};
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(?:"([^"]*)"|'([^']*)'|(.*))$/);
    if (!match) continue;
    values[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return values;
}

export function assertLocalSupabaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('로컬 Supabase API URL을 확인하지 못했어요. `npm run supabase:start`를 먼저 실행해주세요.');
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`안전하지 않은 E2E 대상이 차단됐어요: ${url.origin}. E2E는 로컬 Supabase에서만 실행할 수 있어요.`);
  }
  return url.toString().replace(/\/$/, '');
}

export function readLocalSupabaseEnv() {
  const result = spawnSync(
    npxCommand,
    ['supabase', 'status', '-o', 'env'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_TELEMETRY_DISABLED: '1',
      },
    },
  );

  if (result.status !== 0) {
    throw new Error([
      '로컬 Supabase가 실행 중이지 않아요.',
      '`npm run supabase:start`를 실행한 뒤 다시 시도해주세요.',
      String(result.stderr || result.stdout || '').trim(),
    ].filter(Boolean).join('\n'));
  }

  const values = parseEnvOutput(result.stdout);
  const apiUrl = assertLocalSupabaseUrl(values.API_URL);
  if (!values.ANON_KEY || !values.SERVICE_ROLE_KEY) {
    throw new Error('로컬 Supabase 테스트 키를 읽지 못했어요. `npx supabase status -o env` 결과를 확인해주세요.');
  }

  return {
    apiUrl,
    anonKey: values.ANON_KEY,
    serviceRoleKey: values.SERVICE_ROLE_KEY,
    dbUrl: values.DB_URL || null,
  };
}

export function localE2eProcessEnv(localEnv) {
  const nextEnv = {
    ...process.env,
    SUPABASE_TELEMETRY_DISABLED: '1',
    VITE_SUPABASE_URL: localEnv.apiUrl,
    VITE_SUPABASE_ANON_KEY: localEnv.anonKey,
    VITE_DEPLOY_ENV: 'local',
    E2E_TARGET_KIND: 'local',
    E2E_APP_URL: 'http://127.0.0.1:4173',
    E2E_SUPABASE_URL: localEnv.apiUrl,
    E2E_SUPABASE_ANON_KEY: localEnv.anonKey,
    E2E_SUPABASE_SERVICE_ROLE_KEY: localEnv.serviceRoleKey,
    E2E_USER_PASSWORD: process.env.E2E_USER_PASSWORD || 'Seenit-E2E-2026!',
  };
  // 테스트 자식 프로세스가 현재 셸의 운영용 자격 증명을 우연히 상속하지 않게 한다.
  for (const name of [
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_DB_PASSWORD',
    'SENTRY_AUTH_TOKEN',
  ]) {
    delete nextEnv[name];
  }
  return nextEnv;
}
