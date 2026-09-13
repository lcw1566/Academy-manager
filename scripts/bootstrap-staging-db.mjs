import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const PRODUCTION_SUPABASE_PROJECT_REF = 'vfiiieqnxawnhtgrvmxn';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const { Client } = pg;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} 환경변수가 필요해요.`);
  return value;
}

function run(command, args, { env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) return reject(new Error(`${command}가 ${signal} 신호로 종료됐어요.`));
      if (code !== 0) return reject(new Error(`${command}가 종료 코드 ${code}로 실패했어요.`));
      resolve();
    });
  });
}

async function runSupabase(args, env) {
  return run(npxCommand, ['supabase', ...args], { env });
}

try {
  const projectRef = required('STAGING_SUPABASE_PROJECT_REF');
  const supabaseUrl = new URL(required('STAGING_SUPABASE_URL'));
  const databasePassword = required('STAGING_DB_PASSWORD');
  if (projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('운영 Supabase에 대한 스테이징 bootstrap이 차단됐어요.');
  }
  if (supabaseUrl.protocol !== 'https:' || supabaseUrl.hostname !== `${projectRef}.supabase.co`) {
    throw new Error('STAGING_SUPABASE_URL과 STAGING_SUPABASE_PROJECT_REF가 일치하지 않아요.');
  }

  const originalRef = await readFile('supabase/.temp/project-ref', 'utf8')
    .then((value) => value.trim())
    .catch(() => null);
  const stagingCliEnv = {
    ...process.env,
    SUPABASE_DB_PASSWORD: databasePassword,
    SUPABASE_TELEMETRY_DISABLED: '1',
  };

  console.log(`Fresh staging bootstrap target verified: ${projectRef}`);
  await runSupabase(['link', '--project-ref', projectRef], stagingCliEnv);
  try {
    const poolerUrl = new URL((await readFile('supabase/.temp/pooler-url', 'utf8')).trim());
    if (poolerUrl.username !== `postgres.${projectRef}` || poolerUrl.protocol !== 'postgresql:') {
      throw new Error('스테이징 Pooler 연결 정보가 project ref와 일치하지 않아요.');
    }
    const bootstrapSql = await readFile('supabase/staging/prepare_new_project.sql', 'utf8');
    const client = new Client({
      host: poolerUrl.hostname,
      port: Number(poolerUrl.port || 5432),
      user: decodeURIComponent(poolerUrl.username),
      password: databasePassword,
      database: 'postgres',
      application_name: 'seenit-staging-bootstrap',
      // Supavisor의 체인은 Node 기본 CA에서 자체 서명으로 보인다. PostgreSQL
      // sslmode=require와 동일하게 TLS는 강제하고, 위에서 ref/host/user를 별도 대조한다.
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      await client.query(bootstrapSql);
      console.log('Fresh staging automatic-RLS compatibility bootstrap: ok');
    } finally {
      await client.end();
    }
  } finally {
    if (originalRef && originalRef !== projectRef) {
      console.log(`Supabase CLI 링크를 원래 프로젝트 ${originalRef}로 복원합니다.`);
      await runSupabase(['link', '--project-ref', originalRef], {
        ...process.env,
        SUPABASE_TELEMETRY_DISABLED: '1',
      });
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
