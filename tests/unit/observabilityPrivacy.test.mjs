import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
  sanitizeTelemetryString,
  sanitizeTelemetryValue,
} from "../../src/utils/observabilityPrivacy.js";

const secrets = {
  email: "guardian.person@example.test",
  phone: "010-1234-5678",
  pin: "4821",
  access: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzdHVkZW50In0.fake_signature_123456",
  refresh: "refresh-secret-value",
};

function assertNoSecrets(value) {
  const serialized = JSON.stringify(value);
  for (const secret of Object.values(secrets))
    assert.equal(serialized.includes(secret), false);
}

test("strings remove bearer/JWT, email, phone and named PIN values", () => {
  const input = `Bearer ${secrets.access} ${secrets.email} ${secrets.phone} pin=${secrets.pin}`;
  const output = sanitizeTelemetryString(input);
  assertNoSecrets(output);
  assert.match(output, /\[Filtered\]/);
});

test("nested provider errors keep operational codes but remove identity and payload fields", () => {
  const error = Object.assign(
    new Error(`request failed for ${secrets.email}`),
    {
      code: "42501",
      status: 403,
      details: { parent_phone: secrets.phone, checkin_pin: secrets.pin },
    },
  );
  const output = sanitizeTelemetryValue({
    error,
    body: "student note",
    user_id: "user-123",
  });
  assertNoSecrets(output);
  assert.equal(output.error.code, "42501");
  assert.equal(output.error.status, 403);
  assert.equal(output.body, "[Filtered]");
  assert.equal(output.user_id, "[Filtered]");
});

test("Sentry event removes user, headers, bodies, query strings and nested sensitive values", () => {
  const event = sanitizeSentryEvent({
    user: { email: secrets.email },
    request: {
      method: "POST",
      url: `https://example.test/checkin?token=${secrets.access}&pin=${secrets.pin}`,
      headers: { authorization: `Bearer ${secrets.access}` },
      data: { phone: secrets.phone },
      cookies: `session=${secrets.refresh}`,
    },
    spans: [{ data: { checkin_pin: secrets.pin } }],
    sdkProcessingMetadata: { token: secrets.refresh },
    logentry: { message: 'sync failed', params: [secrets.email] },
    exception: {
      values: [
        {
          value: `failed for ${secrets.email} token=${secrets.access}`,
          stacktrace: { frames: [{
            filename: `https://example.test/assets/app.js?pin=${secrets.pin}`,
            lineno: 42,
            vars: { guardian_phone: secrets.phone },
            context_line: secrets.refresh,
          }] },
        },
      ],
    },
    extra: {
      guardian_phone: secrets.phone,
      response_body: secrets.refresh,
      status: 403,
    },
    contexts: { student: { student_id: "student-123", pin: secrets.pin } },
    breadcrumbs: [
      { message: secrets.email, data: {
        password: secrets.refresh,
        url: `https://example.test/checkin?token=${secrets.access}`,
      } },
    ],
  });
  assertNoSecrets(event);
  assert.equal("user" in event, false);
  assert.deepEqual(event.request, {
    method: "POST",
    url: "https://example.test/checkin",
  });
  assert.equal(event.extra.status, 403);
  assert.equal(event.exception.values[0].stacktrace.frames[0].lineno, 42);
  assert.equal('vars' in event.exception.values[0].stacktrace.frames[0], false);
  assert.equal('params' in event.logentry, false);
  assert.equal('spans' in event, false);
});

test("breadcrumb sanitizer preserves safe action names", () => {
  const result = sanitizeSentryBreadcrumb({
    category: "workspace",
    message: `sync failed ${secrets.phone}`,
    data: { operation: "load-students", email: secrets.email },
  });
  assertNoSecrets(result);
  assert.equal(result.data.operation, "load-students");
});
