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
