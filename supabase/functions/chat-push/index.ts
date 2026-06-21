import { createClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PushDevice = {
  id: string;
  token: string;
  provider: 'fcm' | 'apns' | 'webpush';
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`FCM OAuth failed: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token as string;
}

async function sendFcm(device: PushDevice, payload: Record<string, string>, accessToken: string) {
  const account = parseServiceAccount();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: 'POST',
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
            notification: { channel_id: 'chat_messages', sound: 'default' },
          },
        },
      }),
    },
  );
  return { ok: response.ok, status: response.status, text: await response.text() };
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
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': required('APNS_BUNDLE_ID'),
      'apns-push-type': 'alert',
      'apns-priority': '10',
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
  return { ok: response.ok, status: response.status, text: await response.text() };
}

async function sendWebPush(device: PushDevice, payload: Record<string, string>) {
  webpush.setVapidDetails(
    required('WEB_PUSH_SUBJECT'),
    required('WEB_PUSH_VAPID_PUBLIC_KEY'),
    required('WEB_PUSH_VAPID_PRIVATE_KEY'),
  );
  try {
    await webpush.sendNotification(JSON.parse(device.token), JSON.stringify(payload));
    return { ok: true, status: 201, text: '' };
  } catch (error) {
    const pushError = error as { statusCode?: number; body?: string; message?: string };
    return {
      ok: false,
      status: pushError.statusCode || 500,
      text: pushError.body || pushError.message || 'Web Push failed',
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = required('SUPABASE_URL');
    const anonKey = required('SUPABASE_ANON_KEY');
    const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = req.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }
    const { messageId } = await req.json();
    if (!messageId) return Response.json({ error: 'messageId is required' }, { status: 400, headers: corsHeaders });

    const { data: message, error: messageError } = await admin
      .from('academy_chat_messages')
      .select('id, academy_id, thread_id, sender_id, body')
      .eq('id', messageId)
      .single();
    if (messageError || !message || message.sender_id !== userData.user.id) {
      return Response.json({ error: 'Message not found' }, { status: 404, headers: corsHeaders });
    }

    const { data: thread, error: threadError } = await admin
      .from('academy_chat_threads')
      .select('id, kind, title, group_scope, dm_user_a, dm_user_b')
      .eq('id', message.thread_id)
      .single();
    if (threadError || !thread) throw threadError || new Error('Thread not found');

    let recipientIds: string[] = [];
    if (thread.kind === 'dm') {
      recipientIds = [thread.dm_user_a, thread.dm_user_b].filter(
        (id): id is string => Boolean(id && id !== message.sender_id),
      );
    } else if (thread.group_scope === 'custom') {
      const { data } = await admin
        .from('academy_chat_thread_members')
        .select('user_id')
        .eq('thread_id', thread.id);
      recipientIds = (data || []).map((row) => row.user_id).filter((id) => id !== message.sender_id);
    } else {
      const { data } = await admin
        .from('academy_members')
        .select('user_id')
        .eq('academy_id', message.academy_id)
        .eq('status', 'active');
      recipientIds = (data || []).map((row) => row.user_id).filter((id) => id !== message.sender_id);
    }
    recipientIds = [...new Set(recipientIds)];
    if (recipientIds.length === 0) return Response.json({ sent: 0 }, { headers: corsHeaders });

    const [{ data: sender }, { data: devices, error: devicesError }] = await Promise.all([
      admin.from('profiles').select('display_name, email').eq('id', message.sender_id).maybeSingle(),
      admin
        .from('push_devices')
        .select('id, token, provider')
        .in('user_id', recipientIds)
        .eq('enabled', true),
    ]);
    if (devicesError) throw devicesError;

    const payload = {
      title: thread.kind === 'group'
        ? (thread.title || (thread.group_scope === 'custom' ? '단톡방' : '학원 전체'))
        : (sender?.display_name || sender?.email || '새 채팅'),
      body: message.body,
      threadId: message.thread_id,
      academyId: message.academy_id,
    };

    const typedDevices = (devices || []) as PushDevice[];
    const fcmDevices = typedDevices.filter((device) => device.provider === 'fcm');
    const apnsDevices = typedDevices.filter((device) => device.provider === 'apns');
    const fcmToken = fcmDevices.length ? await getFcmAccessToken() : null;
    const apnsJwt = apnsDevices.length ? await createApnsJwt() : null;

    const results = await Promise.all(typedDevices.map(async (device) => {
      if (device.provider === 'fcm' && fcmToken) return { device, ...(await sendFcm(device, payload, fcmToken)) };
      if (device.provider === 'apns' && apnsJwt) return { device, ...(await sendApns(device, payload, apnsJwt)) };
      if (device.provider === 'webpush') return { device, ...(await sendWebPush(device, payload)) };
      return { device, ok: false, status: 501, text: 'Provider is not configured' };
    }));

    const invalidIds = results
      .filter((result) => !result.ok && (result.status === 404 || result.status === 410))
      .map((result) => result.device.id);
    if (invalidIds.length) {
      await admin.from('push_devices').update({ enabled: false }).in('id', invalidIds);
    }

    return Response.json({
      sent: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('[chat-push]', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown push error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
