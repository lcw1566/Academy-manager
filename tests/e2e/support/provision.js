import { getE2eAccounts } from './accounts.js';
import {
  assertE2eEnvironment,
  createAdminClient,
  createAnonymousClient,
} from './supabase.js';

let cachedAccounts = null;
const provisioningClients = new Map();

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 100) return null;
  }
  throw new Error('로컬 Auth 사용자 목록이 너무 커서 E2E 계정을 찾지 못했어요. 로컬 DB를 초기화해주세요.');
}

async function signIn(account) {
  const existing = provisioningClients.get(account.key);
  if (existing) {
    const { data: { session } } = await existing.auth.getSession();
    if (session) return existing;
  }
  const client = createAnonymousClient();
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw error;
  provisioningClients.set(account.key, client);
  return client;
}

async function ensureAccount(admin, account, { resetExistingCredentials }) {
  let user = await findUserByEmail(admin, account.email);
  const attributes = {
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: {
      display_name: account.displayName,
      account_type: account.accountType,
      default_role: account.defaultRole,
    },
  };

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser(attributes);
    if (error) throw error;
    user = data.user;
  } else if (resetExistingCredentials) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password: account.password,
      user_metadata: attributes.user_metadata,
    });
    if (error) throw error;
    user = data.user;
  }

  const profileClient = await signIn(account);
  const { error: profileError } = await profileClient.from('profiles').upsert({
    id: user.id,
    email: account.email,
    display_name: account.displayName,
    account_type: account.accountType,
    default_role: account.defaultRole,
  }, { onConflict: 'id' });
  if (profileError) throw profileError;
  return user;
}

async function createInvitation(ownerClient, academyId, account) {
  const { data, error } = await ownerClient.rpc('create_academy_invitation_guarded', {
    p_academy_id: academyId,
    p_email: account.email,
    p_job_title: account.jobTitle,
  });
  if (error) throw error;
  const invitation = Array.isArray(data) ? data[0] : data;
  if (!invitation?.id) throw new Error(`${account.key} 테스트 초대 생성 결과가 없어요.`);
  return invitation;
}

async function acceptInvitation(account, invitation) {
  const client = await signIn(account);
  const { data, error } = await client.rpc('accept_academy_invitation', {
    p_invitation_id: invitation.id,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (result?.out_role !== account.key) {
    throw new Error(`${account.key} 테스트 계정에 잘못된 역할이 배정됐어요.`);
  }
}

export async function ensureE2eAccounts({ resetExistingCredentials = false } = {}) {
  assertE2eEnvironment();
  if (cachedAccounts && !resetExistingCredentials) return cachedAccounts;
  const accounts = getE2eAccounts();
  const admin = createAdminClient();
  const users = {};

  for (const account of Object.values(accounts)) {
    users[account.key] = await ensureAccount(admin, account, { resetExistingCredentials });
  }

  const { error: environmentAuditError } = await admin.from('developer_action_logs').insert({
    actor_user_id: users.owner.id,
    action: 'test_environment.enabled_for_automation',
    target_type: 'test_account',
    target_id: users.owner.id,
    details: { target_kind: process.env.E2E_TARGET_KIND || 'local' },
  });
  if (environmentAuditError) throw environmentAuditError;
  const { error: environmentError } = await admin
    .from('developer_test_environment_config')
    .upsert({ singleton: true, enabled: true, updated_at: new Date().toISOString() });
  if (environmentError) throw environmentError;

  const { error } = await admin.from('app_developers').upsert({
    user_id: users.owner.id,
    role: 'developer',
    is_active: true,
    capabilities: {},
  }, { onConflict: 'user_id' });
  if (error) throw error;

  cachedAccounts = { accounts, users };
  return cachedAccounts;
}

export async function provisionRoleTestLab({ resetExistingCredentials = false } = {}) {
  assertE2eEnvironment();
  const { accounts, users } = await ensureE2eAccounts({ resetExistingCredentials });
  const ownerClient = await signIn(accounts.owner);

  const { data: lab, error: prepareError } = await ownerClient.rpc('prepare_developer_test_lab', {
    p_scenario: 'full',
  });
  if (prepareError) throw prepareError;

  const managerInvitation = await createInvitation(ownerClient, lab.academy_id, accounts.manager);
  const teacherInvitation = await createInvitation(ownerClient, lab.academy_id, accounts.teacher);
  const invitedInvitation = await createInvitation(ownerClient, lab.academy_id, accounts.invited);

  await acceptInvitation(accounts.manager, managerInvitation);
  await acceptInvitation(accounts.teacher, teacherInvitation);

  if (process.env.E2E_SUPABASE_URL === 'https://owitlzsgxxuthgbmweyt.supabase.co') {
    const admin = createAdminClient();
    const { error: auditError } = await admin.from('developer_action_logs').insert({
      actor_user_id: users.owner.id, action: 'staging_test_login_registration_requested',
      target_type: 'academy', target_id: lab.academy_id, details: { source: 'e2e_fixture' },
    });
    if (auditError) throw auditError;
    const { error } = await admin.from('developer_test_login_accounts').upsert(
      Object.entries(users).map(([persona, user]) => ({
        user_id: user.id, academy_id: lab.academy_id, persona, enabled: true,
      })), { onConflict: 'user_id' },
    );
    if (error) throw error;
  }

  return {
    accounts,
    users,
    lab,
    invitations: {
      manager: managerInvitation,
      teacher: teacherInvitation,
      invited: invitedInvitation,
    },
  };
}
