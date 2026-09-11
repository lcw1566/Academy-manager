import { createClient } from '@supabase/supabase-js';
import { getE2eAccounts } from './accounts.js';

export const PRODUCTION_SUPABASE_PROJECT_REF = 'vfiiieqnxawnhtgrvmxn';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요해요.`);
  return value;
}

export function getE2eTargetKind() {
  return process.env.E2E_TARGET_KIND || 'local';
}

export function assertE2eEnvironment() {
  const rawUrl = required('E2E_SUPABASE_URL');
  const url = new URL(rawUrl);
  const targetKind = getE2eTargetKind();
  const isLocalHost = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);

  if (targetKind === 'local') {
    if (!isLocalHost) {
      throw new Error(`로컬이 아닌 Supabase E2E가 차단됐어요: ${url.origin}`);
    }
  } else if (targetKind === 'staging') {
    const expectedRef = required('E2E_STAGING_PROJECT_REF');
    if (expectedRef === PRODUCTION_SUPABASE_PROJECT_REF) {
      throw new Error('운영 Supabase project ref는 스테이징 E2E 대상으로 사용할 수 없어요.');
    }
    if (url.protocol !== 'https:' || url.hostname !== `${expectedRef}.supabase.co`) {
      throw new Error('스테이징 Supabase URL과 project ref가 일치하지 않아 실행을 차단했어요.');
    }
    if (url.hostname === `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`) {
      throw new Error('운영 Supabase에 대한 E2E 실행이 차단됐어요.');
    }

    const appUrl = new URL(required('E2E_APP_URL'));
    if (appUrl.protocol !== 'https:' || ['127.0.0.1', 'localhost', '::1'].includes(appUrl.hostname)) {
      throw new Error('스테이징 E2E는 별도의 HTTPS 배포 주소가 필요해요.');
    }
  } else {
    throw new Error(`지원하지 않는 E2E 대상이에요: ${targetKind}`);
  }

  const browserUrl = new URL(required('VITE_SUPABASE_URL'));
  if (browserUrl.origin !== url.origin) {
    throw new Error('브라우저와 E2E 준비 코드의 Supabase 대상이 달라 실행을 차단했어요.');
  }
  required('E2E_SUPABASE_ANON_KEY');
  required('E2E_SUPABASE_SERVICE_ROLE_KEY');
  return url.toString().replace(/\/$/, '');
}

export function assertLocalE2eEnvironment() {
  if (getE2eTargetKind() !== 'local') {
    throw new Error('이 실행기는 로컬 E2E에서만 사용할 수 있어요.');
  }
  return assertE2eEnvironment();
}

export function createAdminClient() {
  const url = assertE2eEnvironment();
  return createClient(url, required('E2E_SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAnonymousClient() {
  const url = assertE2eEnvironment();
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
