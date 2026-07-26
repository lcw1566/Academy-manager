// attendanceHelpers — Phase 41
//
// 출결·등하원 설정 / QR 토큰 / 페이로드 유틸. 어디서나 import 해서 사용.

import { hhmmToMin } from '../../../utils/shiftCoverage';

// memberships[i].academy 로부터 출결 설정을 읽어 일관된 default 값을 반환.
//
// SQL 027 — Wi-Fi는 제거한 채 직원 출퇴근을 직접 기록 또는 QR로 선택한다.
export function readAttendanceSettings(academy) {
  if (!academy) {
    return {
      staffCheckMethod: 'manual',
      studentCheckMethod: 'teacher_manual',
      staffManualOverrideEnabled: true,
      studentManualOverrideEnabled: true,
      attendanceQrToken: '',
      onboardedAt: null,
    };
  }
  return {
    staffCheckMethod: academy.staff_check_method || 'manual',
    studentCheckMethod: academy.student_check_method || 'teacher_manual',
    staffManualOverrideEnabled: academy.staff_manual_override_enabled !== false,
    studentManualOverrideEnabled: academy.student_manual_override_enabled !== false,
    attendanceQrToken: academy.attendance_qr_token || '',
    onboardedAt: academy.attendance_onboarded_at || null,
  };
}

// 랜덤 토큰. crypto.randomUUID 가 있으면 그걸, 없으면 timestamp+random.
export function generateQrToken() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// 공용 디스플레이용 페이로드. JSON 문자열로 인코딩.
// purpose: 'staff_checkin' | 'student_checkin' | 'shared'
//   - 'shared' 는 직원/학생 모두 가능 (현재 정책상 같은 QR 사용).
export function buildPublicCheckinPayload({ academyId, token, purpose = 'shared', ttlSec = 90 }) {
  const now = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    v: 1,
    type: 'academy_checkin',
    academyId,
    purpose,
    token: token || '',
    issuedAt: now,
    expiresAt: now + ttlSec,
  });
}

// 학생 개별 QR — 학원이 학생 카드/프린트물로 발급. 학생이 본인 단말이 없어도
// 공용 단말 스캐너에 노출할 수 있도록 분리된 페이로드 사용.
function normalizePublicBaseUrl(baseUrl) {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(raw)) return '';
  return raw;
}

export function getPublicCheckinBaseUrl() {
  const envBaseUrl = import.meta.env?.VITE_PUBLIC_APP_URL || import.meta.env?.VITE_APP_URL || '';
  const windowOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  return normalizePublicBaseUrl(envBaseUrl) || normalizePublicBaseUrl(windowOrigin);
}

export function buildPublicCheckinUrl({ payload, baseUrl } = {}) {
  const base = normalizePublicBaseUrl(baseUrl || getPublicCheckinBaseUrl());
  if (!base || !payload) return '';

  try {
    const parsed = JSON.parse(payload);
    const url = new URL(base);
    url.searchParams.set('checkin', '1');
    if (parsed?.type === 'academy_checkin') {
      url.searchParams.set('a', parsed.academyId || '');
      url.searchParams.set('t', parsed.token || '');
      url.searchParams.set('e', String(parsed.expiresAt || ''));
      url.searchParams.set('u', String(parsed.issuedAt || ''));
      url.searchParams.set('r', parsed.purpose || 'shared');
    } else {
      url.searchParams.set('p', payload);
    }
    return url.toString();
  } catch {
    return '';
  }
}

export function buildStudentCardPayload({ academyId, studentId }) {
  return JSON.stringify({
    v: 1,
    type: 'academy_student_card',
    academyId,
    studentId,
  });
}

// 스캔 결과 페이로드 파싱. 실패 시 null 반환 (예외 X — UI 가 안전하게 처리).
export function parseCheckinPayload(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // URL 형태로 들어올 경우 querystring 안 payload 도 허용
  try {
    if (s.startsWith('http')) {
      const u = new URL(s);
      const p = u.searchParams.get('p');
      if (p) s = decodeURIComponent(p);
      else if (u.searchParams.has('checkin')) {
        return {
          v: 1,
          type: 'academy_checkin',
          academyId: u.searchParams.get('a') || '',
          purpose: u.searchParams.get('r') || 'shared',
          token: u.searchParams.get('t') || '',
          issuedAt: Number(u.searchParams.get('u') || 0),
          expiresAt: Number(u.searchParams.get('e') || 0),
        };
      }
    }
  } catch { /* ignore */ }
  try {
    const obj = JSON.parse(s);
    if (!obj || typeof obj !== 'object') return null;
    if (obj.type !== 'academy_checkin' && obj.type !== 'academy_student_card') return null;
    return obj;
  } catch {
    return null;
  }
}

// 만료 검사. 'academy_student_card' 페이로드는 만료 X.
export function isPayloadExpired(payload) {
  if (!payload) return true;
  if (payload.type === 'academy_student_card') return false;
  if (!payload.expiresAt) return false;
  return Math.floor(Date.now() / 1000) > Number(payload.expiresAt);
}

// shift 의 actual_start_time vs scheduled_start_time → 상태 라벨.
//   grace 분 이내면 '정상', 초과면 '지각'. actual 없으면 '미출근'.
export function classifyShiftStatus(shift, { graceMin = 5 } = {}) {
  if (!shift) return 'absent';
  if (shift.status === 'canceled') return 'canceled';
  if (shift.actualEndTime || shift.actual_end_time) return 'clockedOut';
  const actual = shift.actualStartTime || shift.actual_start_time;
  if (!actual) return 'absent';
  const scheduled = shift.scheduledStartTime || shift.scheduled_start_time || '';
  if (!scheduled) return 'present';
  const toMin = (hhmm) => {
    if (!hhmm) return null;
    const [h, m] = String(hhmm).split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const a = toMin(actual);
  const s = toMin(scheduled);
  if (a == null || s == null) return 'present';
  return a - s > graceMin ? 'late' : 'present';
}

export const SHIFT_STATUS_LABELS = {
  present:    '정상 출근',
  late:       '지각',
  absent:     '미출근',
  clockedOut: '퇴근 완료',
  canceled:   '취소',
};

// Phase 42 — 학생 등·하원 이벤트(serverEvents) 에서 특정 (학생, 세션) 에 가장
// 가까운 등원 1건과 그 이후 하원 1건을 골라 attendance hint 를 만든다.
//
// 입력:
//   - studentServerId: public.students.id (uuid)
//   - session        : { date 'YYYY-MM-DD', startTime 'HH:mm', endTime 'HH:mm' }
//   - events         : useWorkspaceStore.studentCheckEvents (DB row 형식)
//   - graceMin       : 시작 시각 + 이 분 이내면 'present' (default 10)
//
// 출력:
//   { statusHint: 'present'|'late'|null, checkInTime: 'HH:mm'|null,
//     checkOutTime: 'HH:mm'|null, checkInISO, checkOutISO }
//
// 규칙 (사양 명세 2번 그대로):
//   - check_in <= session start + graceMin → 'present'
//   - check_in >  session start + graceMin && <= session end → 'late'
//   - 그 외엔 statusHint = null (단순 표기만)
//   - check_out 은 check_in 이후 같은 날 가장 빠른 것 1건 (참고 표시).
export function getQrAttendanceHint(studentServerId, session, events = [], { graceMin = 10 } = {}) {
  const empty = { statusHint: null, checkInTime: null, checkOutTime: null, checkInISO: null, checkOutISO: null };
  if (!studentServerId || !session?.date) return empty;
  const sStart = hhmmToMin(session.startTime);
  const sEnd = hhmmToMin(session.endTime);

  // 같은 날짜·학생 이벤트만.
  const dayEvents = [];
  for (const ev of events) {
    if (!ev || ev.student_id !== studentServerId) continue;
    if (!ev.event_time) continue;
    // event_time 은 timestamptz. 날짜 부분만 우선 비교.
    const datePart = String(ev.event_time).slice(0, 10);
    if (datePart !== session.date) continue;
    dayEvents.push(ev);
  }
  if (dayEvents.length === 0) return empty;

  // check_in 중 시작 시각에 가장 가까운(또는 그 이전 가장 늦은) 것.
  const checkIns = dayEvents.filter((e) => e.event_type === 'check_in')
    .sort((a, b) => String(a.event_time).localeCompare(b.event_time));
  let bestIn = null;
  if (sStart != null && checkIns.length > 0) {
    // 시작 시각 이전 가장 늦은 check_in.
    const before = checkIns.filter((e) => evtTimeToMin(e.event_time) <= sStart + graceMin);
    bestIn = before.length > 0 ? before[before.length - 1] : checkIns[0];
  } else {
    bestIn = checkIns[0] || null;
  }
  const checkOuts = dayEvents.filter((e) => e.event_type === 'check_out')
    .sort((a, b) => String(a.event_time).localeCompare(b.event_time));
  let bestOut = null;
  if (bestIn) {
    bestOut = checkOuts.find((e) => String(e.event_time).localeCompare(bestIn.event_time) > 0) || null;
  }

  let statusHint = null;
  if (bestIn && sStart != null) {
    const inMin = evtTimeToMin(bestIn.event_time);
    if (inMin != null) {
      if (inMin <= sStart + graceMin) statusHint = 'present';
      else if (sEnd == null || inMin <= sEnd) statusHint = 'late';
    }
  }
  return {
    statusHint,
    checkInTime: bestIn ? evtTimeToHHmm(bestIn.event_time) : null,
    checkOutTime: bestOut ? evtTimeToHHmm(bestOut.event_time) : null,
    checkInISO: bestIn?.event_time || null,
    checkOutISO: bestOut?.event_time || null,
  };
}

// "YYYY-MM-DDTHH:mm:ss..." (UTC 또는 KST 모두) 의 시간 부분을 분 단위로.
// timestamptz 가 UTC 로 직렬화될 수 있어 local 시간으로 변환한다.
function evtTimeToMin(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}
function evtTimeToHHmm(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Attendance row 의 source 값 → 라벨.
export const ATTENDANCE_SOURCE_LABELS = {
  qr:             'QR 등원',
  teacher_manual: '선생님 수정',
  manual:         '직접 체크',
};
