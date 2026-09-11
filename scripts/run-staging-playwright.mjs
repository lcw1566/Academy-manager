import { spawn } from 'node:child_process';
import { PRODUCTION_SUPABASE_PROJECT_REF } from '../tests/e2e/support/supabase.js';

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} 환경변수가 필요해요.`);
  return value;
}

try {
  const projectRef = required('STAGING_SUPABASE_PROJECT_REF');
  const supabaseUrl = new URL(required('STAGING_SUPABASE_URL'));
  const appUrl = new URL(required('STAGING_APP_URL'));

  if (projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('운영 Supabase project ref는 스테이징 테스트에 사용할 수 없어요.');
  }
  if (supabaseUrl.protocol !== 'https:' || supabaseUrl.hostname !== `${projectRef}.supabase.co`) {
    throw new Error('STAGING_SUPABASE_URL과 STAGING_SUPABASE_PROJECT_REF가 일치하지 않아요.');
  }
  if (appUrl.protocol !== 'https:' || ['127.0.0.1', 'localhost', '::1'].includes(appUrl.hostname)) {
    throw new Error('STAGING_APP_URL에는 별도 스테이징 HTTPS 주소가 필요해요.');
  }

  const stagingEnv = {
    ...process.env,
    E2E_TARGET_KIND: 'staging',
    E2E_STAGING_PROJECT_REF: projectRef,
    E2E_APP_URL: appUrl.origin,
    E2E_SUPABASE_URL: supabaseUrl.origin,
    E2E_SUPABASE_ANON_KEY: required('STAGING_SUPABASE_ANON_KEY'),
    E2E_SUPABASE_SERVICE_ROLE_KEY: required('STAGING_SUPABASE_SERVICE_ROLE_KEY'),
    E2E_USER_PASSWORD: required('STAGING_E2E_USER_PASSWORD'),
    VITE_SUPABASE_URL: supabaseUrl.origin,
    VITE_SUPABASE_ANON_KEY: required('STAGING_SUPABASE_ANON_KEY'),
  };

  console.log(`Playwright staging target verified: ${supabaseUrl.origin} (${projectRef})`);
  console.log(`Playwright staging app verified: ${appUrl.origin}`);

  const child = spawn(
    npxCommand,
    ['playwright', 'test', '--config=playwright.staging.config.js', ...process.argv.slice(2)],
    {
      cwd: process.cwd(),
      env: stagingEnv,
      stdio: 'inherit',
    },
  );

  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (signal) console.error(`Playwright가 ${signal} 신호로 종료됐어요.`);
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
