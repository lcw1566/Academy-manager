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

  test.beforeEach(async () => {
    ({ lab } = await provisionRoleTestLab());
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
});
