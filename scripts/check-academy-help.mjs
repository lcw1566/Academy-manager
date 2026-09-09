import { readFile } from 'node:fs/promises';
import { ACADEMY_TAB_HELP } from '../src/features/academy/help/academyTabHelp.js';

const layout = await readFile(
  new URL('../src/features/academy/AcademyAppLayout.jsx', import.meta.url),
  'utf8',
);
const configSource = layout.split('const TAB_CONFIG = {')[1]?.split('// 모바일')[0] || '';
const configuredIds = new Set(
  [...configSource.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((match) => match[1]),
);
const missing = [...configuredIds].filter((id) => !ACADEMY_TAB_HELP[id]);

if (missing.length > 0) {
  throw new Error(`탭 도움말이 누락됐습니다: ${missing.join(', ')}`);
}

console.log(`academy help coverage: ${configuredIds.size}/${configuredIds.size}`);
