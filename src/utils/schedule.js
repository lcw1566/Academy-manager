// schedule.js — Phase 44.5 / Phase A
//
// 룰/예외로부터 예정 스케줄을 런타임에 렌더링하는 순수 helper.
//
// 호출처는 Phase B 에서 본격 연결된다. 현재는 정의만 + 단위 테스트 가능 형태.
//
// 입력 데이터는 모두 DB row 형식 (snake_case). 출력은 carry-over 가 쉬운
// "planned item" 형태 (camelCase + 명확한 의미 분리).
//
// 시간/날짜 처리 규약:
//   - 날짜 : 'YYYY-MM-DD' 문자열
//   - 시간 : 'HH:mm' 문자열
//   - day_of_week : 0=일, 1=월, ..., 6=토 (JavaScript Date.getDay() 와 동일)
//
// 모든 함수는 어떤 외부 상태(store, fetch)도 건드리지 않는다.

import { parseYMD, formatDateToYMD } from './date';

// ─────────────────────────────────────────────────────────────────
// 범용 유틸
// ─────────────────────────────────────────────────────────────────

export function isYMDInRange(ymd, fromYMD, toYMD) {
  if (!ymd) return false;
  if (fromYMD && ymd < fromYMD) return false;
  if (toYMD && ymd > toYMD) return false;
  return true;
}

// 'YYYY-MM-DD' 두 사이의 모든 날짜 배열.
export function enumerateDates(fromYMD, toYMD) {
  if (!fromYMD || !toYMD) return [];
  const result = [];
  const start = parseYMD(fromYMD);
  const end = parseYMD(toYMD);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cur <= end) {
    result.push(formatDateToYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// 이번 주 [월~일] 시작/끝 YMD 반환. tz 의존 없이 local 기준.
export function getWeekRangeYMD(refDate = new Date()) {
  const d = new Date(refDate);
  const dow = d.getDay(); // 0=Sun
  // 월요일 시작. dow=0(일) → -6, dow=1(월) → 0, ...
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { fromYMD: formatDateToYMD(monday), toYMD: formatDateToYMD(sunday) };
}

// YYYY-MM-DD → JS day_of_week (0=Sun ... 6=Sat).
export function dayOfWeekOfYMD(ymd) {
  const d = parseYMD(ymd);
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay();
}

// rule.effective_start_date 와 effective_end_date 가 ymd 를 포함하는지.
function isRuleActiveOnDate(rule, ymd) {
  if (!rule) return false;
  if (rule.is_active === false) return false;
  if (rule.effective_start_date && ymd < rule.effective_start_date) return false;
  if (rule.effective_end_date && ymd > rule.effective_end_date) return false;
  return true;
}


// ─────────────────────────────────────────────────────────────────
// Staff schedule
// ─────────────────────────────────────────────────────────────────

// 룰+예외로부터 직원의 예정 근무 목록 생성.
//
// 입력:
//   rules        : academy_staff_work_rules row 배열
//   exceptions   : academy_staff_work_exceptions row 배열
//   fromDate     : 'YYYY-MM-DD'
//   toDate       : 'YYYY-MM-DD'
//   staffUserId  : (선택) 이 user 한 명만 필터링
//
// 출력 (정렬: date 오름차순, 같은 날은 startTime 오름차순):
//   [{
//     id, source: 'rule' | 'exception',
//     staffUserId, staffRole,
//     date, startTime, endTime, breakMinutes,
//     ruleId | exceptionId, exceptionType,
//     memo,
//   }, ...]
//
// 예외 적용 규칙:
//   - exception.type='cancel'  : 그 날 룰 기반 항목 제거
//   - exception.type='change'  : 그 날 룰 기반 항목의 시간/휴게를 덮어씀
//   - exception.type='extra'   : 룰과 무관하게 추가 항목
export function buildPlannedStaffSchedule({ rules = [], exceptions = [], fromDate, toDate, staffUserId } = {}) {
  if (!fromDate || !toDate) return [];
  const result = [];
  // 사전 필터링.
  const filteredRules = rules.filter((r) => !staffUserId || r.staff_user_id === staffUserId);
  const filteredExceptions = exceptions.filter((e) => {
    if (staffUserId && e.staff_user_id !== staffUserId) return false;
    return isYMDInRange(e.date, fromDate, toDate);
  });

  // 1) 룰 → 날짜별 항목 생성, 동시에 cancel/change 예외 적용.
  for (const ymd of enumerateDates(fromDate, toDate)) {
    const dow = dayOfWeekOfYMD(ymd);
    if (dow == null) continue;
    for (const rule of filteredRules) {
      if (rule.day_of_week !== dow) continue;
      if (!isRuleActiveOnDate(rule, ymd)) continue;
      const relatedExc = filteredExceptions.find(
        (e) => e.staff_user_id === rule.staff_user_id
          && e.date === ymd
          && (e.type === 'cancel' || e.type === 'change'),
      );
      if (relatedExc?.type === 'cancel') continue;
      const startTime = relatedExc?.start_time || rule.start_time || '';
      const endTime = relatedExc?.end_time || rule.end_time || '';
      const breakMinutes = relatedExc?.break_minutes ?? rule.break_minutes ?? 0;
      result.push({
        id: `rule:${rule.id}:${ymd}`,
        source: 'rule',
        staffUserId: rule.staff_user_id,
        staffRole: rule.staff_role,
        date: ymd,
        startTime,
        endTime,
        breakMinutes,
        ruleId: rule.id,
        exceptionId: relatedExc?.id || null,
        exceptionType: relatedExc?.type || null,
        memo: relatedExc?.memo || rule.memo || '',
      });
    }
  }

  // 2) 'extra' 예외 → 별도 추가.
  for (const exc of filteredExceptions) {
    if (exc.type !== 'extra') continue;
    if (!exc.start_time || !exc.end_time) continue;
    result.push({
      id: `exc:${exc.id}`,
      source: 'exception',
      staffUserId: exc.staff_user_id,
      staffRole: null, // 룰이 없으니 role 모름. UI 가 별도 조회.
      date: exc.date,
      startTime: exc.start_time,
      endTime: exc.end_time,
      breakMinutes: exc.break_minutes ?? 0,
      ruleId: null,
      exceptionId: exc.id,
      exceptionType: 'extra',
      memo: exc.memo || '',
    });
  }

  // 3) 정렬.
  result.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
  return result;
}

// 오늘 한 명의 예정 근무 (가장 빠른 1건 또는 전부).
export function getTodayPlannedWork(staffUserId, todayYMD, { rules, exceptions } = {}) {
  if (!staffUserId || !todayYMD) return [];
  return buildPlannedStaffSchedule({
    rules, exceptions, fromDate: todayYMD, toDate: todayYMD, staffUserId,
  });
}

// 이번 주 한 명의 예정 근무.
export function getWeekPlannedWork(staffUserId, refDate = new Date(), { rules, exceptions } = {}) {
  const { fromYMD, toYMD } = getWeekRangeYMD(refDate);
  return buildPlannedStaffSchedule({
    rules, exceptions, fromDate: fromYMD, toDate: toYMD, staffUserId,
  });
}


// ─────────────────────────────────────────────────────────────────
// Class schedule
// ─────────────────────────────────────────────────────────────────

// class_schedule_rules + class_session_exceptions 로부터 예정 수업 목록.
//
// 출력:
//   [{
//     id, source: 'rule' | 'exception',
//     classGroupId, date, startTime, endTime,
//     teacherUserId, assistantIds (array),
//     substituteTeacherUserId,
//     room, exceptionType,
//     reason, memo,
//   }, ...]
//
// 예외 규칙:
//   - 'cancel'     : 그 날 룰 기반 회차 제거
//   - 'reschedule' : 시간 변경
//   - 'substitute' : substitute_teacher_user_id / teacher_user_id 덮어씀
//   - 'extra'      : 룰 외 추가 회차
export function buildPlannedClassSessions({ rules = [], exceptions = [], fromDate, toDate, classGroupId } = {}) {
  if (!fromDate || !toDate) return [];
  const filteredRules = rules.filter((r) => !classGroupId || r.class_group_id === classGroupId);
  const filteredExceptions = exceptions.filter((e) => {
    if (classGroupId && e.class_group_id !== classGroupId) return false;
    return isYMDInRange(e.session_date, fromDate, toDate);
  });

  const result = [];

  for (const ymd of enumerateDates(fromDate, toDate)) {
    const dow = dayOfWeekOfYMD(ymd);
    if (dow == null) continue;
    for (const rule of filteredRules) {
      if (!rule.is_active) continue;
      if (rule.day_of_week !== dow) continue;
      const relatedExc = filteredExceptions.find(
        (e) => e.class_group_id === rule.class_group_id
          && e.session_date === ymd
          && (e.type === 'cancel' || e.type === 'reschedule' || e.type === 'substitute'),
      );
      if (relatedExc?.type === 'cancel') continue;
      const startTime = relatedExc?.start_time || rule.start_time || '';
      const endTime = relatedExc?.end_time || rule.end_time || '';
      result.push({
        id: `rule:${rule.id}:${ymd}`,
        source: 'rule',
        classGroupId: rule.class_group_id,
        date: ymd,
        startTime,
        endTime,
        teacherUserId: relatedExc?.teacher_user_id || rule.teacher_user_id || null,
        assistantIds: Array.isArray(relatedExc?.assistant_ids)
          ? relatedExc.assistant_ids
          : Array.isArray(rule.assistant_ids) ? rule.assistant_ids : [],
        substituteTeacherUserId: relatedExc?.substitute_teacher_user_id || null,
        room: relatedExc?.start_time ? null : (rule.room || null),
        exceptionId: relatedExc?.id || null,
        exceptionType: relatedExc?.type || null,
        reason: relatedExc?.reason || null,
        memo: relatedExc?.memo || null,
      });
    }
  }

  // 'extra'
  for (const exc of filteredExceptions) {
    if (exc.type !== 'extra') continue;
    if (!exc.start_time || !exc.end_time) continue;
    result.push({
      id: `exc:${exc.id}`,
      source: 'exception',
      classGroupId: exc.class_group_id,
      date: exc.session_date,
      startTime: exc.start_time,
      endTime: exc.end_time,
      teacherUserId: exc.teacher_user_id || null,
      assistantIds: Array.isArray(exc.assistant_ids) ? exc.assistant_ids : [],
      substituteTeacherUserId: exc.substitute_teacher_user_id || null,
      room: null,
      exceptionId: exc.id,
      exceptionType: 'extra',
      reason: exc.reason || null,
      memo: exc.memo || null,
    });
  }

  result.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
  return result;
}

export function getTodayClassSessions(todayYMD, { rules, exceptions, classGroupId } = {}) {
  if (!todayYMD) return [];
  return buildPlannedClassSessions({ rules, exceptions, fromDate: todayYMD, toDate: todayYMD, classGroupId });
}

export function getWeekClassSessions(refDate = new Date(), { rules, exceptions, classGroupId } = {}) {
  const { fromYMD, toYMD } = getWeekRangeYMD(refDate);
  return buildPlannedClassSessions({ rules, exceptions, fromDate: fromYMD, toDate: toYMD, classGroupId });
}


// ─────────────────────────────────────────────────────────────────
// 미래 row 생성 윈도우 (compat)
// ─────────────────────────────────────────────────────────────────

// Phase A — 미래 row 사전 생성을 14일 이내로 제한하기 위한 helper.
//   - 사용자가 endDate 를 6개월 뒤로 잡아도, 사전 생성은 today+14 일까지만.
//   - Phase B 에서 룰 기반 렌더가 도입되면 이 cap 자체가 의미를 잃지만,
//     그 전까지는 "장기 누적 방지" 안전망 역할.
export const FUTURE_GENERATION_WINDOW_DAYS = 14;

export function clampGenerationEndDate(originalEndYMD, { todayYMD, windowDays = FUTURE_GENERATION_WINDOW_DAYS } = {}) {
  if (!todayYMD) return originalEndYMD || null;
  const today = parseYMD(todayYMD);
  if (Number.isNaN(today.getTime())) return originalEndYMD || null;
  const capDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + windowDays);
  const capYMD = formatDateToYMD(capDate);
  if (!originalEndYMD) return capYMD;
  // 두 후보 중 더 빠른 날짜 반환.
  return originalEndYMD < capYMD ? originalEndYMD : capYMD;
}

// 사용자가 입력한 종료일이 cap 보다 뒤면 true. UI 에서 안내 toast 트리거에 사용.
export function isGenerationCapped(originalEndYMD, { todayYMD, windowDays = FUTURE_GENERATION_WINDOW_DAYS } = {}) {
  if (!originalEndYMD) return true; // 무기한 → 항상 capped
  const capped = clampGenerationEndDate(originalEndYMD, { todayYMD, windowDays });
  return capped !== originalEndYMD;
}


// ─────────────────────────────────────────────────────────────────
// Phase 44.6 / Phase B — 머지 헬퍼 (planned 룰 + actual legacy row)
// ─────────────────────────────────────────────────────────────────
//
// 룰/예외로 계산한 planned 항목과 기존 academy_staff_shifts /
// class_sessions 의 actual 행을 합쳐 중복 없는 단일 목록을 만든다.
//
// 중복 키:
//   - 수업 : `${date}__${classGroupId}__${startTime}`
//   - 직원 : `${date}__${staffUserId or staffId}__${scheduledStartTime}`
//
// 실제(legacy) 행이 키와 일치하면 planned 는 제거된다. 즉 "실제 우선".
// 14일 안에서는 모든 항목이 actual 로 노출되고, 14일 너머는 planned 만 노출.

// 수업: planned 항목을 classSession 모양으로 변환해 반환.
// 기존 뷰가 classSession 모양을 기대하므로 호환을 위해 동일 필드 사용.
//   - id           : `planned:${rule.id || exception.id}:${ymd}`
//   - classGroupId : group 의 local id (planned 항목은 group serverId 기준이므로
//                    호출자가 group lookup 으로 local id 매핑 후 넣어줘야 함)
//   - studentIds   : group.studentIds (호출자가 주입)
//   - status       : 'scheduled'
//   - isPlanned    : true  (UI 가 라벨 분기에 사용)
//
// 호출자는 plannedItems 에 group → studentIds / room 등을 미리 채워 둔다.
export function mergePlannedAndActualClassSessions(plannedItems = [], actualSessions = []) {
  const actualKeys = new Set();
  const out = [];
  for (const s of actualSessions) {
    if (!s) continue;
    out.push({ ...s, isPlanned: false });
    const k = `${s.date}__${s.classGroupId}__${(s.startTime || '').slice(0, 5)}`;
    actualKeys.add(k);
  }
  for (const p of plannedItems) {
    if (!p) continue;
    const k = `${p.date}__${p.classGroupId}__${(p.startTime || '').slice(0, 5)}`;
    if (actualKeys.has(k)) continue;
    out.push({ ...p, isPlanned: true });
  }
  out.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
  return out;
}

// 직원: planned 항목을 academyStaffShifts 모양으로 변환해 반환.
//   - id              : `planned:${rule.id || exception.id}:${ymd}`
//   - staffId         : 호출자가 룰의 staff_user_id 를 local staffId 로 매핑해서 넣어줘야 함.
//   - staffRole       : 룰의 staff_role
//   - date            : 'YYYY-MM-DD'
//   - scheduledStartTime / scheduledEndTime
//   - actualStartTime / actualEndTime : null
//   - status          : 'scheduled'
//   - breakMinutes
//   - isPlanned       : true
export function mergePlannedAndActualStaffShifts(plannedItems = [], actualShifts = []) {
  // 중복 키는 (date + staffId + scheduledStartTime) 와 (date + staffUserId + scheduledStartTime)
  // 둘 다로 잡는다. legacy 행은 staffId 만, planned 는 staffUserId 가 있을 수 있어서.
  const keysByStaffId = new Set();
  const keysByStaffUserId = new Set();
  const out = [];
  for (const sh of actualShifts) {
    if (!sh) continue;
    if (sh.status === 'canceled') continue;
    out.push({ ...sh, isPlanned: false });
    const t = (sh.scheduledStartTime || '').slice(0, 5);
    if (sh.staffId) keysByStaffId.add(`${sh.date}__${sh.staffId}__${t}`);
    if (sh.staffUserId) keysByStaffUserId.add(`${sh.date}__${sh.staffUserId}__${t}`);
  }
  for (const p of plannedItems) {
    if (!p) continue;
    const t = (p.scheduledStartTime || p.startTime || '').slice(0, 5);
    if (p.staffId && keysByStaffId.has(`${p.date}__${p.staffId}__${t}`)) continue;
    if (p.staffUserId && keysByStaffUserId.has(`${p.date}__${p.staffUserId}__${t}`)) continue;
    out.push({ ...p, isPlanned: true });
  }
  out.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.scheduledStartTime || a.startTime || '').localeCompare(b.scheduledStartTime || b.startTime || '');
  });
  return out;
}

// planned class items 를 classSession 모양으로 변환 (UI 호환).
// 입력: buildPlannedClassSessions 결과 + class_groups 배열.
export function plannedToClassSessionShape(plannedItems = [], classGroups = []) {
  const byServerId = new Map();
  const byLocalId = new Map();
  for (const g of classGroups) {
    if (g.serverId) byServerId.set(g.serverId, g);
    if (g.id) byLocalId.set(g.id, g);
  }
  const out = [];
  for (const p of plannedItems) {
    // p.classGroupId 는 룰 row 의 server uuid → local id 로 매핑.
    const group = byServerId.get(p.classGroupId) || byLocalId.get(p.classGroupId) || null;
    if (!group) continue; // 모르는 그룹은 건너뜀
    out.push({
      id: p.id,
      classGroupId: group.id, // local id 로 통일
      date: p.date,
      startTime: p.startTime || '',
      endTime: p.endTime || '',
      room: p.room || group.room || '',
      teacherId: group.teacherId || '',
      teacherUserId: p.teacherUserId || group.teacherUserId || '',
      assistantUserIds: Array.isArray(p.assistantIds) ? p.assistantIds : [],
      assistantIds: [],
      studentIds: Array.isArray(group.studentIds) ? group.studentIds : [],
      status: 'scheduled',
      substituteTeacherUserId: p.substituteTeacherUserId || null,
      substituteTeacherId: null,
      substituteReason: p.reason || null,
      memo: p.memo || '',
      isPlanned: true,
      plannedSource: p.source,            // 'rule' | 'exception'
      plannedExceptionType: p.exceptionType || null,
    });
  }
  return out;
}

// planned staff items 를 academyStaffShifts 모양으로 변환 (UI 호환).
// 입력: buildPlannedStaffSchedule 결과 + academyTeachers/academyAssistants
//   (staff_user_id → local staffId 매핑용).
export function plannedToStaffShiftShape(plannedItems = [], { academyTeachers = [], academyAssistants = [] } = {}) {
  const teacherByUserId = new Map();
  for (const t of academyTeachers) {
    if (t?.serverUserId) teacherByUserId.set(t.serverUserId, t);
  }
  const assistantByUserId = new Map();
  for (const a of academyAssistants) {
    if (a?.serverUserId) assistantByUserId.set(a.serverUserId, a);
  }
  const out = [];
  for (const p of plannedItems) {
    const role = p.staffRole;
    let localStaff = null;
    if (role === 'teacher') localStaff = teacherByUserId.get(p.staffUserId) || null;
    else if (role === 'assistant') localStaff = assistantByUserId.get(p.staffUserId) || null;
    else {
      // role 미상 (extra exception 등) — teacher/assistant 양쪽 lookup.
      localStaff = teacherByUserId.get(p.staffUserId)
        || assistantByUserId.get(p.staffUserId)
        || null;
    }
    out.push({
      id: p.id,
      staffId: localStaff?.id || '',
      staffUserId: p.staffUserId,
      staffRole: role || (localStaff?._role ?? 'teacher'),
      date: p.date,
      scheduledStartTime: p.startTime || '',
      scheduledEndTime: p.endTime || '',
      breakMinutes: p.breakMinutes ?? 0,
      actualStartTime: null,
      actualEndTime: null,
      status: 'scheduled',
      memo: p.memo || '',
      isPlanned: true,
      plannedSource: p.source,
      plannedExceptionType: p.exceptionType || null,
    });
  }
  return out;
}

