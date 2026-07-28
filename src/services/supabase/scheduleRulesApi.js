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
  query = query.order('session_date');
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
