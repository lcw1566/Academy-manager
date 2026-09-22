import { chromium } from '@playwright/test';
import {
  assertE2eEnvironment,
  getE2eTargetKind,
} from './support/supabase.js';
import { provisionRoleTestLab } from './support/provision.js';

async function assertBrowserTarget() {
  const targetKind = getE2eTargetKind();
  const appUrl = process.env.E2E_APP_URL || 'http://127.0.0.1:4173';
  const expectedProjectRef = targetKind === 'staging'
    ? process.env.E2E_STAGING_PROJECT_REF
    : 'local';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    const marker = await page.locator('html').evaluate((element) => ({
      environment: element.dataset.seenitEnvironment,
      supabaseProjectRef: element.dataset.seenitSupabaseProject,
      supabaseKeyFingerprint: element.dataset.seenitSupabaseKeyFingerprint,
    }));
    const expectedKeyFingerprint = String(process.env.E2E_SUPABASE_ANON_KEY || '').slice(-12);
    if (marker.environment !== targetKind
      || marker.supabaseProjectRef !== expectedProjectRef
      || marker.supabaseKeyFingerprint !== expectedKeyFingerprint) {
      throw new Error(
        `앱 배포 대상이 E2E 설정과 달라 실행을 차단했어요. `
        + `expected=${targetKind}/${expectedProjectRef}/key-match, `
        + `actual=${marker.environment}/${marker.supabaseProjectRef}/`
        + `${marker.supabaseKeyFingerprint === expectedKeyFingerprint ? 'key-match' : 'key-mismatch'}`,
      );
    }
  } finally {
    await browser.close();
  }
}

export default async function globalSetup() {
  assertE2eEnvironment();
  await assertBrowserTarget();
  await provisionRoleTestLab({ resetExistingCredentials: true });
}
