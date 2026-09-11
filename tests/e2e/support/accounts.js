export const E2E_AUTH_FILES = {
  owner: 'playwright/.auth/owner.json',
  manager: 'playwright/.auth/manager.json',
  teacher: 'playwright/.auth/teacher.json',
  invited: 'playwright/.auth/invited.json',
};

const ACCOUNT_DEFINITIONS = {
  owner: {
    key: 'owner',
    email: 'owner.e2e@example.test',
    displayName: 'E2E 원장',
    accountType: 'staff',
    defaultRole: 'teacher',
    jobTitle: '테스트 원장',
  },
  manager: {
    key: 'manager',
    email: 'manager.e2e@example.test',
    displayName: 'E2E 운영 매니저',
    accountType: 'staff',
    defaultRole: 'manager',
    jobTitle: '운영 매니저',
  },
  teacher: {
    key: 'teacher',
    email: 'teacher.e2e@example.test',
    displayName: 'E2E 선생님',
    accountType: 'staff',
    defaultRole: 'teacher',
    jobTitle: '선생님',
  },
  invited: {
    key: 'invited',
    email: 'invited.e2e@example.test',
    displayName: 'E2E 초대 대기',
    accountType: 'staff',
    defaultRole: 'teacher',
    jobTitle: '선생님',
  },
};

export function getE2eAccounts() {
  const password = process.env.E2E_USER_PASSWORD;
  if (!password) throw new Error('E2E_USER_PASSWORD 환경변수가 필요해요.');
  return Object.fromEntries(Object.entries(ACCOUNT_DEFINITIONS).map(([key, account]) => [
    key,
    { ...account, password, authFile: E2E_AUTH_FILES[key] },
  ]));
}
