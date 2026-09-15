export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body, status = 200) => Response.json(body, { status, headers: corsHeaders });

export function chatPushPayload(plan) {
  return {
    title: '씨닛',
    body: '새 메시지가 도착했어요. 앱에서 확인해주세요.',
    threadId: plan.threadId,
    academyId: plan.academyId,
  };
}

// Browser subscriptions are user input. Never send VAPID credentials to an
// arbitrary URL (including internal services or attacker-controlled hosts).
export function parseWebPushSubscription(token) {
  const subscription = JSON.parse(token);
  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password
    || !['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(endpoint.hostname)
    || typeof subscription.keys?.auth !== 'string' || typeof subscription.keys?.p256dh !== 'string') {
    throw new Error('Invalid Web Push subscription');
  }
  return { endpoint: endpoint.href, keys: { auth: subscription.keys.auth, p256dh: subscription.keys.p256dh } };
}

// Dependencies are injected so tests exercise the real HTTP handler without
// credentials, outbound notifications or an additional test runtime.
export function createChatPushHandler({ authenticate, admin, prepareProviders, send, getWebPushPublicKey = () => null, log = console.error }) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);
    try {
      const authorization = req.headers.get('Authorization') || '';
      if (!/^Bearer \S+$/i.test(authorization)) return json({ error: 'Unauthorized' }, 401);
      const user = await authenticate(authorization.slice(7));
      if (!user) return json({ error: 'Unauthorized' }, 401);
      // Public registration key only. Read from the same project as the sender
      // to avoid requiring a separate Vercel secret/configuration rollout.
      if (req.method === 'GET') return json({ publicKey: getWebPushPublicKey() });
      let input;
      try { input = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
      const messageId = input?.messageId;
      if (typeof messageId !== 'string' || !uuid.test(messageId)) return json({ error: 'Invalid messageId' }, 400);

      const { data: plan, error } = await admin.rpc('claim_chat_push', {
        p_message_id: messageId, p_sender_id: user.id,
      });
      if (error?.code === '42501') return json({ error: 'Forbidden' }, 403);
      if (error || !plan) throw new Error('Push claim failed');
      if (!plan.claimed) return json({ sent: 0, skipped: plan.reason });
      if (!plan.devices.length) return json({ sent: 0, failed: 0, skipped: 0 });

      const providers = await prepareProviders(plan.devices);
      const payload = chatPushPayload(plan);
      const results = await Promise.all(plan.devices.map(async (target) => {
        try {
          const { data, error: deviceError } = await admin.rpc('get_chat_push_device', {
            p_message_id: messageId, p_sender_id: user.id,
            p_device_id: target.id, p_recipient_id: target.user_id,
          });
          if (deviceError) throw new Error('Device check failed');
          const device = data?.[0];
          if (!device) return 'skipped';
          const result = await send(device, payload, providers);
          if (result.ok) return 'sent';
          // Never log provider bodies: they can echo tokens or payloads.
          log('[chat-push] delivery failed', { provider: device.provider, status: result.status });
          if (result.invalidDevice) {
            const { error: disableError } = await admin.from('push_devices').update({ enabled: false })
              .eq('id', device.id).eq('user_id', target.user_id).eq('updated_at', device.updated_at);
            if (disableError) log('[chat-push] device disable failed');
          }
          return 'failed';
        } catch {
          log('[chat-push] delivery failed', { provider: target.provider });
          return 'failed';
        }
      }));
      return json({
        sent: results.filter((r) => r === 'sent').length,
        failed: results.filter((r) => r === 'failed').length,
        skipped: results.filter((r) => r === 'skipped').length,
      });
    } catch {
      log('[chat-push] request failed');
      return json({ error: 'Push delivery unavailable' }, 500);
    }
  };
}
