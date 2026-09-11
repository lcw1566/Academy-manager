import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readLocalSupabaseEnv } from './local-supabase-env.mjs';

const testFiles = [
  'supabase/tests/084_advisor_performance_rls.sql',
  'supabase/tests/085_developer_test_lab.sql',
  'supabase/tests/086_developer_test_permission_controls.sql',
  'supabase/tests/087_developer_test_collaboration.sql',
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
        input: readFileSync(file, 'utf8'),
      },
    );
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`${file} 실행에 실패했어요.`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
