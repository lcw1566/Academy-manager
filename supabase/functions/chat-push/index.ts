import { createClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5';
import webpush from 'npm:web-push@3.6.7';

import { createChatPushHandler, parseWebPushSubscription } from './handler.mjs';

type PushDevice = {
  id: string;
  token: string;
  provider: 'fcm' | 'apns' | 'webpush';
  updated_at: string;
};

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function parseServiceAccount() {
  const raw = required('FCM_SERVICE_ACCOUNT_JSON');
  return JSON.parse(raw);
}

async function getFcmAccessToken() {
  const account = parseServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key, 'RS256');
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`FCM OAuth failed: ${response.status}`);
  return (await response.json()).access_token as string;
}

async function sendFcm(device: PushDevice, payload: Record<string, string>, accessToken: string) {
  const account = parseServiceAccount();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: device.token,
          notification: { title: payload.title, body: payload.body },
          data: { threadId: payload.threadId, academyId: payload.academyId },
          android: {
            priority: 'high',
            ttl: '120s',
            notification: { channel_id: 'chat_messages', sound: 'default' },
          },
        },
      }),
    },
  );
  const result = await response.json().catch(() => ({}));
  const invalidDevice = !response.ok && result.error?.details?.some(
    (detail: { errorCode?: string }) => detail.errorCode === 'UNREGISTERED',
  );
  return { ok: response.ok, status: response.status, invalidDevice: Boolean(invalidDevice) };
}

async function createApnsJwt() {
  const keyId = required('APNS_KEY_ID');
  const teamId = required('APNS_TEAM_ID');
  const privateKey = required('APNS_PRIVATE_KEY').replace(/\\n/g, '\n');
  const key = await importPKCS8(privateKey, 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .sign(key);
}

async function sendApns(device: PushDevice, payload: Record<string, string>, jwt: string) {
  const host = Deno.env.get('APNS_USE_SANDBOX') === 'true'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com';
  const response = await fetch(`${host}/3/device/${device.token}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': required('APNS_BUNDLE_ID'),
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 120),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: 'default',
      },
      threadId: payload.threadId,
      academyId: payload.academyId,
    }),
  });
  return { ok: response.ok, status: response.status, invalidDevice: response.status === 410 };
}

async function sendWebPush(device: PushDevice, payload: Record<string, string>) {
  webpush.setVapidDetails(
    required('WEB_PUSH_SUBJECT'),
    required('WEB_PUSH_VAPID_PUBLIC_KEY'),
    required('WEB_PUSH_VAPID_PRIVATE_KEY'),
  );
  try {
    await webpush.sendNotification(parseWebPushSubscription(device.token), JSON.stringify(payload), { TTL: 120, timeout: 10_000 });
    return { ok: true, status: 201, invalidDevice: false };
  } catch (error) {
    const pushError = error as { statusCode?: number };
    return {
      ok: false,
      status: pushError.statusCode || 500,
      invalidDevice: pushError.statusCode === 404 || pushError.statusCode === 410,
    };
  }
}

// Keep provider failures isolated: a missing APNs key must not stop Web Push.
async function prepareProviders(devices: Pick<PushDevice, 'provider'>[]) {
  const providers: Record<string, string> = {};
  await Promise.all([
    (async () => {
      if (devices.some((d) => d.provider === 'fcm')) {
        try { providers.fcm = await getFcmAccessToken(); } catch { /* counted per device */ }
      }
    })(),
    (async () => {
      if (devices.some((d) => d.provider === 'apns')) {
        try { providers.apns = await createApnsJwt(); } catch { /* counted per device */ }
      }
    })(),
  ]);
  return providers;
}

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(createChatPushHandler({
  admin,
  getWebPushPublicKey: () => Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY') || null,
  authenticate: async (token: string) => {
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user;
  },
  prepareProviders,
  send: async (device: PushDevice, payload: Record<string, string>, providers: Record<string, string>) => {
    if (device.provider === 'fcm' && providers.fcm) return sendFcm(device, payload, providers.fcm);
    if (device.provider === 'apns' && providers.apns) return sendApns(device, payload, providers.apns);
    if (device.provider === 'webpush') return sendWebPush(device, payload);
    return { ok: false, status: 503 };
  },
}));
