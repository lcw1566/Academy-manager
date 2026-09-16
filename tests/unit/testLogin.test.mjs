import test from "node:test";
import assert from "node:assert/strict";
import {
  createTestLoginHandler,
  isStagingLoginEnabled,
} from "../../supabase/functions/staging-test-login/handler.mjs";

function fixture(overrides = {}) {
  const calls = [];
  const target = {
    user_id: "target",
    email: "synthetic@example.invalid",
    academy_id: "lab",
  };
  const admin = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data:
          name === "get_test_login_context" ? { accounts: [target] } : target,
      };
    },
    from: () => ({
      insert: async (row) => {
        calls.push({ audit: row });
        return {};
      },
    }),
  };
  const handler = createTestLoginHandler({
    enabled: true,
    authenticate: async (token) =>
      token === "valid" ? { id: "verified-actor" } : null,
    admin,
    login: async (email) => {
      calls.push({ login: email });
      return {
        user: { id: "target" },
        access_token: "test-access",
        refresh_token: "test-refresh",
      };
    },
    ...overrides,
  });
  const request = (
    body = { persona: "teacher" },
    token = "valid",
    method = "POST",
  ) =>
    handler(
      new Request("https://test.invalid", {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return { request, calls, admin };
}

test("project gate fails closed for production, local and absent flag", () => {
  assert.equal(
    isStagingLoginEnabled("https://owitlzsgxxuthgbmweyt.supabase.co", "true"),
    true,
  );
  for (const url of [
    "https://vfiiieqnxawnhtgrvmxn.supabase.co",
    "http://127.0.0.1:54321",
    "https://owitlzsgxxuthgbmweyt.supabase.co.attacker.invalid",
  ])
    assert.equal(isStagingLoginEnabled(url, "true"), false);
  assert.equal(
    isStagingLoginEnabled(
      "https://owitlzsgxxuthgbmweyt.supabase.co",
      undefined,
    ),
    false,
  );
});
test("disabled function does not authenticate or issue sessions", async () => {
  const f = fixture({
    enabled: false,
    authenticate: () => {
      throw Error("must not run");
    },
  });
  assert.equal((await f.request()).status, 404);
  assert.equal(f.calls.length, 0);
});
test("missing, forged and invalid credentials cannot query registry", async () => {
  for (const token of ["", "forged"]) {
    const f = fixture();
    assert.equal((await f.request({}, token)).status, 401);
    assert.equal(f.calls.length, 0);
  }
});
test("rejects invalid persona; browser actor, email, password and target IDs are ignored", async () => {
  const f = fixture();
  assert.equal((await f.request({ persona: "customer" })).status, 400);
  const response = await f.request({
    persona: "teacher",
    p_actor_id: "spoofed",
    email: "customer@example.invalid",
    user_id: "customer",
    password: "evil",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(f.calls[0], {
    name: "authorize_test_login",
    args: { p_actor_id: "verified-actor", p_persona: "teacher" },
  });
  assert.deepEqual(f.calls[1], { login: "synthetic@example.invalid" });
  assert.equal(f.calls[2].audit.actor_user_id, "verified-actor");
  assert.deepEqual(await response.json(), {
    access_token: "test-access",
    refresh_token: "test-refresh",
    academy_id: "lab",
  });
});
test("GET is verified context only, never login or audit", async () => {
  const f = fixture();
  assert.equal((await f.request(null, "valid", "GET")).status, 200);
  assert.deepEqual(f.calls, [
    { name: "get_test_login_context", args: { p_actor_id: "verified-actor" } },
  ]);
});
test("denied and rate-limited authorization never signs in", async () => {
  for (const [code, status] of [
    ["42501", 403],
    ["54000", 429],
  ]) {
    const f = fixture({
      admin: { rpc: async () => ({ error: { code } }) },
      login: () => {
        throw Error("should not sign in");
      },
    });
    assert.equal((await f.request()).status, status);
  }
});
test("unexpected auth identity, failed login and audit failure never disclose sessions or raw errors", async () => {
  for (const login of [
    async () => null,
    async () => ({ user: { id: "customer" }, access_token: "SECRET" }),
    async () => {
      throw Error("SECRET");
    },
  ]) {
    const f = fixture({ login });
    const response = await f.request();
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /SECRET/);
  }
  const base = fixture();
  base.admin.from = () => ({
    insert: async () => ({ error: { message: "SECRET" } }),
  });
  const f = fixture({ admin: base.admin });
  const response = await f.request();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /test-access|test-refresh|SECRET/);
});
