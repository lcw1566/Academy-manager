import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { PERMISSION_DEFAULTS, resolvePermissions } from '../src/utils/staffPermissions.js';

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

const studentManagerPermissions = resolvePermissions('teacher', {
  canViewStudents: false,
  canManageStudents: true,
});
if (!studentManagerPermissions.canViewStudents) {
  failures.push('학생 관리 권한은 학생 정보 조회 권한을 포함해야 합니다.');
}
const contactManagerPermissions = resolvePermissions('teacher', {
  canViewStudentContacts: false,
  canManageStudentContacts: true,
});
if (!contactManagerPermissions.canViewStudentContacts) {
  failures.push('학생 연락처 관리 권한은 연락처 조회 권한을 포함해야 합니다.');
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
const contactRegistrationSql = await readFile(
  new URL('../supabase/sql/079_student_contact_registration.sql', import.meta.url),
  'utf8',
);
const staffReinvitationSql = await readFile(
  new URL('../supabase/sql/080_staff_reinvitation.sql', import.meta.url),
  'utf8',
);
const invitationAccountHistorySql = await readFile(
  new URL('../supabase/sql/081_invitation_account_history.sql', import.meta.url),
  'utf8',
);
const studentPermissionConsistencySql = await readFile(
  new URL('../supabase/sql/082_student_permission_consistency.sql', import.meta.url),
  'utf8',
);
const advisorFunctionHardeningSql = await readFile(
  new URL('../supabase/sql/083_supabase_advisor_function_hardening.sql', import.meta.url),
  'utf8',
);
const domainApiSource = await readFile(
  new URL('../src/services/supabase/domainApi.js', import.meta.url),
  'utf8',
);
const academyStudentCreateSource = domainApiSource.match(
  /export async function createAcademyStudent[\s\S]*?export async function createPrivateStudent/,
)?.[0] || '';
if (!academyStudentCreateSource.includes(".from('students')\n    .insert(row)")) {
  failures.push('학원 학생 신규 등록은 students INSERT를 사용해야 합니다.');
}
if (academyStudentCreateSource.includes('.upsert(')) {
  failures.push('연락처 SELECT 권한과 충돌하는 students UPSERT를 신규 등록에 사용할 수 없습니다.');
}
for (const required of [
  'list_academy_students_secure',
  'set_student_contact_permissions',
  'enforce_student_contact_write_permission',
  'academy_invitations update by operations',
]) {
  if (!hardeningSql.includes(required)) failures.push(`SQL 075 필수 보호 누락: ${required}`);
}

for (const required of [
  'academy_member_has_permission',
  "p_permission = 'canViewStudents'",
  "v_effective -> 'canManageStudents'",
  "p_permission = 'canViewStudentContacts'",
  "v_effective -> 'canManageStudentContacts'",
  "m.status = 'active'",
  "set_config('seenit.allow_student_contact_permission_write', 'on', true)",
  'revoke all on function public.academy_member_has_permission',
  'revoke all on function public.protect_student_contact_permission_assignment',
]) {
  if (!studentPermissionConsistencySql.includes(required)) {
    failures.push(`SQL 082 학생 권한 일관성 보호 누락: ${required}`);
  }
}

for (const required of [
  "tg_op = 'INSERT'",
  "has_academy_permission(new.academy_id, 'canManageStudents')",
  'can_manage_student_contacts(new.academy_id)',
]) {
  if (!contactRegistrationSql.includes(required)) {
    failures.push(`SQL 079 연락처 등록/조회 분리 보호 누락: ${required}`);
  }
}
if (/\b(?:phone|parent_phone|checkin_pin)\b/.test(invitationAccountHistorySql)) {
  failures.push('SQL 081 초대 계정 기록에 연락처 또는 등하원 PIN을 포함할 수 없습니다.');
}

for (const required of [
  'list_academy_invitation_accounts',
  'profile.display_name',
  'membership_status',
  "has_academy_permission(p_academy_id, 'canManageStaff')",
  'revoke all on function public.list_academy_invitation_accounts',
]) {
  if (!invitationAccountHistorySql.includes(required)) {
    failures.push(`SQL 081 초대 계정 기록 보호 누락: ${required}`);
  }
}

for (const required of [
  'create_academy_invitation_guarded',
  "member.status = 'active'",
  'academy_invitations_one_pending_email_idx',
  "permissions = '{}'::jsonb",
  'employment_ended_on = null',
  'revoke all on function public.create_academy_invitation_guarded',
]) {
  if (!staffReinvitationSql.includes(required)) {
    failures.push(`SQL 080 재초대 권한 보호 누락: ${required}`);
  }
}

for (const required of [
  "alter function public.set_updated_at() set search_path = pg_catalog",
  "'public_student_checkin'",
  'revoke execute on function public.public_student_checkin(uuid, text, text, bigint)',
  'to anon, authenticated',
  "'rls_auto_enable'",
  "'enforce_student_contact_write_permission'",
  "'handle_auth_user_profile_upsert'",
  "'touch_chat_thread_on_message'",
  'revoke execute on functions from public',
  "has_function_privilege('anon', procedure.oid, 'execute')",
  "has_function_privilege('authenticated', procedure.oid, 'execute')",
  'authenticated lost required RLS/RPC function access',
  'anon lost required public_student_checkin access',
]) {
  if (!advisorFunctionHardeningSql.includes(required)) {
    failures.push(`SQL 083 함수 실행 권한 보호 누락: ${required}`);
  }
}

if (failures.length > 0) throw new Error(failures.join('\n'));
console.log('security guardrails: ok');
