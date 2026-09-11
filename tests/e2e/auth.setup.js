import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { getE2eAccounts } from './support/accounts.js';
import { getE2eTargetKind } from './support/supabase.js';

for (const account of Object.values(getE2eAccounts())) {
  setup(`${getE2eTargetKind() === 'staging' ? '스테이징' : '로컬'} ${account.displayName} 계정으로 로그인`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '로그인', exact: true }).first().click();
    await page.getByPlaceholder('you@example.com').fill(account.email);
    await page.getByPlaceholder('비밀번호 입력').fill(account.password);
    await page.getByRole('button', { name: '로그인', exact: true }).last().click();

    await expect(page.getByRole('heading', {
      name: /^(워크스페이스를|학원을) 선택해주세요$/,
    })).toBeVisible();
    await mkdir(dirname(account.authFile), { recursive: true });
    await page.context().storageState({ path: account.authFile });
  });
}
