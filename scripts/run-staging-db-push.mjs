import { spawn } from 'node:child_process';

const PRODUCTION_SUPABASE_PROJECT_REF = 'vfiiieqnxawnhtgrvmxn';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} 환경변수가 필요해요.`);
  return value;
}

try {
  const projectRef = required('STAGING_SUPABASE_PROJECT_REF');
  const supabaseUrl = new URL(required('STAGING_SUPABASE_URL'));
  const databasePassword = required('STAGING_DB_PASSWORD');
  const dryRun = process.argv.includes('--dry-run');

  if (projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('운영 Supabase project ref에 대한 스테이징 DB 작업이 차단됐어요.');
  }
  if (supabaseUrl.protocol !== 'https:' || supabaseUrl.hostname !== `${projectRef}.supabase.co`) {
    throw new Error('STAGING_SUPABASE_URL과 STAGING_SUPABASE_PROJECT_REF가 일치하지 않아요.');
  }

  console.log(`Staging database target verified: ${projectRef}`);
  console.log(dryRun ? 'Staging migration dry-run을 시작합니다.' : 'Staging migration 적용을 시작합니다.');

  const args = ['supabase', 'db', 'push', '--project-ref', projectRef];
  if (dryRun) args.push('--dry-run');
  const child = spawn(npxCommand, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SUPABASE_DB_PASSWORD: databasePassword,
      SUPABASE_TELEMETRY_DISABLED: '1',
    },
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (signal) console.error(`Supabase CLI가 ${signal} 신호로 종료됐어요.`);
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
