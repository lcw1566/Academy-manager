// hydrateMappers.js
//
// 서버(snake_case) → local(camelCase) 변환기.
// Phase 16 read-first 의 수동 hydrate 에 사용.
//
// 매핑 원칙:
//   - server.id 를 local.id 로 그대로 사용 → 다중 디바이스에서 동일 row 식별 가능
//   - local.serverId 에도 동일 uuid 를 명시적으로 저장 → 기존 write-through 가 그대로 작동
//   - 1:1 매핑인 도메인은 row 단위 변환
//   - lesson_records 는 1 server row → N local row (학생당 1행 + _common_ 1행) 로 펼침
//
// 이 매퍼는 호출처에서 충돌/머지 정책을 적용하기 전 단계의 순수 변환만 담당한다.

// ─── students ────────────────────────────────────────────────
export function mapServerStudentToLocal(s) {
  if (!s) return null;
  return {
    id: s.id,
    serverId: s.id,
    name: s.name ?? '',
    schoolType: s.school_type ?? '',
    school: s.school_name ?? '',
    grade: s.grade ?? '',
    phone: s.phone ?? '',
    parentTitle: s.parent_title ?? '',
    parentName: s.parent_name ?? '',
    parentPhone: s.parent_phone ?? '',
    enrollmentDate: s.enrollment_date ?? '',
    status: s.status ?? 'active',
    memo: s.memo ?? '',
    classGroupIds: Array.isArray(s.class_group_ids) ? s.class_group_ids : [],
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

// ─── class_groups ────────────────────────────────────────────
export function mapServerClassGroupToLocal(g) {
  if (!g) return null;
  const db = g.default_billing || {};
  const monthlyFee = Number(db.monthlyFee ?? db.monthly_fee ?? 0) || 0;
  return {
    id: g.id,
    serverId: g.id,
    name: g.name ?? '',
    subject: g.subject ?? '',
    level: g.level ?? '',
    teacherId: g.teacher_id ?? '',
    studentIds: Array.isArray(g.student_ids) ? g.student_ids : [],
    weekdays: Array.isArray(g.weekdays) ? g.weekdays : [],
    startTime: g.start_time ?? '',
    endTime: g.end_time ?? '',
    room: g.room ?? '',
    startDate: g.start_date ?? '',
    endDate: g.end_date ?? '',
    billingMode: g.billing_mode ?? 'same',
    monthlyFee,
    studentBillings:
      g.student_billings && typeof g.student_billings === 'object' ? g.student_billings : {},
    memo: g.memo ?? '',
    status: g.status ?? 'active',
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  };
}

// ─── class_sessions ──────────────────────────────────────────
export function mapServerClassSessionToLocal(cs) {
  if (!cs) return null;
  return {
    id: cs.id,
    serverId: cs.id,
    classGroupId: cs.class_group_id,
    date: cs.date,
    startTime: cs.start_time ?? '',
    endTime: cs.end_time ?? '',
    room: cs.room ?? '',
    teacherId: cs.teacher_id ?? '',
    assistantIds: [],
    studentIds: Array.isArray(cs.student_ids) ? cs.student_ids : [],
    status: cs.status ?? 'scheduled',
    memo: cs.memo ?? '',
    createdAt: cs.created_at,
    updatedAt: cs.updated_at,
  };
}

// ─── lesson_records ──────────────────────────────────────────
// 서버는 회차당 1행, jsonb student_records 안에 학생별 평가를 모은 형태.
// local 은 (sessionId, studentId) 조합당 1행 — '_common_' 학생 1행 + 실제 학생 N행.
// 따라서 1 server row → N local row 로 펼친다.
export function expandServerLessonRecordToLocal(lr) {
  if (!lr) return [];
  const baseTs = lr.updated_at || lr.created_at || new Date().toISOString();
  const rows = [];
  rows.push({
    id: `${lr.id}__common`,
    serverId: lr.id,
    sessionId: lr.class_session_id,
    classGroupId: lr.class_group_id,
    studentId: '_common_',
    date: lr.date,
    commonProgress: lr.common_progress ?? '',
    commonContent: lr.common_lesson_content ?? '',
    commonHomework: lr.common_homework ?? '',
    nextLessonPlan: lr.next_lesson_plan ?? '',
    teacherMemo: lr.teacher_memo ?? '',
    createdAt: baseTs,
    updatedAt: baseTs,
  });
  const records = lr.student_records && typeof lr.student_records === 'object'
    ? lr.student_records
    : {};
  for (const [studentUuid, rec] of Object.entries(records)) {
    rows.push({
      id: `${lr.id}__${studentUuid}`,
      serverId: lr.id, // 동일 server row 를 공유 (write-through 시 sessionId 기준 upsert)
      sessionId: lr.class_session_id,
      classGroupId: lr.class_group_id,
      studentId: studentUuid,
      date: lr.date,
      attitude: rec?.attitude ?? null,
      focus: rec?.focus ?? null,
      understanding: rec?.understanding ?? null,
      homeworkStatus: rec?.homeworkStatus ?? null,
      memo: rec?.memo ?? '',
      supportTags: Array.isArray(rec?.supportTags) ? rec.supportTags : [],
      supportMemo: rec?.supportMemo ?? '',
      createdAt: baseTs,
      updatedAt: baseTs,
    });
  }
  return rows;
}

// ─── attendance_records ──────────────────────────────────────
export function mapServerAttendanceRecordToLocal(a) {
  if (!a) return null;
  return {
    id: a.id,
    serverId: a.id,
    sessionId: a.class_session_id,
    classGroupId: a.class_group_id,
    studentId: a.student_id,
    date: a.date,
    status: a.status ?? 'present',
    memo: a.memo ?? null,
  };
}

// ─── clinic_records ──────────────────────────────────────────
export function mapServerClinicRecordToLocal(c) {
  if (!c) return null;
  return {
    id: c.id,
    serverId: c.id,
    studentId: c.student_id,
    classGroupId: c.class_group_id ?? '',
    classSessionId: c.class_session_id ?? '',
    date: c.date,
    subject: c.subject ?? '',
    sourceLessonRecordId: c.source_lesson_record_id ?? null,
    sourceSupportTags: Array.isArray(c.source_support_tags) ? c.source_support_tags : [],
    sourceSupportMemo: c.source_support_memo ?? '',
    items: Array.isArray(c.items) ? c.items : [],
    overallMemo: c.overall_memo ?? '',
    createdByRole: c.created_by_role ?? '',
    createdById: c.created_by_id ?? '',
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

// ─── payments ────────────────────────────────────────────────
export function mapServerPaymentToLocal(p) {
  if (!p) return null;
  return {
    id: p.id,
    serverId: p.id,
    studentId: p.student_id,
    classGroupId: p.class_group_id ?? '',
    month: p.month,
    amount: Number(p.amount) || 0,
    dueDate: p.due_date ?? '',
    paidDate: p.paid_date ?? '',
    status: p.status ?? 'unpaid',
    payerName: p.payer_name ?? '',
    memo: p.memo ?? '',
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

// ─── payrolls ────────────────────────────────────────────────
export function mapServerPayrollToLocal(p) {
  if (!p) return null;
  return {
    id: p.id,
    serverId: p.id,
    staffType: p.staff_type,
    staffId: p.staff_id,
    month: p.month,
    wageType: p.wage_type ?? 'monthly',
    hourlyWage: Number(p.hourly_wage) || 0,
    monthlySalary: Number(p.monthly_salary) || 0,
    totalHours: Number(p.total_hours) || 0,
    completedSessionCount: Number(p.completed_session_count) || 0,
    completedClinicCount: Number(p.completed_clinic_count) || 0,
    amount: Number(p.amount) || 0,
    status: p.status ?? 'scheduled',
    paidDate: p.paid_date ?? '',
    memo: p.memo ?? '',
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}
