import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { readLocalSupabaseEnv } from '../../scripts/local-supabase-env.mjs';

const local = readLocalSupabaseEnv();
const apiUrl = new URL(local.apiUrl);
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(apiUrl.hostname));

const admin = createClient(local.apiUrl, local.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const password = 'Seenit-Storage-2026!';
const { Client } = pg;

function anonymousClient() {
  return createClient(local.apiUrl, local.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createSignedInUser(label, suffix) {
  const email = `storage-${label}-${suffix}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = anonymousClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

test('private storage enforces real upload, download and academy boundaries', async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const academyA = crypto.randomUUID();
  const academyB = crypto.randomUUID();
  const ownerPath = `${academyA}/${crypto.randomUUID()}.pdf`;
  const managerPath = `${academyA}/${crypto.randomUUID()}.pdf`;
  const feedbackFileName = `${crypto.randomUUID()}.png`;
  const createdUsers = [];
  const database = new Client({ connectionString: local.dbUrl });
  let ownerA;
  let managerA;
  let ownerB;
  let testError;

  try {
    await database.connect();
    ownerA = await createSignedInUser('owner-a', suffix);
    managerA = await createSignedInUser('manager-a', suffix);
    ownerB = await createSignedInUser('owner-b', suffix);
    createdUsers.push(ownerA.id, managerA.id, ownerB.id);

    await database.query(
      `insert into public.academies (id, name, owner_id) values
       ($1, $2, $3), ($4, $5, $6)`,
      [academyA, `Storage A ${suffix}`, ownerA.id, academyB, `Storage B ${suffix}`, ownerB.id],
    );
    await database.query(
      `insert into public.academy_members (academy_id, user_id, role, status) values
       ($1, $2, 'owner', 'active'),
       ($1, $3, 'manager', 'active'),
       ($4, $5, 'owner', 'active')`,
      [academyA, ownerA.id, managerA.id, academyB, ownerB.id],
    );

    const ownerMetadata = await ownerA.client.from('academy_drive_files').insert({
      academy_id: academyA,
      storage_path: ownerPath,
      original_name: 'owner.pdf',
      mime_type: 'application/pdf',
      size_bytes: 18,
      created_by: ownerA.id,
    });
    assert.equal(ownerMetadata.error, null);
    const ownerUpload = await ownerA.client.storage
      .from('academy-drive')
      .upload(ownerPath, new TextEncoder().encode('synthetic-owner-pdf'), {
        contentType: 'application/pdf',
        upsert: false,
      });
    assert.equal(ownerUpload.error, null);
    const ownerDownload = await ownerA.client.storage.from('academy-drive').download(ownerPath);
    assert.equal(ownerDownload.error, null);
    assert.equal(await ownerDownload.data.text(), 'synthetic-owner-pdf');

    const managerMetadata = await managerA.client.from('academy_drive_files').insert({
      academy_id: academyA,
      storage_path: managerPath,
      original_name: 'manager.pdf',
      mime_type: 'application/pdf',
      size_bytes: 20,
      created_by: managerA.id,
    });
    assert.equal(managerMetadata.error, null);
    const managerUpload = await managerA.client.storage
      .from('academy-drive')
      .upload(managerPath, new TextEncoder().encode('synthetic-manager-pdf'), {
        contentType: 'application/pdf',
        upsert: false,
      });
    assert.equal(managerUpload.error, null);
    const managerDirectDownload = await managerA.client.storage
      .from('academy-drive')
      .download(managerPath);
    assert.notEqual(managerDirectDownload.error, null);

    const crossAcademyDownload = await ownerB.client.storage
      .from('academy-drive')
      .download(ownerPath);
    assert.notEqual(crossAcademyDownload.error, null);
    const anonymousDownload = await anonymousClient().storage
      .from('academy-drive')
      .download(ownerPath);
    assert.notEqual(anonymousDownload.error, null);

    const ownerReadsMemberUpload = await ownerA.client.storage
      .from('academy-drive')
      .download(managerPath);
    assert.equal(ownerReadsMemberUpload.error, null);
    assert.equal(await ownerReadsMemberUpload.data.text(), 'synthetic-manager-pdf');

    const publicUrl = ownerA.client.storage.from('academy-drive').getPublicUrl(ownerPath);
    const publicResponse = await fetch(publicUrl.data.publicUrl, { redirect: 'manual' });
    assert.notEqual(publicResponse.status, 200);

    const actualFeedbackPath = `${ownerA.id}/${feedbackFileName}`;
    const feedbackUpload = await ownerA.client.storage
      .from('feedback-attachments')
      .upload(actualFeedbackPath, new Uint8Array([137, 80, 78, 71]), {
        contentType: 'image/png',
        upsert: false,
      });
    assert.equal(feedbackUpload.error, null);
    const otherFeedbackRead = await managerA.client.storage
      .from('feedback-attachments')
      .download(actualFeedbackPath);
    assert.notEqual(otherFeedbackRead.error, null);
    const ownFeedbackRead = await ownerA.client.storage
      .from('feedback-attachments')
      .download(actualFeedbackPath);
    assert.equal(ownFeedbackRead.error, null);

    const wrongMime = await ownerA.client.storage
      .from('feedback-attachments')
      .upload(`${ownerA.id}/${crypto.randomUUID()}.txt`, new TextEncoder().encode('no'), {
        contentType: 'text/plain',
        upsert: false,
      });
    assert.notEqual(wrongMime.error, null);

    const ownDelete = await ownerA.client.storage
      .from('feedback-attachments')
      .remove([actualFeedbackPath]);
    assert.equal(ownDelete.error, null);
  } catch (error) {
    testError = error;
    throw error;
  } finally {
    let cleanupError;
    const driveCleanup = await admin.storage.from('academy-drive').remove([ownerPath, managerPath]);
    if (driveCleanup.error) cleanupError = driveCleanup.error;
    if (ownerA) {
      const feedbackCleanup = await admin.storage
        .from('feedback-attachments')
        .remove([`${ownerA.id}/${feedbackFileName}`]);
      if (feedbackCleanup.error) cleanupError ??= feedbackCleanup.error;
    }

    if (!database.ended) {
      try {
        await database.query('delete from public.academies where id = any($1::uuid[])', [[academyA, academyB]]);
      } catch (error) {
        cleanupError ??= error;
      } finally {
        await database.end();
      }
    }

    const userCleanup = await Promise.allSettled(createdUsers.map(async (userId) => {
      const deletion = await admin.auth.admin.deleteUser(userId);
      if (deletion.error) throw deletion.error;
    }));
    const rejectedUserCleanup = userCleanup.find((result) => result.status === 'rejected');
    if (rejectedUserCleanup?.status === 'rejected') cleanupError ??= rejectedUserCleanup.reason;
    await Promise.allSettled(
      [ownerA, managerA, ownerB]
        .filter(Boolean)
        .map(({ client }) => client.auth.signOut({ scope: 'local' })),
    );
    if (cleanupError && !testError) throw cleanupError;
  }
});
