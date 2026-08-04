// scheduleRulesApi.js
//
// Phase 44.5 / Phase A — 룰 기반 스케줄 모델 API 스켈레톤.
//
// 이 파일은 SQL 014 에서 만든 5개 테이블에 대한 CRUD 헬퍼만 제공한다.
//   - academy_staff_work_rules
//   - academy_staff_work_exceptions
//   - staff_attendance_logs        (Phase A 에서는 정의만, 호출처 없음)
//   - class_schedule_rules
//   - class_session_exceptions
//
// 호출처 (ClassGroupFormModal, ShiftFormModal, StaffPage 등) 와 store 연결은
// Phase B 작업. 이 파일은 단독으로 검증 가능 — supabase 미설정 시 친절 에러.
//
// 변환 규칙:
//   - 함수 input/output 은 모두 snake_case (DB row 그대로).
//   - 시간은 'HH:mm' 문자열, 날짜는 'YYYY-MM-DD'.
//   - undefined 키는 patch 에서 제외.

import { supabase, isSupabaseConfigured } from '../../lib/supabase';

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase가 설정되지 않았어요. .env.local을 확인해주세요.');
  }
}

function pickDefined(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────
// academy_staff_work_rules
// ────────────────────────────────────────────────────────────────

const STAFF_WORK_RULE_FIELDS = new Set([
  'academy_id', 'staff_user_id', 'staff_role',
  'day_of_week', 'start_time', 'end_time', 'break_minutes',
  'effective_start_date', 'effective_end_date',
  'repeat_interval_weeks', 'rotation_week_index',
  'is_active', 'memo',
]);

function sanitizeStaffWorkRule(input, { strip = [] } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!STAFF_WORK_RULE_FIELDS.has(k)) continue;
    if (strip.includes(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function listStaffWorkRules(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('academy_staff_work_rules')
    .select('*')
    .eq('academy_id', academyId)
    .order('staff_user_id')
    .order('day_of_week');
  if (error) throw error;
  return data ?? [];
}

export async function createStaffWorkRule({ academyId, ...payload } = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const row = sanitizeStaffWorkRule({ ...payload, academy_id: academyId });
  const { data, error } = await supabase
    .from('academy_staff_work_rules')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStaffWorkRule(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeStaffWorkRule(patch, { strip: ['academy_id'] });
  if (Object.keys(safe).length === 0) return null;
  safe.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('academy_staff_work_rules')
    .update(safe)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteStaffWorkRule(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase
    .from('academy_staff_work_rules')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}


// ────────────────────────────────────────────────────────────────
// academy_staff_work_exceptions
// ────────────────────────────────────────────────────────────────

const STAFF_WORK_EXCEPTION_FIELDS = new Set([
  'academy_id', 'staff_user_id', 'date', 'type',
  'start_time', 'end_time', 'break_minutes', 'memo',
]);

function sanitizeStaffWorkException(input, { strip = [] } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!STAFF_WORK_EXCEPTION_FIELDS.has(k)) continue;
    if (strip.includes(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function listStaffWorkExceptions(academyId, { fromDate, toDate } = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  let query = supabase
    .from('academy_staff_work_exceptions')
    .select('*')
    .eq('academy_id', academyId);
  if (fromDate) query = query.gte('date', fromDate);
  if (toDate) query = query.lte('date', toDate);
  query = query.order('date');
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createStaffWorkException({ academyId, ...payload } = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const row = sanitizeStaffWorkException({ ...payload, academy_id: academyId });
  const { data, error } = await supabase
    .from('academy_staff_work_exceptions')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStaffWorkException(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeStaffWorkException(patch, { strip: ['academy_id'] });
  if (Object.keys(safe).length === 0) return null;
  safe.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('academy_staff_work_exceptions')
    .update(safe)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteStaffWorkException(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase
    .from('academy_staff_work_exceptions')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}


// ────────────────────────────────────────────────────────────────
// staff_attendance_logs (Phase C 본격 사용 예정)
// ────────────────────────────────────────────────────────────────

const STAFF_ATTENDANCE_LOG_FIELDS = new Set([
  'academy_id', 'staff_user_id', 'staff_role', 'work_date',
  'scheduled_start_time', 'scheduled_end_time',
  'actual_start_time', 'actual_end_time', 'break_minutes',
  'status', 'source', 'approved_by', 'approved_at', 'memo',
]);

function sanitizeStaffAttendanceLog(input, { strip = [] } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!STAFF_ATTENDANCE_LOG_FIELDS.has(k)) continue;
    if (strip.includes(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function listStaffAttendanceLogs(academyId, { fromDate, toDate, limit = 500 } = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  let query = supabase
    .from('staff_attendance_logs')
    .select('*')
    .eq('academy_id', academyId);
  if (fromDate) query = query.gte('work_date', fromDate);
  if (toDate) query = query.lte('work_date', toDate);
  query = query.order('work_date', { ascending: false }).limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createStaffAttendanceLog({ academyId, ...payload } = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const row = sanitizeStaffAttendanceLog({ ...payload, academy_id: academyId });
  const { data, error } = await supabase
    .from('staff_attendance_logs')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStaffAttendanceLog(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeStaffAttendanceLog(patch, { strip: ['academy_id'] });
  if (Object.keys(safe).length === 0) return null;
  safe.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('staff_attendance_logs')
    .update(safe)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}


// ────────────────────────────────────────────────────────────────
// class_schedule_rules
// ────────────────────────────────────────────────────────────────

const CLASS_SCHEDULE_RULE_FIELDS = new Set([
  'academy_id', 'class_group_id',
  'day_of_week', 'start_time', 'end_time',
  'teacher_user_id', 'assistant_ids', 'room', 'is_active',
  'effective_start_date', 'effective_end_date',
]);

function sanitizeClassScheduleRule(input, { strip = [] } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!CLASS_SCHEDULE_RULE_FIELDS.has(k)) continue;
    if (strip.includes(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function listClassScheduleRules(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('class_schedule_rules')
    .select('*')
    .eq('academy_id', academyId)
    .order('class_group_id')
    .order('day_of_week');
  if (error) throw error;
  return data ?? [];
}

export async function createClassScheduleRule({ academyId, ...payload } = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const row = sanitizeClassScheduleRule({ ...payload, academy_id: academyId });
  const { data, error } = await supabase
    .from('class_schedule_rules')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClassScheduleRule(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeClassScheduleRule(patch, { strip: ['academy_id', 'class_group_id'] });
  if (Object.keys(safe).length === 0) return null;
  safe.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('class_schedule_rules')
    .update(safe)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteClassScheduleRule(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase
    .from('class_schedule_rules')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}

// SQL 048 — 반과 반복 규칙을 한 트랜잭션으로 생성한다.
// classGroupId는 클라이언트에서 한 번 만든 UUID를 재사용하므로, 응답이 유실되어
// 같은 요청을 다시 보내도 서버에는 반이 하나만 남는다.
export async function createClassGroupWithRulesTransaction({
  academyId,
  classGroupId,
  group,
  rules,
} = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!classGroupId) throw new Error('classGroupId가 필요해요.');
  if (!group || typeof group !== 'object') throw new Error('반 정보가 필요해요.');
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error('수업 규칙이 필요해요.');
  }

  const { data, error } = await supabase.rpc('create_class_group_with_rules', {
    p_academy_id: academyId,
    p_class_group_id: classGroupId,
    p_group: group,
    p_rules: rules,
  });
  if (error) {
    if (['42883', 'PGRST202'].includes(error.code)) {
      const migrationError = new Error(
        '반 안전 생성 기능이 아직 서버에 적용되지 않았어요. SQL 048을 먼저 실행해주세요.',
      );
      migrationError.code = 'TRANSACTIONAL_CLASS_CREATION_NOT_INSTALLED';
      throw migrationError;
    }
    throw error;
  }
  return data ?? null;
}

// SQL 047 — 반 정보와 반복 규칙 전체를 한 PostgreSQL 트랜잭션으로 수정한다.
export async function updateClassGroupWithRulesTransaction({
  academyId,
  classGroupId,
  groupPatch,
  rules,
  effectiveFrom,
  expectedUpdatedAt,
} = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!classGroupId) throw new Error('classGroupId가 필요해요.');
  if (!groupPatch || typeof groupPatch !== 'object') {
    throw new Error('반 수정 정보가 필요해요.');
  }
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error('수업 규칙이 필요해요.');
  }

  if (!expectedUpdatedAt) {
    throw new Error('반의 최신 수정 시각을 확인하지 못했어요. 수업 목록을 새로고침해주세요.');
  }

  const { data, error } = await supabase.rpc('update_class_group_with_rules_guarded', {
    p_academy_id: academyId,
    p_class_group_id: classGroupId,
    p_group_patch: groupPatch,
    p_rules: rules,
    p_effective_from: effectiveFrom || undefined,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) {
    if (['42883', 'PGRST202'].includes(error.code)) {
      const migrationError = new Error(
        '반 동시 수정 보호 기능이 아직 서버에 적용되지 않았어요. SQL 071을 먼저 실행해주세요.',
      );
      migrationError.code = 'CLASS_GROUP_GUARD_NOT_INSTALLED';
      throw migrationError;
    }
    if (error.code === '40001' || String(error.message || '').includes('다른 기기')) {
      const conflict = new Error(
        '다른 기기에서 이 반을 먼저 수정했어요. 최신 정보를 다시 열어주세요.',
      );
      conflict.code = 'DATA_CONFLICT_CLASS_GROUP';
      throw conflict;
    }
    throw error;
  }
  return data ?? null;
}


// ────────────────────────────────────────────────────────────────
// class_session_exceptions
// ────────────────────────────────────────────────────────────────

const CLASS_SESSION_EXCEPTION_FIELDS = new Set([
  'academy_id', 'class_group_id', 'session_date', 'type',
  'start_time', 'end_time',
  'teacher_user_id', 'assistant_ids', 'substitute_teacher_user_id',
  'reason', 'memo',
]);

function sanitizeClassSessionException(input, { strip = [] } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!CLASS_SESSION_EXCEPTION_FIELDS.has(k)) continue;
    if (strip.includes(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function listClassSessionExceptions(academyId, { fromDate, toDate } = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  let query = supabase
    .from('class_session_exceptions')
    .select('*')
    .eq('academy_id', academyId);
  if (fromDate) query = query.gte('session_date', fromDate);
  if (toDate) query = query.lte('session_date', toDate);
  query = query
    .order('session_date')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createClassSessionException({ academyId, ...payload } = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const row = sanitizeClassSessionException({ ...payload, academy_id: academyId });
  const { data, error } = await supabase
    .from('class_session_exceptions')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClassSessionException(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeClassSessionException(patch, { strip: ['academy_id', 'class_group_id'] });
  if (Object.keys(safe).length === 0) return null;
  safe.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('class_session_exceptions')
    .update(safe)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteClassSessionException(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase
    .from('class_session_exceptions')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}

// SQL 046 — 반복 규칙을 필요한 날짜 범위의 실제 class_sessions로 준비한다.
// 서버 함수가 멱등성과 동시 호출 잠금을 담당하므로 여러 화면/기기에서 호출해도
// 같은 회차가 중복 생성되지 않는다.
export async function ensureClassSessionsForRange({
  academyId,
  fromDate,
  toDate,
  classGroupId = null,
} = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!fromDate || !toDate) throw new Error('수업을 준비할 날짜 범위가 필요해요.');

  const { data, error } = await supabase.rpc('ensure_class_sessions_for_range', {
    p_academy_id: academyId,
    p_from_date: fromDate,
    p_to_date: toDate,
    p_class_group_id: classGroupId || null,
  });
  if (error) {
    if (['42883', 'PGRST202'].includes(error.code)) {
      const migrationError = new Error(
        '수업 일정 자동 준비 기능이 아직 서버에 적용되지 않았어요. SQL 046을 먼저 실행해주세요.',
      );
      migrationError.code = 'CLASS_SESSION_MATERIALIZATION_NOT_INSTALLED';
      throw migrationError;
    }
    throw error;
  }
  return data ?? [];
}
