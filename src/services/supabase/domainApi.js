// domainApi.js
//
// 도메인 테이블 (students / class_groups / ...) 에 접근하는 CRUD 래퍼.
// 6단계에서는 students 만 노출합니다. 다른 테이블은 후속 단계에서 추가.
//
// 설계 메모:
//   - 모든 함수는 supabase 미설정 / 미로그인 시 친절한 에러를 throw.
//   - academy 모드와 private 모드는 별도 함수로 노출하여 호출처에서 의도를
//     명시적으로 드러내도록 한다.
//   - update / delete 는 RLS 가 row 단위로 차단하므로 호출처에서 academyId
//     를 다시 지정할 필요는 없다 (단, 본인이 접근 가능한 row 만 영향).
//   - update 시 mode / academy_id / user_id 같은 ownership 컬럼은 절대
//     변경하지 못하도록 화이트리스트 필터링.

import { supabase, isSupabaseConfigured } from '../../lib/supabase';

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase가 설정되지 않았어요. .env.local을 확인해주세요.');
  }
}

async function getCurrentUserOrThrow() {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error('로그인이 필요해요.');
  return data.user;
}

// ────────────────────────────────────────────────────────────────
// students
// ────────────────────────────────────────────────────────────────

// 학원 모드 학생 목록 — currentAcademyId 기준
export async function listAcademyStudents(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// 개인(과외) 모드 학생 목록 — 본인 user_id 기준
export async function listMyPrivateStudents() {
  const user = await getCurrentUserOrThrow();
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('mode', 'private')
    .eq('user_id', user.id)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getStudentById(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 학원 모드 학생 생성. academyId 의 active 멤버여야 RLS 통과.
export async function createAcademyStudent({ academyId, ...payload } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const row = sanitizeStudentPayload({
    ...payload,
    mode: 'academy',
    academy_id: academyId,
    user_id: user.id,
  });
  const mutation = row.id
    ? supabase.from('students').upsert(row, { onConflict: 'id' })
    : supabase.from('students').insert(row);
  const { data, error } = await mutation
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 개인(과외) 모드 학생 생성. 본인 user_id 로 자동 귀속.
export async function createPrivateStudent(payload = {}) {
  const user = await getCurrentUserOrThrow();
  const row = sanitizeStudentPayload({
    ...payload,
    mode: 'private',
    academy_id: null,
    user_id: user.id,
  });
  const { data, error } = await supabase
    .from('students')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ownership 컬럼은 patch 로 변경 불가 — sanitize 에서 자동 제거.
export async function updateStudent(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeStudentPayload(patch, { strip: ['id', 'mode', 'academy_id', 'user_id', 'created_at', 'updated_at'] });
  if (Object.keys(safe).length === 0) {
    throw new Error('변경할 항목이 없어요.');
  }
  const { data, error } = await supabase
    .from('students')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStudent(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// class_groups
// ────────────────────────────────────────────────────────────────

export async function listAcademyClassGroups(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('class_groups')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createAcademyClassGroup({ academyId, ...payload } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const row = sanitizeClassGroupPayload({
    ...payload,
    mode: 'academy',
    academy_id: academyId,
    user_id: user.id,
  });
  const { data, error } = await supabase
    .from('class_groups')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClassGroup(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeClassGroupPayload(patch, {
    strip: ['id', 'mode', 'academy_id', 'user_id', 'created_at', 'updated_at'],
  });
  if (Object.keys(safe).length === 0) {
    throw new Error('변경할 항목이 없어요.');
  }
  const { data, error } = await supabase
    .from('class_groups')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClassGroup(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase
    .from('class_groups')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// class_sessions
// ────────────────────────────────────────────────────────────────

export async function listAcademyClassSessions(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('class_sessions')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listAcademyClassSessionsByGroup(academyId, classGroupServerId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!classGroupServerId) throw new Error('classGroupServerId가 필요해요.');
  const { data, error } = await supabase
    .from('class_sessions')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .eq('class_group_id', classGroupServerId)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createAcademyClassSession({ academyId, ...payload } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const row = sanitizeClassSessionPayload({
    ...payload,
    mode: 'academy',
    academy_id: academyId,
    user_id: user.id,
  });
  const { data, error } = await supabase
    .from('class_sessions')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// sessions 가 빈 배열이면 호출 자체 skip 후 [] 반환.
// 반환 순서는 PostgreSQL 다중 INSERT 의 일반 동작상 입력 순서와 같지만,
// 안전을 위해 호출처에서 (date, start_time) 으로 매칭하는 것을 권장.
export async function createAcademyClassSessionsBulk({ academyId, sessions } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!Array.isArray(sessions) || sessions.length === 0) return [];
  const rows = sessions.map((s) =>
    sanitizeClassSessionPayload({
      ...s,
      mode: 'academy',
      academy_id: academyId,
      user_id: user.id,
    })
  );
  const { data, error } = await supabase
    .from('class_sessions')
    .insert(rows)
    .select();
  if (error) throw error;
  return data ?? [];
}

export async function updateClassSession(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeClassSessionPayload(patch, {
    strip: ['id', 'mode', 'academy_id', 'user_id', 'created_at', 'updated_at'],
  });
  if (Object.keys(safe).length === 0) {
    throw new Error('변경할 항목이 없어요.');
  }
  const { data, error } = await supabase
    .from('class_sessions')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 담당 선생님은 회차 일정 전체 UPDATE 권한 없이도 자신의 수업을 완료할 수 있다.
// SQL 051의 제한된 RPC가 담당 배정과 역할을 서버에서 다시 확인한다.
export async function completeAcademyClassSession(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { data, error } = await supabase.rpc('complete_assigned_class_session', {
    p_session_id: id,
  });
  if (error) throw error;
  return data;
}

export async function updateFutureClassSessionRecordSchema({
  academyId,
  classGroupId,
  fromDate,
  recordSchema,
} = {}) {
  assertSupabaseConfigured();
  if (!academyId || !classGroupId || !fromDate) {
    throw new Error('학원·반·시작 날짜가 필요해요.');
  }
  const { data, error } = await supabase
    .from('class_sessions')
    .update({ record_schema: Array.isArray(recordSchema) ? recordSchema : [] })
    .eq('academy_id', academyId)
    .eq('class_group_id', classGroupId)
    .gte('date', fromDate)
    .not('status', 'in', '("completed","canceled")')
    .select();
  if (error) throw error;
  return data ?? [];
}

export async function deleteClassSession(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase
    .from('class_sessions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// 보조 함수 — class_groups.id 의 on delete cascade 로 자동 정리되므로
// 일반적으로는 사용할 필요가 없으나, 명시적 정리가 필요할 때 사용.
export async function deleteClassSessionsByGroup(classGroupServerId) {
  assertSupabaseConfigured();
  if (!classGroupServerId) throw new Error('classGroupServerId가 필요해요.');
  const { error } = await supabase
    .from('class_sessions')
    .delete()
    .eq('class_group_id', classGroupServerId);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// lesson_records
// 수업 회차당 1 row. unique(class_session_id) onConflict 로 upsert.
// 학생별 평가는 student_records jsonb 에 통합 저장.
// ────────────────────────────────────────────────────────────────

export async function listAcademyLessonRecords(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('lesson_records')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId);
  if (error) throw error;
  return data ?? [];
}

export async function listAcademyLessonRecordsBySession(academyId, classSessionServerId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!classSessionServerId) throw new Error('classSessionServerId가 필요해요.');
  const { data, error } = await supabase
    .from('lesson_records')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .eq('class_session_id', classSessionServerId);
  if (error) throw error;
  return data ?? [];
}

export async function getLessonRecordBySession(classSessionServerId) {
  assertSupabaseConfigured();
  if (!classSessionServerId) throw new Error('classSessionServerId가 필요해요.');
  const { data, error } = await supabase
    .from('lesson_records')
    .select('*')
    .eq('class_session_id', classSessionServerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function createDataConflictError(message) {
  const error = new Error(message || '다른 기기에서 먼저 수정한 내용이 있어요. 최신 데이터를 불러온 뒤 다시 저장해주세요.');
  error.code = 'DATA_CONFLICT';
  return error;
}

export async function upsertAcademyLessonRecord({ academyId, expectedUpdatedAt, ...payload } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!payload.class_session_id) throw new Error('class_session_id가 필요해요.');
  const row = sanitizeLessonRecordPayload({
    ...payload,
    mode: 'academy',
    academy_id: academyId,
    user_id: user.id,
  });
  if (expectedUpdatedAt === null) {
    const { data, error } = await supabase
      .from('lesson_records')
      .insert(row)
      .select()
      .single();
    if (error?.code === '23505') throw createDataConflictError();
    if (error) throw error;
    return data;
  }

  if (typeof expectedUpdatedAt === 'string' && expectedUpdatedAt) {
    const { data, error } = await supabase
      .from('lesson_records')
      .update(row)
      .eq('class_session_id', payload.class_session_id)
      .eq('updated_at', expectedUpdatedAt)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw createDataConflictError();
    return data;
  }

  const { data, error } = await supabase
    .from('lesson_records')
    .upsert(row, { onConflict: 'class_session_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLessonRecord(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeLessonRecordPayload(patch, {
    strip: ['id', 'mode', 'academy_id', 'user_id', 'created_at', 'updated_at'],
  });
  if (Object.keys(safe).length === 0) {
    throw new Error('변경할 항목이 없어요.');
  }
  const { data, error } = await supabase
    .from('lesson_records')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLessonRecord(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase.from('lesson_records').delete().eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// attendance_records
// unique(class_session_id, student_id) onConflict 로 upsert.
// student_id 는 반드시 서버 students.id uuid 여야 함 (FK 제약).
// ────────────────────────────────────────────────────────────────

export async function listAcademyAttendanceRecords(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId);
  if (error) throw error;
  return data ?? [];
}

export async function listAcademyAttendanceRecordsBySession(academyId, classSessionServerId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!classSessionServerId) throw new Error('classSessionServerId가 필요해요.');
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .eq('class_session_id', classSessionServerId);
  if (error) throw error;
  return data ?? [];
}

export async function upsertAcademyAttendanceRecord({ academyId, ...payload } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!payload.class_session_id) throw new Error('class_session_id가 필요해요.');
  if (!payload.student_id) throw new Error('student_id가 필요해요.');
  const row = sanitizeAttendancePayload({
    ...payload,
    mode: 'academy',
    academy_id: academyId,
    user_id: user.id,
  });
  const { data, error } = await supabase
    .from('attendance_records')
    .upsert(row, { onConflict: 'class_session_id,student_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// records 빈 배열이면 skip. 모든 row 는 class_session_id + student_id 필수.
export async function upsertAcademyAttendanceRecordsBulk({ academyId, records } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!Array.isArray(records) || records.length === 0) return [];
  const rows = records.map((r) =>
    sanitizeAttendancePayload({
      ...r,
      mode: 'academy',
      academy_id: academyId,
      user_id: user.id,
    })
  );
  for (const r of rows) {
    if (!r.class_session_id || !r.student_id) {
      throw new Error('class_session_id / student_id 가 누락된 출결이 있어요.');
    }
  }
  const { data, error } = await supabase
    .from('attendance_records')
    .upsert(rows, { onConflict: 'class_session_id,student_id' })
    .select();
  if (error) throw error;
  return data ?? [];
}

export async function updateAttendanceRecord(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeAttendancePayload(patch, {
    strip: ['id', 'mode', 'academy_id', 'user_id', 'created_at', 'updated_at'],
  });
  if (Object.keys(safe).length === 0) {
    throw new Error('변경할 항목이 없어요.');
  }
  const { data, error } = await supabase
    .from('attendance_records')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAttendanceRecord(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase.from('attendance_records').delete().eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// clinic_records
// student_id 는 반드시 서버 students.id uuid (FK).
// class_group_id / class_session_id / source_lesson_record_id 는 nullable.
// ────────────────────────────────────────────────────────────────

export async function listAcademyClinicRecords(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('clinic_records')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listAcademyClinicRecordsByStudent(academyId, studentServerId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!studentServerId) throw new Error('studentServerId가 필요해요.');
  const { data, error } = await supabase
    .from('clinic_records')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .eq('student_id', studentServerId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listAcademyClinicRecordsBySession(academyId, classSessionServerId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!classSessionServerId) throw new Error('classSessionServerId가 필요해요.');
  const { data, error } = await supabase
    .from('clinic_records')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .eq('class_session_id', classSessionServerId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createAcademyClinicRecord({ academyId, ...payload } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!payload.student_id) throw new Error('student_id가 필요해요.');
  if (!payload.date) throw new Error('date가 필요해요.');
  const row = sanitizeClinicRecordPayload({
    ...payload,
    mode: 'academy',
    academy_id: academyId,
    user_id: user.id,
  });
  const mutation = row.id
    ? supabase.from('clinic_records').upsert(row, { onConflict: 'id' })
    : supabase.from('clinic_records').insert(row);
  const { data, error } = await mutation
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClinicRecord(id, patch = {}, { expectedUpdatedAt } = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeClinicRecordPayload(patch, {
    strip: ['id', 'mode', 'academy_id', 'user_id', 'created_at', 'updated_at'],
  });
  if (Object.keys(safe).length === 0) {
    throw new Error('변경할 항목이 없어요.');
  }
  let query = supabase
    .from('clinic_records')
    .update(safe)
    .eq('id', id);
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);
  const { data, error } = await query.select().maybeSingle();
  if (error) throw error;
  if (!data) throw createDataConflictError('다른 기기에서 이 클리닉 기록을 먼저 수정했어요. 최신 기록을 다시 열어주세요.');
  return data;
}

export async function deleteClinicRecord(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { data, error } = await supabase
    .from('clinic_records')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('삭제 권한이 없거나 이미 삭제된 기록이에요. 목록을 새로고침해주세요.');
  return data;
}

// ────────────────────────────────────────────────────────────────
// clinic_events / clinic_event_students
// 반은 선택적인 학생 불러오기 수단일 뿐이며, 실제 참여 명단은 일정별로 저장한다.
// ────────────────────────────────────────────────────────────────

export async function listAcademyClinicEvents(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('clinic_events')
    .select(`
      *,
      clinic_event_students (
        student_id,
        subject_override,
        sort_order
      )
    `)
    .eq('academy_id', academyId)
    .neq('status', 'cancelled')
    .order('event_date', { ascending: false })
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveAcademyClinicEvent({
  id = null,
  academyId,
  name,
  date,
  startTime = null,
  endTime = null,
  subject = null,
  room = null,
  classGroupId = null,
  memo = null,
  participants = [],
} = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!String(name || '').trim()) throw new Error('클리닉 이름을 입력해주세요.');
  if (!date) throw new Error('클리닉 날짜를 선택해주세요.');
  const { data, error } = await supabase.rpc('save_academy_clinic_event', {
    p_event_id: id || null,
    p_academy_id: academyId,
    p_name: String(name).trim(),
    p_event_date: date,
    p_start_time: startTime || null,
    p_end_time: endTime || null,
    p_subject: subject || null,
    p_room: room || null,
    p_class_group_id: classGroupId || null,
    p_memo: memo || null,
    p_participants: participants.map((participant) => ({
      student_id: participant.studentId,
      subject: participant.subject || null,
    })),
  });
  if (error) throw error;
  return data;
}

export async function deleteAcademyClinicEvent(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('클리닉 일정 id가 필요해요.');
  const { error } = await supabase.from('clinic_events').delete().eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// academy_calendar_events
// 학원 방학, 학교 시험, 학교 일정처럼 수업과 나란히 보이는 공통 일정.
// 저장/삭제 RPC가 휴원 일정과 class_session_exceptions를 한 트랜잭션으로 묶는다.
// ────────────────────────────────────────────────────────────────

export async function listAcademyCalendarEvents(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('academy_calendar_events')
    .select('*')
    .eq('academy_id', academyId)
    .is('deleted_at', null)
    .order('start_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) throw error;
  return data ?? [];
}

export async function saveAcademyCalendarEvent({ academyId, id = null, event } = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!event || typeof event !== 'object') throw new Error('일정 정보가 필요해요.');
  const { data, error } = await supabase.rpc('save_academy_calendar_event', {
    p_academy_id: academyId,
    p_event: event,
    p_event_id: id || null,
  });
  if (error) {
    if (['42883', 'PGRST202', '42P01'].includes(error.code)) {
      throw new Error('학원 일정 기능이 아직 서버에 적용되지 않았어요. SQL 068을 먼저 실행해주세요.');
    }
    throw error;
  }
  return data ?? null;
}

export async function deleteAcademyCalendarEvent(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('일정 id가 필요해요.');
  const { data, error } = await supabase.rpc('delete_academy_calendar_event', {
    p_event_id: id,
  });
  if (error) {
    if (['42883', 'PGRST202', '42P01'].includes(error.code)) {
      throw new Error('학원 일정 기능이 아직 서버에 적용되지 않았어요. SQL 068을 먼저 실행해주세요.');
    }
    throw error;
  }
  return data;
}

// ────────────────────────────────────────────────────────────────
// exam_results
// ────────────────────────────────────────────────────────────────

export async function listAcademyExamResults(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('exam_results')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .order('exam_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createAcademyExamResult({ academyId, ...payload } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!payload.student_id) throw new Error('학생을 선택해주세요.');
  const row = sanitizeExamResultPayload({
    ...payload,
    mode: 'academy',
    academy_id: academyId,
    user_id: user.id,
  });
  const { data, error } = await supabase
    .from('exam_results')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExamResult(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeExamResultPayload(patch, {
    strip: ['id', 'mode', 'academy_id', 'user_id', 'student_id', 'created_at', 'updated_at'],
  });
  if (Object.keys(safe).length === 0) throw new Error('변경할 항목이 없어요.');
  const { data, error } = await supabase
    .from('exam_results')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExamResult(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase.from('exam_results').delete().eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// payments
// unique (class_group_id, student_id, month).
// class_group_id NULL 일 때는 PG 표준상 unique 가 작동하지 않음 → 호출처에서
// dedupe 책임. 자동 월별 생성은 createAcademyPaymentsBulk 로 한 번에.
// status 는 'unpaid' | 'paid' | 'partial' | 'waived' | 'overdue' 만 허용 (DB check).
// ────────────────────────────────────────────────────────────────

export async function listAcademyPayments(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .order('month', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listAcademyPaymentsByStudent(academyId, studentServerId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!studentServerId) throw new Error('studentServerId가 필요해요.');
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .eq('student_id', studentServerId)
    .order('month', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listAcademyPaymentsByMonth(academyId, month) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!month) throw new Error('month가 필요해요.');
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .eq('month', month);
  if (error) throw error;
  return data ?? [];
}

export async function createAcademyPayment({ academyId, ...payload } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!payload.student_id) throw new Error('student_id가 필요해요.');
  if (!payload.month) throw new Error('month가 필요해요.');
  const row = sanitizePaymentPayload({
    ...payload,
    mode: 'academy',
    academy_id: academyId,
    user_id: user.id,
  });
  const { data, error } = await supabase
    .from('payments')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 자동 월별 생성용 bulk insert. payments 빈 배열이면 skip.
// 호출처에서 dedupe(같은 class_group+student+month 중복 제거) 되어 있어야 안전.
export async function createAcademyPaymentsBulk({ academyId, payments } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!Array.isArray(payments) || payments.length === 0) return [];
  const rows = payments.map((p) =>
    sanitizePaymentPayload({
      ...p,
      mode: 'academy',
      academy_id: academyId,
      user_id: user.id,
    })
  );
  for (const r of rows) {
    if (!r.student_id || !r.month) {
      throw new Error('student_id / month 가 누락된 수납이 있어요.');
    }
  }
  const { data, error } = await supabase
    .from('payments')
    .insert(rows)
    .select();
  if (!error) return data ?? [];
  if (error.code !== '23505') throw error;

  // 두 기기가 같은 달 자동 수납을 거의 동시에 생성하면 묶음 INSERT 전체가
  // unique 충돌로 취소될 수 있다. 그 경우에만 행별로 재시도하고, 이미 생긴
  // 학생 월 청구는 기존 row를 반환해 한 기기만 저장된 것처럼 보이지 않게 한다.
  const resolved = [];
  for (const row of rows) {
    const inserted = await supabase.from('payments').insert(row).select().maybeSingle();
    if (!inserted.error) {
      if (inserted.data) resolved.push(inserted.data);
      continue;
    }
    if (inserted.error.code !== '23505') throw inserted.error;

    let existingQuery = supabase
      .from('payments')
      .select('*')
      .eq('academy_id', academyId)
      .eq('student_id', row.student_id)
      .eq('month', row.month);
    existingQuery = row.class_group_id
      ? existingQuery.eq('class_group_id', row.class_group_id)
      : existingQuery.is('class_group_id', null);
    if (row.payment_kind) existingQuery = existingQuery.eq('payment_kind', row.payment_kind);
    const existing = await existingQuery.maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) resolved.push(existing.data);
  }
  return resolved;
}

export async function updatePayment(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizePaymentPayload(patch, {
    strip: ['id', 'mode', 'academy_id', 'user_id', 'created_at', 'updated_at'],
  });
  if (Object.keys(safe).length === 0) {
    throw new Error('변경할 항목이 없어요.');
  }
  const { data, error } = await supabase
    .from('payments')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePayment(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// payrolls
// unique (academy_id, staff_type, staff_id, month).
// 자동 월별 재계산이 같은 달의 행을 모두 교체하기 때문에 bulk 는 upsert
// (onConflict='academy_id,staff_type,staff_id,month') 로 처리해 덮어쓴다.
// staff_id 는 text — 현재 local staff id 또는 'owner' 문자열을 그대로 저장.
// ────────────────────────────────────────────────────────────────

export async function listAcademyPayrolls(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('payrolls')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .order('month', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listAcademyPayrollsByStaff(academyId, staffType, staffId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!staffType) throw new Error('staffType가 필요해요.');
  if (!staffId) throw new Error('staffId가 필요해요.');
  const { data, error } = await supabase
    .from('payrolls')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .eq('staff_type', staffType)
    .eq('staff_id', staffId)
    .order('month', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listAcademyPayrollsByMonth(academyId, month) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!month) throw new Error('month가 필요해요.');
  const { data, error } = await supabase
    .from('payrolls')
    .select('*')
    .eq('mode', 'academy')
    .eq('academy_id', academyId)
    .eq('month', month);
  if (error) throw error;
  return data ?? [];
}

export async function createAcademyPayroll({ academyId, ...payload } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!payload.staff_type) throw new Error('staff_type가 필요해요.');
  if (!payload.staff_id) throw new Error('staff_id가 필요해요.');
  if (!payload.month) throw new Error('month가 필요해요.');
  const row = sanitizePayrollPayload({
    ...payload,
    mode: 'academy',
    academy_id: academyId,
    user_id: user.id,
  });
  const { data, error } = await supabase
    .from('payrolls')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 자동 월별 재계산용 bulk upsert. payrolls 빈 배열이면 skip.
// 동일 (academy, staff_type, staff_id, month) 행이 있으면 덮어쓰기.
export async function createAcademyPayrollsBulk({ academyId, payrolls } = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!Array.isArray(payrolls) || payrolls.length === 0) return [];
  const rows = payrolls.map((p) =>
    sanitizePayrollPayload({
      ...p,
      mode: 'academy',
      academy_id: academyId,
      user_id: user.id,
    })
  );
  for (const r of rows) {
    if (!r.staff_type || !r.staff_id || !r.month) {
      throw new Error('staff_type / staff_id / month 가 누락된 급여가 있어요.');
    }
  }
  const { data, error } = await supabase
    .from('payrolls')
    .upsert(rows, { onConflict: 'academy_id,staff_type,staff_id,month' })
    .select();
  if (error) throw error;
  return data ?? [];
}

export async function updatePayroll(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizePayrollPayload(patch, {
    strip: ['id', 'mode', 'academy_id', 'user_id', 'created_at', 'updated_at'],
  });
  if (Object.keys(safe).length === 0) {
    throw new Error('변경할 항목이 없어요.');
  }
  const { data, error } = await supabase
    .from('payrolls')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePayroll(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase.from('payrolls').delete().eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// academy_staff_shifts (Phase 30/31 — SQL 006)
// ────────────────────────────────────────────────────────────────
//
// 한 행 = 한 명 staff 의 하루(또는 슬롯) 근무 기록.
// RLS: owner 는 학원 전체, staff 는 본인 row 만.

const STAFF_SHIFT_ALLOWED_FIELDS = new Set([
  'id', 'academy_id', 'staff_user_id', 'staff_role',
  'date',
  'scheduled_start_time', 'scheduled_end_time',
  'actual_start_time', 'actual_end_time',
  'break_minutes', 'status', 'memo',
]);

function sanitizeStaffShiftPayload(input, { strip = [] } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!STAFF_SHIFT_ALLOWED_FIELDS.has(key)) continue;
    if (strip.includes(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export async function listAcademyStaffShifts(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('academy_staff_shifts')
    .select('*')
    .eq('academy_id', academyId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createAcademyStaffShift({ academyId, ...payload } = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const row = sanitizeStaffShiftPayload({
    ...payload,
    academy_id: academyId,
  }, { strip: ['id', 'created_at', 'updated_at'] });
  const { data, error } = await supabase
    .from('academy_staff_shifts')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAcademyStaffShift(id, patch = {}) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const safe = sanitizeStaffShiftPayload(patch, {
    strip: ['id', 'academy_id', 'created_at', 'updated_at'],
  });
  if (Object.keys(safe).length === 0) return null;
  const { data, error } = await supabase
    .from('academy_staff_shifts')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAcademyStaffShift(id) {
  assertSupabaseConfigured();
  if (!id) throw new Error('id가 필요해요.');
  const { error } = await supabase
    .from('academy_staff_shifts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// internal helpers
// ────────────────────────────────────────────────────────────────

const STUDENT_ALLOWED_FIELDS = new Set([
  'id', 'academy_id', 'user_id', 'mode',
  'name', 'school_type', 'school_name', 'grade',
  'phone', 'parent_phone', 'parent_title', 'parent_title_custom', 'parent_name',
  'enrollment_date', 'status', 'memo', 'class_group_ids',
  'checkin_pin',
  'base_tuition', 'tuition_subjects', 'tuition_source',
  'tuition_effective_from', 'tuition_effective_to', 'grade_reference_year',
  'clinic_record_fields', 'clinic_default_activity_type', 'clinic_default_items',
]);

function sanitizeStudentPayload(input, { strip = [] } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!STUDENT_ALLOWED_FIELDS.has(key)) continue;
    if (strip.includes(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const EXAM_RESULT_ALLOWED_FIELDS = new Set([
  'academy_id', 'user_id', 'mode', 'student_id',
  'exam_name', 'exam_type', 'subject', 'exam_date',
  'score', 'max_score', 'grade', 'memo',
]);

function sanitizeExamResultPayload(input, { strip = [] } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!EXAM_RESULT_ALLOWED_FIELDS.has(key)) continue;
    if (strip.includes(key) || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const CLASS_GROUP_ALLOWED_FIELDS = new Set([
  'id', 'academy_id', 'user_id', 'mode',
  'name', 'subject', 'level',
  'activity_type', 'activity_name', 'record_blocks', 'record_schema',
  'initial_homework', 'initial_next_plan',
  'teacher_id', 'teacher_type',
  // Phase 44 — server-stable auth.users.id 매칭용 (SQL 013)
  'teacher_user_id',
  'student_ids', 'weekdays',
  'start_time', 'end_time', 'room',
  'start_date', 'end_date',
  'billing_mode', 'default_billing', 'student_billings',
  'fee_policy', 'additional_fee_type', 'additional_fee_amount',
  'memo', 'status',
  // Phase 35 — 보조강사 배정 영속화 (SQL 008)
  'assistant_ids',
]);

function sanitizeClassGroupPayload(input, { strip = [] } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!CLASS_GROUP_ALLOWED_FIELDS.has(key)) continue;
    if (strip.includes(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const CLASS_SESSION_ALLOWED_FIELDS = new Set([
  'id', 'academy_id', 'user_id', 'mode',
  'class_group_id', 'date',
  'start_time', 'end_time', 'room',
  'teacher_id', 'teacher_type',
  // Phase 44 — server-stable auth.users.id 매칭용 (SQL 013)
  'teacher_user_id',
  'student_ids', 'status', 'memo',
  'record_schema', 'activity_type', 'activity_name', 'session_kind', 'origin_session_id',
  // Phase 30 — 대체 강사 (SQL 006 에서 추가됨)
  'substitute_teacher_user_id', 'substitute_reason',
  // Phase 35 — 보조강사 배정 영속화 (SQL 008)
  'assistant_ids',
]);

function sanitizeClassSessionPayload(input, { strip = [] } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!CLASS_SESSION_ALLOWED_FIELDS.has(key)) continue;
    if (strip.includes(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const LESSON_RECORD_ALLOWED_FIELDS = new Set([
  'id', 'academy_id', 'user_id', 'mode',
  'class_group_id', 'class_session_id', 'date', 'teacher_id',
  'common_progress', 'common_lesson_content', 'common_homework',
  'next_lesson_plan', 'teacher_memo',
  'common_custom_values',
  'student_records',
  'ai_parent_notice', 'ai_student_homework_notice',
]);

function sanitizeLessonRecordPayload(input, { strip = [] } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!LESSON_RECORD_ALLOWED_FIELDS.has(key)) continue;
    if (strip.includes(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const ATTENDANCE_ALLOWED_FIELDS = new Set([
  'id', 'academy_id', 'user_id', 'mode',
  'class_group_id', 'class_session_id', 'student_id',
  'date', 'status', 'memo',
  // Phase 41 — SQL 011 추가 컬럼.
  'source', 'checked_at',
  // SQL 049 — 등원 기반 추론과 선생님 확정 분리.
  'confirmation_state', 'confirmed_at', 'confirmed_by',
]);

function sanitizeAttendancePayload(input, { strip = [] } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!ATTENDANCE_ALLOWED_FIELDS.has(key)) continue;
    if (strip.includes(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const CLINIC_RECORD_ALLOWED_FIELDS = new Set([
  'id', 'academy_id', 'user_id', 'mode',
  'student_id', 'class_group_id', 'class_session_id', 'clinic_event_id',
  'date', 'subject', 'teacher_id', 'assistant_id',
  'activity_type', 'activity_name',
  'source_lesson_record_id', 'source_support_tags', 'source_support_memo',
  'items', 'overall_memo',
  'created_by_role', 'created_by_id',
]);

function sanitizeClinicRecordPayload(input, { strip = [] } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!CLINIC_RECORD_ALLOWED_FIELDS.has(key)) continue;
    if (strip.includes(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const PAYMENT_ALLOWED_FIELDS = new Set([
  'id', 'academy_id', 'user_id', 'mode',
  'student_id', 'class_group_id', 'month',
  'amount', 'due_date', 'paid_date', 'status',
  'payer_name', 'memo',
  'payment_kind', 'billing_snapshot',
]);

function sanitizePaymentPayload(input, { strip = [] } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!PAYMENT_ALLOWED_FIELDS.has(key)) continue;
    if (strip.includes(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const PAYROLL_ALLOWED_FIELDS = new Set([
  'id', 'academy_id', 'user_id', 'mode',
  'staff_type', 'staff_id', 'staff_user_id', 'month',
  'wage_type', 'hourly_wage', 'monthly_salary',
  'total_hours', 'completed_session_count', 'completed_clinic_count',
  'amount', 'status', 'paid_date', 'memo',
]);

function sanitizePayrollPayload(input, { strip = [] } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!PAYROLL_ALLOWED_FIELDS.has(key)) continue;
    if (strip.includes(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}
