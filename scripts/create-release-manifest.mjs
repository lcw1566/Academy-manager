import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    }),
  );
  return files.flat();
}

async function digest(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

const gitResult = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
if (gitResult.status !== 0) throw new Error("Cannot resolve the tested commit");
const statusResult = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
if (statusResult.status !== 0 || statusResult.stdout.trim()) {
  throw new Error("Commit the tested changes before recording a release manifest");
}
const commit = String(process.env.GITHUB_SHA || gitResult.stdout).trim();
if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error("Invalid tested commit");

const migrations = (await filesUnder("supabase/migrations"))
  .filter((path) => extname(path) === ".sql")
  .sort()
  .map((path) => relative("supabase/migrations", path));
const migrationHashes = {};
for (const name of migrations)
  migrationHashes[name] = await digest(join("supabase/migrations", name));
const edgeSources = (await filesUnder("supabase/functions"))
  .filter((path) => [".ts", ".js", ".mjs"].includes(extname(path)))
  .sort();
const edgeFunctions = {};
for (const path of edgeSources)
  edgeFunctions[relative("supabase/functions", path)] = await digest(path);

const manifest = {
  schema: 1,
  commit,
  generated_at: new Date().toISOString(),
  migrations,
  migration_sha256: migrationHashes,
  edge_function_sha256: edgeFunctions,
  verification: [
    "repository-guardrails",
    "database-role-tests",
    "production-build-without-public-sourcemaps",
    "playwright-chromium",
  ],
};
await mkdir("test-artifacts", { recursive: true });
await writeFile(
  "test-artifacts/release-manifest.json",
  `${JSON.stringify(manifest, null, 2)}\n`,
  {
    mode: 0o600,
  },
);
console.log(
  `release manifest: ${commit.slice(0, 12)}, ${migrations.length} migrations, ${edgeSources.length} edge sources`,
);
