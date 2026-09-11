import { createClient } from '@supabase/supabase-js';
import { getE2eAccounts } from './accounts.js';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요해요.`);
  return value;
}

export function assertLocalE2eEnvironment() {
  const rawUrl = required('E2E_SUPABASE_URL');
  const url = new URL(rawUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`운영·원격 Supabase E2E가 차단됐어요: ${url.origin}`);
  }
  const browserUrl = new URL(required('VITE_SUPABASE_URL'));
  if (browserUrl.origin !== url.origin) {
    throw new Error('브라우저와 E2E 준비 코드의 Supabase 대상이 달라 실행을 차단했어요.');
  }
  required('E2E_SUPABASE_ANON_KEY');
  required('E2E_SUPABASE_SERVICE_ROLE_KEY');
  return url.toString().replace(/\/$/, '');
}

export function createAdminClient() {
  const url = assertLocalE2eEnvironment();
  return createClient(url, required('E2E_SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAnonymousClient() {
  const url = assertLocalE2eEnvironment();
  return createClient(url, required('E2E_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createDeveloperClient() {
  return createRoleClient('owner');
}

export async function createRoleClient(role) {
  const account = getE2eAccounts()[role];
  if (!account) throw new Error(`알 수 없는 E2E 역할이에요: ${role}`);
  const client = createAnonymousClient();
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw error;
  return client;
}

export async function resetDeveloperLab(scenario = 'full') {
  const client = await createDeveloperClient();
  try {
    const { data, error } = await client.rpc('prepare_developer_test_lab', {
      p_scenario: scenario,
    });
    if (error) throw error;
    return { client, lab: data };
  } catch (error) {
    await client.auth.signOut();
    throw error;
  }
}

export async function setDeveloperPersona(client, persona) {
  const { data, error } = await client.rpc('set_developer_test_persona', {
    p_persona: persona,
  });
  if (error) throw error;
  return data;
}

export async function setDeveloperPermissions(client, permissions) {
  const { data, error } = await client.rpc('set_developer_test_permissions', {
    p_permissions: permissions,
  });
  if (error) throw error;
  return data;
}
