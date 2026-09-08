import { getAcademyYmd } from '../attendance/attendanceHelpers.js';

export function summarizeStudentPresence(events = [], ymd) {
  const latestByStudent = new Map();
  const checkedInStudentIds = new Set();

  for (const event of events) {
    if (
      !event?.student_id
      || !event.event_time
      || getAcademyYmd(event.event_time) !== ymd
      || !['check_in', 'check_out'].includes(event.event_type)
    ) {
      continue;
    }

    if (event.event_type === 'check_in') checkedInStudentIds.add(event.student_id);
    const previous = latestByStudent.get(event.student_id);
    if (
      !previous
      || new Date(event.event_time).getTime() >= new Date(previous.event_time).getTime()
    ) {
      latestByStudent.set(event.student_id, event);
    }
  }

  const inside = [...latestByStudent.values()].filter(
    (event) => event.event_type === 'check_in',
  ).length;

  return {
    inside,
    checkedInToday: checkedInStudentIds.size,
  };
}

function hhmmToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function includesAny(values, ids) {
  return (values || []).some((value) => ids.has(value));
}

export function isSessionAssignedToCurrentUser(session, group, {
  userId,
  staffIds = new Set(),
  isOwner = false,
} = {}) {
  if (!session) return false;
  const userIds = new Set(userId ? [userId] : []);
  const assistantMatches = includesAny(session.assistantUserIds, userIds)
    || includesAny(group?.assistantUserIds, userIds)
    || includesAny(session.assistantIds, staffIds)
    || includesAny(group?.assistantIds, staffIds);

  const substituteUserId = session.substituteTeacherUserId;
  const substituteId = session.substituteTeacherId;
  if (substituteUserId || substituteId) {
    return (substituteUserId && substituteUserId === userId)
      || (substituteId && staffIds.has(substituteId))
      || assistantMatches;
  }

  const teacherUserId = session.teacherUserId || group?.teacherUserId;
  if (teacherUserId === userId) return true;

  const teacherId = session.teacherId || group?.teacherId;
  if (!teacherUserId && teacherId === 'owner' && isOwner) return true;
  if (teacherId && staffIds.has(teacherId)) return true;

  return assistantMatches;
}

export function getActionableClassSessions({
  sessions = [],
  groups = [],
  lessonRecords = [],
  nowMinutes,
  assignment,
}) {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const completedSessionIds = new Set(
    lessonRecords
      .filter((record) => record.studentId === '_common_')
      .map((record) => record.sessionId),
  );

  return sessions
    .filter((session) => session.status !== 'canceled' && !completedSessionIds.has(session.id))
    .filter((session) => isSessionAssignedToCurrentUser(
      session,
      groupsById.get(session.classGroupId),
      assignment,
    ))
    .map((session) => {
      const start = hhmmToMinutes(session.startTime);
      const parsedEnd = hhmmToMinutes(session.endTime);
      const end = parsedEnd ?? (start === null ? null : start + 60);
      if (start === null || end === null) return null;

      if (session.status === 'completed' || nowMinutes > end) {
        return { session, phase: 'finish', start, end };
      }
      if (nowMinutes >= start) return { session, phase: 'live', start, end };
      if (start - nowMinutes <= 30) {
        return { session, phase: 'soon', start, end, startsIn: start - nowMinutes };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}
