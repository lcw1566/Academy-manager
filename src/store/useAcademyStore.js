import { create } from 'zustand';
import { selectPersistedAcademyState, sanitizeAcademyStorageValue } from '../utils/academyPersistence';
import { persist, createJSONStorage } from 'zustand/middleware';
import { localizeUserMessage } from '../utils/localizeError';
import { generateClassDates } from '../utils/recurringClass';
import {
  getCurrentMonth,
  getDaysInMonth,
  getKoreanWeekdayIndex,
  today as getTodayYMD,
} from '../utils/date';
import {
  buildPlannedStaffSchedule,
  plannedToStaffShiftShape,
} from '../utils/schedule';
import {
  calculateStudentMonthlyCharge,
  resolveStudentBaseTuition,
} from '../utils/studentBilling';
import {
  mapServerStudentToLocal,
  mapServerExamResultToLocal,
  mapServerClassGroupToLocal,
  mapServerClassSessionToLocal,
  expandServerLessonRecordToLocal,
  mapServerAttendanceRecordToLocal,
  mapServerClinicRecordToLocal,
  mapServerPaymentToLocal,
  mapServerPayrollToLocal,
} from '../services/supabase/hydrateMappers';
import { computeLessonHoursForMonth } from '../utils/shiftCoverage';
import { sumStaffAttendanceHours } from '../utils/staffAttendance';
import { normalizeRecordSchema } from '../constants/learningActivitySettings';
import { DEFAULT_JOB_TITLE_PERMISSIONS } from '../utils/staffPermissions';
import { reconcileStaffCollectionsWithActiveMembers } from '../utils/staffCache';

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function toWonInteger(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function monthStartYMD(month) {
  if (!month) return '';
  return `${month}-01`;
}

function monthEndYMD(month) {
  const [year, m] = String(month || '').split('-').map(Number);
  if (!year || !m) return '';
  const last = getDaysInMonth(year, m);
  return `${month}-${String(last).padStart(2, '0')}`;
}

function minYMD(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return a < b ? a : b;
}

function maxYMD(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return a > b ? a : b;
}

function createDeferredLocalStorage(delay = 250) {
  if (typeof window === 'undefined') return noopStorage;

  let base;
  try {
    base = window.localStorage;
  } catch {
    return noopStorage;
  }
  if (!base) return noopStorage;
  const pending = new Map();
  const handles = new Map();

  const cancel = (handle) => {
    if (!handle) return;
    if (handle.type === 'idle' && window.cancelIdleCallback) {
      window.cancelIdleCallback(handle.id);
      return;
    }
    window.clearTimeout(handle.id);
  };

  const flush = (name) => {
    if (!pending.has(name)) return;
    const value = pending.get(name);
    pending.delete(name);
    handles.delete(name);
    try {
      base.setItem(name, value);
    } catch (err) {
      console.warn('[academy-store] deferred localStorage write failed', err);
    }
  };

  const flushAll = () => {
    for (const name of pending.keys()) {
      cancel(handles.get(name));
      flush(name);
    }
  };

  const schedule = (name) => {
    cancel(handles.get(name));
    const run = () => flush(name);
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(run, { timeout: 1000 });
      handles.set(name, { type: 'idle', id });
      return;
    }
    const id = window.setTimeout(run, delay);
    handles.set(name, { type: 'timeout', id });
  };

  window.addEventListener('pagehide', flushAll);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });

  return {
    getItem: (name) => {
      const original = base.getItem(name);
      if (original === null) return null;
      const sanitized = sanitizeAcademyStorageValue(original);
      // Remove old sensitive values synchronously, before Zustand hydrates.
      if (sanitized !== original) {
        try {
          if (sanitized === null) base.removeItem(name);
          else base.setItem(name, sanitized);
        } catch {
          base.removeItem(name);
          return null;
        }
      }
      return sanitized;
    },
    setItem: (name, value) => {
      pending.set(name, sanitizeAcademyStorageValue(value));
      schedule(name);
    },
    removeItem: (name) => {
      cancel(handles.get(name));
      pending.delete(name);
      handles.delete(name);
      base.removeItem(name);
    },
  };
}

function createDefaultAcademyProfile() {
  return {
    name: '우리 학원',
    ownerName: '',
    address: '',
    phone: '',
    salaryPaymentDay: 10,
    tuitionDueDay: 1,
    academyType: 'core_subjects',
    academySubjects: ['korean', 'english', 'math'],
    clinicRequired: true,
    clinicDefaultItems: {},
    tuitionPolicy: 'school_level',
    tuitionRates: {},
    jobTitlePermissions: DEFAULT_JOB_TITLE_PERMISSIONS,
  };
}

function createEmptyAcademyScopeState({
  ownerUserId = null,
  ownerAcademyId = null,
  ownerRole = null,
} = {}) {
  return {
    academyProfile: createDefaultAcademyProfile(),
    academyStudents: [],
    classGroups: [],
    classSessions: [],
    clinicTasks: [],
    clinicRecords: [],
    academyTeachers: [],
    academyAssistants: [],
    academyManagers: [],
    academyPayments: [],
    academyLessonRecords: [],
    academyAttendanceRecords: [],
    academyStudentEvents: [],
    academyExamResults: [],
    academyConsultations: [],
    academyPayrolls: [],
    academyStaffShifts: [],
    selectedClassGroupId: null,
    selectedClassSessionId: null,
    selectedAcademyStudentId: null,
    academyDataOwnerUserId: ownerUserId,
    academyDataOwnerAcademyId: ownerAcademyId,
    academyDataOwnerRole: ownerRole,
  };
}

const useAcademyStore = create(
  persist(
    (set, get) => ({
  // === Auth / Mode ===
  role: null,
  currentMode: 'academy',

  // === School Names (autocomplete) ===
  schoolNames: [],
  addSchoolName: (name) => {
    if (!name?.trim()) return;
    set((s) => {
      if (s.schoolNames.includes(name)) return {};
      return { schoolNames: [...s.schoolNames, name] };
    });
  },

  // === Navigation ===
  activeTab: 'home',
  // Academy navigation
  selectedClassGroupId: null,
  selectedClassSessionId: null,
  selectedAcademyStudentId: null,

  // === Academy Workspace (원장/강사/보조강사 공유) ===
  academyProfile: createDefaultAcademyProfile(),
  academyStudents: [],
  classGroups: [],
  classSessions: [],
  clinicTasks: [],
  clinicRecords: [],
  academyTeachers: [],
  academyAssistants: [],
  academyManagers: [],
  academyPayments: [],
  academyLessonRecords: [],
  academyAttendanceRecords: [],
  academyStudentEvents: [],
  academyExamResults: [],
  academyConsultations: [],
  academyPayrolls: [],
  // Phase 30 — 근무표 / 타임카드. 로컬 캐시 + 서버 mirror 예정 (006 SQL 의 academy_staff_shifts).
  // 각 entry: { id, staffId (local), staffRole, date, scheduledStartTime, scheduledEndTime,
  //   actualStartTime, actualEndTime, breakMinutes, status, memo, createdAt, updatedAt, serverId? }
  academyStaffShifts: [],

  // === Account Scoping (Phase 29) ===
  // localStorage 의 academy-store 는 브라우저 단위라서, 같은 브라우저에서
  // 다른 사용자가 로그인하면 이전 사용자의 학원 데이터가 그대로 보이는 leak 이
  // 있었다. 이 필드에 마지막으로 academy 데이터를 쓴 auth.users.id 를 기록해
  // 두고, 다른 사용자로 로그인되면 academy-scoped 데이터를 모두 비운다.
  academyDataOwnerUserId: null,
  // 같은 계정이 여러 학원에 소속된 경우에도 캐시가 섞이지 않도록 현재 학원도 함께 기록한다.
  academyDataOwnerAcademyId: null,
  // 같은 사용자라도 역할이 낮아졌다면 이전 역할에서 받은 넓은 범위의 캐시를
  // 재사용하면 안 된다. 현재 캐시를 만든 앱 역할도 함께 저장한다.
  academyDataOwnerRole: null,

  // === Toast ===
  toast: null,

  // ─── Auth ──────────────────────────────────────────
  setRole: (role) => {
    const ACADEMY_ROLES = ['owner', 'teacher', 'assistant', 'manager'];
    set({
      role: ACADEMY_ROLES.includes(role) ? role : null,
      currentMode: 'academy',
      activeTab: 'home',
      selectedClassGroupId: null,
      selectedClassSessionId: null,
      selectedAcademyStudentId: null,
    });
  },
  logout: () => set({ role: null, currentMode: 'academy' }),

  // ─── Navigation ──────────────────────────
  setActiveTab: (tab) => set({
    activeTab: tab,
    selectedClassGroupId: null,
    selectedClassSessionId: null,
    selectedAcademyStudentId: null,
  }),
  // ─── Navigation (Academy) ─────────────────────────
  navigateToClassGroup: (id) => set({ selectedClassGroupId: id, activeTab: 'classes', selectedClassSessionId: null }),
  navigateToClassSession: (id) => set({ selectedClassSessionId: id }),
  navigateToAcademyStudent: (id) => set({ selectedAcademyStudentId: id, activeTab: 'students' }),
  goBackFromClassGroup: () => set({ selectedClassGroupId: null, selectedClassSessionId: null }),
  goBackFromClassSession: () => set({ selectedClassSessionId: null }),
  goBackFromAcademyStudent: () => set({ selectedAcademyStudentId: null }),

  // ─── Toast ─────────────────────────────────────────
  _toastTimer: null,
  showToast: (message, type = 'success') => {
    const prev = get()._toastTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => set({ toast: null, _toastTimer: null }), 2500);
    set({ toast: { message: localizeUserMessage(message), type }, _toastTimer: timer });
  },

  // ─── Academy Profile ──────────────────────────────
  setAcademyProfile: (profile) => set((s) => ({ academyProfile: { ...s.academyProfile, ...profile } })),

  // ─── Academy Students ─────────────────────────────
  addAcademyStudent: (student) => {
    const newStudent = { ...student, id: `as${Date.now()}`, createdAt: new Date().toISOString() };
    set((s) => ({ academyStudents: [...s.academyStudents, newStudent] }));
    get().showToast('학생이 추가되었습니다.');
    return newStudent;
  },
  updateAcademyStudent: (id, data) => {
    set((s) => ({ academyStudents: s.academyStudents.map((st) => (st.id === id ? { ...st, ...data } : st)) }));
    get().showToast('학생 정보가 수정되었습니다.');
  },
  deleteAcademyStudent: (id) => {
    set((s) => ({ academyStudents: s.academyStudents.filter((st) => st.id !== id) }));
    get().showToast('학생이 삭제되었습니다.');
  },
  // Supabase students row 의 uuid 를 local 학생에 매핑. write-through 성공 후 호출.
  // toast 미발생 — 순수 매핑 기록용.
  setAcademyStudentServerId: (localId, serverId) => {
    if (!localId || !serverId) return;
    set((s) => ({
      academyStudents: s.academyStudents.map((st) =>
        st.id === localId ? { ...st, serverId } : st
      ),
    }));
  },
  // 신규 학생을 반과 앞으로의 수업 회차에 한 번에 배정한다.
  // 과거 회차에는 소급 배정하지 않아 기존 출결 기록을 오염시키지 않는다.
  assignAcademyStudentToClassGroups: ({ studentId, classGroupIds = [], fromDate } = {}) => {
    if (!studentId || !Array.isArray(classGroupIds) || classGroupIds.length === 0) return;
    const selectedGroupIds = new Set(classGroupIds.filter(Boolean));
    const effectiveFromDate = fromDate || getTodayYMD();
    set((s) => {
      const student = s.academyStudents.find(
        (item) => item.id === studentId || item.serverId === studentId,
      );
      if (!student) return {};
      const canonicalStudentId = student.id;
      const studentAliases = new Set(
        [student.id, student.serverId, studentId].filter(Boolean),
      );
      const appendStudent = (ids = []) => [
        ...ids.filter((id) => !studentAliases.has(id)),
        canonicalStudentId,
      ];
      return {
        academyStudents: s.academyStudents.map((item) => (
          item.id === student.id
            ? {
                ...item,
                classGroupIds: [...new Set([
                  ...(item.classGroupIds || []),
                  ...selectedGroupIds,
                ])],
              }
            : item
        )),
        classGroups: s.classGroups.map((group) => (
          selectedGroupIds.has(group.id)
            ? { ...group, studentIds: appendStudent(group.studentIds), updatedAt: new Date().toISOString() }
            : group
        )),
        classSessions: s.classSessions.map((session) => (
          selectedGroupIds.has(session.classGroupId)
          && session.status !== 'canceled'
          && (!session.date || session.date >= effectiveFromDate)
            ? { ...session, studentIds: appendStudent(session.studentIds), updatedAt: new Date().toISOString() }
            : session
        )),
      };
    });
    get().showToast(`${classGroupIds.length}개 수업에 학생을 배정했어요.`);
  },

  // ─── Class Groups (반) ────────────────────────────
  // Phase 38 — group.weekdayTimes (옵션) 가 있으면 각 요일별 시간을 사용한다.
  //   weekdayTimes 구조: { '월': { startTime: '16:00', endTime: '18:00' }, ... }
  //   keys 는 한글 요일 문자열 ('월','화','수','목','금','토','일').
  //   해당 키가 없으면 group.startTime / group.endTime 으로 fallback.
  generateClassSessions: (group, options = {}) => {
    const {
      id: classGroupId, weekdays, startDate, endDate, startTime, endTime,
      room, teacherId, teacherUserId, studentIds, weekdayTimes,
    } = group;
    const dayNameToNum = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 0 };
    const numToDayName = ['일', '월', '화', '수', '목', '금', '토'];
    const daysOfWeek = (weekdays || []).map((d) => dayNameToNum[d]).filter((d) => d !== undefined);
    const targetMonth = options.month || (startDate || getTodayYMD()).slice(0, 7);
    const fromDate = maxYMD(startDate, options.fromDate || monthStartYMD(targetMonth));
    const toDate = minYMD(endDate || '', options.toDate || monthEndYMD(targetMonth));
    if (!fromDate || !toDate || fromDate > toDate) return [];
    const dates = generateClassDates({ daysOfWeek, startDate: fromDate, endDate: toDate, repeatType: '매주' });
    const ts = Date.now();
    return dates.map((date, i) => {
      const dayName = numToDayName[getKoreanWeekdayIndex(date)];
      const perDay = weekdayTimes?.[dayName];
      const sessionStart = perDay?.startTime || startTime;
      const sessionEnd = perDay?.endTime || endTime;
      return {
        id: `cs${ts}_${i}`,
        classGroupId,
        date,
        startTime: sessionStart,
        endTime: sessionEnd,
        room: room || '',
        teacherId: teacherId || '',
        // Phase 44 — server-stable user id (cross-device 매칭)
        teacherUserId: teacherUserId || '',
        assistantIds: [],
        studentIds: studentIds || [],
        recordSchema: normalizeRecordSchema(group.recordSchema || group.recordBlocks),
        activityType: group.activityType || 'regular_class',
        activityName: group.activityName || '',
        sessionKind: 'regular',
        originSessionId: null,
        status: 'scheduled',
        memo: '',
        createdAt: new Date().toISOString(),
      };
    });
  },
  addClassGroup: (groupData, { generateSessions = true } = {}) => {
    const groupId = `cg${Date.now()}`;
    const newGroup = { ...groupData, id: groupId, createdAt: new Date().toISOString() };
    const sessions = generateSessions ? get().generateClassSessions(newGroup) : [];
    set((s) => ({
      classGroups: [...s.classGroups, newGroup],
      classSessions: [...s.classSessions, ...sessions],
    }));
    if (generateSessions) {
      const monthLabel = (newGroup.startDate || getTodayYMD()).slice(0, 7);
      get().showToast(`반이 생성되었어요. ${monthLabel} 수업 ${sessions.length}회차를 만들었어요.`);
    } else {
      get().showToast('반이 생성되었어요.');
    }
    // 10단계: write-through 호출처가 생성된 sessions 에 serverId 매핑할 수 있도록
    // group 과 sessions 를 함께 반환. 기존 caller 는 newGroup.id / .name 등으로
    // 사용 중이라 group 을 그대로 spread 한다 (호환).
    return { ...newGroup, group: newGroup, sessions };
  },
  ensureClassSessionsForMonth: (groupId, month) => {
    if (!groupId || !month) return [];
    const group = get().classGroups.find((g) => g.id === groupId);
    if (!group) return [];
    const generated = get().generateClassSessions(group, { month });
    if (generated.length === 0) return [];
    const existingKeys = new Set(
      get().classSessions
        .filter((s) => s.classGroupId === groupId)
        .map((s) => `${s.date}__${(s.startTime || '').slice(0, 5)}`)
    );
    const missing = generated.filter((s) => !existingKeys.has(`${s.date}__${(s.startTime || '').slice(0, 5)}`));
    if (missing.length === 0) return [];
    set((s) => ({
      classSessions: [...s.classSessions, ...missing],
    }));
    return missing;
  },
  ensureStaffShiftsForMonth: ({
    month,
    rules = [],
    exceptions = [],
    academyTeachers = [],
    academyAssistants = [],
    academyManagers = [],
  } = {}) => {
    if (!month) return [];
    const fromDate = monthStartYMD(month);
    const toDate = monthEndYMD(month);
    if (!fromDate || !toDate) return [];

    const plannedRaw = buildPlannedStaffSchedule({
      rules,
      exceptions,
      fromDate,
      toDate,
    });
    const planned = plannedToStaffShiftShape(plannedRaw, {
      academyTeachers,
      academyAssistants,
      academyManagers,
    });
    if (planned.length === 0) return [];

    const keyOf = (shift) => {
      const staffKey = shift.staffUserId || shift.staffId || '';
      const start = (shift.scheduledStartTime || shift.startTime || '').slice(0, 5);
      return `${shift.date}__${staffKey}__${start}`;
    };
    const existingKeys = new Set(
      (get().academyStaffShifts || [])
        .filter((shift) => shift?.status !== 'canceled' && shift?.date?.startsWith(month))
        .map(keyOf)
        .filter(Boolean),
    );
    const missing = [];
    for (const shift of planned) {
      if (!shift?.date || !shift.staffUserId || !shift.scheduledStartTime || !shift.scheduledEndTime) continue;
      const key = keyOf(shift);
      if (!key || existingKeys.has(key)) continue;
      existingKeys.add(key);
      missing.push({
        staffId: shift.staffId || '',
        staffUserId: shift.staffUserId || '',
        staffRole: shift.staffRole || 'teacher',
        date: shift.date,
        scheduledStartTime: shift.scheduledStartTime || '',
        scheduledEndTime: shift.scheduledEndTime || '',
        breakMinutes: Number(shift.breakMinutes) || 0,
        actualStartTime: null,
        actualEndTime: null,
        status: 'scheduled',
        memo: shift.memo || '',
      });
    }
    if (missing.length === 0) return [];
    const ts = Date.now();
    const rows = missing.map((shift, index) => ({
      id: `shift_auto_${ts}_${index}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...shift,
    }));
    set((s) => ({
      academyStaffShifts: [...(s.academyStaffShifts || []), ...rows],
    }));
    return rows;
  },
  updateClassGroup: (groupId, updates) => {
    set((s) => ({
      classGroups: s.classGroups.map((g) => (g.id === groupId ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g)),
    }));
    get().showToast('반 정보가 수정되었습니다.');
  },
  deleteClassGroup: (groupId) => {
    set((s) => ({
      classGroups: s.classGroups.filter((g) => g.id !== groupId),
      classSessions: s.classSessions.filter((session) => session.classGroupId !== groupId),
      clinicTasks: s.clinicTasks.filter((t) => t.classGroupId !== groupId),
    }));
    get().showToast('반이 삭제되었습니다.');
  },
  // Supabase class_groups row 의 uuid 를 local 반에 매핑. write-through 성공 후 호출.
  setClassGroupServerId: (localId, serverId) => {
    if (!localId || !serverId) return;
    set((s) => ({
      classGroups: s.classGroups.map((g) =>
        g.id === localId ? { ...g, serverId } : g
      ),
    }));
  },

  // ─── Class Sessions (수업 회차) ───────────────────
  addClassSession: (sessionData) => {
    const session = {
      ...sessionData,
      id: sessionData.id || `cs_manual_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set((s) => ({ classSessions: [...s.classSessions, session] }));
    get().showToast(session.sessionKind === 'makeup' ? '보강 회차를 만들었어요.' : '수업 회차를 만들었어요.');
    return session;
  },
  updateClassSession: (sessionId, updates) => {
    set((s) => ({
      classSessions: s.classSessions.map((session) =>
        session.id === sessionId ? { ...session, ...updates, updatedAt: new Date().toISOString() } : session
      ),
    }));
    get().showToast('수업 회차가 수정되었습니다.');
  },
  applyRecordSchemaToFutureSessions: (groupId, recordSchema, fromDate = getTodayYMD()) => {
    const normalized = normalizeRecordSchema(recordSchema, []);
    set((s) => ({
      classSessions: s.classSessions.map((session) => (
        session.classGroupId === groupId
        && session.date >= fromDate
        && session.status !== 'completed'
        && session.status !== 'canceled'
          ? { ...session, recordSchema: normalized, updatedAt: new Date().toISOString() }
          : session
      )),
    }));
  },
  // Supabase class_sessions row 의 uuid 를 local session 에 매핑 (silent).
  setClassSessionServerId: (localId, serverId) => {
    if (!localId || !serverId) return;
    set((s) => ({
      classSessions: s.classSessions.map((cs) =>
        cs.id === localId ? { ...cs, serverId } : cs
      ),
    }));
  },
  // bulk insert 후 (localId, serverId) 쌍을 한번에 매핑. silent.
  setClassSessionServerIds: (pairs) => {
    if (!Array.isArray(pairs) || pairs.length === 0) return;
    const map = new Map(pairs.filter((p) => p?.localId && p?.serverId).map((p) => [p.localId, p.serverId]));
    if (map.size === 0) return;
    set((s) => ({
      classSessions: s.classSessions.map((cs) =>
        map.has(cs.id) ? { ...cs, serverId: map.get(cs.id) } : cs
      ),
    }));
  },
  // 날짜 범위 실체화나 실시간 새로고침 직후 class_sessions만 가볍게 동기화한다.
  // 전체 snapshot hydrate를 다시 돌리지 않아 작성 중인 학생/클리닉 상태를 건드리지 않는다.
  syncClassSessionsFromServer: (serverRows = [], { preserveLocalOnly = true } = {}) => {
    const mapped = (Array.isArray(serverRows) ? serverRows : [])
      .map(mapServerClassSessionToLocal)
      .filter(Boolean);
    set((s) => {
      const assistantByUserId = new Map(
        (s.academyAssistants || [])
          .filter((assistant) => assistant?.serverUserId)
          .map((assistant) => [assistant.serverUserId, assistant.id]),
      );
      const resolved = mapped.map((session) => ({
        ...session,
        assistantIds: (session.assistantUserIds || [])
          .map((userId) => assistantByUserId.get(userId))
          .filter(Boolean),
      }));
      const serverIds = new Set(resolved.map((session) => session.id));
      const preserved = preserveLocalOnly
        ? (s.classSessions || []).filter((session) => (
            !serverIds.has(session.id)
            && (!session.serverId || !serverIds.has(session.serverId))
          ))
        : [];
      return { classSessions: [...preserved, ...resolved] };
    });
    return mapped;
  },
  // Realtime 부분 갱신용. 서버에서 다시 읽은 한 테이블만 로컬 화면 캐시에
  // 반영해 다른 화면에서 작성 중인 데이터가 불필요하게 교체되지 않도록 한다.
  syncAcademyTableFromServer: (
    dataset,
    serverRows = [],
    { preserveLocalOnly = false } = {},
  ) => {
    const rows = Array.isArray(serverRows) ? serverRows : [];
    const mergeById = (localRows, mappedRows) => {
      const serverIds = new Set(mappedRows.map((row) => row.id));
      const preserved = preserveLocalOnly
        ? (localRows || []).filter((row) => (
            !serverIds.has(row.id)
            && (!row.serverId || !serverIds.has(row.serverId))
          ))
        : [];
      return [...preserved, ...mappedRows];
    };
    const resolveAssistantIds = (mappedRows, assistants) => {
      const localIdByUserId = new Map(
        (assistants || [])
          .filter((assistant) => assistant?.serverUserId)
          .map((assistant) => [assistant.serverUserId, assistant.id]),
      );
      return mappedRows.map((row) => ({
        ...row,
        assistantIds: (row.assistantUserIds || [])
          .map((userId) => localIdByUserId.get(userId))
          .filter(Boolean),
      }));
    };

    let mapped = [];
    set((state) => {
      switch (dataset) {
        case 'students':
          mapped = rows.map(mapServerStudentToLocal).filter(Boolean);
          return { academyStudents: mergeById(state.academyStudents, mapped) };
        case 'examResults':
          mapped = rows.map(mapServerExamResultToLocal).filter(Boolean);
          return { academyExamResults: mergeById(state.academyExamResults, mapped) };
        case 'classGroups':
          mapped = resolveAssistantIds(
            rows.map(mapServerClassGroupToLocal).filter(Boolean),
            state.academyAssistants,
          );
          return { classGroups: mergeById(state.classGroups, mapped) };
        case 'lessonRecords': {
          mapped = rows.flatMap(expandServerLessonRecordToLocal);
          const serverSessionIds = new Set(mapped.map((row) => row.sessionId));
          const preserved = preserveLocalOnly
            ? (state.academyLessonRecords || []).filter(
                (row) => !serverSessionIds.has(row.sessionId),
              )
            : [];
          return { academyLessonRecords: [...preserved, ...mapped] };
        }
        case 'attendanceRecords': {
          mapped = rows.map(mapServerAttendanceRecordToLocal).filter(Boolean);
          const serverKeys = new Set(
            mapped.map((row) => `${row.sessionId}__${row.studentId}`),
          );
          const preserved = preserveLocalOnly
            ? (state.academyAttendanceRecords || []).filter(
                (row) => !serverKeys.has(`${row.sessionId}__${row.studentId}`),
              )
            : [];
          return { academyAttendanceRecords: [...preserved, ...mapped] };
        }
        case 'clinicRecords':
          mapped = rows.map(mapServerClinicRecordToLocal).filter(Boolean);
          return { clinicRecords: mergeById(state.clinicRecords, mapped) };
        case 'payments':
          mapped = rows.map(mapServerPaymentToLocal).filter(Boolean);
          return { academyPayments: mergeById(state.academyPayments, mapped) };
        case 'payrolls':
          mapped = rows.map(mapServerPayrollToLocal).filter(Boolean);
          return { academyPayrolls: mergeById(state.academyPayrolls, mapped) };
        default:
          return {};
      }
    });
    return mapped;
  },
  deleteClassSession: (sessionId) => {
    set((s) => ({
      classSessions: s.classSessions.filter((s2) => s2.id !== sessionId),
      academyAttendanceRecords: s.academyAttendanceRecords.filter((a) => a.sessionId !== sessionId),
      academyLessonRecords: s.academyLessonRecords.filter((lr) => lr.sessionId !== sessionId),
    }));
    get().showToast('수업 회차가 삭제되었습니다.');
  },

  // ─── Academy Attendance ───────────────────────────
  // SQL 049 — 등원 추론은 이 액션으로 만들지 않는다. 선생님이 출석 버튼을
  // 눌렀을 때 확정 출석과 확정 시각/담당자를 로컬 캐시에 기록한다.
  updateAcademyAttendance: (
    sessionId,
    studentId,
    status,
    {
      source = 'teacher_manual',
      checkedAt,
      confirmationState = 'teacher_confirmed',
      confirmedAt,
      confirmedBy,
      silent,
    } = {},
  ) => {
    const existing = get().academyAttendanceRecords.find(
      (a) => a.sessionId === sessionId && a.studentId === studentId
    );
    const session = get().classSessions.find((s) => s.id === sessionId);
    const now = new Date().toISOString();
    if (existing) {
      set((s) => ({
        academyAttendanceRecords: s.academyAttendanceRecords.map((a) =>
          a.id === existing.id
            ? {
                ...a,
                status,
                source,
                checkedAt: checkedAt ?? a.checkedAt ?? null,
                confirmationState,
                confirmedAt: confirmedAt || now,
                confirmedBy: confirmedBy ?? a.confirmedBy ?? null,
              }
            : a
        ),
      }));
    } else {
      set((s) => ({
        academyAttendanceRecords: [
          ...s.academyAttendanceRecords,
          {
            id: `aa${Date.now()}`,
            sessionId,
            studentId,
            date: session?.date || '',
            status,
            source,
            checkedAt: checkedAt || null,
            confirmationState,
            confirmedAt: confirmedAt || now,
            confirmedBy: confirmedBy || null,
          },
        ],
      }));
    }
    if (!silent) get().showToast('출결이 저장되었습니다.');
  },

  // ─── Academy Lesson Records ───────────────────────
  saveAcademyLessonRecord: (record) => {
    const existing = get().academyLessonRecords.find(
      (lr) => lr.sessionId === record.sessionId && lr.studentId === record.studentId
    );
    if (existing) {
      set((s) => ({
        academyLessonRecords: s.academyLessonRecords.map((lr) =>
          lr.id === existing.id ? { ...lr, ...record, updatedAt: new Date().toISOString() } : lr
        ),
      }));
    } else {
      set((s) => ({
        academyLessonRecords: [...s.academyLessonRecords, { ...record, id: `alr${Date.now()}`, createdAt: new Date().toISOString() }],
      }));
    }
    get().showToast('수업 기록이 저장되었습니다.');
  },

  // 공통 기록 + 학생별 평가를 한 번에 저장 (toast 1회)
  batchSaveSessionRecords: ({ sessionId, date, commonRecord, studentRecords, serverUpdatedAt }) => {
    const ts = serverUpdatedAt || new Date().toISOString();
    const existing = get().academyLessonRecords;
    const updated = [...existing];

    const upsert = (studentId, data) => {
      const idx = updated.findIndex((lr) => lr.sessionId === sessionId && lr.studentId === studentId);
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], ...data, updatedAt: ts };
      } else {
        updated.push({ id: `alr${Date.now()}_${studentId}`, sessionId, studentId, date, ...data, createdAt: ts, updatedAt: ts });
      }
    };

    if (commonRecord) upsert('_common_', commonRecord);
    Object.entries(studentRecords || {}).forEach(([sid, rec]) => upsert(sid, rec));

    set({ academyLessonRecords: updated });
    get().showToast('수업 기록이 저장되었어요.');
  },

  // ─── Clinic Tasks ─────────────────────────────────
  addClinicTask: (task) => {
    const newTask = { ...task, id: `clinic${Date.now()}`, status: task.status || 'pending', createdAt: new Date().toISOString() };
    set((s) => ({ clinicTasks: [...s.clinicTasks, newTask] }));
    get().showToast('클리닉 업무가 추가되었습니다.');
    return newTask;
  },
  updateClinicTask: (taskId, updates) => {
    set((s) => ({
      clinicTasks: s.clinicTasks.map((t) => (t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t)),
    }));
  },
  deleteClinicTask: (taskId) => {
    set((s) => ({ clinicTasks: s.clinicTasks.filter((t) => t.id !== taskId) }));
    get().showToast('클리닉이 삭제되었습니다.');
  },
  completeClinicTask: (taskId, resultMemo) => {
    set((s) => ({
      clinicTasks: s.clinicTasks.map((t) =>
        t.id === taskId
          ? { ...t, status: 'completed', resultMemo, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : t
      ),
    }));
    get().showToast('클리닉이 완료 처리되었습니다.');
  },
  assignClinicTask: (taskId, assignedToId) => {
    set((s) => ({
      clinicTasks: s.clinicTasks.map((t) => (t.id === taskId ? { ...t, assignedToId, updatedAt: new Date().toISOString() } : t)),
    }));
    get().showToast('담당자가 배정되었습니다.');
  },

  // ─── Clinic Records (기록형 클리닉) ────────────────
  addClinicRecord: (record, { silent = false } = {}) => {
    const newRecord = {
      ...record,
      id: `cr${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set((s) => ({ clinicRecords: [...(s.clinicRecords || []), newRecord] }));
    if (!silent) get().showToast('클리닉 기록이 저장되었어요.');
    return newRecord;
  },
  updateClinicRecord: (recordId, updates, { silent = false } = {}) => {
    set((s) => ({
      clinicRecords: (s.clinicRecords || []).map((r) =>
        r.id === recordId ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
      ),
    }));
    if (!silent) get().showToast('클리닉 기록이 수정되었어요.');
  },
  deleteClinicRecord: (recordId) => {
    set((s) => ({ clinicRecords: (s.clinicRecords || []).filter((r) => r.id !== recordId) }));
    get().showToast('클리닉 기록이 삭제되었어요.');
  },
  // 서버 저장 성공 후 local clinicRecord 에 serverId 주입 (toast 없음).
  setClinicRecordServerId: (localId, serverId) => {
    if (!localId || !serverId) return;
    set((s) => ({
      clinicRecords: (s.clinicRecords || []).map((r) =>
        r.id === localId ? { ...r, serverId } : r
      ),
    }));
  },

  // ─── Academy Teachers ─────────────────────────────
  addTeacher: (teacher) => {
    const newTeacher = { ...teacher, id: `t${Date.now()}`, status: teacher.status || 'active' };
    set((s) => ({ academyTeachers: [...s.academyTeachers, newTeacher] }));
    get().showToast('강사가 추가되었습니다.');
    return newTeacher;
  },
  updateTeacher: (teacherId, updates) => {
    set((s) => ({ academyTeachers: s.academyTeachers.map((t) => (t.id === teacherId ? { ...t, ...updates } : t)) }));
    get().showToast('강사 정보가 수정되었습니다.');
  },
  deleteTeacher: (teacherId) => {
    set((s) => ({ academyTeachers: s.academyTeachers.filter((t) => t.id !== teacherId) }));
    get().showToast('강사가 삭제되었습니다.');
  },

  // ─── Academy Assistants ───────────────────────────
  addAssistant: (assistant) => {
    const newAssistant = { ...assistant, id: `ast${Date.now()}`, status: assistant.status || 'active' };
    set((s) => ({ academyAssistants: [...s.academyAssistants, newAssistant] }));
    get().showToast('보조강사가 추가되었습니다.');
    return newAssistant;
  },
  updateAssistant: (assistantId, updates) => {
    set((s) => ({ academyAssistants: s.academyAssistants.map((a) => (a.id === assistantId ? { ...a, ...updates } : a)) }));
    get().showToast('보조강사 정보가 수정되었습니다.');
  },
  deleteAssistant: (assistantId) => {
    set((s) => ({ academyAssistants: s.academyAssistants.filter((a) => a.id !== assistantId) }));
    get().showToast('보조강사가 삭제되었습니다.');
  },

  // ─── Academy Operations Managers ───────────────────
  // 운영 매니저는 데스크 실무를 담당하는 별도 직원군이다. 강사/보조강사와
  // 동일하게 근무표·급여 데이터에는 포함되지만 수업/클리닉 배정에는 쓰지 않는다.
  addManager: (manager) => {
    const newManager = { ...manager, id: `mgr${Date.now()}`, status: manager.status || 'active' };
    set((s) => ({ academyManagers: [...s.academyManagers, newManager] }));
    get().showToast('운영 매니저가 추가되었습니다.');
    return newManager;
  },
  updateManager: (managerId, updates) => {
    set((s) => ({ academyManagers: s.academyManagers.map((m) => (m.id === managerId ? { ...m, ...updates } : m)) }));
    get().showToast('운영 매니저 정보가 수정되었습니다.');
  },
  deleteManager: (managerId) => {
    set((s) => ({ academyManagers: s.academyManagers.filter((m) => m.id !== managerId) }));
    get().showToast('운영 매니저가 삭제되었습니다.');
  },
  // 서버 멤버십을 inactive로 전환한 직원을 현재 기기의 목록에서도 즉시 숨긴다.
  // 과거 기록이 참조하는 로컬 ID는 유지하고 상태만 바꾼다.
  deactivateLocalStaff: (staffId, role, identity = {}) => {
    const collectionKey = role === 'manager'
      ? 'academyManagers'
      : role === 'assistant'
        ? 'academyAssistants'
        : 'academyTeachers';
    const serverUserId = identity.serverUserId || identity.userId || null;
    const academyMemberId = identity.academyMemberId || identity.memberId || null;
    const normalizedEmail = String(identity.email || '').trim().toLowerCase();
    const deactivateMatches = (staff, key) => {
      const matches = (
        (key === collectionKey && staff.id === staffId)
        || (serverUserId && staff.serverUserId === serverUserId)
        || (academyMemberId && staff.academyMemberId === academyMemberId)
        || (normalizedEmail && String(staff.email || '').trim().toLowerCase() === normalizedEmail)
      );
      return matches && staff.status !== 'inactive' ? { ...staff, status: 'inactive' } : staff;
    };
    set((state) => ({
      academyTeachers: (state.academyTeachers || [])
        .map((staff) => deactivateMatches(staff, 'academyTeachers')),
      academyAssistants: (state.academyAssistants || [])
        .map((staff) => deactivateMatches(staff, 'academyAssistants')),
      academyManagers: (state.academyManagers || [])
        .map((staff) => deactivateMatches(staff, 'academyManagers')),
    }));
  },
  // 서버가 돌려준 활성 멤버 목록을 기준으로, 이전 브라우저 세션에 남아 있는
  // 서버 연결 직원만 비활성화한다. 과거 수업/급여가 참조하는 로컬 ID는 보존한다.
  reconcileLocalStaffWithActiveMembers: (activeMembers = []) => {
    let result = { deactivated: 0, skipped: true };
    set((state) => {
      result = reconcileStaffCollectionsWithActiveMembers({
        teachers: state.academyTeachers,
        assistants: state.academyAssistants,
        managers: state.academyManagers,
      }, activeMembers);
      if (result.skipped) return {};
      return {
        academyTeachers: result.teachers,
        academyAssistants: result.assistants,
        academyManagers: result.managers,
      };
    });
    return { deactivated: result.deactivated, skipped: result.skipped };
  },
  changeLocalStaffRole: (staffId, fromRole, toRole, updates = {}) => {
    if (!staffId || fromRole === toRole) return null;
    const collectionKey = (staffRole) => (
      staffRole === 'assistant' ? 'academyAssistants'
        : staffRole === 'manager' ? 'academyManagers'
          : 'academyTeachers'
    );
    const fromKey = collectionKey(fromRole);
    const toKey = collectionKey(toRole);
    let moved = null;
    set((s) => {
      const source = (s[fromKey] || []).find((staff) => staff.id === staffId);
      if (!source) return {};
      const sourceEmail = (source.email || '').trim().toLowerCase();
      const nextFrom = (s[fromKey] || []).filter((staff) => staff.id !== staffId);
      const targetIdx = (s[toKey] || []).findIndex((staff) =>
        staff.id === staffId ||
        (source.serverUserId && staff.serverUserId === source.serverUserId) ||
        (source.academyMemberId && staff.academyMemberId === source.academyMemberId) ||
        (sourceEmail && (staff.email || '').trim().toLowerCase() === sourceEmail)
      );
      moved = {
        ...(targetIdx >= 0 ? s[toKey][targetIdx] : {}),
        ...source,
        ...updates,
        id: source.id,
        status: updates.status || source.status || 'active',
      };
      const nextTo = (s[toKey] || []).slice();
      if (targetIdx >= 0) nextTo[targetIdx] = moved;
      else nextTo.push(moved);
      return {
        [fromKey]: nextFrom,
        [toKey]: nextTo,
        academyStaffShifts: (s.academyStaffShifts || []).map((sh) =>
          sh.staffId === staffId ? { ...sh, staffRole: toRole } : sh
        ),
      };
    });
    return moved;
  },

  // ─── Server-mirrored staff upsert ─────────────────────
  // Phase 23: take a payload built from `profiles` + `academy_staff_profiles`
  // and merge it into the local academyTeachers / academyAssistants arrays.
  //
  // Matching rules (first match wins):
  //   1) existing.serverUserId === userId
  //   2) existing.academyMemberId === memberId
  //   3) lowercase(existing.email) === lowercase(email)  (only when both present)
  //
  // Behavior:
  //   - existing match → patch in place, KEEP the local id (so classSessions
  //     that reference it via teacherId stay valid, and payroll keeps matching)
  //   - no match → append a new entry with stable id `teacher_${userId}` /
  //     `assistant_${userId}` (so future syncs hit branch 1, not duplicate)
  //   - 같은 서버 직원이 다른 역할 배열에 남아 있으면 현재 역할 배열로 이동한다.
  //     역할 변경 뒤 과거 역할 카드가 중복 노출되지 않도록 서버 신원을 기준으로 정리한다.
  //
  // Quiet by design — these are triggered from sync orchestration on the
  // workspace store, not direct user action, so no toast.
  upsertLocalTeacherFromServerStaff: (payload = {}) => {
    const {
      userId, memberId, email, displayName, phone,
      jobTitle, subject, subjects, wageType, hourlyWage, monthlySalary, hourlyMode, memo, status,
    } = payload;
    if (!userId) return null;
    const normalizedEmail = (email || '').trim().toLowerCase() || null;

    let saved = null;
    set((s) => {
      const matchesIdentity = (staff) => (
        (staff.serverUserId && staff.serverUserId === userId)
        || (memberId && staff.academyMemberId && staff.academyMemberId === memberId)
        || (normalizedEmail && (staff.email || '').trim().toLowerCase() === normalizedEmail)
      );
      const existing = [
        ...s.academyTeachers,
        ...s.academyAssistants,
        ...s.academyManagers,
      ].find(matchesIdentity) || null;
      const stableId = existing?.id || `teacher_${userId}`;

      const merged = {
        ...(existing || {}),
        id: stableId,
        serverUserId: userId,
        academyMemberId: memberId || existing?.academyMemberId || null,
        email: normalizedEmail,
        name: displayName || existing?.name || normalizedEmail || '(이름 없음)',
        phone: phone || existing?.phone || '',
        jobTitle: jobTitle !== undefined ? jobTitle : (existing?.jobTitle ?? ''),
        subject: subject !== undefined ? subject : (existing?.subject ?? ''),
        subjects: Array.isArray(subjects)
          ? subjects
          : (Array.isArray(existing?.subjects) ? existing.subjects : []),
        wageType: wageType || existing?.wageType || 'hourly',
        hourlyWage: hourlyWage !== undefined && hourlyWage !== null
          ? toWonInteger(hourlyWage)
          : (existing?.hourlyWage ?? 0),
        monthlySalary: monthlySalary !== undefined && monthlySalary !== null
          ? toWonInteger(monthlySalary)
          : (existing?.monthlySalary ?? 0),
        hourlyMode: 'actualAttendance',
        memo: memo !== undefined ? memo : (existing?.memo ?? ''),
        status: status || existing?.status || 'active',
        source: 'server',
      };
      saved = merged;
      return {
        academyTeachers: [
          ...s.academyTeachers.filter((staff) => !matchesIdentity(staff)),
          merged,
        ],
        academyAssistants: s.academyAssistants.filter((staff) => !matchesIdentity(staff)),
        academyManagers: s.academyManagers.filter((staff) => !matchesIdentity(staff)),
      };
    });
    return saved;
  },

  upsertLocalAssistantFromServerStaff: (payload = {}) => {
    const {
      userId, memberId, email, displayName, phone,
      jobTitle, subject, subjects, wageType, hourlyWage, monthlySalary, hourlyMode, memo, status,
    } = payload;
    if (!userId) return null;
    const normalizedEmail = (email || '').trim().toLowerCase() || null;

    let saved = null;
    set((s) => {
      const matchesIdentity = (staff) => (
        (staff.serverUserId && staff.serverUserId === userId)
        || (memberId && staff.academyMemberId && staff.academyMemberId === memberId)
        || (normalizedEmail && (staff.email || '').trim().toLowerCase() === normalizedEmail)
      );
      const existing = [
        ...s.academyAssistants,
        ...s.academyTeachers,
        ...s.academyManagers,
      ].find(matchesIdentity) || null;
      const stableId = existing?.id || `assistant_${userId}`;

      const merged = {
        ...(existing || {}),
        id: stableId,
        serverUserId: userId,
        academyMemberId: memberId || existing?.academyMemberId || null,
        email: normalizedEmail,
        name: displayName || existing?.name || normalizedEmail || '(이름 없음)',
        phone: phone || existing?.phone || '',
        jobTitle: jobTitle !== undefined ? jobTitle : (existing?.jobTitle ?? ''),
        subject: subject !== undefined ? subject : (existing?.subject ?? ''),
        subjects: Array.isArray(subjects)
          ? subjects
          : (Array.isArray(existing?.subjects) ? existing.subjects : []),
        wageType: wageType || existing?.wageType || 'hourly',
        hourlyWage: hourlyWage !== undefined && hourlyWage !== null
          ? toWonInteger(hourlyWage)
          : (existing?.hourlyWage ?? 0),
        monthlySalary: monthlySalary !== undefined && monthlySalary !== null
          ? toWonInteger(monthlySalary)
          : (existing?.monthlySalary ?? 0),
        hourlyMode: 'actualAttendance',
        memo: memo !== undefined ? memo : (existing?.memo ?? ''),
        status: status || existing?.status || 'active',
        source: 'server',
      };
      saved = merged;
      return {
        academyTeachers: s.academyTeachers.filter((staff) => !matchesIdentity(staff)),
        academyAssistants: [
          ...s.academyAssistants.filter((staff) => !matchesIdentity(staff)),
          merged,
        ],
        academyManagers: s.academyManagers.filter((staff) => !matchesIdentity(staff)),
      };
    });
    return saved;
  },

  upsertLocalManagerFromServerStaff: (payload = {}) => {
    const {
      userId, memberId, email, displayName, phone,
      jobTitle, subject, subjects, wageType, hourlyWage, monthlySalary, memo, status,
    } = payload;
    if (!userId) return null;
    const normalizedEmail = (email || '').trim().toLowerCase() || null;
    let saved = null;
    set((s) => {
      const matchesIdentity = (staff) => (
        (staff.serverUserId && staff.serverUserId === userId)
        || (memberId && staff.academyMemberId && staff.academyMemberId === memberId)
        || (normalizedEmail && (staff.email || '').trim().toLowerCase() === normalizedEmail)
      );
      const existing = [
        ...s.academyManagers,
        ...s.academyTeachers,
        ...s.academyAssistants,
      ].find(matchesIdentity) || null;
      const merged = {
        ...(existing || {}),
        id: existing?.id || `manager_${userId}`,
        serverUserId: userId,
        academyMemberId: memberId || existing?.academyMemberId || null,
        email: normalizedEmail,
        name: displayName || existing?.name || normalizedEmail || '(이름 없음)',
        phone: phone || existing?.phone || '',
        jobTitle: jobTitle !== undefined ? jobTitle : (existing?.jobTitle ?? ''),
        subject: subject !== undefined ? subject : (existing?.subject ?? '운영'),
        subjects: Array.isArray(subjects) ? subjects : (Array.isArray(existing?.subjects) ? existing.subjects : []),
        wageType: wageType || existing?.wageType || 'hourly',
        hourlyWage: hourlyWage !== undefined && hourlyWage !== null ? toWonInteger(hourlyWage) : (existing?.hourlyWage ?? 0),
        monthlySalary: monthlySalary !== undefined && monthlySalary !== null ? toWonInteger(monthlySalary) : (existing?.monthlySalary ?? 0),
        hourlyMode: 'actualAttendance',
        memo: memo !== undefined ? memo : (existing?.memo ?? ''),
        status: status || existing?.status || 'active',
        source: 'server',
      };
      saved = merged;
      return {
        academyTeachers: s.academyTeachers.filter((staff) => !matchesIdentity(staff)),
        academyAssistants: s.academyAssistants.filter((staff) => !matchesIdentity(staff)),
        academyManagers: [
          ...s.academyManagers.filter((staff) => !matchesIdentity(staff)),
          merged,
        ],
      };
    });
    return saved;
  },

  // ─── Staff rekey (manual reconciliation) ──────────────
  // Phase 24: owner-driven action to move existing class/session/clinic
  // assignments from an old local staff id (e.g. t1700000000) onto a
  // server-linked local staff id (e.g. teacher_<userId>).
  //
  // Why manual: auto-rekey is unsafe — names may coincide, owner may have
  // intentionally separated entries, and we never want to silently rewrite
  // historical records. Owner runs it from the staff detail page.
  //
  // Returns { classGroupsTouched, classSessionsTouched } so the UI can
  // show a precise summary in the confirmation toast.
  rekeyTeacherSessions: (fromTeacherId, toTeacherId) => {
    if (!fromTeacherId || !toTeacherId || fromTeacherId === toTeacherId) {
      return { classGroupsTouched: 0, classSessionsTouched: 0 };
    }
    let classGroupsTouched = 0;
    let classSessionsTouched = 0;
    set((s) => {
      const classGroups = s.classGroups.map((g) => {
        if (g.teacherId === fromTeacherId) {
          classGroupsTouched += 1;
          return { ...g, teacherId: toTeacherId };
        }
        return g;
      });
      const classSessions = s.classSessions.map((sess) => {
        if (sess.teacherId === fromTeacherId) {
          classSessionsTouched += 1;
          return { ...sess, teacherId: toTeacherId };
        }
        return sess;
      });
      return { classGroups, classSessions };
    });
    return { classGroupsTouched, classSessionsTouched };
  },

  // Move clinic task assignments from an old assistant local id to a new
  // (server-linked) one. Keeps existing clinic_records / clinicTasks history.
  rekeyAssistantClinicTasks: (fromAssistantId, toAssistantId) => {
    if (!fromAssistantId || !toAssistantId || fromAssistantId === toAssistantId) {
      return { clinicTasksTouched: 0 };
    }
    let clinicTasksTouched = 0;
    set((s) => {
      const clinicTasks = s.clinicTasks.map((t) => {
        if (t.assignedToId === fromAssistantId) {
          clinicTasksTouched += 1;
          return { ...t, assignedToId: toAssistantId };
        }
        return t;
      });
      return { clinicTasks };
    });
    return { clinicTasksTouched };
  },

  // ─── Academy Payments ─────────────────────────────
  addAcademyPayment: (payment) => {
    const newPayment = { ...payment, id: `ap${Date.now()}` };
    set((s) => ({ academyPayments: [...s.academyPayments, newPayment] }));
    get().showToast('수납 항목이 추가되었습니다.');
    return newPayment;
  },
  updateAcademyPayment: (id, data) => {
    set((s) => ({ academyPayments: s.academyPayments.map((p) => (p.id === id ? { ...p, ...data } : p)) }));
    get().showToast('수납 정보가 업데이트되었습니다.');
  },
  deleteAcademyPayment: (id) => {
    set((s) => ({ academyPayments: s.academyPayments.filter((p) => p.id !== id) }));
    get().showToast('수납 항목이 삭제되었습니다.');
  },
  // 서버 저장 성공 후 local payment 에 serverId 주입 (toast 없음).
  setPaymentServerId: (localId, serverId) => {
    if (!localId || !serverId) return;
    set((s) => ({
      academyPayments: s.academyPayments.map((p) =>
        p.id === localId ? { ...p, serverId } : p
      ),
    }));
  },
  generateAcademyPaymentsForMonth: (month) => {
    const {
      academyStudents, classGroups, classSessions, academyPayments, academyProfile,
    } = get();
    const newPayments = [];
    const updatedPayments = [];
    const [year, monthNumber] = String(month || '').split('-').map(Number);
    if (!year || !monthNumber) return { created: [], updated: [] };
    const dueDay = Math.max(1, Number(academyProfile?.tuitionDueDay) || 1);
    const lastDay = getDaysInMonth(year, monthNumber);
    const dueDate = `${month}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
    // 아직 화면에서 해당 월을 열지 않아 회차가 materialize 되지 않았더라도
    // 별도 비용 계산은 빠지지 않아야 한다. 저장된 취소/변경 회차를 우선하고,
    // 없는 날짜만 반 규칙으로 메모리에서 보완한다.
    const billingSessions = [...classSessions];
    for (const group of classGroups.filter((item) => item.feePolicy === 'additional')) {
      const existingKeys = new Set(
        classSessions
          .filter((session) => session.classGroupId === group.id)
          .map((session) => `${session.date}__${(session.startTime || '').slice(0, 5)}`),
      );
      const projected = get().generateClassSessions(group, { month });
      for (const session of projected) {
        const key = `${session.date}__${(session.startTime || '').slice(0, 5)}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        billingSessions.push(session);
      }
    }

    for (const student of academyStudents) {
      const aliases = new Set([student.id, student.serverId].filter(Boolean));
      const existingMonthly = academyPayments.find(
        (payment) => (
          payment.month === month
          && aliases.has(payment.studentId)
          && payment.paymentKind === 'student_monthly'
        ),
      );
      // 전환 전 반별 청구는 중복 청구 방지를 위해 유지한다. 직접 추가한 수납은
      // 별도 비용이므로 학생 기본 학원비 생성을 막지 않는다.
      const hasLegacyClassPayment = academyPayments.some(
        (payment) => (
          payment.month === month
          && aliases.has(payment.studentId)
          && payment.paymentKind === 'legacy_class'
        ),
      );
      if (!existingMonthly && hasLegacyClassPayment) continue;

      const resolvedBaseTuition = resolveStudentBaseTuition({
        student,
        groups: classGroups,
        tuitionRates: academyProfile?.tuitionRates,
        tuitionPolicy: academyProfile?.tuitionPolicy,
        month,
      });
      const charge = calculateStudentMonthlyCharge({
        student: {
          ...student,
          // 가격표 학생은 저장 당시 금액이 아니라 청구 월의 학년/가격표로 계산한다.
          // 학생별 조정 기간이 끝나면 같은 방식으로 학원 가격표에 자동 복귀한다.
          baseTuition: resolvedBaseTuition.amount,
          tuitionEffectiveFrom: student.enrollmentDate || student.tuitionEffectiveFrom,
          tuitionEffectiveTo: '',
        },
        groups: classGroups,
        sessions: billingSessions,
        month,
      });
      if (charge.amount <= 0) continue;
      const additionsLabel = charge.additions.map((item) => item.name).join(', ');
      const memo = additionsLabel
        ? `기본 수강료 + ${additionsLabel}`
        : '기본 수강료';

      if (existingMonthly) {
        // 납부가 시작된 금액은 자동으로 바꾸지 않는다. 아직 미납인 자동 항목만
        // 현재 학생 정보와 가격표로 안전하게 다시 계산한다.
        if (
          ['unpaid', 'overdue'].includes(existingMonthly.status)
          && (
            Number(existingMonthly.amount) !== charge.amount
            || existingMonthly.dueDate !== dueDate
            || existingMonthly.memo !== memo
            || JSON.stringify(existingMonthly.billingSnapshot || {}) !== JSON.stringify(charge)
          )
        ) {
          updatedPayments.push({
            ...existingMonthly,
            amount: charge.amount,
            dueDate,
            billingSnapshot: charge,
            memo,
            updatedAt: new Date().toISOString(),
          });
        }
        continue;
      }

      newPayments.push({
        id: `ap${Date.now()}_${student.id}`,
        studentId: student.id,
        classGroupId: '',
        month,
        amount: charge.amount,
        dueDate,
        status: 'unpaid',
        paymentKind: 'student_monthly',
        billingSnapshot: charge,
        memo,
        createdAt: new Date().toISOString(),
      });
    }
    if (newPayments.length > 0 || updatedPayments.length > 0) {
      const updatedById = new Map(updatedPayments.map((payment) => [payment.id, payment]));
      set((s) => ({
        academyPayments: [
          ...s.academyPayments.map((payment) => updatedById.get(payment.id) || payment),
          ...newPayments,
        ],
      }));
      get().showToast(
        `수납 항목 ${newPayments.length}건 생성 · ${updatedPayments.length}건 재계산`,
      );
    } else {
      get().showToast('생성할 수납 항목이 없습니다. (이미 존재하거나 수강료 미설정)');
    }
    return { created: newPayments, updated: updatedPayments };
  },

  // ─── Academy Student Events ───────────────────────
  addAcademyStudentEvent: (eventData) => {
    const newEvent = { ...eventData, id: `aev${Date.now()}` };
    set((s) => ({ academyStudentEvents: [...s.academyStudentEvents, newEvent] }));
    get().showToast('일정이 추가되었습니다.');
    return newEvent;
  },
  updateAcademyStudentEvent: (id, data) => {
    set((s) => ({ academyStudentEvents: s.academyStudentEvents.map((e) => (e.id === id ? { ...e, ...data } : e)) }));
    get().showToast('일정이 수정되었습니다.');
  },
  deleteAcademyStudentEvent: (id) => {
    set((s) => ({ academyStudentEvents: s.academyStudentEvents.filter((e) => e.id !== id) }));
    get().showToast('일정이 삭제되었습니다.');
  },

  // ─── Academy Exam Results ─────────────────────────
  addAcademyExamResult: (resultData) => {
    const newResult = { ...resultData, id: `aer${Date.now()}` };
    set((s) => ({ academyExamResults: [...s.academyExamResults, newResult] }));
    get().showToast('성적이 기록되었습니다.');
    return newResult;
  },
  updateAcademyExamResult: (id, data) => {
    set((s) => ({ academyExamResults: s.academyExamResults.map((r) => (r.id === id ? { ...r, ...data } : r)) }));
    get().showToast('성적이 수정되었습니다.');
  },
  deleteAcademyExamResult: (id) => {
    set((s) => ({ academyExamResults: s.academyExamResults.filter((r) => r.id !== id) }));
    get().showToast('성적 기록이 삭제되었습니다.');
  },

  // ─── Academy Payrolls ─────────────────────────────
  // Phase 30 — 급여 자동 계산.
  //   hourly          : 퇴근까지 완료된 실제 근퇴 기록 합계로 계산
  //   teacher lessons : 급여에는 영향 없이 업무 참고 정보로 유지
  //   assistant clinic: 급여에는 영향 없이 업무 참고 정보로 유지
  //   monthly         : monthlySalary 그대로
  // 클리닉 카운트(completedClinicCount) 는 보조강사 카드에 참고 정보로만 남는다.
  // SQL 072 — 퇴근까지 완료된 completed/approved 근퇴만 시급제 금액에 반영.
  generatePayrollsForMonth: (month, opts = {}) => {
    const { academyTeachers, academyAssistants, academyManagers, classSessions, clinicTasks } = get();
    const computeActualShiftHours = get().computeStaffActualHoursForMonth;
    const computeFromLogs = get().computeStaffHoursFromLogs;
    const attendanceLogs = Array.isArray(opts?.attendanceLogs) ? opts.attendanceLogs : [];
    const ts = Date.now();
    const payrolls = [];
    const existingByKey = new Map(
      (get().academyPayrolls || [])
        .filter((p) => p.month === month)
        .map((p) => [`${p.staffType}__${p.staffId}`, p]),
    );

    const keepLockedFields = (draft) => {
      const existing = existingByKey.get(`${draft.staffType}__${draft.staffId}`);
      if (!existing) return draft;
      if (existing.status === 'completed' || existing.isExitSettlement) {
        return {
          ...existing,
          staffUserId: existing.staffUserId || draft.staffUserId || null,
          memo: existing.memo || draft.memo,
          recalculatedAt: new Date().toISOString(),
        };
      }
      return {
        ...draft,
        id: existing.id || draft.id,
        serverId: existing.serverId || draft.serverId,
        status: draft.status,
        paidDate: draft.paidDate,
        memo: existing.memo || draft.memo,
        createdAt: existing.createdAt || draft.createdAt,
        recalculatedAt: new Date().toISOString(),
      };
    };

    academyTeachers.filter((teacher) => teacher.status !== 'inactive').forEach((teacher, i) => {
      // 시급제 급여는 퇴근까지 완료된 실제 근퇴 기록만 기준으로 한다.
      const approvedLogHours = computeFromLogs(teacher.serverUserId, month, attendanceLogs, { approvedOnly: true });
      const pendingLogHours = computeFromLogs(teacher.serverUserId, month, attendanceLogs, { approvedOnly: false });
      const localActualHours = teacher.serverUserId ? 0 : computeActualShiftHours(teacher.id, month);
      const payableHours = teacher.serverUserId ? approvedLogHours : localActualHours;
      const lessonHours = computeLessonHoursForMonth({
        staffId: teacher.id, staffRole: 'teacher', month, classSessions,
      });
      const sessions = classSessions.filter((s) => {
        if (s.status !== 'completed' || !s.date?.startsWith(month)) return false;
        const isMainAndNoSubstitute = s.teacherId === teacher.id && !s.substituteTeacherId;
        const isSubstitute = s.substituteTeacherId === teacher.id;
        return isMainAndNoSubstitute || isSubstitute;
      });
      const completedSessionCount = sessions.length;
      const actualHours = payableHours;
      const gapHours = Math.max(0, actualHours - lessonHours);
      const amount = teacher.wageType === 'hourly'
        ? Math.round((teacher.hourlyWage || 0) * actualHours)
        : (teacher.monthlySalary || teacher.monthlyWage || 0);
      payrolls.push(keepLockedFields({
        id: `pr${ts}t${i}`, staffType: 'teacher', staffId: teacher.id, month,
        staffUserId: teacher.serverUserId || null,
        wageType: teacher.wageType || 'monthly', hourlyMode: 'actualAttendance',
        hourlyWage: teacher.hourlyWage || 0,
        monthlySalary: teacher.monthlySalary || 0,
        totalHours: actualHours, shiftHours: actualHours, lessonHours, gapHours,
        completedSessionCount, completedClinicCount: 0,
        approvedLogHours, pendingLogHours,
        amount, status: 'scheduled', paidDate: '', memo: '',
        createdAt: new Date().toISOString(),
      }));
    });

    academyAssistants.filter((assistant) => assistant.status !== 'inactive').forEach((assistant, i) => {
      const completed = clinicTasks.filter(
        (t) => t.assignedToId === assistant.id && t.status === 'completed' && t.completedAt?.startsWith(month)
      );
      const approvedLogHours = computeFromLogs(assistant.serverUserId, month, attendanceLogs, { approvedOnly: true });
      const pendingLogHours = computeFromLogs(assistant.serverUserId, month, attendanceLogs, { approvedOnly: false });
      const localActualHours = assistant.serverUserId ? 0 : computeActualShiftHours(assistant.id, month);
      const payableHours = assistant.serverUserId ? approvedLogHours : localActualHours;
      const lessonHours = computeLessonHoursForMonth({
        staffId: assistant.id, staffRole: 'assistant', month, classSessions,
      });
      const actualHours = payableHours;
      const gapHours = Math.max(0, actualHours - lessonHours);
      const amount = assistant.wageType === 'hourly'
        ? Math.round((assistant.hourlyWage || 0) * actualHours)
        : (assistant.monthlySalary || 0);
      payrolls.push(keepLockedFields({
        id: `pr${ts}a${i}`, staffType: 'assistant', staffId: assistant.id, month,
        staffUserId: assistant.serverUserId || null,
        wageType: assistant.wageType || 'monthly', hourlyMode: 'actualAttendance',
        hourlyWage: assistant.hourlyWage || 0,
        monthlySalary: assistant.monthlySalary || 0,
        totalHours: actualHours, shiftHours: actualHours, lessonHours, gapHours,
        completedSessionCount: 0, completedClinicCount: completed.length,
        approvedLogHours, pendingLogHours,
        amount, status: 'scheduled', paidDate: '', memo: '',
        createdAt: new Date().toISOString(),
      }));
    });

    academyManagers.filter((manager) => manager.status !== 'inactive').forEach((manager, i) => {
      const approvedLogHours = computeFromLogs(manager.serverUserId, month, attendanceLogs, { approvedOnly: true });
      const pendingLogHours = computeFromLogs(manager.serverUserId, month, attendanceLogs, { approvedOnly: false });
      const localActualHours = manager.serverUserId ? 0 : computeActualShiftHours(manager.id, month);
      const actualHours = manager.serverUserId ? approvedLogHours : localActualHours;
      const amount = manager.wageType === 'hourly'
        ? Math.round((manager.hourlyWage || 0) * actualHours)
        : (manager.monthlySalary || 0);
      payrolls.push(keepLockedFields({
        id: `pr${ts}m${i}`, staffType: 'manager', staffId: manager.id, month,
        staffUserId: manager.serverUserId || null,
        wageType: manager.wageType || 'monthly', hourlyMode: 'actualAttendance',
        hourlyWage: manager.hourlyWage || 0, monthlySalary: manager.monthlySalary || 0,
        totalHours: actualHours, shiftHours: actualHours, lessonHours: 0, gapHours: actualHours,
        completedSessionCount: 0, completedClinicCount: 0,
        approvedLogHours, pendingLogHours,
        amount, status: 'scheduled', paidDate: '', memo: '', createdAt: new Date().toISOString(),
      }));
    });

    const payrollKeys = new Set(payrolls.map((p) => `${p.staffType}__${p.staffId}`));
    const lockedPayrollsToKeep = (get().academyPayrolls || []).filter(
      (p) => p.month === month
        && (p.status === 'completed' || p.isExitSettlement)
        && !payrollKeys.has(`${p.staffType}__${p.staffId}`),
    );

    set((s) => ({
      academyPayrolls: [
        ...s.academyPayrolls.filter((p) => p.month !== month),
        ...lockedPayrollsToKeep,
        ...payrolls,
      ],
    }));
    get().showToast(`${month} 급여 명세가 생성되었습니다.`);
    return payrolls;
  },
  updatePayroll: (payrollId, updates) => {
    set((s) => ({
      academyPayrolls: s.academyPayrolls.map((p) => (p.id === payrollId ? { ...p, ...updates } : p)),
    }));
    get().showToast('급여 정보가 수정되었습니다.');
  },
  markPayrollPaid: (payrollId) => {
    set((s) => ({
      academyPayrolls: s.academyPayrolls.map((p) =>
        p.id === payrollId ? { ...p, status: 'completed', paidDate: getTodayYMD() } : p
      ),
    }));
    get().showToast('급여 지급 완료 처리되었습니다.');
  },
  // 서버 저장 성공 후 local payroll 에 serverId 주입 (toast 없음).
  setPayrollServerId: (localId, serverId) => {
    if (!localId || !serverId) return;
    set((s) => ({
      academyPayrolls: s.academyPayrolls.map((p) =>
        p.id === localId ? { ...p, serverId } : p
      ),
    }));
  },

  // ─── Phase 16: 수동 hydrate (서버 snapshot → local) ──────────
  // Supabase fetchAcademySnapshot 의 결과를 8개 local 컬렉션에 머지한다.
  //
  // 정책:
  //   - strategy='serverWins' — 동일 식별자를 가진 row 는 server 값으로 덮어쓴다
  //   - preserveLocalOnly=true — server snapshot 과 매칭되지 않는 local row 는 유지
  //   - preserveLocalOnly=false — Supabase snapshot 을 원본으로 보고 local-only row 는 제거
  //   - 자연키(이름, month 등) 단순 일치로 merge 하지 않는다. Supabase 연결 환경에서는
  //     preserveLocalOnly=false 로 로컬 찌꺼기를 제거해 origin 간 중복 표시를 막는다.
  //
  // 매칭 키:
  //   - students / class_groups / class_sessions / clinic_records / payments / payrolls:
  //       id 또는 serverId 가 server.id 와 일치
  //   - lesson_records: sessionId 단위 (server 1 row → local N row 로 펼쳐지므로)
  //   - attendance_records: (sessionId, studentId) 자연키
  //
  hydrateAcademyFromServerSnapshot: (snapshot, options = {}) => {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const {
      strategy = 'serverWins',
      preserveLocalOnly = true,
    } = options;
    if (strategy !== 'serverWins') {
      throw new Error(`Unsupported hydrate strategy: ${strategy}`);
    }

    // 1:1 도메인용 — server.id / serverId 기준 머지
    const mergeByIdOrServerId = (localRows, newServerRows) => {
      const serverIds = new Set(newServerRows.map((r) => r.id));
      const preserved = preserveLocalOnly
        ? (localRows || []).filter((r) => {
            if (serverIds.has(r.id)) return false;
            if (r.serverId && serverIds.has(r.serverId)) return false;
            return true;
          })
        : [];
      return [...preserved, ...newServerRows];
    };

    // 복합 자연키 머지 (attendance_records 용)
    const mergeByCompositeKey = (localRows, newServerRows, getKey) => {
      const newKeys = new Set(newServerRows.map(getKey));
      const preserved = preserveLocalOnly
        ? (localRows || []).filter((r) => !newKeys.has(getKey(r)))
        : [];
      return [...preserved, ...newServerRows];
    };

    // 변환
    const newStudents = (snapshot.students || []).map(mapServerStudentToLocal).filter(Boolean);
    const newExamResults = (snapshot.examResults || []).map(mapServerExamResultToLocal).filter(Boolean);
    const newClassGroups = (snapshot.classGroups || []).map(mapServerClassGroupToLocal).filter(Boolean);
    const newClassSessions = (snapshot.classSessions || []).map(mapServerClassSessionToLocal).filter(Boolean);
    const newAttendance = (snapshot.attendanceRecords || [])
      .map(mapServerAttendanceRecordToLocal)
      .filter(Boolean);
    const newClinic = (snapshot.clinicRecords || []).map(mapServerClinicRecordToLocal).filter(Boolean);
    const newPayments = (snapshot.payments || []).map(mapServerPaymentToLocal).filter(Boolean);
    const newPayrolls = (snapshot.payrolls || []).map(mapServerPayrollToLocal).filter(Boolean);
    // lesson_records: 1 server row → N local row
    const newLessonRecords = (snapshot.lessonRecords || []).flatMap(expandServerLessonRecordToLocal);
    const newLrSessionIds = new Set(newLessonRecords.map((lr) => lr.sessionId));

    // Phase 35 — class_groups / class_sessions 의 assistantUserIds (서버 user_id)
    // 를 로컬 academyAssistants.id 로 변환해 assistantIds 채워두기.
    // 매핑 실패한 user_id 는 무시 (학원 멤버 mirror 가 아직 도착하지 않은 경우는
    // 다음 hydrate / sync 에서 재시도된다).
    const resolveAssistantIds = (rows, assistants) => {
      const userIdToLocalId = new Map(
        (assistants || [])
          .filter((a) => a && a.serverUserId)
          .map((a) => [a.serverUserId, a.id]),
      );
      return rows.map((r) => {
        if (!Array.isArray(r.assistantUserIds) || r.assistantUserIds.length === 0) return r;
        const localIds = r.assistantUserIds
          .map((uid) => userIdToLocalId.get(uid))
          .filter(Boolean);
        return { ...r, assistantIds: localIds };
      });
    };

    let counts = null;
    set((s) => {
      const resolvedClassGroups = resolveAssistantIds(newClassGroups, s.academyAssistants);
      const resolvedClassSessions = resolveAssistantIds(newClassSessions, s.academyAssistants);
      const mergedStudents = mergeByIdOrServerId(s.academyStudents, newStudents);
      const mergedExamResults = mergeByIdOrServerId(s.academyExamResults, newExamResults);
      const mergedClassGroups = mergeByIdOrServerId(s.classGroups, resolvedClassGroups);
      const mergedClassSessions = mergeByIdOrServerId(s.classSessions, resolvedClassSessions);
      // lesson_records: server snapshot 에 들어 있는 sessionId 의 local row 들은 전부 교체
      const preservedLr = preserveLocalOnly
        ? (s.academyLessonRecords || []).filter((lr) => !newLrSessionIds.has(lr.sessionId))
        : [];
      const mergedLessonRecords = [...preservedLr, ...newLessonRecords];
      const mergedAttendance = mergeByCompositeKey(
        s.academyAttendanceRecords,
        newAttendance,
        (a) => `${a.sessionId}__${a.studentId}`,
      );
      const mergedClinic = mergeByIdOrServerId(s.clinicRecords, newClinic);
      const mergedPayments = mergeByIdOrServerId(s.academyPayments, newPayments);
      // 급여는 RLS가 owner=전체, staff=본인 행만 반환한다. 일반 직원에게 예전에
      // 캐시된 다른 직원 급여가 남지 않도록 owner만 local-only 급여를 보존한다.
      const mergedPayrolls = mergeByIdOrServerId(
        preserveLocalOnly && s.role === 'owner' ? s.academyPayrolls : [],
        newPayrolls,
      );

      counts = {
        students: newStudents.length,
        examResults: newExamResults.length,
        classGroups: newClassGroups.length,
        classSessions: newClassSessions.length,
        lessonRecords: newLessonRecords.length,
        attendanceRecords: newAttendance.length,
        clinicRecords: newClinic.length,
        payments: newPayments.length,
        payrolls: newPayrolls.length,
      };

      return {
        academyStudents: mergedStudents,
        academyExamResults: mergedExamResults,
        classGroups: mergedClassGroups,
        classSessions: mergedClassSessions,
        academyLessonRecords: mergedLessonRecords,
        academyAttendanceRecords: mergedAttendance,
        clinicRecords: mergedClinic,
        academyPayments: mergedPayments,
        academyPayrolls: mergedPayrolls,
      };
    });
    return counts;
  },

  // ─── Phase 30 — 근무표 / 타임카드 (local only scaffold) ──
  addAcademyStaffShift: (shift) => {
    const id = `shift${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newShift = {
      id,
      status: 'scheduled',
      breakMinutes: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...shift,
    };
    set((s) => ({ academyStaffShifts: [...(s.academyStaffShifts || []), newShift] }));
    get().showToast('근무 일정이 추가되었어요.');
    return newShift;
  },
  updateAcademyStaffShift: (id, updates) => {
    set((s) => ({
      academyStaffShifts: (s.academyStaffShifts || []).map((sh) =>
        sh.id === id ? { ...sh, ...updates, updatedAt: new Date().toISOString() } : sh,
      ),
    }));
  },
  deleteAcademyStaffShift: (id) => {
    set((s) => ({
      academyStaffShifts: (s.academyStaffShifts || []).filter((sh) => sh.id !== id),
    }));
    get().showToast('근무 일정이 삭제되었어요.');
  },
  // Phase 31 — supabase write-through 후 local shift 에 serverId 주입 (toast 없음).
  setStaffShiftServerId: (localId, serverId) => {
    if (!localId || !serverId) return;
    set((s) => ({
      academyStaffShifts: (s.academyStaffShifts || []).map((sh) =>
        sh.id === localId ? { ...sh, serverId } : sh,
      ),
    }));
  },
  // 서버 shift 목록을 로컬에 mirror — 동일 serverId 가 있으면 patch, 없으면 append.
  // serverId 가 없는 local-only 항목은 그대로 보존.
  mirrorServerStaffShifts: (serverShifts = []) => {
    if (!Array.isArray(serverShifts)) return;
    set((s) => {
      const serverIds = new Set(serverShifts.map((sr) => sr?.id).filter(Boolean));
      const existing = (s.academyStaffShifts || []).filter(
        (sh) => !sh.serverId || serverIds.has(sh.serverId),
      );
      const next = existing.slice();
      const localStaffByUserId = new Map();
      (s.academyTeachers || []).forEach((t) => {
        if (t.serverUserId) localStaffByUserId.set(`${t.serverUserId}__teacher`, t.id);
      });
      (s.academyAssistants || []).forEach((a) => {
        if (a.serverUserId) localStaffByUserId.set(`${a.serverUserId}__assistant`, a.id);
      });
      (s.academyManagers || []).forEach((m) => {
        if (m.serverUserId) localStaffByUserId.set(`${m.serverUserId}__manager`, m.id);
      });
      const indexByServerId = new Map(
        next.map((sh, i) => [sh.serverId, i]).filter(([id]) => id),
      );
      for (const sr of serverShifts) {
        if (!sr || !sr.id) continue;
        const localStaffId = localStaffByUserId.get(`${sr.staff_user_id}__${sr.staff_role}`);
        const mapped = {
          serverId: sr.id,
          staffUserId: sr.staff_user_id,
          staffRole: sr.staff_role,
          date: sr.date,
          scheduledStartTime: sr.scheduled_start_time,
          scheduledEndTime: sr.scheduled_end_time,
          actualStartTime: sr.actual_start_time,
          actualEndTime: sr.actual_end_time,
          breakMinutes: sr.break_minutes || 0,
          status: sr.status,
          memo: sr.memo,
          createdAt: sr.created_at,
          updatedAt: sr.updated_at,
        };
        if (localStaffId) mapped.staffId = localStaffId;
        const idx = indexByServerId.get(sr.id);
        if (idx !== undefined) {
          next[idx] = { ...next[idx], ...mapped };
        } else {
          next.push({
            id: `shift_${sr.id.slice(0, 8)}_${Date.now()}`,
            ...mapped,
          });
        }
      }
      return { academyStaffShifts: next };
    });
  },
  reconcileStaffShiftLocalIds: () => {
    set((s) => {
      const localStaffByUserId = new Map();
      (s.academyTeachers || []).forEach((t) => {
        if (t.serverUserId) localStaffByUserId.set(`${t.serverUserId}__teacher`, t.id);
      });
      (s.academyAssistants || []).forEach((a) => {
        if (a.serverUserId) localStaffByUserId.set(`${a.serverUserId}__assistant`, a.id);
      });
      return {
        academyStaffShifts: (s.academyStaffShifts || []).map((sh) => {
          if (sh.staffId || !sh.staffUserId) return sh;
          const staffId = localStaffByUserId.get(`${sh.staffUserId}__${sh.staffRole}`);
          return staffId ? { ...sh, staffId } : sh;
        }),
      };
    });
  },
  // staff (local id) 가 한 달에 일한 시급 시간을 합산해 반환.
  // 우선순위: actual 우선, 없으면 scheduled (status='completed' 만), 그 외 0.
  computeStaffHoursForMonth: (staffId, month /* YYYY-MM */) => {
    if (!staffId || !month) return 0;
    const shifts = (get().academyStaffShifts || []).filter(
      (sh) => sh.staffId === staffId && sh.date && sh.date.startsWith(month),
    );
    let totalMinutes = 0;
    for (const sh of shifts) {
      let start = sh.actualStartTime || (sh.status === 'completed' ? sh.scheduledStartTime : null);
      let end = sh.actualEndTime || (sh.status === 'completed' ? sh.scheduledEndTime : null);
      if (!start || !end) continue;
      const [sh1, sm1] = start.split(':').map(Number);
      const [sh2, sm2] = end.split(':').map(Number);
      if (Number.isNaN(sh1) || Number.isNaN(sh2)) continue;
      const minutes = (sh2 * 60 + sm2) - (sh1 * 60 + sm1) - (sh.breakMinutes || 0);
      if (minutes > 0) totalMinutes += minutes;
    }
    return totalMinutes / 60;
  },

  // 실제 출퇴근 시간이 명시된 legacy/local shift 만 합산한다.
  // 예정 시간 fallback 은 급여 산정 원칙과 다르므로 여기서는 사용하지 않는다.
  computeStaffActualHoursForMonth: (staffId, month /* YYYY-MM */) => {
    if (!staffId || !month) return 0;
    const shifts = (get().academyStaffShifts || []).filter(
      (sh) => sh.staffId === staffId && sh.date && sh.date.startsWith(month),
    );
    let totalMinutes = 0;
    for (const sh of shifts) {
      const start = sh.actualStartTime;
      const end = sh.actualEndTime;
      if (!start || !end) continue;
      const [sh1, sm1] = start.split(':').map(Number);
      const [sh2, sm2] = end.split(':').map(Number);
      if (Number.isNaN(sh1) || Number.isNaN(sh2)) continue;
      const minutes = (sh2 * 60 + sm2) - (sh1 * 60 + sm1) - (sh.breakMinutes || 0);
      if (minutes > 0) totalMinutes += minutes;
    }
    return totalMinutes / 60;
  },

  // staff_attendance_logs 기반 시간 계산.
  // 정상적으로 퇴근까지 기록된 completed와 기존 approved는 급여 시간으로 합산한다.
  // pending은 출근만 있고 퇴근이 없는 예외이므로 별도로 표시하되 급여에는 넣지 않는다.
  computeStaffHoursFromLogs: (staffUserId, month, logs = [], { approvedOnly = true } = {}) => {
    return sumStaffAttendanceHours(logs, {
      staffUserId,
      month,
      mode: approvedOnly ? 'payable' : 'pending',
    });
  },

  // ─── Account / academy scoping ───────────────────────
  // 사용자 또는 현재 학원이 달라지면 academy-scoped 캐시를 먼저 비운다.
  // 서버 fetch 전에 동기적으로 실행되어 이전 학원의 학생/급여가 화면에 섞이는 것을 막는다.
  ensureAcademyDataScope: (userId, academyId, ownerRole = null) => {
    if (!userId || !academyId) return;
    const state = get();
    if (
      state.academyDataOwnerUserId === userId &&
      state.academyDataOwnerAcademyId === academyId &&
      (!ownerRole || state.academyDataOwnerRole === ownerRole)
    ) {
      return;
    }
    set({
      ...createEmptyAcademyScopeState({
        ownerUserId: userId,
        ownerAcademyId: academyId,
        ownerRole: ownerRole || (
          state.academyDataOwnerUserId === userId
          && state.academyDataOwnerAcademyId === academyId
            ? state.academyDataOwnerRole
            : null
        ),
      }),
      schoolNames: [],
    });
  },

  // 구버전 호출부/저장 데이터 호환용. 사용자만 먼저 확정된 시점에는 계정 간
  // 유출만 차단하고, 학원 ID는 loadMemberships 이후 ensureAcademyDataScope가 채운다.
  ensureAcademyDataOwner: (userId) => {
    if (!userId) return;
    const current = get().academyDataOwnerUserId;
    if (current === userId) return;
    set({
      ...createEmptyAcademyScopeState({ ownerUserId: userId }),
      schoolNames: [],
    });
  },

  // 로그아웃/세션 만료 시 개인정보가 브라우저 localStorage에 남지 않도록 조용히 제거한다.
  clearAcademyDataCache: () => {
    set({ ...createEmptyAcademyScopeState(), schoolNames: [] });
  },

  // ─── Academy Reset ────────────────────────────────
  resetAcademyData: () => {
    const state = get();
    set(createEmptyAcademyScopeState({
      ownerUserId: state.academyDataOwnerUserId,
      ownerAcademyId: state.academyDataOwnerAcademyId,
      ownerRole: state.academyDataOwnerRole,
    }));
    get().showToast('학원 데이터가 초기화되었어요.');
  },

  // ─── Academy Sample Data ──────────────────────────
  generateAcademySampleData: () => {
    const ts = Date.now();
    const sampleStudents = [
      { id: `as${ts}1`, name: '김민수', grade: '중2', phone: '010-1111-2222', parentPhone: '010-2222-3333', school: '서울중학교', classGroupIds: [] },
      { id: `as${ts}2`, name: '이서연', grade: '중2', phone: '010-3333-4444', parentPhone: '010-4444-5555', school: '서울중학교', classGroupIds: [] },
      { id: `as${ts}3`, name: '박서후', grade: '중2', phone: '010-5555-6666', parentPhone: '010-6666-7777', school: '서울중학교', classGroupIds: [] },
    ];
    const sampleTeacher = { id: `t${ts}`, name: '김강사', phone: '010-7777-8888', subjects: ['영어'], status: 'active', wageType: 'hourly', hourlyWage: 30000, assignedClassGroupIds: [] };
    const sampleAssistant = { id: `ast${ts}`, name: '박보조', phone: '010-8888-9999', taskTypes: ['homework', 'wrong_answer', 'vocabulary'], status: 'active' };

    // 오늘 기준으로 이번 달 1일 시작
    const startDate = `${getCurrentMonth()}-01`;

    const sampleGroup = {
      id: `cg${ts}`,
      name: '중2 영어 A반',
      subject: '영어',
      level: '중2',
      teacherId: sampleTeacher.id,
      assistantIds: [],
      studentIds: sampleStudents.map((s) => s.id),
      weekdays: ['월', '수'],
      startTime: '18:00',
      endTime: '20:00',
      room: '1강의실',
      startDate,
      endDate: '',
      monthlyFee: 320000,
      memo: '',
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const dayNameToNum = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 0 };
    const daysOfWeek = sampleGroup.weekdays.map((d) => dayNameToNum[d]);
    const dates = generateClassDates({ daysOfWeek, startDate, endDate: null, repeatType: '매주' });
    const sampleSessions = dates.slice(0, 8).map((date, i) => ({
      id: `cs${ts}_${i}`,
      classGroupId: sampleGroup.id,
      date,
      startTime: '18:00',
      endTime: '20:00',
      room: '1강의실',
      teacherId: sampleTeacher.id,
      assistantIds: [],
      studentIds: sampleStudents.map((s) => s.id),
      status: 'scheduled',
      memo: '',
      createdAt: new Date().toISOString(),
    }));

    const todayStr = getTodayYMD();
    const nextSession = sampleSessions.find((s) => s.date >= todayStr) || sampleSessions[0];
    const sampleClinics = [
      {
        id: `clinic${ts}1`,
        studentId: sampleStudents[0].id,
        classGroupId: sampleGroup.id,
        classSessionId: nextSession?.id || '',
        createdByRole: 'teacher',
        createdById: sampleTeacher.id,
        assignedToId: sampleAssistant.id,
        type: 'wrong_answer',
        title: '문법 오답 클리닉',
        description: '관계대명사 문제 오답 재풀이 필요',
        dueDate: nextSession?.date || todayStr,
        status: 'pending',
        priority: 'normal',
        resultMemo: '',
        completedById: '',
        completedAt: '',
        createdAt: new Date().toISOString(),
      },
      {
        id: `clinic${ts}2`,
        studentId: sampleStudents[1].id,
        classGroupId: sampleGroup.id,
        classSessionId: nextSession?.id || '',
        createdByRole: 'teacher',
        createdById: sampleTeacher.id,
        assignedToId: sampleAssistant.id,
        type: 'vocabulary',
        title: '단어 재시험',
        description: '이번 주 단어 20개 재시험 필요',
        dueDate: nextSession?.date || todayStr,
        status: 'pending',
        priority: 'high',
        resultMemo: '',
        completedById: '',
        completedAt: '',
        createdAt: new Date().toISOString(),
      },
    ];

    const sampleClinicRecords = [
      {
        id: `cr${ts}1`,
        academyId: 'academy_001',
        studentId: sampleStudents[2].id,
        classGroupId: sampleGroup.id,
        classSessionId: nextSession?.id || '',
        date: todayStr,
        subject: '영어',
        teacherId: sampleTeacher.id,
        assistantId: sampleAssistant.id,
        items: [
          {
            id: `cri${ts}1`,
            categoryKey: 'vocabulary_test',
            title: '단어 암기 및 시험',
            description: 'Lesson 3 단어 30개 테스트, 24개 정답. 틀린 단어 6개는 다음 시간 재시험 예정.',
            result: '24/30',
            memo: '단어 뜻은 대체로 알고 있으나 철자 실수가 있음',
          },
          {
            id: `cri${ts}2`,
            categoryKey: 'sentence_structure',
            title: '문장 구문 분석',
            description: '본문 3번 문장의 주어, 동사, 수식어를 끊어 읽으며 직독직해 연습',
            result: '',
            memo: '',
          },
        ],
        overallMemo: '단어와 구문 모두 보완 진행. 다음 시간에 단어 재시험 필요.',
        createdByRole: 'assistant',
        createdById: sampleAssistant.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    set((s) => ({
      academyStudents: [...s.academyStudents, ...sampleStudents],
      academyTeachers: [...s.academyTeachers, sampleTeacher],
      academyAssistants: [...s.academyAssistants, sampleAssistant],
      classGroups: [...s.classGroups, sampleGroup],
      classSessions: [...s.classSessions, ...sampleSessions],
      clinicTasks: [...s.clinicTasks, ...sampleClinics],
      clinicRecords: [...(s.clinicRecords || []), ...sampleClinicRecords],
    }));
    get().showToast('샘플 데이터가 생성되었습니다.');
  },

}),
    {
      name: 'academy-store',
      storage: createJSONStorage(() => createDeferredLocalStorage()),
      version: 3,
      // 이전 버전에서 남아 있던 예시 학교 자동완성 캐시는 한 번 비운다.
      // 학생 레코드의 실제 school/schoolName 값은 건드리지 않는다.
      migrate: (persistedState, persistedVersion) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState;
        if (persistedVersion < 1) {
          persistedState = { ...persistedState, schoolNames: [] };
        }
        // 역할/담당 범위 RLS 도입 전에는 선생님 브라우저에도 학원 전체 학생과
        // 반 데이터가 localStorage에 남을 수 있었다. 서버가 새 범위로 다시
        // 내려주기 전 이전 캐시가 잠깐 보이지 않도록 학원 캐시만 한 번 비운다.
        if (persistedVersion < 2) {
          return {
            ...persistedState,
            academyStudents: [],
            classGroups: [],
            classSessions: [],
            clinicTasks: [],
            clinicRecords: [],
            academyPayments: [],
            academyLessonRecords: [],
            academyAttendanceRecords: [],
            academyStudentEvents: [],
            academyExamResults: [],
            academyConsultations: [],
            academyPayrolls: [],
            academyStaffShifts: [],
            academyDataOwnerRole: null,
          };
        }
        return selectPersistedAcademyState(persistedState);
      },
      partialize: selectPersistedAcademyState,
      merge: (persisted, current) => ({ ...current, ...selectPersistedAcademyState(persisted) }),
    }
  )
);

export default useAcademyStore;
