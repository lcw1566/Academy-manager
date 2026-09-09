import { readFile } from 'node:fs/promises';

const files = {
  migration: '../supabase/sql/078_developer_workspace.sql',
  api: '../src/services/supabase/developerApi.js',
  selection: '../src/features/auth/WorkspaceSelectionPage.jsx',
  app: '../src/App.jsx',
  page: '../src/features/developer/DeveloperWorkspace.jsx',
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

if (!sources.migration.includes('developer_action_logs')) {
  throw new Error('개발자 변경 이력 기록이 누락됐습니다.');
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

console.log('developer workspace guardrails: ok');
