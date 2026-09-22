import { spawn } from "node:child_process";
import {
  localE2eProcessEnv,
  readLocalSupabaseEnv,
} from "./local-supabase-env.mjs";

const localEnv = readLocalSupabaseEnv();
const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "build"],
  {
    cwd: process.cwd(),
    env: {
      ...localE2eProcessEnv(localEnv),
      SENTRY_UPLOAD_SOURCEMAPS: "0",
    },
    stdio: "inherit",
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) console.error(`Production build exited with ${signal}`);
  process.exitCode = code ?? 1;
});
