import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { PERMISSION_DEFAULTS } from '../src/utils/staffPermissions.js';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.js', '.jsx', '.ts', '.tsx'].includes(extname(path)) ? [path] : [];
  }));
  return nested.flat();
}

const failures = [];
for (const role of ['teacher', 'assistant', 'manager']) {
  if (PERMISSION_DEFAULTS[role]?.canViewStudentContacts !== false
      || PERMISSION_DEFAULTS[role]?.canManageStudentContacts !== false) {
    failures.push(`${role} 연락처 기본 권한은 false여야 합니다.`);
  }
}

for (const path of await sourceFiles(new URL('../src', import.meta.url).pathname)) {
  const source = await readFile(path, 'utf8');
  const directStudentReads = source.matchAll(
    /\.from\(['"]students['"]\)([\s\S]{0,240}?)\.select\(([^)]*)\)/g,
  );
  for (const match of directStudentReads) {
    const selection = match[2].trim();
    if (selection === '' || selection === "'*'" || selection === '"*"' || selection.includes('phone')) {
      failures.push(`${path}: students 직접 조회에서 민감 컬럼을 요청합니다.`);
    }
  }
}

const hardeningSql = await readFile(
  new URL('../supabase/sql/075_permission_and_student_privacy_hardening.sql', import.meta.url),
  'utf8',
);
for (const required of [
  'list_academy_students_secure',
  'set_student_contact_permissions',
  'enforce_student_contact_write_permission',
  'academy_invitations update by operations',
]) {
  if (!hardeningSql.includes(required)) failures.push(`SQL 075 필수 보호 누락: ${required}`);
}

if (failures.length > 0) throw new Error(failures.join('\n'));
console.log('security guardrails: ok');
