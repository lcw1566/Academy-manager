import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { readLocalSupabaseEnv } from '../../scripts/local-supabase-env.mjs';
import { createChatPushHandler } from '../../supabase/functions/chat-push/handler.mjs';

test('local REST/RPC: service boundary and simultaneous dispatch requests', async () => {
  const env = readLocalSupabaseEnv(); // Rejects remote targets before any writes.
  const db = new pg.Client({ connectionString: env.dbUrl });
  const admin = createClient(env.apiUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymous = createClient(env.apiUrl, env.anonKey, { auth: { persistSession: false } });
  const owner = randomUUID(), recipient = randomUUID(), academy = randomUUID(), thread = randomUUID(), message = randomUUID(), device = randomUUID();
  await db.connect();
  try {
    await db.query('begin');
    await db.query('set local session_replication_role=replica');
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [owner, `push-${owner}@example.invalid`, recipient, `push-${recipient}@example.invalid`]);
    await db.query('insert into public.academies(id,name,owner_id) values($1,$2,$3)', [academy,'Synthetic push concurrency test',owner]);
    await db.query("insert into public.academy_members(academy_id,user_id,role,status) values($1,$2,'owner','active'),($1,$3,'teacher','active')", [academy,owner,recipient]);
    await db.query("insert into public.academy_chat_threads(id,academy_id,kind) values($1,$2,'group')", [thread,academy]);
    await db.query('insert into public.academy_chat_messages(id,academy_id,thread_id,sender_id,body) values($1,$2,$3,$4,$5)',[message,academy,thread,owner,'Synthetic confidential body']);
    await db.query("insert into public.push_devices(id,user_id,token,platform,provider) values($1,$2,$3,'android','fcm')",[device,recipient,`synthetic-${device}`]);
    await db.query('commit');

    const denied = await anonymous.rpc('claim_chat_push', { p_message_id: message, p_sender_id: owner });
    assert.equal(denied.error?.code, '42501');
    const deviceDenied = await anonymous.rpc('get_chat_push_device', { p_message_id: message, p_sender_id: owner, p_device_id: device, p_recipient_id: recipient });
    assert.equal(deviceDenied.error?.code, '42501');
    const receiptsDenied = await anonymous.from('chat_push_dispatches').select('message_id');
    assert.equal(receiptsDenied.error?.code, '42501');

    let attempts = 0;
    const handler = createChatPushHandler({
      admin,
      authenticate: async () => ({ id: owner }), // Auth itself is tested by the local Edge smoke check.
      prepareProviders: async () => ({}),
      send: async (target, payload) => {
        assert.equal(target.id, device);
        assert.doesNotMatch(JSON.stringify(payload), /confidential|synthetic-/);
        attempts += 1;
        return { ok: true };
      },
    });
    const responses = await Promise.all(Array.from({ length: 12 }, () => handler(new Request('https://local.invalid', {
      method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ messageId: message }),
    }))));
    const results = await Promise.all(responses.map((r) => r.json()));
    assert.equal(attempts, 1, 'twelve concurrent HTTP requests must send once');
    assert.equal(results.filter((r) => r.skipped === 'duplicate').length, 11);
    assert.equal(results.reduce((sum, r) => sum + r.sent, 0), 1);
    const receiptCount = await db.query('select count(*)::int as n from public.chat_push_dispatches where message_id=$1',[message]);
    assert.equal(receiptCount.rows[0].n,1);
  } finally {
    await db.query('rollback');
    await db.query('delete from public.academies where id=$1',[academy]);
    await db.query('delete from auth.users where id=any($1::uuid[])',[[owner,recipient]]);
    await db.end();
  }
});
