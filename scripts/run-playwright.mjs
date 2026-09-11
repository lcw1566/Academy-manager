import { spawn } from 'node:child_process';
import { localE2eProcessEnv, readLocalSupabaseEnv } from './local-supabase-env.mjs';

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

try {
  const localEnv = readLocalSupabaseEnv();
  console.log(`Playwright target verified: ${localEnv.apiUrl} (local only)`);

  const child = spawn(
    npxCommand,
    ['playwright', 'test', ...process.argv.slice(2)],
    {
      cwd: process.cwd(),
      env: localE2eProcessEnv(localEnv),
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
