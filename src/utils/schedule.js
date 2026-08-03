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

import {
  addDaysYMD,
  formatDateToYMD,
  getKoreanWeekdayIndex,
  parseYMD,
} from './date';

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
  if (fromYMD > toYMD) return [];
  const result = [];
  let current = fromYMD;
  while (current <= toYMD) {
    result.push(current);
    current = addDaysYMD(current, 1);
    if (!current) return [];
  }
  return result;
}

// 이번 주 [월~일] 시작/끝 YMD 반환. 한국 날짜 문자열 기준.
export function getWeekRangeYMD(refDate = new Date()) {
  const ymd = typeof refDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(refDate)
    ? refDate
    : formatDateToYMD(refDate);
  const dow = getKoreanWeekdayIndex(ymd);
  if (dow < 0) return { fromYMD: '', toYMD: '' };
  // 월요일 시작. dow=0(일) → -6, dow=1(월) → 0, ...
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const fromYMD = addDaysYMD(ymd, diffToMonday);
  return { fromYMD, toYMD: addDaysYMD(fromYMD, 6) };
}

// YYYY-MM-DD → JS day_of_week (0=Sun ... 6=Sat).
export function dayOfWeekOfYMD(ymd) {
  const weekday = getKoreanWeekdayIndex(ymd);
  return weekday < 0 ? null : weekday;
}

// rule.effective_start_date 와 effective_end_date 가 ymd 를 포함하는지.
function isRuleActiveOnDate(rule, ymd) {
  if (!rule) return false;
  if (rule.is_active === false) return false;
  const effectiveStartDate = rule.effective_start_date || rule.effectiveStartDate || null;
  const effectiveEndDate = rule.effective_end_date || rule.effectiveEndDate || null;
  if (effectiveStartDate && ymd < effectiveStartDate) return false;
  if (effectiveEndDate && ymd > effectiveEndDate) return false;
  const repeatIntervalWeeks = Number(rule.repeat_interval_weeks || rule.repeatIntervalWeeks) || 1;
  if (repeatIntervalWeeks > 1 && effectiveStartDate) {
    const mondayOf = (dateYMD) => {
      const dow = getKoreanWeekdayIndex(dateYMD);
      if (dow < 0) return '';
      return addDaysYMD(dateYMD, dow === 0 ? -6 : 1 - dow);
    };
    const anchorMonday = parseYMD(mondayOf(effectiveStartDate));
    const currentMonday = parseYMD(mondayOf(ymd));
    if (Number.isNaN(anchorMonday.getTime()) || Number.isNaN(currentMonday.getTime())) return false;
    const weekDiff = Math.round(
      (currentMonday.getTime() - anchorMonday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    if (weekDiff < 0 || weekDiff % repeatIntervalWeeks !== 0) return false;
  }
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
      // 같은 날 변경과 취소가 모두 있으면 취소를 우선한다. 배열 수신 순서에
      // 따라 기기마다 다른 근무표가 보이지 않도록 최근 행까지 결정적으로 고른다.
      const relatedExc = filteredExceptions
        .filter((e) => (
          e.staff_user_id === rule.staff_user_id
          && e.date === ymd
          && (e.type === 'cancel' || e.type === 'change')
        ))
        .sort((left, right) => (
          (left.type === 'cancel' ? 0 : 1) - (right.type === 'cancel' ? 0 : 1)
          || String(right.created_at || '').localeCompare(String(left.created_at || ''))
          || String(right.id || '').localeCompare(String(left.id || ''))
        ))[0];
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
//     teacherUserId, assistantIds (array, legacy-empty),
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
  const exceptionPriority = { cancel: 1, reschedule: 2, substitute: 3 };

  for (const ymd of enumerateDates(fromDate, toDate)) {
    const dow = dayOfWeekOfYMD(ymd);
    if (dow == null) continue;
    for (const rule of filteredRules) {
      if (rule.day_of_week !== dow) continue;
      if (!isRuleActiveOnDate(rule, ymd)) continue;
      // DB 실체화 함수와 같은 우선순위(cancel → reschedule → substitute)를 쓴다.
      // 같은 종류가 여러 번 저장된 레거시 데이터는 가장 최근 행을 적용한다.
      const relatedExc = filteredExceptions
        .filter((e) => (
          e.class_group_id === rule.class_group_id
          && e.session_date === ymd
          && Object.prototype.hasOwnProperty.call(exceptionPriority, e.type)
        ))
        .sort((a, b) => (
          exceptionPriority[a.type] - exceptionPriority[b.type]
          || String(b.created_at || '').localeCompare(
            String(a.created_at || ''),
          )
          || String(b.id || '').localeCompare(String(a.id || ''))
        ))[0];
      if (relatedExc?.type === 'cancel') continue;
      const startTime = relatedExc?.start_time || rule.start_time || '';
      const endTime = relatedExc?.end_time || rule.end_time || '';
      result.push({
        id: `rule:${rule.id}:${ymd}`,
        source: 'rule',
        ruleId: rule.id,
        classGroupId: rule.class_group_id,
        date: ymd,
        startTime,
        endTime,
        teacherUserId: relatedExc?.teacher_user_id || rule.teacher_user_id || null,
        assistantIds: [],
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
      ruleId: null,
      classGroupId: exc.class_group_id,
      date: exc.session_date,
      startTime: exc.start_time,
      endTime: exc.end_time,
      teacherUserId: exc.teacher_user_id || null,
      assistantIds: [],
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
  const capYMD = addDaysYMD(todayYMD, windowDays);
  if (!capYMD) return originalEndYMD || null;
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
// 중복 판정:
//   - 수업 : rule/exception ID 우선, 없으면 날짜+반+시간 및 정기 회차 자연키
//   - 직원 : `${date}__${staffUserId or staffId}__${scheduledStartTime}`
//
// 수업은 실제 회차 ID와 기록 연결은 보존하면서 최신 planned 시간·담당·학생
// 스냅샷을 덮어 쓴다. DB 동기화 직전에도 이전/새 시간이 중복 노출되지 않는다.

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
  const consumedPlannedIndexes = new Set();
  const out = [];

  const groupKeyOf = (item) => item?.classGroupServerId || item?.classGroupId || '';
  const timeKeyOf = (item) => (
    `${item?.date || ''}__${groupKeyOf(item)}__${(item?.startTime || '').slice(0, 5)}`
  );
  const isPlannedExtra = (item) => (
    item?.plannedSource === 'exception' || item?.plannedExceptionType === 'extra'
  );
  const isActualExtra = (item) => (
    !!item?.sessionExceptionId && !item?.scheduleRuleId
  );

  for (const s of actualSessions) {
    if (!s) continue;
    let plannedIndex = plannedItems.findIndex((p, index) => (
      !consumedPlannedIndexes.has(index)
      && p
      && timeKeyOf(p) === timeKeyOf(s)
      && (isActualExtra(s) ? isPlannedExtra(p) : !isPlannedExtra(p))
    ));

    if (plannedIndex < 0 && s.scheduleRuleId) {
      plannedIndex = plannedItems.findIndex((p, index) => (
        !consumedPlannedIndexes.has(index)
        && p
        && p.date === s.date
        && p.scheduleRuleId === s.scheduleRuleId
      ));
    }

    if (plannedIndex < 0 && s.sessionExceptionId) {
      plannedIndex = plannedItems.findIndex((p, index) => (
        !consumedPlannedIndexes.has(index)
        && p
        && p.date === s.date
        && p.sessionExceptionId === s.sessionExceptionId
      ));
    }

    // 규칙 수정 직후 DB 회차 갱신보다 UI 계산이 먼저 끝나는 짧은 구간에도
    // 같은 반·날짜의 정기 회차를 두 개로 보이지 않게 한다. 예정 규칙의 최신
    // 시간만 실제 회차에 덮어 쓰고, 기록 연결에 필요한 실제 회차 ID는 보존한다.
    if (plannedIndex < 0 && !isActualExtra(s)) {
      plannedIndex = plannedItems.findIndex((p, index) => (
        !consumedPlannedIndexes.has(index)
        && p
        && !isPlannedExtra(p)
        && p.date === s.date
        && groupKeyOf(p) === groupKeyOf(s)
      ));
    }

    const planned = plannedIndex >= 0 ? plannedItems[plannedIndex] : null;
    if (planned) consumedPlannedIndexes.add(plannedIndex);
    const canApplyLatestSchedule = planned && (
      s.status !== 'completed'
      // 완료 회차의 기본 규칙 변경은 역사로 보존하지만, 사용자가 이 회차에
      // 명시적으로 저장한 시간 정정은 최신 값이므로 즉시 보여준다.
      || planned.plannedExceptionType === 'reschedule'
    );
    out.push({
      ...s,
      ...(canApplyLatestSchedule ? {
        startTime: planned.startTime || s.startTime,
        endTime: planned.endTime || s.endTime,
        room: planned.room || s.room,
        teacherUserId: planned.teacherUserId || s.teacherUserId,
        substituteTeacherUserId:
          planned.substituteTeacherUserId ?? s.substituteTeacherUserId,
        substituteReason: planned.substituteReason ?? s.substituteReason,
        studentIds: Array.isArray(planned.studentIds) ? planned.studentIds : s.studentIds,
        scheduleRuleId: planned.scheduleRuleId || s.scheduleRuleId,
        sessionExceptionId: planned.sessionExceptionId ?? s.sessionExceptionId,
        plannedSource: planned.plannedSource,
        plannedExceptionType: planned.plannedExceptionType,
      } : {}),
      isPlanned: false,
    });
  }
  plannedItems.forEach((p, index) => {
    if (!p) return;
    if (consumedPlannedIndexes.has(index)) return;
    out.push({ ...p, isPlanned: true });
  });
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
    // 반복 규칙 자체에는 유효 기간이 없고 반의 시작일/종료일이 기준이다.
    // 이 필터가 없으면 개강 전·종강 후에도 UI에만 가짜 예정 회차가 나타난다.
    if (group.status && group.status !== 'active') continue;
    if (group.startDate && p.date < group.startDate) continue;
    if (group.endDate && p.date > group.endDate) continue;
    out.push({
      id: p.id,
      classGroupId: group.id, // local id 로 통일
      classGroupServerId: group.serverId || group.id,
      date: p.date,
      occurrenceDate: p.date,
      scheduleRuleId: p.ruleId || null,
      sessionExceptionId: p.exceptionId || null,
      startTime: p.startTime || '',
      endTime: p.endTime || '',
      room: p.room || group.room || '',
      teacherId: group.teacherId || '',
      teacherUserId: p.teacherUserId || group.teacherUserId || '',
      assistantUserIds: [],
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
// 입력: buildPlannedStaffSchedule 결과 + academyTeachers/academyAssistants/academyManagers
//   (staff_user_id → local staffId 매핑용).
export function plannedToStaffShiftShape(plannedItems = [], {
  academyTeachers = [], academyAssistants = [], academyManagers = [],
} = {}) {
  const teacherByUserId = new Map();
  for (const t of academyTeachers) {
    if (t?.serverUserId) teacherByUserId.set(t.serverUserId, t);
  }
  const assistantByUserId = new Map();
  for (const a of academyAssistants) {
    if (a?.serverUserId) assistantByUserId.set(a.serverUserId, a);
  }
  const managerByUserId = new Map();
  for (const m of academyManagers) {
    if (m?.serverUserId) managerByUserId.set(m.serverUserId, m);
  }
  const out = [];
  for (const p of plannedItems) {
    const role = p.staffRole;
    let localStaff = null;
    if (role === 'teacher') localStaff = teacherByUserId.get(p.staffUserId) || null;
    else if (role === 'assistant') localStaff = assistantByUserId.get(p.staffUserId) || null;
    else if (role === 'manager') localStaff = managerByUserId.get(p.staffUserId) || null;
    else {
      // role 미상 (extra exception 등) — 등록된 모든 직원군에서 lookup.
      localStaff = teacherByUserId.get(p.staffUserId)
        || assistantByUserId.get(p.staffUserId)
        || managerByUserId.get(p.staffUserId)
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
