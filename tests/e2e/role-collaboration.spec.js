import { expect, test } from '@playwright/test';
import { E2E_AUTH_FILES } from './support/accounts.js';
import { provisionRoleTestLab } from './support/provision.js';
import { createRoleClient } from './support/supabase.js';

async function openAcademy(page, roleLabel) {
  await page.goto('/');
  await expect(page.getByRole('heading', {
    name: /^(워크스페이스를|학원을) 선택해주세요$/,
  })).toBeVisible();
  await page.getByRole('button', {
    name: new RegExp(`씨닛 기능 테스트 학원.*${roleLabel}`),
  }).click();
  await expect(page.getByRole('button', { name: '홈', exact: true })).toBeVisible();
}

test.describe('역할별 독립 테스트 계정', () => {
  let lab;
  let users;

  test.beforeEach(async () => {
    ({ lab, users } = await provisionRoleTestLab());
  });

  test('원장·매니저·선생님의 서버 데이터 권한을 독립 세션에서 분리한다', async () => {
    const manager = await createRoleClient('manager');
    const teacher = await createRoleClient('teacher');
    const invited = await createRoleClient('invited');

    try {
      const managerPayments = await manager
        .from('payments')
        .select('id')
        .eq('academy_id', lab.academy_id);
      expect(managerPayments.error).toBeNull();
      expect(managerPayments.data).toHaveLength(4);

      const teacherPayments = await teacher
        .from('payments')
        .select('id')
        .eq('academy_id', lab.academy_id);
      expect(teacherPayments.error).toBeNull();
      expect(teacherPayments.data).toHaveLength(0);

      const invitedStudents = await invited.rpc('list_academy_students_secure', {
        p_academy_id: lab.academy_id,
      });
      expect(invitedStudents.error).not.toBeNull();
    } finally {
      await manager.auth.signOut();
      await teacher.auth.signOut();
      await invited.auth.signOut();
    }
  });

  test('역할별 브라우저에서 허용된 탭과 초대 상태만 표시한다', async ({ browser }) => {
    const managerContext = await browser.newContext({ storageState: E2E_AUTH_FILES.manager });
    const teacherContext = await browser.newContext({ storageState: E2E_AUTH_FILES.teacher });
    const invitedContext = await browser.newContext({ storageState: E2E_AUTH_FILES.invited });

    try {
      const managerPage = await managerContext.newPage();
      await openAcademy(managerPage, '운영 매니저');
      await expect(managerPage.getByRole('button', { name: '직원', exact: true })).toBeVisible();
      await expect(managerPage.getByRole('button', { name: '수납', exact: true })).toBeVisible();

      const teacherPage = await teacherContext.newPage();
      await openAcademy(teacherPage, '선생님');
      await expect(teacherPage.getByRole('button', { name: '직원', exact: true })).toHaveCount(0);
      await expect(teacherPage.getByRole('button', { name: '수납', exact: true })).toHaveCount(0);
      await expect(teacherPage.getByRole('button', { name: '급여', exact: true })).toBeVisible();

      const invitedPage = await invitedContext.newPage();
      await invitedPage.goto('/');
      await expect(invitedPage.getByRole('heading', { name: '학원을 선택해주세요' })).toBeVisible();
      await expect(invitedPage.getByText('씨닛 기능 테스트 학원')).toBeVisible();
      await expect(invitedPage.getByRole('button', { name: '수락', exact: true })).toBeVisible();
    } finally {
      await managerContext.close();
      await teacherContext.close();
      await invitedContext.close();
    }
  });

  test('원장 직원 탭에 실제 계정이 표시되고 개인 권한을 저장한다', async ({ page, browser }) => {
    const owner = await createRoleClient('owner');
    const { data: original, error: readError } = await owner.from('academy_staff_profiles').select('permissions,job_title').eq('academy_id', lab.academy_id).eq('user_id', users.teacher.id).single();
    expect(readError).toBeNull();
    try {
      await openAcademy(page, '원장');
      await page.getByRole('button', { name: '직원', exact: true }).click();

      await expect(page.getByRole('button', { name: /E2E 원장/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /E2E 운영 매니저/ }).first()).toBeVisible();
      const teacherCard = page.getByRole('button', { name: /E2E 선생님/ }).first();
      await expect(teacherCard).toBeVisible();

      await teacherCard.click();
      await page.getByRole('button', { name: '권한', exact: true }).click();
      await expect(page.getByText('선생님 기본 권한', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: /학생 정보 조회/ }).click();
      const saveButton = page.getByRole('button', { name: '저장', exact: true });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();
      await expect(page.getByText('개인 권한을 저장했어요.', { exact: true })).toBeVisible();
      const teacherContext = await browser.newContext({ storageState: E2E_AUTH_FILES.teacher });
      try {
        const teacherPage = await teacherContext.newPage();
        const deniedRequests = [];
        teacherPage.on('request', request => {
          if (/rpc\/(list_academy_students_secure|list_academy_staff_access_profiles|list_academy_invitation_accounts)$/.test(request.url())) deniedRequests.push(request.url());
        });
        await openAcademy(teacherPage, '선생님');
        await teacherPage.waitForTimeout(1500);
        await expect(teacherPage.getByText('일부 데이터를 동기화하지 못했어요', { exact: true })).toHaveCount(0);
        expect(deniedRequests).toEqual([]);
        // Genuine transport failures must still surface as sync errors.
        await teacherPage.route('**/rest/v1/rpc/get_my_academy_sync_access', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic outage' }) }));
        await teacherPage.reload();
        await expect(teacherPage.getByText('일부 데이터를 동기화하지 못했어요', { exact: true })).toBeVisible({ timeout: 15000 });
      } finally { await teacherContext.close(); }
    } finally {
      const { error } = await owner.rpc('manage_academy_staff_access', { p_academy_id: lab.academy_id, p_user_id: users.teacher.id, p_job_title: original.job_title, p_permissions: original.permissions });
      await owner.auth.signOut({ scope: 'local' });
      expect(error).toBeNull();
    }
  });
});
