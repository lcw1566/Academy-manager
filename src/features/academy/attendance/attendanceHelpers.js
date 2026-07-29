// attendanceHelpers — Phase 41
//
// 출결·등하원 설정 / QR 토큰 / 페이로드 유틸. 어디서나 import 해서 사용.

import {
  formatDateToYMD,
  getKoreaHHMM,
} from '../../../utils/date';

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

export function buildQrDisplayUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('qrDisplay', '1');
    return url.toString();
  } catch {
    return '';
  }
}

export function openQrDisplayWindow() {
  if (typeof window === 'undefined') return false;
  const url = buildQrDisplayUrl();
  if (!url) return false;
  const popup = window.open(
    url,
    'seenit-attendance-qr',
    'popup=yes,width=1180,height=820,resizable=yes,scrollbars=yes',
  );
  if (!popup) {
    window.alert('QR 새 창을 열지 못했어요. 브라우저의 팝업 차단을 허용해주세요.');
    return false;
  }
  popup.focus?.();
  return true;
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

export function getAcademyYmd(value = new Date()) {
  return formatDateToYMD(value) || null;
}

export function getStudentDayCheckState(studentServerId, ymd, events = []) {
  const dayEvents = events
    .filter((event) => (
      event?.student_id === studentServerId
      && event.event_time
      && getAcademyYmd(event.event_time) === ymd
      && ['check_in', 'check_out'].includes(event.event_type)
    ))
    .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());

  const latest = dayEvents[dayEvents.length - 1] || null;
  return {
    events: dayEvents,
    latest,
    isInside: latest?.event_type === 'check_in',
  };
}

// 학생의 당일 등원 여부를 수업 출석 기본값으로 사용한다.
// 등원 기록이 하나라도 있으면 출석, 없으면 결석이다. 지각·인정결석 같은
// 예외만 수업 화면에서 선생님이 직접 수정한다.
//
// 입력:
//   - studentServerId: public.students.id (uuid)
//   - session        : { date 'YYYY-MM-DD', startTime 'HH:mm', endTime 'HH:mm' }
//   - events         : useWorkspaceStore.studentCheckEvents (DB row 형식)
//
// 출력:
//   { statusHint: 'present'|'absent', checkInTime: 'HH:mm'|null,
//     checkOutTime: 'HH:mm'|null, checkInISO, checkOutISO }
export function getQrAttendanceHint(studentServerId, session, events = []) {
  const empty = {
    statusHint: 'absent',
    checkInTime: null,
    checkOutTime: null,
    checkInISO: null,
    checkOutISO: null,
    source: null,
  };
  if (!studentServerId || !session?.date) return empty;

  const { events: dayEvents } = getStudentDayCheckState(
    studentServerId,
    session.date,
    events,
  );
  if (dayEvents.length === 0) return empty;

  const firstCheckIn = dayEvents.find((event) => event.event_type === 'check_in') || null;
  if (!firstCheckIn) return empty;
  const lastCheckOut = dayEvents
    .slice()
    .reverse()
    .find((event) => (
      event.event_type === 'check_out'
      && new Date(event.event_time).getTime() >= new Date(firstCheckIn.event_time).getTime()
    )) || null;

  return {
    statusHint: 'present',
    checkInTime: evtTimeToHHmm(firstCheckIn.event_time),
    checkOutTime: lastCheckOut ? evtTimeToHHmm(lastCheckOut.event_time) : null,
    checkInISO: firstCheckIn.event_time,
    checkOutISO: lastCheckOut?.event_time || null,
    source: firstCheckIn.source || null,
  };
}

function evtTimeToHHmm(ts) {
  if (!ts || Number.isNaN(new Date(ts).getTime())) return null;
  return getKoreaHHMM(ts);
}

// Attendance row 의 source 값 → 라벨.
export const ATTENDANCE_SOURCE_LABELS = {
  qr:             'QR 등원',
  teacher_manual: '선생님 수정',
  manual:         '직접 체크',
};
