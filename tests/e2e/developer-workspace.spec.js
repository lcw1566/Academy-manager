import { expect, test } from '@playwright/test';
import { createRoleClient, getE2eTargetKind, resetDeveloperLab } from './support/supabase.js';
import { provisionRoleTestLab } from './support/provision.js';
const isStaging = getE2eTargetKind() === 'staging';
// Session responses must not be retained in switch test traces.
if (isStaging) test.use({ trace: 'off', video: 'off' });

async function enterDeveloperWorkspace(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '워크스페이스를 선택해주세요' })).toBeVisible();
  await page.getByRole('button', { name: /개발자 워크스페이스/ }).click();
  await expect(page.getByRole('heading', { name: '씨닛 개발자 워크스페이스' })).toBeVisible();
}

test.describe('개발자 기능 테스트 랩', () => {
  let fixture;
  test.beforeEach(async ({ page }) => {
    if (isStaging) {
      fixture = await provisionRoleTestLab();
      const client = await createRoleClient('owner');
      const { data: { session } } = await client.auth.getSession();
      const key = `sb-${process.env.E2E_STAGING_PROJECT_REF}-auth-token`;
      await page.addInitScript(({ key, session }) => {
        if (!sessionStorage.getItem('switch-test-initialized')) {
          localStorage.setItem(key, JSON.stringify(session));
          sessionStorage.setItem('switch-test-initialized', '1');
        }
      }, { key, session });
      return;
    }
    const { client } = await resetDeveloperLab('full');
    await client.auth.signOut({ scope: 'local' });
  });

  test('합성 데이터와 개인정보 보호 안내를 표시한다', async ({ page }) => {
    await enterDeveloperWorkspace(page);

    await expect(page.getByRole('heading', { name: '기능 테스트 랩' })).toBeVisible();
    await expect(page.getByText(/현재 원장 · 학생 5명 · 반 2개 · 수납 4건 · 급여 1건/)).toBeVisible();
    await expect(page.getByText(/학생 연락처·학부모 연락처·체크인 PIN은 개발자 권한으로도 조회하지 않습니다/)).toBeVisible();
  });

  test('선생님 역할과 수납 조회 권한을 실제 학원 화면에 반영한다', async ({ page }) => {
    await enterDeveloperWorkspace(page);

    if (isStaging) {
      const owner = await createRoleClient('owner');
      try {
        const { error } = await owner.rpc('manage_academy_staff_access', {
          p_academy_id: fixture.lab.academy_id, p_user_id: fixture.users.teacher.id,
          p_job_title: '선생님', p_permissions: { canViewPayments: true },
        });
        expect(error).toBeNull();
        await page.getByRole('button', { name: /^선생님 계정으로 전환/ }).click();
        await expect(page.getByRole('heading', { name: '학원을 선택해주세요' })).toBeVisible();
        await page.getByRole('button', { name: /씨닛 기능 테스트 학원.*선생님/ }).click();
        await expect(page.getByText(/합성 데이터 · teacher 역할/)).toBeVisible();
        await expect(page.getByRole('button', { name: '수납', exact: true })).toBeVisible();
        await expect(page.getByText('일부 데이터를 동기화하지 못했어요', { exact: true })).toHaveCount(0);
      } finally {
        await owner.rpc('manage_academy_staff_access', { p_academy_id: fixture.lab.academy_id, p_user_id: fixture.users.teacher.id, p_job_title: '선생님', p_permissions: {} });
        await owner.auth.signOut({ scope: 'local' });
      }
      return;
    }
    const teacher = page.getByRole('button', { name: /^선생님/ });
    await teacher.click();
    await expect(teacher).toHaveAttribute('aria-pressed', 'true');

    const paymentView = page.getByRole('button', { name: /^수납 조회/ });
    await expect(paymentView).toHaveAttribute('aria-pressed', 'false');
    await paymentView.click();
    await expect(paymentView).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: '현재 역할로 열기' }).click();
    await expect(page.getByText(/합성 데이터 · teacher 역할/)).toBeVisible();
    await expect(page.getByRole('button', { name: '수납', exact: true })).toBeVisible();
  });

  test('초대 대기 역할은 학원 화면 대신 초대 흐름으로 보낸다', async ({ page }) => {
    await enterDeveloperWorkspace(page);

    if (isStaging) {
      await page.getByRole('button', { name: /^초대 대기 계정으로 전환/ }).click();
      await expect(page.getByRole('heading', { name: '학원을 선택해주세요' })).toBeVisible();
      await expect(page.getByRole('button', { name: '수락', exact: true })).toBeVisible();
      await page.getByText('테스트 계정 전환 · 현재 초대 대기', { exact: true }).click();
      await page.getByRole('button', { name: /^원장 계정으로 전환/ }).click();
      await expect(page.getByRole('heading', { name: '워크스페이스를 선택해주세요' })).toBeVisible();
      return;
    }
    const invited = page.getByRole('button', { name: /^초대 대기/ });
    await invited.click();
    await expect(invited).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '초대 화면 열기' }).click();

    await expect(page.getByRole('heading', { name: '워크스페이스를 선택해주세요' })).toBeVisible();
    await expect(page.getByText('씨닛 기능 테스트 학원')).toBeVisible();
    await expect(page.getByRole('button', { name: '수락', exact: true })).toBeVisible();
  });
});
