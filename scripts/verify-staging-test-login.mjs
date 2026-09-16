// Focused smoke check: never resets fixtures, changes permissions or sends chat.
// Run with --env-file=.env.staging.local after deploying the Edge Function.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.STAGING_SUPABASE_URL;
assert.equal(url, "https://owitlzsgxxuthgbmweyt.supabase.co");
const appUrl = process.env.TEST_LOGIN_APP_URL || process.env.STAGING_APP_URL;
assert.ok(
  [
    "https://academy-manager-staging.vercel.app",
    "http://127.0.0.1:4175",
  ].includes(new URL(appUrl).origin),
);
const anonKey = process.env.STAGING_SUPABASE_ANON_KEY;
const client = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client.auth.signInWithPassword({
  email: "staging-teacher.e2e@example.test",
  password: process.env.STAGING_E2E_USER_PASSWORD,
});
assert.ok(!error, "Teacher login failed");
const source = data.session;
const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${source.access_token}`,
};
const endpoint = `${url}/functions/v1/staging-test-login`;
const contextResponse = await fetch(endpoint, { headers });
assert.equal(contextResponse.status, 200, "Registered teacher context");
const context = await contextResponse.json();
assert.equal(context.accounts.length, 4);
const denied = await client.rpc("authorize_test_login", {
  p_actor_id: context.accounts[0].user_id,
  p_persona: "owner",
});
assert.equal(
  denied.error?.code,
  "42501",
  "Client cannot invoke privileged RPC with a spoofed actor",
);
const registry = await client
  .from("developer_test_login_accounts")
  .select("user_id");
assert.equal(registry.error?.code, "42501", "Client cannot read registry");
const noAuth = await fetch(endpoint, { headers: { apikey: anonKey } });
assert.ok([401, 403].includes(noAuth.status));
const { data: scope, error: scopeError } = await client.rpc(
  "get_my_academy_sync_access",
  { p_academy_id: context.academy_id },
);
assert.ok(!scopeError);
if (!scope.students) {
  const direct = await client.rpc("list_academy_students_secure", {
    p_academy_id: context.academy_id,
  });
  assert.equal(
    direct.error?.code,
    "42501",
    "Student access remains denied on server",
  );
}
const browser = await chromium.launch();
const browserContext = await browser.newContext({
  locale: "ko-KR",
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
const page = await browserContext.newPage();
const requests = [];
page.on("request", (req) => {
  if (
    /rpc\/(list_academy_students_secure|list_academy_staff_access_profiles|list_academy_invitation_accounts)$/.test(
      req.url(),
    )
  )
    requests.push(req.url());
});
await page.addInitScript(
  ({ session, key }) => {
    if (!sessionStorage.getItem("test-login-smoke-initialized")) {
      localStorage.setItem(key, JSON.stringify(session));
      sessionStorage.setItem("test-login-smoke-initialized", "1");
    }
  },
  { session: source, key: "sb-owitlzsgxxuthgbmweyt-auth-token" },
);
try {
  await page.goto(appUrl);
  await expect(page.locator("html")).toHaveAttribute(
    "data-seenit-supabase-project",
    "owitlzsgxxuthgbmweyt",
  );
  await page
    .getByRole("button", { name: /씨닛 기능 테스트 학원.*선생님/ })
    .click();
  await expect(
    page.getByText("테스트 계정 전환 · 현재 선생님", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1800);
  await expect(
    page.getByText("일부 데이터를 동기화하지 못했어요", { exact: true }),
  ).toHaveCount(0);
  if (!scope.students)
    assert.ok(
      !requests.some((u) => u.endsWith("list_academy_students_secure")),
    );
  if (!scope.staffAccess)
    assert.ok(
      !requests.some((u) => u.endsWith("list_academy_staff_access_profiles")),
    );
  if (!scope.invitationAccounts)
    assert.ok(
      !requests.some((u) => u.endsWith("list_academy_invitation_accounts")),
    );
  await page
    .getByText("테스트 계정 전환 · 현재 선생님", { exact: true })
    .click();
  await mkdir("test-artifacts/account-switch", { recursive: true });
  for (const dark of [false, true]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    );
    const panel = page
      .locator("details")
      .filter({ hasText: "테스트 계정 전환" });
    const colors = await panel.evaluate((el) => ({
      foreground: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor,
    }));
    assert.notEqual(colors.foreground, colors.background);
    await panel.screenshot({
      path: `test-artifacts/account-switch/${dark ? "dark" : "light"}.png`,
    });
  }
  const roles = [
    ["owner", "원장"],
    ["manager", "운영 매니저"],
    ["invited", "초대 대기"],
    ["teacher", "선생님"],
  ];
  let previousId = source.user.id;
  for (const [persona, label] of roles) {
    const summary = page
      .locator("summary")
      .filter({ hasText: "테스트 계정 전환" });
    const details = summary.locator("..");
    if ((await details.getAttribute("open")) === null) await summary.click();
    await page
      .getByRole("button", { name: new RegExp(`^${label} 계정으로 전환`) })
      .click();
    await expect(
      page.getByRole("heading", {
        name: /^(워크스페이스를|학원을) 선택해주세요$/,
      }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByText(`테스트 계정 전환 · 현재 ${label}`, { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    const identity = await page.evaluate(() => {
      const key = "sb-owitlzsgxxuthgbmweyt-auth-token";
      const session = JSON.parse(
        sessionStorage.getItem(key) || localStorage.getItem(key),
      );
      return { id: session.user.id, email: session.user.email };
    });
    assert.equal(
      identity.id,
      context.accounts.find((a) => a.persona === persona).user_id,
    );
    assert.notEqual(identity.id, previousId);
    assert.equal(identity.email, `staging-${persona}.e2e@example.test`);
    previousId = identity.id;
    // Browser storage must never contain the shared server password.
    assert.equal(
      await page.evaluate(
        (secret) =>
          [
            ...Object.values(localStorage),
            ...Object.values(sessionStorage),
          ].some((v) => v.includes(secret)),
        process.env.STAGING_E2E_USER_PASSWORD,
      ),
      false,
    );
  }
  await page
    .getByRole("button", { name: /씨닛 기능 테스트 학원.*선생님/ })
    .click();
  await expect(
    page.getByRole("button", { name: "홈", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(
    page.getByText("일부 데이터를 동기화하지 못했어요", { exact: true }),
  ).toHaveCount(0);
  console.log(
    "PASS: real teacher→owner→manager→invited→teacher identities; teacher sync; REST denials; light/dark/reduced-motion panel. No fixture reset or permission changes.",
  );
} finally {
  // Revoke only this browser's final session, never other testers' sessions.
  const token = await page
    .evaluate(() => {
      const key = "sb-owitlzsgxxuthgbmweyt-auth-token";
      try {
        return JSON.parse(
          sessionStorage.getItem(key) || localStorage.getItem(key),
        )?.access_token;
      } catch {
        return null;
      }
    })
    .catch(() => null);
  if (token)
    await fetch(`${url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
  await browser.close();
  await client.auth.signOut({ scope: "local" });
}
