import { readFile } from 'node:fs/promises';

const [staffPage, workspaceApi, historySql] = await Promise.all([
  readFile(new URL('../src/features/academy/staff/StaffPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/supabase/workspaceApi.js', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/sql/081_invitation_account_history.sql', import.meta.url), 'utf8'),
]);

for (const required of [
  '지금까지 초대한 계정',
  'account.display_name',
  '다시 초대하기',
  '재직 중',
  '초대 대기 중',
  'onReinvite',
]) {
  if (!staffPage.includes(required)) {
    throw new Error(`직원 초대 기록 UI가 누락됐습니다: ${required}`);
  }
}

if (staffPage.includes('수락 완료')) {
  throw new Error('초대 기록은 수락 상태표 대신 계정 목록을 표시해야 합니다.');
}
if (!workspaceApi.includes("rpc('list_academy_invitation_accounts'")) {
  throw new Error('초대 계정 이름 조회 API 연결이 누락됐습니다.');
}
if (
  !workspaceApi.includes("accountResult.error?.code === '42501'")
  || !workspaceApi.includes('초대 기록을 확인할 권한이 없어요.')
) {
  throw new Error('일반 직원의 예상된 초대 이력 권한 거절 처리가 누락됐습니다.');
}
if (!historySql.includes('display_name') || !historySql.includes('has_pending_invitation')) {
  throw new Error('초대 계정 기록 서버 응답에 필요한 필드가 누락됐습니다.');
}

console.log('staff invitation account history: ok');
