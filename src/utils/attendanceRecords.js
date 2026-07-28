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
