// staffMatch
//
// Phase 25 — find the local academyTeachers / academyAssistants entry that
// corresponds to the currently authenticated user. Used by:
//   - TeacherDashboard / AssistantDashboard (filter assigned content)
//   - PayrollPage (load my own payroll)
//
// Matching rules (first match wins):
//   1) entry.serverUserId === userId
//   2) entry.academyMemberId === memberId
//   3) lowercase(entry.email) === lowercase(email)
//
// Same matching rules as upsertLocalTeacherFromServerStaff in useAcademyStore,
// so once syncLocalStaffFromServerMembers has run, this lookup will always
// hit branch 1.
export function findLocalStaffForUser(staffList, { userId, memberId, email } = {}) {
  if (!Array.isArray(staffList) || staffList.length === 0) return null;
  const normalizedEmail = (email || '').trim().toLowerCase();
  for (const entry of staffList) {
    if (!entry) continue;
    if (userId && entry.serverUserId === userId) return entry;
    if (memberId && entry.academyMemberId === memberId) return entry;
    if (
      normalizedEmail &&
      (entry.email || '').trim().toLowerCase() === normalizedEmail
    ) {
      return entry;
    }
  }
  return null;
}
