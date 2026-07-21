import {
  createAcademyClassSessionsBulk,
  createAcademyStaffShift,
} from './supabase/domainApi';
import useAcademyStore from '../store/useAcademyStore';
import useWorkspaceStore from '../store/useWorkspaceStore';
import { OWNER_TEACHER_ID } from '../utils/format';

function formatMonthFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonthOf(date) {
  return formatMonthFromDate(new Date(date.getFullYear(), date.getMonth() + 1, 1));
}

export function isMonthEnd(date = new Date()) {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() === last;
}

function autoGenerationKey(academyId, targetMonth) {
  return `monthly-schedule-generated:${academyId}:${targetMonth}`;
}

function wasGenerated(academyId, targetMonth) {
  if (!academyId || !targetMonth || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(autoGenerationKey(academyId, targetMonth)) === '1';
  } catch {
    return false;
  }
}

function markGenerated(academyId, targetMonth) {
  if (!academyId || !targetMonth || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(autoGenerationKey(academyId, targetMonth), '1');
  } catch {
    /* ignore */
  }
}

function resolveTeacherUserId(localTeacherId, academyTeachers, ownerUserId) {
  if (!localTeacherId) return null;
  if (localTeacherId === OWNER_TEACHER_ID) return ownerUserId || null;
  const teacher = academyTeachers.find((item) => item.id === localTeacherId);
  return teacher?.serverUserId || null;
}

function mapClassSessionToServerPayload(session, classGroupServerId, {
  academyStudents,
  academyTeachers,
  ownerUserId,
} = {}) {
  const studentById = new Map((academyStudents || []).map((item) => [item.id, item]));
  return {
    class_group_id: classGroupServerId,
    date: session.date,
    start_time: session.startTime || null,
    end_time: session.endTime || null,
    room: session.room || null,
    teacher_id: session.teacherId || null,
    teacher_type: session.teacherId === OWNER_TEACHER_ID ? 'owner' : 'teacher',
    teacher_user_id: session.teacherUserId
      || resolveTeacherUserId(session.teacherId, academyTeachers || [], ownerUserId)
      || null,
    student_ids: (session.studentIds || [])
      .map((localId) => studentById.get(localId)?.serverId || localId)
      .filter(Boolean),
    assistant_ids: [],
    status: session.status || 'scheduled',
    memo: session.memo || null,
  };
}

function matchClassSessionPairs(localSessions, serverSessions) {
  const serverByKey = new Map(
    (serverSessions || []).map((row) => [`${row.date}__${row.start_time || ''}`, row]),
  );
  return (localSessions || [])
    .map((local) => {
      const server = serverByKey.get(`${local.date}__${local.startTime || ''}`);
      return server?.id ? { localId: local.id, serverId: server.id } : null;
    })
    .filter(Boolean);
}

async function syncClassSessions({ academyId, targetMonth, ownerUserId }) {
  const academyState = useAcademyStore.getState();
  const {
    classGroups = [],
    academyStudents = [],
    academyTeachers = [],
    ensureClassSessionsForMonth,
    setClassSessionServerIds,
  } = academyState;
  const createdByGroup = [];
  let createdCount = 0;

  for (const group of classGroups) {
    if (!group || group.status === 'inactive') continue;
    const created = ensureClassSessionsForMonth?.(group.id, targetMonth) || [];
    if (created.length === 0) continue;
    createdCount += created.length;
    createdByGroup.push({ group, sessions: created });
  }

  for (const { group, sessions } of createdByGroup) {
    if (!group.serverId || sessions.length === 0) continue;
    const payloads = sessions.map((session) =>
      mapClassSessionToServerPayload(session, group.serverId, {
        academyStudents,
        academyTeachers,
        ownerUserId,
      })
    );
    const serverSessions = await createAcademyClassSessionsBulk({
      academyId,
      sessions: payloads,
    });
    setClassSessionServerIds?.(matchClassSessionPairs(sessions, serverSessions));
  }

  return createdCount;
}

async function syncStaffShifts({ academyId, targetMonth }) {
  const academyState = useAcademyStore.getState();
  const workspaceState = useWorkspaceStore.getState();
  const created = academyState.ensureStaffShiftsForMonth?.({
    month: targetMonth,
    rules: workspaceState.staffWorkRules || [],
    exceptions: workspaceState.staffWorkExceptions || [],
    academyTeachers: academyState.academyTeachers || [],
    academyAssistants: academyState.academyAssistants || [],
    academyManagers: academyState.academyManagers || [],
  }) || [];

  for (const shift of created) {
    if (!shift.staffUserId) continue;
    const serverShift = await createAcademyStaffShift({
      academyId,
      staff_user_id: shift.staffUserId,
      staff_role: shift.staffRole || 'teacher',
      date: shift.date,
      scheduled_start_time: shift.scheduledStartTime || null,
      scheduled_end_time: shift.scheduledEndTime || null,
      break_minutes: Number(shift.breakMinutes) || 0,
      status: shift.status || 'scheduled',
      memo: shift.memo || null,
    });
    if (serverShift?.id) {
      academyState.setStaffShiftServerId?.(shift.id, serverShift.id);
    }
  }

  return created.length;
}

export async function runMonthEndScheduleGeneration({
  academyId,
  ownerUserId,
  now = new Date(),
  force = false,
} = {}) {
  if (!academyId) return { skipped: true, reason: 'no-academy' };
  if (!force && !isMonthEnd(now)) return { skipped: true, reason: 'not-month-end' };

  const targetMonth = nextMonthOf(now);
  if (!force && wasGenerated(academyId, targetMonth)) {
    return { skipped: true, reason: 'already-generated', targetMonth };
  }

  const classSessionsCreated = await syncClassSessions({
    academyId,
    targetMonth,
    ownerUserId,
  });
  const staffShiftsCreated = await syncStaffShifts({
    academyId,
    targetMonth,
  });

  markGenerated(academyId, targetMonth);
  return {
    skipped: false,
    targetMonth,
    classSessionsCreated,
    staffShiftsCreated,
  };
}
