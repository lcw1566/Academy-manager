// shiftCoverage — Phase 34
//
// 근무 (academyStaffShifts) 와 수업/세션 시간의 관계를 다루는 헬퍼.
//
// 핵심 개념:
//   - Work shift   : 학원에 머무는 시간. 시급제 급여의 기준.
//   - Lesson hours : shift 안에서 실제로 수업이 잡힌 시간.
//   - Gap          : shift 안 - lesson 시간. 행정/클리닉 대기.
//
// 시간 표현은 모두 "HH:mm" 24h 문자열. 분 변환은 hhmmToMin / minToHHmm 사용.

export function hhmmToMin(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function minToHHmm(min) {
  if (!Number.isFinite(min) || min < 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 두 시간 구간이 겹치는가? (start 포함, end 미포함)
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  return aStart < bEnd && bStart < aEnd;
}

// shift 안에 lesson 이 완전히 포함되는가?
export function shiftCovers(shift, lessonStartTime, lessonEndTime) {
  const sStart = hhmmToMin(shift.scheduledStartTime);
  const sEnd = hhmmToMin(shift.scheduledEndTime);
  const lStart = hhmmToMin(lessonStartTime);
  const lEnd = hhmmToMin(lessonEndTime);
  if (sStart == null || sEnd == null || lStart == null || lEnd == null) return false;
  return sStart <= lStart && lEnd <= sEnd;
}

// (staffId, date, lessonStartTime, lessonEndTime) 를 완전히 cover 하는 shift 찾기.
// status=canceled 는 무시. 여러 개 있으면 첫 번째.
export function findShiftCoveringTime(shifts, staffId, date, lessonStartTime, lessonEndTime) {
  if (!Array.isArray(shifts) || !staffId || !date) return null;
  return shifts.find(
    (sh) =>
      sh.staffId === staffId
      && sh.date === date
      && sh.status !== 'canceled'
      && shiftCovers(sh, lessonStartTime, lessonEndTime),
  ) || null;
}

// lesson 시간과 겹치는 shift (전체 포함 X, 일부만 겹쳐도 매칭).
export function findOverlappingShift(shifts, staffId, date, lessonStartTime, lessonEndTime) {
  if (!Array.isArray(shifts) || !staffId || !date) return null;
  const lStart = hhmmToMin(lessonStartTime);
  const lEnd = hhmmToMin(lessonEndTime);
  if (lStart == null || lEnd == null) return null;
  return shifts.find(
    (sh) =>
      sh.staffId === staffId
      && sh.date === date
      && sh.status !== 'canceled'
      && rangesOverlap(hhmmToMin(sh.scheduledStartTime), hhmmToMin(sh.scheduledEndTime), lStart, lEnd),
  ) || null;
}

// 분석 결과: 'covered' | 'partial' | 'none'
export function classifyCoverage(shifts, staffId, date, startTime, endTime) {
  if (!staffId || !date || !startTime || !endTime) return 'none';
  if (findShiftCoveringTime(shifts, staffId, date, startTime, endTime)) return 'covered';
  if (findOverlappingShift(shifts, staffId, date, startTime, endTime)) return 'partial';
  return 'none';
}

// Lesson 으로부터 shift 후보 payload 만들기.
// option = 'exact' | 'buffer' (앞뒤 30분) | 'custom' (직접 설정 — UI 가 따로 처리)
export function buildShiftDraftFromLesson({ staff, staffRole, date, startTime, endTime, option }) {
  const lStart = hhmmToMin(startTime);
  const lEnd = hhmmToMin(endTime);
  if (lStart == null || lEnd == null) return null;
  let start = lStart;
  let end = lEnd;
  if (option === 'buffer') {
    start = Math.max(0, lStart - 30);
    end = Math.min(24 * 60 - 1, lEnd + 30);
  }
  return {
    staffId: staff?.id,
    staffRole,
    date,
    scheduledStartTime: minToHHmm(start),
    scheduledEndTime: minToHHmm(end),
    breakMinutes: 0,
    status: 'scheduled',
    memo: '',
  };
}

// 기존 shift 를 lesson 범위만큼 늘리기 (시작은 더 빨리, 끝은 더 늦게).
export function extendShiftToCoverLesson(shift, lessonStartTime, lessonEndTime) {
  const sStart = hhmmToMin(shift.scheduledStartTime);
  const sEnd = hhmmToMin(shift.scheduledEndTime);
  const lStart = hhmmToMin(lessonStartTime);
  const lEnd = hhmmToMin(lessonEndTime);
  if (sStart == null || sEnd == null || lStart == null || lEnd == null) return null;
  const newStart = Math.min(sStart, lStart);
  const newEnd = Math.max(sEnd, lEnd);
  if (newStart === sStart && newEnd === sEnd) return null;
  return {
    scheduledStartTime: minToHHmm(newStart),
    scheduledEndTime: minToHHmm(newEnd),
  };
}

// 특정 날짜 staff 의 shift + 그 안에 들어 있는 lesson 들을 합쳐 timeline 행으로 변환.
// 결과: [{ type: 'lesson' | 'gap', startTime, endTime, durationMin, session? }]
// shift 안에 들어 있는 lesson 만 timeline 에 표시. shift 밖 lesson 은 무시 (별도 경고는 UI 가 처리).
export function buildShiftTimeline(shift, sessionsOnDate = []) {
  if (!shift) return [];
  const sStart = hhmmToMin(shift.scheduledStartTime);
  const sEnd = hhmmToMin(shift.scheduledEndTime);
  if (sStart == null || sEnd == null || sEnd <= sStart) return [];

  // shift 안에 들어오는 lesson session 만 (전체 포함 우선)
  const lessons = sessionsOnDate
    .map((s) => {
      const lStart = hhmmToMin(s.startTime);
      const lEnd = hhmmToMin(s.endTime);
      if (lStart == null || lEnd == null) return null;
      // shift 범위로 clamp
      const cs = Math.max(sStart, lStart);
      const ce = Math.min(sEnd, lEnd);
      if (cs >= ce) return null;
      return { session: s, startMin: cs, endMin: ce };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMin - b.startMin);

  // 겹치는 lesson 은 merge — 시간 합산 시 중복 카운트 방지
  const merged = [];
  for (const lesson of lessons) {
    const last = merged[merged.length - 1];
    if (last && lesson.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, lesson.endMin);
      last.sessions.push(lesson.session);
    } else {
      merged.push({ startMin: lesson.startMin, endMin: lesson.endMin, sessions: [lesson.session] });
    }
  }

  const rows = [];
  let cursor = sStart;
  for (const block of merged) {
    if (block.startMin > cursor) {
      rows.push({
        type: 'gap',
        startTime: minToHHmm(cursor),
        endTime: minToHHmm(block.startMin),
        durationMin: block.startMin - cursor,
      });
    }
    rows.push({
      type: 'lesson',
      startTime: minToHHmm(block.startMin),
      endTime: minToHHmm(block.endMin),
      durationMin: block.endMin - block.startMin,
      sessions: block.sessions,
    });
    cursor = block.endMin;
  }
  if (cursor < sEnd) {
    rows.push({
      type: 'gap',
      startTime: minToHHmm(cursor),
      endTime: minToHHmm(sEnd),
      durationMin: sEnd - cursor,
    });
  }
  return rows;
}

// Phase 35 — 여러 lesson 으로부터 만든 shift draft 목록을, 같은 staff/date 안에서
// 겹치거나 맞붙은 구간끼리 병합한다. 추가로 mergeGapMinutes 이내 작은 틈은 함께 묶음.
//
// 입력: [{ staffId, staffRole, date, scheduledStartTime, scheduledEndTime, memo?, breakMinutes?, status? }, ...]
// 출력: 같은 형태지만 (staffId, date) 별로 1개 이상의 병합된 shift draft.
export function mergeShiftDraftsForStaffDate(drafts = [], { mergeGapMinutes = 0 } = {}) {
  if (!Array.isArray(drafts) || drafts.length === 0) return [];

  const groups = new Map(); // key: staffId__date → drafts
  for (const d of drafts) {
    if (!d?.staffId || !d?.date) continue;
    const start = hhmmToMin(d.scheduledStartTime);
    const end = hhmmToMin(d.scheduledEndTime);
    if (start == null || end == null || end <= start) continue;
    const key = `${d.staffId}__${d.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...d, _start: start, _end: end });
  }

  const out = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a._start - b._start);
    let cur = null;
    for (const d of list) {
      if (cur && d._start <= cur._end + mergeGapMinutes) {
        cur._end = Math.max(cur._end, d._end);
        // 메모는 첫 번째 것만 유지 (운영자가 직접 합쳐서 보는 일정이므로 단순화).
      } else {
        if (cur) out.push(cur);
        cur = { ...d };
      }
    }
    if (cur) out.push(cur);
  }

  return out.map((d) => ({
    staffId: d.staffId,
    staffRole: d.staffRole,
    date: d.date,
    scheduledStartTime: minToHHmm(d._start),
    scheduledEndTime: minToHHmm(d._end),
    breakMinutes: d.breakMinutes || 0,
    status: d.status || 'scheduled',
    memo: d.memo || '',
  }));
}

// Phase 35 — 후보 draft 가 기존 shift 와 어떤 관계인지 분류.
// returns: { action: 'skip' | 'extend' | 'create', existing? }
//   - 'skip'   : 같은 staff/date 의 기존 shift 가 draft 를 완전히 포함 → 중복 추가 X.
//   - 'extend' : 일부 겹치면 기존 shift 의 시작/끝을 늘려 cover 하도록 patch.
//   - 'create' : 겹침 없음 → 새 shift 생성.
export function planShiftForDraft(existingShifts = [], draft) {
  if (!draft?.staffId || !draft?.date) return { action: 'skip' };
  const dStart = hhmmToMin(draft.scheduledStartTime);
  const dEnd = hhmmToMin(draft.scheduledEndTime);
  if (dStart == null || dEnd == null || dEnd <= dStart) return { action: 'skip' };

  // 완전 포함하는 shift 가 있다면 skip.
  const covering = existingShifts.find(
    (sh) =>
      sh.staffId === draft.staffId
      && sh.date === draft.date
      && sh.status !== 'canceled'
      && shiftCovers(sh, draft.scheduledStartTime, draft.scheduledEndTime),
  );
  if (covering) return { action: 'skip', existing: covering };

  // 일부 겹치는 shift 가 있다면 extend.
  const overlap = existingShifts.find(
    (sh) =>
      sh.staffId === draft.staffId
      && sh.date === draft.date
      && sh.status !== 'canceled'
      && rangesOverlap(
        hhmmToMin(sh.scheduledStartTime), hhmmToMin(sh.scheduledEndTime),
        dStart, dEnd,
      ),
  );
  if (overlap) return { action: 'extend', existing: overlap };

  return { action: 'create' };
}

// 한 달 동안 특정 staff 의 lesson 시간 합 (시간 단위, 소수).
// staff 의 lesson assignment 는:
//   - classSessions.teacherId === staffId  AND status='completed' AND !substituteTeacherId
//   - OR classSessions.substituteTeacherId === staffId AND status='completed'
// 보조강사는 수업 배정 대상이 아니므로 lesson 시간에 포함하지 않는다.
//
// "수업 시간" 정책상 status='completed' 만 합산 (작성된 수업만 정산).
export function computeLessonHoursForMonth({ staffId, staffRole, month, classSessions = [] }) {
  if (!staffId || !month) return 0;
  let totalMin = 0;
  for (const s of classSessions) {
    if (s.status !== 'completed') continue;
    if (!s.date || !s.date.startsWith(month)) continue;
    const lStart = hhmmToMin(s.startTime);
    const lEnd = hhmmToMin(s.endTime);
    if (lStart == null || lEnd == null || lEnd <= lStart) continue;
    let counts = false;
    if (staffRole === 'assistant') {
      counts = false;
    } else {
      // teacher (또는 staffRole 미지정)
      const isMainAndNoSubstitute = s.teacherId === staffId && !s.substituteTeacherId;
      const isSubstitute = s.substituteTeacherId === staffId;
      counts = isMainAndNoSubstitute || isSubstitute;
    }
    if (counts) totalMin += lEnd - lStart;
  }
  return totalMin / 60;
}

// 한 달 동안 특정 staff 의 lesson session 들을 (날짜별로) 모으기.
export function listLessonSessionsForMonth({ staffId, staffRole, month, classSessions = [] }) {
  if (!staffId || !month) return [];
  return classSessions.filter((s) => {
    if (!s.date?.startsWith(month)) return false;
    if (staffRole === 'assistant') return false;
    const isMainAndNoSubstitute = s.teacherId === staffId && !s.substituteTeacherId;
    const isSubstitute = s.substituteTeacherId === staffId;
    return isMainAndNoSubstitute || isSubstitute;
  });
}
