// Only academy UI/cache fields may survive a browser restart. Student records
// (including contacts and PINs) are fetched again through the secure RPCs.
const PERSISTED_FIELDS = [
  'schoolNames', 'academyProfile', 'classGroups', 'classSessions', 'clinicTasks',
  'clinicRecords', 'academyTeachers', 'academyAssistants', 'academyManagers',
  'academyPayments', 'academyLessonRecords', 'academyAttendanceRecords',
  'academyStudentEvents', 'academyExamResults', 'academyConsultations',
  'academyPayrolls', 'academyStaffShifts', 'academyDataOwnerUserId',
  'academyDataOwnerAcademyId', 'academyDataOwnerRole',
];

export function selectPersistedAcademyState(state) {
  const result = { currentMode: 'academy' };
  if (!state || typeof state !== 'object') return result;
  for (const field of PERSISTED_FIELDS) {
    if (Object.hasOwn(state, field)) result[field] = state[field];
  }
  return result;
}

// Scrub on read as well as write: older versions and already-open old tabs can
// leave private workspace data or student records in the same storage key.
export function sanitizeAcademyStorageValue(value) {
  try {
    const envelope = JSON.parse(value);
    if (!envelope || typeof envelope !== 'object') return null;
    return JSON.stringify({
      state: selectPersistedAcademyState(envelope.state),
      version: envelope.version,
    });
  } catch {
    return null;
  }
}
