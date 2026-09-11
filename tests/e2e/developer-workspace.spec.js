import { expect, test } from '@playwright/test';
import { resetDeveloperLab } from './support/supabase.js';

async function enterDeveloperWorkspace(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '워크스페이스를 선택해주세요' })).toBeVisible();
  await page.getByRole('button', { name: /개발자 워크스페이스/ }).click();
  await expect(page.getByRole('heading', { name: '씨닛 개발자 워크스페이스' })).toBeVisible();
}

test.describe('개발자 기능 테스트 랩', () => {
  test.beforeEach(async () => {
    const { client } = await resetDeveloperLab('full');
    await client.auth.signOut();
  });

  test('합성 데이터와 개인정보 보호 안내를 표시한다', async ({ page }) => {
    await enterDeveloperWorkspace(page);

    await expect(page.getByRole('heading', { name: '기능 테스트 랩' })).toBeVisible();
    await expect(page.getByText(/현재 원장 · 학생 5명 · 반 2개 · 수납 4건 · 급여 1건/)).toBeVisible();
    await expect(page.getByText(/학생 연락처·학부모 연락처·체크인 PIN은 개발자 권한으로도 조회하지 않습니다/)).toBeVisible();
  });

  test('선생님 역할과 수납 조회 권한을 실제 학원 화면에 반영한다', async ({ page }) => {
    await enterDeveloperWorkspace(page);

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

    const invited = page.getByRole('button', { name: /^초대 대기/ });
    await invited.click();
    await expect(invited).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '초대 화면 열기' }).click();

    await expect(page.getByRole('heading', { name: '워크스페이스를 선택해주세요' })).toBeVisible();
    await expect(page.getByText('씨닛 기능 테스트 학원')).toBeVisible();
    await expect(page.getByRole('button', { name: '수락', exact: true })).toBeVisible();
  });
});
