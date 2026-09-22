import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return files.flat();
}

const maps = (await walk('dist')).filter((path) => path.endsWith('.map'));
if (maps.length) {
  throw new Error(`Public build contains source maps: ${maps.map((path) => relative('dist', path)).join(', ')}`);
}
console.log('public build artifacts: no source maps');
