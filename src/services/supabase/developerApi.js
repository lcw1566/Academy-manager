import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { FEEDBACK_BUCKET } from './feedbackApi';

const FEEDBACK_STATUSES = new Set(['received', 'reviewing', 'planned', 'resolved', 'closed']);
const FEEDBACK_CATEGORIES = new Set(['bug', 'improvement']);
const TEST_LAB_SCENARIOS = new Set(['full', 'billing', 'attendance', 'staff']);
const TEST_LAB_PERSONAS = new Set(['owner', 'manager', 'teacher', 'invited', 'inactive']);

function assertConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('개발자 워크스페이스를 사용하려면 서버 연결이 필요해요.');
  }
}

function isMissingDeveloperSetup(error) {
  return error?.code === '42883'
    || error?.code === 'PGRST202'
    || String(error?.message || '').includes('get_my_developer_access');
}

export async function getMyDeveloperAccess() {
  assertConfigured();
  const { data, error } = await supabase.rpc('get_my_developer_access');
  if (error) {
    if (isMissingDeveloperSetup(error)) {
      return { has_access: false, setup_missing: true };
    }
    throw error;
  }
  return data || { has_access: false };
}

export async function getDeveloperDashboardStats() {
  assertConfigured();
  const { data, error } = await supabase.rpc('get_developer_dashboard_stats');
  if (error) throw error;
  return data || {};
}

export async function getDeveloperTestLab() {
  assertConfigured();
  const { data, error } = await supabase.rpc('get_developer_test_lab');
  if (error) {
    if (error?.code === '42883' || error?.code === 'PGRST202') {
      return { exists: false, setup_missing: true };
    }
    throw error;
  }
  return data || { exists: false };
}

export async function getMyDeveloperTestContext(academyId) {
  assertConfigured();
  if (!academyId) return { is_test_lab: false };
  const { data, error } = await supabase.rpc('get_my_developer_test_context', {
    p_academy_id: academyId,
  });
  if (error) {
    if (error?.code === '42883' || error?.code === 'PGRST202') {
      return { is_test_lab: false, setup_missing: true };
    }
    throw error;
  }
  return data || { is_test_lab: false };
}

export async function prepareDeveloperTestLab(scenario = 'full') {
  assertConfigured();
  if (!TEST_LAB_SCENARIOS.has(scenario)) {
    throw new Error('테스트 시나리오가 올바르지 않아요.');
  }
  const { data, error } = await supabase.rpc('prepare_developer_test_lab', {
    p_scenario: scenario,
  });
  if (error) throw error;
  return data || { exists: false };
}

export async function setDeveloperTestPersona(persona) {
  assertConfigured();
  if (!TEST_LAB_PERSONAS.has(persona)) {
    throw new Error('테스트 역할이 올바르지 않아요.');
  }
  const { data, error } = await supabase.rpc('set_developer_test_persona', {
    p_persona: persona,
  });
  if (error) throw error;
  return data || { exists: false };
}

export async function listDeveloperFeedback({
  status = null,
  category = null,
  limit = 50,
  offset = 0,
} = {}) {
  assertConfigured();
  if (status && !FEEDBACK_STATUSES.has(status)) throw new Error('의견 상태가 올바르지 않아요.');
  if (category && !FEEDBACK_CATEGORIES.has(category)) throw new Error('의견 종류가 올바르지 않아요.');
  const { data, error } = await supabase.rpc('list_product_feedback_for_developer', {
    p_status: status || null,
    p_category: category || null,
    p_limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
    p_offset: Math.max(Number(offset) || 0, 0),
  });
  if (error) throw error;
  return data || [];
}

export async function updateDeveloperFeedbackStatus(feedbackId, status) {
  assertConfigured();
  if (!feedbackId) throw new Error('의견 ID가 필요해요.');
  if (!FEEDBACK_STATUSES.has(status)) throw new Error('의견 상태가 올바르지 않아요.');
  const { data, error } = await supabase.rpc('update_product_feedback_status_for_developer', {
    p_feedback_id: feedbackId,
    p_status: status,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function createDeveloperFeedbackScreenshotUrl(path, expiresIn = 300) {
  assertConfigured();
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(FEEDBACK_BUCKET)
    .createSignedUrl(path, Math.min(Math.max(Number(expiresIn) || 300, 60), 600));
  if (error) throw error;
  return data?.signedUrl || null;
}
