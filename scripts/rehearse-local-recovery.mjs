import { spawn } from 'node:child_process';
import { mkdtemp, open, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLocalSupabaseEnv } from './local-supabase-env.mjs';

const container = 'supabase_db_academy-manager';
const database = `seenit_recovery_${process.pid}_${Date.now()}`;
const startedAt = new Date();

readLocalSupabaseEnv();

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'seenit-recovery-'));
const dumpPath = join(temporaryDirectory, 'synthetic-local.dump');

async function run(args, { inputFile, outputFile, allowFailure = false } = {}) {
  const input = inputFile ? await open(inputFile, 'r') : null;
  const output = outputFile ? await open(outputFile, 'w', 0o600) : null;

  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn('docker', ['exec', ...(inputFile ? ['-i'] : []), container, ...args], {
        cwd: process.cwd(),
        stdio: [input?.fd ?? 'ignore', output?.fd ?? 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      if (!output) child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });

    if (result.code !== 0 && !allowFailure) {
      throw new Error(result.stderr.trim() || `docker exec failed: ${args[0]}`);
    }
    return result;
  } finally {
    await Promise.allSettled([input?.close(), output?.close()].filter(Boolean));
  }
}

try {
  await run([
    'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc',
    '--no-owner', '--no-privileges',
    '--schema=public', '--schema=auth', '--schema=storage',
    '--schema=supabase_migrations', '--schema=extensions',
  ], { outputFile: dumpPath });
  await run(['createdb', '-U', 'postgres', '-T', 'template0', database]);
  await run(['psql', '-U', 'postgres', '-d', database, '-c', 'drop schema public cascade']);
  await run([
    'pg_restore', '-U', 'postgres', '-d', database,
    '--no-owner', '--no-privileges',
  ], { inputFile: dumpPath });

  const verificationSql = `
    select json_build_object(
      'migration_count', (select count(*) from supabase_migrations.schema_migrations),
      'private_bucket_count', (select count(*) from storage.buckets where public = false),
      'storage_policy_count', (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'),
      'rls_table_count', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
      'secure_student_rpc', to_regprocedure('public.list_academy_students_secure(uuid)') is not null,
      'attendance_rpc', to_regprocedure('public.record_staff_attendance(uuid,uuid,text,date,text,text,text,text,integer,text,text,bigint)') is not null
    );
  `;
  const verification = await run([
    'psql', '-U', 'postgres', '-d', database, '-Atc', verificationSql,
  ]);
  const checks = JSON.parse(verification.stdout.trim());
  if (checks.migration_count < 1
    || checks.private_bucket_count < 2
    || checks.storage_policy_count < 1
    || checks.rls_table_count < 1
    || !checks.secure_student_rpc
    || !checks.attendance_rpc) {
    throw new Error('Restored database did not satisfy the recovery verification checks');
  }
  const report = {
    schema: 1,
    source: 'local-synthetic-supabase',
    started_at: startedAt.toISOString(),
    completed_at: new Date().toISOString(),
    result: 'passed',
    checks,
    note: 'This rehearsal validates schema/data restoration mechanics with local synthetic data. It is not evidence of a production backup.',
  };
  await mkdir('test-artifacts', { recursive: true });
  await writeFile(
    'test-artifacts/recovery-rehearsal.json',
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(`recovery rehearsal: passed (${checks.migration_count} migrations, ${checks.private_bucket_count} private buckets)`);
} finally {
  try {
    await run(['dropdb', '-U', 'postgres', '--force', database], { allowFailure: true });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
