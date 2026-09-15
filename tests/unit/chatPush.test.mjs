import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createChatPushHandler, chatPushPayload, parseWebPushSubscription } from '../../supabase/functions/chat-push/handler.mjs';

const messageId = '00000000-0000-0000-0000-000000000001';
const plan = { claimed: true, threadId: 'thread', academyId: 'academy',
  body: 'SECRET MESSAGE', title: 'SECRET NAME', email: 'secret@example.invalid',
  devices: [{ id: 'device', user_id: 'recipient', provider: 'fcm' }] };
const request = (body = { messageId }, headers = { Authorization: 'Bearer verified-token' }, method = 'POST') =>
  new Request('https://local.invalid/chat-push', { method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });

function setup(overrides = {}) {
  const calls = [], deliveries = [], logs = [];
  const deps = {
    authenticate: async (token) => { assert.equal(token, 'verified-token'); return { id: 'verified-user' }; },
    admin: { rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: name === 'claim_chat_push' ? plan : [{ id: 'device', token: 'SECRET TOKEN', provider: 'fcm' }] };
    } },
    prepareProviders: async () => ({}),
    send: async (device, payload) => { deliveries.push({ device, payload }); return { ok: true }; },
    log: (...args) => logs.push(args),
    ...overrides,
  };
  return { handler: createChatPushHandler(deps), calls, deliveries, logs };
}

test('unsupported methods and unauthenticated or invalid requests cannot reach the database', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request(undefined, {}, 'PUT'))).status, 405);
  assert.equal((await handler(request(undefined, {}, 'GET'))).status, 401);
  assert.equal((await handler(request(undefined, {}, 'OPTIONS'))).status, 200);
  assert.equal((await handler(request(undefined, {}))).status, 401);
  for (const input of [null, {}, { messageId: 'bad' }, { messageId: {} }]) {
    assert.equal((await handler(request(input))).status, 400);
  }
  assert.equal((await handler(new Request('https://local.invalid', { method: 'POST', headers: { Authorization: 'Bearer verified-token' }, body: '{' }))).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await setup({ authenticate: async () => null }).handler(request())).status, 401);
});

test('authenticated GET returns only the public registration key without claiming or sending', async () => {
  const { handler, calls, deliveries } = setup({ getWebPushPublicKey: () => 'public-registration-key' });
  const response = await handler(request(undefined, { Authorization: 'Bearer verified-token' }, 'GET'));
  assert.deepEqual(await response.json(), { publicKey: 'public-registration-key' });
  assert.equal(calls.length, 0);
  assert.equal(deliveries.length, 0);
});

test('caller-provided sender, recipients and body are ignored; delivery uses verified identity', async () => {
  const { handler, calls, deliveries } = setup();
  const response = await handler(request({ messageId, senderId: 'forged', recipientIds: ['outsider'], body: 'SECRET OVERRIDE' }));
  assert.deepEqual(await response.json(), { sent: 1, failed: 0, skipped: 0 });
  assert.deepEqual(calls[0], { name: 'claim_chat_push', args: { p_message_id: messageId, p_sender_id: 'verified-user' } });
  assert.equal(calls[1].args.p_recipient_id, 'recipient');
  assert.deepEqual(deliveries[0].payload, { title: '씨닛', body: '새 메시지가 도착했어요. 앱에서 확인해주세요.', threadId: 'thread', academyId: 'academy' });
  assert.doesNotMatch(JSON.stringify(chatPushPayload(plan)), /SECRET|email|token/);
});

test('duplicate, expired and unauthorized claims never initialize providers or send', async () => {
  for (const result of [{ data: { claimed: false, reason: 'duplicate' } }, { data: { claimed: false, reason: 'expired' } }, { error: { code: '42501' } }]) {
    const { handler, deliveries } = setup({ admin: { rpc: async () => result }, prepareProviders: async () => assert.fail('provider called') });
    const response = await handler(request());
    assert.equal(response.status, result.error ? 403 : 200);
    assert.equal(deliveries.length, 0);
  }
});

test('membership is rechecked after provider preparation, and revocation skips delivery', async () => {
  let prepared = false;
  const { handler, deliveries } = setup({
    prepareProviders: async () => { prepared = true; },
    admin: { rpc: async (name) => {
      if (name === 'claim_chat_push') return { data: plan };
      assert.equal(prepared, true);
      return { data: [] };
    } },
  });
  assert.deepEqual(await (await handler(request())).json(), { sent: 0, failed: 0, skipped: 1 });
  assert.equal(deliveries.length, 0);
});

test('database and provider errors fail closed without leaking bodies or tokens', async () => {
  const { handler, logs } = setup({ send: async () => { throw new Error('SECRET TOKEN and student phone'); } });
  const response = await handler(request());
  assert.deepEqual(await response.json(), { sent: 0, failed: 1, skipped: 0 });
  assert.doesNotMatch(JSON.stringify(logs), /SECRET|student/);
  const failure = setup({ admin: { rpc: async () => ({ error: { message: 'SECRET DATABASE VALUE' } }) } });
  const failed = await failure.handler(request());
  assert.equal(failed.status, 500);
  assert.doesNotMatch(await failed.text(), /SECRET/);
  assert.doesNotMatch(JSON.stringify(failure.logs), /SECRET/);
  const recheck = setup({ admin: { rpc: async (name) => name === 'claim_chat_push' ? { data: plan } : { error: { message: 'secret' } } } });
  assert.equal((await (await recheck.handler(request())).json()).failed, 1);
  assert.equal(recheck.deliveries.length, 0);
});

test('one failed provider does not discard successful device deliveries', async () => {
  const multi = { ...plan, devices: [...plan.devices, { id: 'web', user_id: 'other', provider: 'webpush' }] };
  const { handler } = setup({ admin: { rpc: async (name, args) => ({ data: name === 'claim_chat_push' ? multi : [{ id: args.p_device_id }] }) },
    send: async (device) => { if (device.id === 'device') throw new Error('network failure'); return { ok: true }; } });
  assert.deepEqual(await (await handler(request())).json(), { sent: 1, failed: 1, skipped: 0 });
});

test('only permanent device errors disable the same owner and device version; tokens stay out of URLs', async () => {
  for (const invalidDevice of [false, true]) {
    const filters = [];
    const chain = { eq: (key, value) => { filters.push([key, value]); return chain; } };
    const { handler, logs } = setup({ admin: {
      rpc: async (name) => ({ data: name === 'claim_chat_push' ? plan : [{ id: 'device', token: 'SECRET TOKEN', provider: 'fcm', updated_at: 'version' }] }),
      from: (table) => { assert.equal(table, 'push_devices'); return { update: () => chain }; },
    }, send: async () => ({ ok: false, status: 404, invalidDevice, text: 'SECRET provider echo' }) });
    await handler(request());
    assert.deepEqual(filters, invalidDevice ? [['id', 'device'], ['user_id', 'recipient'], ['updated_at', 'version']] : []);
    assert.doesNotMatch(JSON.stringify(logs), /SECRET/);
  }
});

test('Web Push rejects arbitrary/internal endpoints and strips extra subscription fields', () => {
  const subscription = (endpoint) => JSON.stringify({ endpoint, keys: { auth: 'auth', p256dh: 'key' }, privateData: 'SECRET' });
  for (const endpoint of ['http://fcm.googleapis.com/send', 'https://127.0.0.1', 'https://fcm.googleapis.com.attacker.invalid', 'https://fcm.googleapis.com:54321/send', 'https://secret@web.push.apple.com/send']) {
    assert.throws(() => parseWebPushSubscription(subscription(endpoint)));
  }
  for (const host of ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']) {
    assert.doesNotMatch(JSON.stringify(parseWebPushSubscription(subscription(`https://${host}/send`))), /SECRET/);
  }
});

test('service worker ignores private fields even from an old queued payload', async () => {
  const handlers = {}, notifications = [];
  const self = { addEventListener: (name, fn) => { handlers[name] = fn; },
    clients: { matchAll: async () => [] },
    registration: { showNotification: async (...args) => notifications.push(args) } };
  vm.runInNewContext(readFileSync('public/push-sw.js', 'utf8'), { self });
  let pending;
  handlers.push({ data: { json: () => ({ title: 'SECRET name', body: 'SECRET body', threadId: 'thread' }) }, waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.equal(notifications[0][0], '씨닛');
  assert.doesNotMatch(JSON.stringify(notifications), /SECRET/);
  assert.equal(notifications[0][1].data.threadId, 'thread');
});

test('foreground OS notification cannot display raw message fields', () => {
  const source = readFileSync('src/services/pushNotifications.js', 'utf8');
  const functionSource = source.slice(source.indexOf('export function showForegroundChatNotification')).replace('export ', '');
  const notifications = [];
  function Notification(...args) { notifications.push(args); }
  Notification.permission = 'granted';
  const context = { Notification, isNativePushAvailable: () => false };
  vm.createContext(context);
  vm.runInContext(functionSource, context);
  context.showForegroundChatNotification({ title: 'SECRET', body: 'SECRET', threadId: 'thread' });
  assert.doesNotMatch(JSON.stringify(notifications), /SECRET/);
  assert.equal(notifications[0][0], '씨닛');
});
