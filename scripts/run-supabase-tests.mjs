import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readLocalSupabaseEnv } from './local-supabase-env.mjs';

const testFiles = [
  'supabase/tests/084_advisor_performance_rls.sql',
  'supabase/tests/085_developer_test_lab.sql',
  'supabase/tests/086_developer_test_permission_controls.sql',
  'supabase/tests/087_developer_test_collaboration.sql',
  'supabase/tests/088_secure_public_checkin.sql',
  'supabase/tests/089_retire_private_workspace.sql',
  'supabase/tests/090_harden_chat_push.sql',
  'supabase/tests/091_workspace_sync_and_test_login.sql',
  'supabase/tests/092_isolate_developer_test_environment.sql',
  'supabase/tests/093_authenticated_attendance_paths.sql',
];

try {
  readLocalSupabaseEnv();
  const containerName = 'supabase_db_academy-manager';

  for (const file of testFiles) {
    console.log(`database test: ${file}`);
    const result = spawnSync(
      'docker',
      ['exec', '-i', containerName, 'psql', '-U', 'postgres', '-d', 'postgres'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        input: readFileSync(file, 'utf8').replace(
          /^-- @include-migration ([0-9]+_[a-z_]+\.sql)$/gm,
          (_, name) => readFileSync(`supabase/migrations/${name}`, 'utf8'),
        ),
      },
    );
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`${file} 실행에 실패했어요.`);
    }
  }
  const pushTests = spawnSync(process.execPath, ['--test', 'tests/integration/chatPush.test.mjs'], {
    cwd: process.cwd(), stdio: 'inherit',
  });
  if (pushTests.error) throw pushTests.error;
  if (pushTests.status !== 0) throw new Error('채팅 푸시 REST/동시 요청 검증에 실패했어요.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
