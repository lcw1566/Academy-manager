import { readFile } from 'node:fs/promises';

const files = {
  migration: '../supabase/sql/078_developer_workspace.sql',
  testLabMigration: '../supabase/migrations/20260911090000_developer_test_lab.sql',
  testPermissionMigration: '../supabase/migrations/20260911140000_developer_test_permission_controls.sql',
  testCollaborationMigration: '../supabase/migrations/20260911150000_developer_test_collaboration.sql',
  api: '../src/services/supabase/developerApi.js',
  selection: '../src/features/auth/WorkspaceSelectionPage.jsx',
  app: '../src/App.jsx',
  page: '../src/features/developer/DeveloperWorkspace.jsx',
  academyLayout: '../src/features/academy/AcademyAppLayout.jsx',
  settlement: '../src/features/academy/settlement/SettlementPage.jsx',
  payroll: '../src/features/academy/payroll/PayrollPage.jsx',
  work: '../src/features/academy/work/MyWorkPage.jsx',
  shiftAction: '../src/features/academy/dashboard/MyTodayShiftCard.jsx',
  e2eEnv: './local-supabase-env.mjs',
  e2eRunner: './run-playwright.mjs',
  e2eSupport: '../tests/e2e/support/supabase.js',
  e2eAccounts: '../tests/e2e/support/accounts.js',
  e2eProvision: '../tests/e2e/support/provision.js',
  e2eRoleTest: '../tests/e2e/role-collaboration.spec.js',
  e2eConfig: '../playwright.config.js',
  e2eWorkflow: '../.github/workflows/e2e.yml',
  vite: '../vite.config.js',
};

const sources = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [
    key,
    await readFile(new URL(path, import.meta.url), 'utf8'),
  ]),
));

for (const functionName of [
  'get_my_developer_access',
  'get_developer_dashboard_stats',
  'list_product_feedback_for_developer',
  'update_product_feedback_status_for_developer',
]) {
  if (!sources.migration.includes(functionName)) {
    throw new Error(`개발자 서버 함수가 누락됐습니다: ${functionName}`);
  }
}
for (const functionName of [
  'get_developer_test_permissions',
  'set_developer_test_permissions',
]) {
  if (!sources.testPermissionMigration.includes(functionName)) {
    throw new Error(`개발자 테스트 권한 서버 함수가 누락됐습니다: ${functionName}`);
  }
}
if (!sources.testPermissionMigration.includes("'test_lab.permissions_changed'")
  || !sources.testPermissionMigration.includes('canViewPayments')
  || !sources.testPermissionMigration.includes('canViewPayroll')) {
  throw new Error('테스트 권한 제한 또는 감사 로그가 누락됐습니다.');
}

if (!sources.migration.includes('developer_action_logs')) {
  throw new Error('개발자 변경 이력 기록이 누락됐습니다.');
}
for (const functionName of [
  'get_developer_test_lab',
  'get_my_developer_test_context',
  'prepare_developer_test_lab',
  'set_developer_test_persona',
]) {
  if (!sources.testLabMigration.includes(functionName)) {
    throw new Error(`개발자 테스트 랩 서버 함수가 누락됐습니다: ${functionName}`);
  }
}
if (!sources.testLabMigration.includes('developer_test_workspaces')) {
  throw new Error('개발자 테스트 학원 서버 등록부가 누락됐습니다.');
}
if (!sources.testCollaborationMigration.includes('member.status = \'active\'')
  || !sources.testCollaborationMigration.includes("developer.role = 'developer'")) {
  throw new Error('테스트 학원 협업 문맥의 활성 멤버십 또는 개발자 검증이 누락됐습니다.');
}
if (!sources.testLabMigration.includes("'test_lab.reset'")
  || !sources.testLabMigration.includes("'test_lab.persona_changed'")) {
  throw new Error('테스트 랩 변경 감사 로그가 누락됐습니다.');
}
if (!sources.testLabMigration.includes('synthetic_data_only')) {
  throw new Error('테스트 랩 합성 데이터 표기가 누락됐습니다.');
}
if (/import\.meta\.env\.(?:SUPABASE_SECRET_KEY|VITE_SUPABASE_SERVICE)/.test(sources.api + sources.page)) {
  throw new Error('개발자 프론트엔드에 서버 비밀 키를 넣을 수 없습니다.');
}
if (!sources.selection.includes('enterWorkspace') || !sources.app.includes('DeveloperWorkspace')) {
  throw new Error('워크스페이스 선택 또는 앱 진입 경로가 누락됐습니다.');
}
if (sources.app.includes('return <StaffWaitingPage')) {
  throw new Error('소속 학원이 없는 직원을 전용 대기 화면으로 보내면 안 됩니다.');
}
if (!sources.selection.includes('handlePickTutor') || !sources.app.includes('hasWorkspaceAccount')) {
  throw new Error('학원·과외·개발자 공통 워크스페이스 선택 경로가 누락됐습니다.');
}
if (!sources.page.includes('개인정보') || !sources.page.includes('학생 연락처')) {
  throw new Error('개발자 워크스페이스 개인정보 안내가 누락됐습니다.');
}
if (!sources.page.includes('기능 테스트 랩') || !sources.page.includes('실제 RLS 역할 전환')) {
  throw new Error('개발자 테스트 랩 UI 또는 권한 안내가 누락됐습니다.');
}
if (!sources.page.includes('기능 권한 테스트')
  || !sources.api.includes('setDeveloperTestPermissions')) {
  throw new Error('테스트 학원 권한 전환 UI가 누락됐습니다.');
}
if (sources.page.includes("id: 'assistant'") || sources.api.includes("'assistant', 'invited'")) {
  throw new Error('통합된 보조강사 테스트 역할이 다시 노출됐습니다.');
}
if (!sources.academyLayout.includes('testLabMode')
  || !sources.settlement.includes('학생별 학원비 조정')
  || !sources.settlement.includes('근무 확인')
  || !sources.payroll.includes('급여가 지급되었어요')) {
  throw new Error('테스트 학원 전용 수납·급여 검증 UI가 누락됐습니다.');
}
if (!sources.academyLayout.includes("id: 'my-work'")
  || !sources.work.includes('내 근무 기록')
  || !sources.work.includes('내 근무 스케줄')
  || !sources.work.includes('text-seenit-ink')
  || !sources.shiftAction.includes("variant === 'action'")
  || !sources.shiftAction.includes('effectiveStaff')) {
  throw new Error('테스트 학원의 직원 근무·급여 분리 또는 테마 대응이 누락됐습니다.');
}
if (!sources.settlement.includes("'bg-seenit-brand text-seenit-on-brand'")
  || !sources.settlement.includes('bg-seenit-brand py-2.5')) {
  throw new Error('수납·급여 완료 버튼의 라이트·다크 대비 토큰이 누락됐습니다.');
}
if (!sources.e2eEnv.includes('assertLocalSupabaseUrl')
  || !sources.e2eEnv.includes("['127.0.0.1', 'localhost', '::1']")
  || !sources.e2eSupport.includes('assertLocalE2eEnvironment')
  || !sources.e2eSupport.includes('browserUrl.origin !== url.origin')) {
  throw new Error('E2E의 운영 Supabase 실행 차단 장치가 누락됐습니다.');
}
if ((sources.e2eEnv + sources.e2eRunner + sources.e2eSupport)
  .includes('VITE_SUPABASE_SERVICE_ROLE')) {
  throw new Error('E2E service-role 키를 브라우저 환경변수에 넣을 수 없습니다.');
}
for (const accountKey of ['owner', 'manager', 'teacher', 'invited']) {
  if (!sources.e2eAccounts.includes(`${accountKey}.e2e@example.test`)
    || !sources.e2eAccounts.includes(`${accountKey}.json`)) {
    throw new Error(`역할별 독립 E2E 계정이 누락됐습니다: ${accountKey}`);
  }
}
if (!sources.e2eProvision.includes('create_academy_invitation_guarded')
  || !sources.e2eProvision.includes('accept_academy_invitation')
  || !sources.e2eRoleTest.includes('browser.newContext')) {
  throw new Error('역할별 초대·수락 또는 독립 브라우저 세션 검증이 누락됐습니다.');
}
if (!sources.e2eConfig.includes('workers: 1')
  || !sources.e2eConfig.includes("trace: 'retain-on-failure'")) {
  throw new Error('공유 테스트 학원 격리 또는 Playwright 실패 trace 설정이 누락됐습니다.');
}
if (!sources.e2eWorkflow.includes('npm run test:db')
  || !sources.e2eWorkflow.includes('npm run test:e2e')
  || sources.e2eWorkflow.indexOf('npm run test:db') > sources.e2eWorkflow.indexOf('npm run test:e2e')
  || !sources.e2eWorkflow.includes('npm run supabase:start')) {
  throw new Error('E2E CI의 로컬 DB 준비·역할 테스트 순서가 올바르지 않습니다.');
}
if (!sources.vite.includes("command === 'build' && mode === 'production'")) {
  throw new Error('Sentry source map 업로드는 production build로 제한해야 합니다.');
}

console.log('developer workspace guardrails: ok');
