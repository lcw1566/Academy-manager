export const ATTENDANCE_CONFIRMATION = {
  AUTO_INFERRED: 'auto_inferred',
  TEACHER_CONFIRMED: 'teacher_confirmed',
  LEGACY_CONFIRMED: 'legacy_confirmed',
};

export function getAttendanceConfirmationState(record) {
  if (!record) return null;
  if (record.confirmationState) return record.confirmationState;
  if (record.confirmation_state) return record.confirmation_state;
  // SQL 049 적용 전 데이터도 안전하게 구분한다.
  return record.source === 'qr'
    ? ATTENDANCE_CONFIRMATION.AUTO_INFERRED
    : ATTENDANCE_CONFIRMATION.LEGACY_CONFIRMED;
}

export function isConfirmedAttendance(record) {
  const state = getAttendanceConfirmationState(record);
  return state === ATTENDANCE_CONFIRMATION.TEACHER_CONFIRMED
    || state === ATTENDANCE_CONFIRMATION.LEGACY_CONFIRMED;
}

export function isAutoInferredAttendance(record) {
  return getAttendanceConfirmationState(record) === ATTENDANCE_CONFIRMATION.AUTO_INFERRED;
}

// 등원 기록을 수업 출석의 기본값으로 사용하므로 자동 반영 행도 유효한
// 출석 기록이다. 선생님 확정 여부가 필요한 수정 화면에서는
// isConfirmedAttendance를 계속 사용한다.
export function isEffectiveAttendance(record) {
  return Boolean(getAttendanceConfirmationState(record));
}
