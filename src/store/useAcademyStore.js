import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { generateClassDates } from '../utils/recurringClass';
import { getCurrentMonth, getMonthsBetween, today as getTodayYMD } from '../utils/date';
import {
  buildPlannedStaffSchedule,
  plannedToStaffShiftShape,
} from '../utils/schedule';
import { generatePaymentForMonth, groupHasPayment, resolveStudentBilling } from '../utils/billing';
import { DEFAULT_PARENT_NOTICE_PROMPT, DEFAULT_STUDENT_HOMEWORK_PROMPT } from '../constants/aiPrompts';
import {
  mapServerStudentToLocal,
  mapServerClassGroupToLocal,
  mapServerClassSessionToLocal,
  expandServerLessonRecordToLocal,
  mapServerAttendanceRecordToLocal,
  mapServerClinicRecordToLocal,
  mapServerPaymentToLocal,
  mapServerPayrollToLocal,
} from '../services/supabase/hydrateMappers';
import { computeLessonHoursForMonth } from '../utils/shiftCoverage';

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
  const last = new Date(year, m, 0).getDate();
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
    getItem: (name) => base.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
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

const defaultTutorProfile = {
  name: '과외 선생님',
  phone: '',
  email: '',
  subjects: [],
  defaultLocation: '',
  bankName: '',
  bankAccount: '',
  accountHolder: '',
  defaultNoticeTone: 'friendly',
  parentNoticePrompt: DEFAULT_PARENT_NOTICE_PROMPT,
  studentHomeworkPrompt: DEFAULT_STUDENT_HOMEWORK_PROMPT,
};

const useAcademyStore = create(
  persist(
    (set, get) => ({
  // === Auth / Mode ===
  role: null,
  currentMode: 'private', // 'private' | 'academy'

  // === Tutor Profile ===
  tutorProfile: defaultTutorProfile,
  setTutorProfile: (profile) => set({ tutorProfile: profile }),

  // === School Names (autocomplete) ===
  schoolNames: [],
  addSchoolName: (name) => {
    if (!name?.trim()) return;
    set((s) => {
      if (s.schoolNames.includes(name)) return {};
      return { schoolNames: [...s.schoolNames, name] };
    });
  },

  // === API Key ===
  geminiApiKey: '',
  setGeminiApiKey: (key) => set({ geminiApiKey: key }),

  // === Navigation ===
  activeTab: 'home',
  selectedClassId: null,
  selectedStudentId: null,
  selectedRepeatGroupId: null,
  // Academy navigation
  selectedClassGroupId: null,
  selectedClassSessionId: null,
  selectedAcademyStudentId: null,

  // === Private Workspace (과외 선생님) ===
  students: [],
  teachers: [],
  classes: [],
  attendanceRecords: [],
  lessonRecords: [],
  payments: [],
  consultations: [],
  payrolls: [],
  repeatGroups: [],
  studentEvents: [],
  examResults: [],

  // === Academy Workspace (원장/강사/보조강사 공유) ===
  academyProfile: { name: '우리 학원', ownerName: '', address: '', phone: '', salaryPaymentDay: 10, tuitionDueDay: 1 },
  academyStudents: [],
  classGroups: [],
  classSessions: [],
  clinicTasks: [],
  clinicRecords: [],
  academyTeachers: [],
  academyAssistants: [],
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

  // === Toast ===
  toast: null,

  // ─── Auth ──────────────────────────────────────────
  setRole: (role) => {
    const ACADEMY_ROLES = ['owner', 'teacher', 'assistant'];
    set({
      role,
      currentMode: ACADEMY_ROLES.includes(role) ? 'academy' : 'private',
      activeTab: 'home',
      selectedClassId: null,
      selectedStudentId: null,
      selectedRepeatGroupId: null,
      selectedClassGroupId: null,
      selectedClassSessionId: null,
      selectedAcademyStudentId: null,
    });
  },
  logout: () => set({ role: null, currentMode: 'private' }),

  // ─── Navigation (Private) ──────────────────────────
  setActiveTab: (tab) => set({
    activeTab: tab,
    selectedClassId: null,
    selectedStudentId: null,
    selectedRepeatGroupId: null,
    selectedClassGroupId: null,
    selectedClassSessionId: null,
    selectedAcademyStudentId: null,
  }),
  navigateToClass: (id) => set({ selectedClassId: id, activeTab: 'classes', selectedRepeatGroupId: null }),
  navigateToStudent: (id) => set({ selectedStudentId: id, activeTab: 'students' }),
  navigateToRepeatGroup: (id) => set({ selectedRepeatGroupId: id, activeTab: 'classes', selectedClassId: null }),
  goBackFromClass: () => set({ selectedClassId: null }),
  goBackFromStudent: () => set({ selectedStudentId: null }),
  goBackFromRepeatGroup: () => set({ selectedRepeatGroupId: null }),

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
    set({ toast: { message, type }, _toastTimer: timer });
  },

  // ─── Students ──────────────────────────────────────
  addStudent: (student) => {
    const newStudent = { ...student, id: `s${Date.now()}` };
    set((s) => ({ students: [...s.students, newStudent] }));
    get().showToast('학생이 추가되었습니다.');
    return newStudent;
  },
  updateStudent: (id, data) => {
    set((s) => ({ students: s.students.map((st) => (st.id === id ? { ...st, ...data } : st)) }));
    get().showToast('학생 정보가 수정되었습니다.');
  },
  deleteStudent: (id) => {
    set((s) => ({ students: s.students.filter((st) => st.id !== id) }));
    get().showToast('학생이 삭제되었습니다.');
  },

  // ─── Student Events ────────────────────────────────
  addStudentEvent: (eventData) => {
    const newEvent = { ...eventData, id: `ev${Date.now()}` };
    set((s) => ({ studentEvents: [...s.studentEvents, newEvent] }));
    get().showToast('일정이 추가되었습니다.');
    return newEvent;
  },
  updateStudentEvent: (id, data) => {
    set((s) => ({ studentEvents: s.studentEvents.map((e) => (e.id === id ? { ...e, ...data } : e)) }));
    get().showToast('일정이 수정되었습니다.');
  },
  deleteStudentEvent: (id) => {
    set((s) => ({
      studentEvents: s.studentEvents.filter((e) => e.id !== id),
      examResults: s.examResults.filter((r) => r.eventId !== id),
    }));
    get().showToast('일정이 삭제되었습니다.');
  },

  // ─── Exam Results ──────────────────────────────────
  addExamResult: (resultData) => {
    const newResult = { ...resultData, id: `er${Date.now()}` };
    set((s) => ({ examResults: [...s.examResults, newResult] }));
    get().showToast('성적이 기록되었습니다.');
    return newResult;
  },
  updateExamResult: (id, data) => {
    set((s) => ({ examResults: s.examResults.map((r) => (r.id === id ? { ...r, ...data } : r)) }));
    get().showToast('성적이 수정되었습니다.');
  },
  deleteExamResult: (id) => {
    set((s) => ({ examResults: s.examResults.filter((r) => r.id !== id) }));
    get().showToast('성적 기록이 삭제되었습니다.');
  },

  // ─── Single class ──────────────────────────────────
  addClass: (cls) => {
    const newClass = { ...cls, id: `c${Date.now()}` };
    set((s) => ({ classes: [...s.classes, newClass] }));
    get().showToast('수업이 추가되었습니다.');
    return newClass;
  },
  updateClass: (id, data) => {
    set((s) => ({ classes: s.classes.map((c) => (c.id === id ? { ...c, ...data } : c)) }));
    get().showToast('수업이 수정되었습니다.');
  },
  updateClassInstance: (id, data) => {
    set((s) => ({ classes: s.classes.map((c) => (c.id === id ? { ...c, ...data } : c)) }));
  },
  deleteClass: (id) => {
    set((s) => ({ classes: s.classes.filter((c) => c.id !== id) }));
    get().showToast('수업이 삭제되었습니다.');
  },

  // ─── Recurring class (정기 과외) ───────────────────
  addRepeatGroup: (groupData) => {
    const groupId = `rg${Date.now()}`;

    // Normalize billing structure
    const billingMode = groupData.billingMode || 'same';
    const defaultBilling = groupData.defaultBilling || {
      billingType: groupData.billingType || 'monthly',
      monthlyFee: Number(groupData.monthlyFee) || 0,
      hourlyRate: Number(groupData.hourlyRate) || 0,
      paymentDay: Number(groupData.paymentDay) || 10,
    };
    const studentBillings = groupData.studentBillings || {};

    const newGroup = {
      ...groupData,
      id: groupId,
      billingMode,
      defaultBilling,
      studentBillings,
      // Keep legacy top-level fields for backward compat
      billingType: defaultBilling.billingType,
      monthlyFee: defaultBilling.monthlyFee,
      hourlyRate: defaultBilling.hourlyRate,
      paymentDay: defaultBilling.paymentDay,
    };

    const dates = generateClassDates({
      daysOfWeek: groupData.daysOfWeek,
      startDate: groupData.startDate,
      endDate: groupData.endDate || null,
      repeatType: groupData.repeatType,
    });

    const allStudents = get().students;
    const studentIds = groupData.studentIds || (groupData.studentId ? [groupData.studentId] : []);
    const firstStudent = allStudents.find((s) => s.id === studentIds[0]);
    const studentCount = studentIds.length;
    const namePrefix =
      studentCount <= 1
        ? firstStudent?.name || ''
        : `${firstStudent?.name || ''} 외 ${studentCount - 1}명`;
    const classLabel = studentCount <= 1 ? '과외' : '그룹과외';

    const ts = Date.now();
    const newClasses = dates.map((date, i) => ({
      id: `c${ts}_${i}`,
      name: `${namePrefix} ${groupData.subject} ${classLabel}`,
      type: studentCount <= 1 ? '정기 과외' : '그룹 과외',
      subject: groupData.subject,
      date,
      startTime: groupData.startTime,
      endTime: groupData.endTime,
      location: groupData.location,
      teacherId: '',
      studentIds,
      repeatGroupId: groupId,
      repeatType: groupData.repeatType,
      memo: groupData.memo || '',
    }));

    const startMonth = groupData.startDate?.slice(0, 7) || getCurrentMonth();
    const currentMonth = getCurrentMonth();

    const endMonthRaw = groupData.endDate ? groupData.endDate.slice(0, 7) : currentMonth;
    const paymentEndMonth = endMonthRaw < currentMonth ? endMonthRaw : currentMonth;
    const monthsToCreate = getMonthsBetween(startMonth, paymentEndMonth);

    const newPayments = [];
    if (groupHasPayment(newGroup)) {
      for (const month of monthsToCreate) {
        const monthHasClasses = newClasses.some((c) => c.date.startsWith(month));
        if (!monthHasClasses) continue;

        const [yr, mo] = month.split('-');

        for (const studentId of studentIds) {
          const existing = get().payments.find(
            (p) => p.studentId === studentId && p.month === month && p.repeatGroupId === groupId
          );
          if (existing) continue;

          const student = allStudents.find((s) => s.id === studentId);
          const studentBilling = resolveStudentBilling(newGroup, studentId);
          const payDay = String(studentBilling.paymentDay || defaultBilling.paymentDay || 10).padStart(2, '0');

          const paymentInfo = generatePaymentForMonth({
            group: newGroup,
            classes: newClasses,
            month,
            studentId,
          });

          if (paymentInfo.amount <= 0 && paymentInfo.calculatedSessionCount === 0) continue;

          let memo = '';
          if (paymentInfo.isProrated) {
            memo = `${month.replace('-', '년 ')}월은 ${paymentInfo.calculatedSessionCount}회 기준으로 계산됐어요`;
          }

          newPayments.push({
            id: `p${ts}_${month}_${studentId}`,
            studentId,
            repeatGroupId: groupId,
            month,
            ...paymentInfo,
            dueDate: `${yr}-${mo}-${payDay}`,
            status: 'pending',
            paidDate: null,
            paidAmount: null,
            depositorName: student?.depositorName || '',
            memo,
          });
        }
      }
    }

    set((s) => ({
      repeatGroups: [...s.repeatGroups, newGroup],
      classes: [...s.classes, ...newClasses],
      payments: [...s.payments, ...newPayments],
    }));

    get().showToast(`${dates.length}개 수업이 등록되었습니다.`);
    return { groupId, classCount: dates.length };
  },

  deleteRepeatGroupFuture: (groupId, fromDate) => {
    set((s) => ({
      classes: s.classes.filter(
        (c) => !(c.repeatGroupId === groupId && c.date >= fromDate)
      ),
    }));
    get().showToast('앞으로의 수업이 삭제되었습니다.');
  },

  // ─── 수업 그룹 수정 (기본 정보만) ──────────────────────────────────────────
  updateRepeatGroup: (groupId, data) => {
    const allStudents = get().students;
    const studentIds = data.studentIds || [];
    const firstStudent = allStudents.find((s) => s.id === studentIds[0]);
    const studentCount = studentIds.length;
    const namePrefix =
      studentCount <= 1
        ? firstStudent?.name || ''
        : `${firstStudent?.name || ''} 외 ${studentCount - 1}명`;
    const classLabel = studentCount <= 1 ? '과외' : '그룹과외';
    const classType = studentCount <= 1 ? '정기 과외' : '그룹 과외';
    const className = `${namePrefix} ${data.subject} ${classLabel}`;

    // Normalize billing
    const billingMode = data.billingMode || 'same';
    const defaultBilling = data.defaultBilling || {
      billingType: data.billingType || 'monthly',
      monthlyFee: Number(data.monthlyFee) || 0,
      hourlyRate: Number(data.hourlyRate) || 0,
      paymentDay: Number(data.paymentDay) || 10,
    };

    set((s) => ({
      repeatGroups: s.repeatGroups.map((g) =>
        g.id === groupId
          ? {
              ...g, ...data,
              billingMode,
              defaultBilling,
              studentBillings: data.studentBillings || g.studentBillings || {},
              billingType: defaultBilling.billingType,
              monthlyFee: defaultBilling.monthlyFee,
              hourlyRate: defaultBilling.hourlyRate,
              paymentDay: defaultBilling.paymentDay,
            }
          : g
      ),
      classes: s.classes.map((c) => {
        if (c.repeatGroupId !== groupId) return c;
        return {
          ...c,
          name: className,
          subject: data.subject,
          startTime: data.startTime,
          endTime: data.endTime,
          location: data.location,
          studentIds,
          type: classType,
          memo: data.memo || c.memo,
        };
      }),
    }));
    get().showToast('수업 정보가 수정되었습니다.');
  },

  // ─── 수업 그룹 수정 + 미래 일정 재생성 + 과외비 재계산 ────────────────────
  updateRepeatGroupFuture: (groupId, data, fromDate) => {
    const { classes, attendanceRecords, lessonRecords, students: allStudents, payments } = get();

    const studentIds = data.studentIds || [];
    const firstStudent = allStudents.find((s) => s.id === studentIds[0]);
    const studentCount = studentIds.length;
    const namePrefix =
      studentCount <= 1
        ? firstStudent?.name || ''
        : `${firstStudent?.name || ''} 외 ${studentCount - 1}명`;
    const classLabel = studentCount <= 1 ? '과외' : '그룹과외';
    const classType = studentCount <= 1 ? '정기 과외' : '그룹 과외';
    const className = `${namePrefix} ${data.subject} ${classLabel}`;

    // Normalize billing
    const billingMode = data.billingMode || 'same';
    const defaultBilling = data.defaultBilling || {
      billingType: data.billingType || 'monthly',
      monthlyFee: Number(data.monthlyFee) || 0,
      hourlyRate: Number(data.hourlyRate) || 0,
      paymentDay: Number(data.paymentDay) || 10,
    };
    const studentBillings = data.studentBillings || {};

    const updatedGroup = {
      ...data,
      id: groupId,
      billingMode,
      defaultBilling,
      studentBillings,
      billingType: defaultBilling.billingType,
      monthlyFee: defaultBilling.monthlyFee,
      hourlyRate: defaultBilling.hourlyRate,
      paymentDay: defaultBilling.paymentDay,
    };

    const futureGroupClasses = classes.filter(
      (c) => c.repeatGroupId === groupId && c.date >= fromDate
    );
    const classesWithRecords = new Set(
      futureGroupClasses
        .filter(
          (c) =>
            attendanceRecords.some((a) => a.classId === c.id) ||
            lessonRecords.some((lr) => lr.classId === c.id)
        )
        .map((c) => c.id)
    );

    const remainingClasses = classes
      .filter(
        (c) =>
          !(c.repeatGroupId === groupId && c.date >= fromDate && !classesWithRecords.has(c.id))
      )
      .map((c) => {
        if (c.repeatGroupId !== groupId) return c;
        return { ...c, name: className, subject: data.subject, startTime: data.startTime, endTime: data.endTime, location: data.location, studentIds, type: classType };
      });

    const newDates = generateClassDates({
      daysOfWeek: data.daysOfWeek,
      startDate: fromDate,
      endDate: data.endDate || null,
      repeatType: data.repeatType,
    });

    const existingDates = new Set(
      remainingClasses.filter((c) => c.repeatGroupId === groupId).map((c) => c.date)
    );
    const datesToCreate = newDates.filter((d) => !existingDates.has(d));

    const ts = Date.now();
    const newClasses = datesToCreate.map((date, i) => ({
      id: `c${ts}_${i}`,
      name: className,
      type: classType,
      subject: data.subject,
      date,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      teacherId: '',
      studentIds,
      repeatGroupId: groupId,
      repeatType: data.repeatType,
      memo: data.memo || '',
    }));

    const allNewGroupClasses = [...remainingClasses, ...newClasses].filter(
      (c) => c.repeatGroupId === groupId
    );

    // ── Payment recalculation ──────────────────────────────────────
    const fromMonth = fromDate.slice(0, 7);

    const keptPayments = payments.filter(
      (p) =>
        !(p.repeatGroupId === groupId &&
          p.month >= fromMonth &&
          p.status !== 'paid' &&
          p.status !== 'exempt')
    );

    const newPayments = [];
    if (groupHasPayment(updatedGroup)) {
      const affectedMonths = [
        ...new Set(
          allNewGroupClasses
            .filter((c) => c.date >= fromDate)
            .map((c) => c.date.slice(0, 7))
        ),
      ].sort();

      for (const month of affectedMonths) {
        for (const studentId of studentIds) {
          const alreadyKept = keptPayments.find(
            (p) => p.studentId === studentId && p.month === month && p.repeatGroupId === groupId
          );
          if (alreadyKept) continue;

          const student = allStudents.find((s) => s.id === studentId);
          const [yr, mo] = month.split('-');
          const studentBilling = resolveStudentBilling(updatedGroup, studentId);
          const payDay = String(studentBilling.paymentDay || defaultBilling.paymentDay || 10).padStart(2, '0');

          const paymentInfo = generatePaymentForMonth({
            group: updatedGroup,
            classes: allNewGroupClasses,
            month,
            studentId,
          });

          if (paymentInfo.amount <= 0 && paymentInfo.calculatedSessionCount === 0) continue;

          let memo = '';
          if (paymentInfo.isProrated) {
            memo = `${month.replace('-', '년 ')}월은 ${paymentInfo.calculatedSessionCount}회 기준으로 계산됐어요`;
          }

          newPayments.push({
            id: `p${ts}_${month}_${studentId}`,
            studentId,
            repeatGroupId: groupId,
            month,
            ...paymentInfo,
            dueDate: `${yr}-${mo}-${payDay}`,
            status: 'pending',
            paidDate: null,
            paidAmount: null,
            depositorName: student?.depositorName || '',
            memo,
          });
        }
      }
    }

    set((s) => ({
      repeatGroups: s.repeatGroups.map((g) => (g.id === groupId ? { ...g, ...updatedGroup } : g)),
      classes: [...remainingClasses, ...newClasses],
      payments: [...keptPayments, ...newPayments],
    }));
    get().showToast('앞으로의 수업 일정과 과외비가 새로 반영됐어요.');
  },

  // ─── 수업 그룹 전체 삭제 ────────────────────────────────────────────────────
  deleteRepeatGroup: (groupId) => {
    const classIds = new Set(
      get().classes.filter((c) => c.repeatGroupId === groupId).map((c) => c.id)
    );
    set((s) => ({
      repeatGroups: s.repeatGroups.filter((g) => g.id !== groupId),
      classes: s.classes.filter((c) => c.repeatGroupId !== groupId),
      attendanceRecords: s.attendanceRecords.filter((a) => !classIds.has(a.classId)),
      lessonRecords: s.lessonRecords.filter((lr) => !classIds.has(lr.classId)),
    }));
    get().showToast('수업 그룹이 삭제되었습니다.');
  },

  // ─── Attendance ────────────────────────────────────
  updateAttendance: (classId, studentId, date, status) => {
    const existing = get().attendanceRecords.find(
      (a) => a.classId === classId && a.studentId === studentId && a.date === date
    );
    if (existing) {
      set((s) => ({
        attendanceRecords: s.attendanceRecords.map((a) =>
          a.id === existing.id ? { ...a, status } : a
        ),
      }));
    } else {
      set((s) => ({
        attendanceRecords: [
          ...s.attendanceRecords,
          { id: `a${Date.now()}`, classId, studentId, date, status },
        ],
      }));
    }
    get().showToast('출결이 저장되었습니다.');
  },

  // ─── Lesson Records ────────────────────────────────
  saveLessonRecord: (record) => {
    const existing = get().lessonRecords.find(
      (lr) => lr.classId === record.classId && lr.studentId === record.studentId && lr.date === record.date
    );
    if (existing) {
      set((s) => ({
        lessonRecords: s.lessonRecords.map((lr) =>
          lr.id === existing.id ? { ...lr, ...record } : lr
        ),
      }));
    } else {
      set((s) => ({
        lessonRecords: [...s.lessonRecords, { ...record, id: `lr${Date.now()}` }],
      }));
    }
    get().showToast('수업 기록이 저장되었습니다.');
  },
  updateLessonRecord: (id, data) => {
    set((s) => ({
      lessonRecords: s.lessonRecords.map((lr) => (lr.id === id ? { ...lr, ...data } : lr)),
    }));
  },

  // ─── Payments ──────────────────────────────────────
  addPayment: (payment) => {
    const newPayment = { ...payment, id: `p${Date.now()}` };
    set((s) => ({ payments: [...s.payments, newPayment] }));
    get().showToast('수납 항목이 추가되었습니다.');
  },
  updatePayment: (id, data) => {
    set((s) => ({
      payments: s.payments.map((p) => (p.id === id ? { ...p, ...data } : p)),
    }));
    get().showToast('수납 정보가 업데이트되었습니다.');
  },

  // ─── Payment 보정 (누락 월 자동 생성) ─────────────────
  ensurePaymentsForRecurringLessons: () => {
    const { repeatGroups, classes, payments, students: allStudents } = get();
    const currentMonth = getCurrentMonth();
    const ts = Date.now();
    const newPayments = [];

    for (const group of repeatGroups) {
      if (!groupHasPayment(group)) continue;

      const startMonth = group.startDate?.slice(0, 7);
      if (!startMonth) continue;

      const endMonthRaw = group.endDate ? group.endDate.slice(0, 7) : currentMonth;
      const paymentEndMonth = endMonthRaw < currentMonth ? endMonthRaw : currentMonth;

      const monthsNeeded = getMonthsBetween(startMonth, paymentEndMonth);
      const studentIds = group.studentIds || (group.studentId ? [group.studentId] : []);
      const groupClasses = classes.filter((c) => c.repeatGroupId === group.id);

      for (const month of monthsNeeded) {
        const monthHasClasses = groupClasses.some((c) => c.date.startsWith(month));
        if (!monthHasClasses) continue;

        const [yr, mo] = month.split('-');

        for (const studentId of studentIds) {
          const alreadyExists = payments.some(
            (p) => p.repeatGroupId === group.id && p.studentId === studentId && p.month === month
          );
          if (alreadyExists) continue;

          const student = allStudents.find((s) => s.id === studentId);
          const studentBilling = resolveStudentBilling(group, studentId);
          const payDay = String(studentBilling.paymentDay || group.paymentDay || 10).padStart(2, '0');

          const paymentInfo = generatePaymentForMonth({ group, classes: groupClasses, month, studentId });

          if (paymentInfo.amount <= 0 && paymentInfo.calculatedSessionCount === 0) continue;

          let memo = '';
          if (paymentInfo.isProrated) {
            memo = `${month.replace('-', '년 ')}월은 ${paymentInfo.calculatedSessionCount}회 기준으로 계산됐어요`;
          }

          newPayments.push({
            id: `p${ts}_ensure_${group.id}_${studentId}_${month}`,
            studentId,
            repeatGroupId: group.id,
            month,
            ...paymentInfo,
            dueDate: `${yr}-${mo}-${payDay}`,
            status: 'pending',
            paidDate: null,
            paidAmount: null,
            depositorName: student?.depositorName || '',
            memo,
          });
        }
      }
    }

    if (newPayments.length > 0) {
      set((s) => ({ payments: [...s.payments, ...newPayments] }));
    }
  },

  // ─── Data Reset ────────────────────────────────────
  resetAllData: () => {
    set({
      students: [],
      teachers: [],
      classes: [],
      attendanceRecords: [],
      lessonRecords: [],
      payments: [],
      consultations: [],
      payrolls: [],
      repeatGroups: [],
      schoolNames: [],
      studentEvents: [],
      examResults: [],
      tutorProfile: defaultTutorProfile,
      geminiApiKey: '',
      // Academy workspace also reset
      academyProfile: { name: '우리 학원', ownerName: '', address: '', phone: '', salaryPaymentDay: 10, tuitionDueDay: 1 },
      academyStudents: [],
      classGroups: [],
      classSessions: [],
      clinicTasks: [],
      clinicRecords: [],
      academyTeachers: [],
      academyAssistants: [],
      academyPayments: [],
      academyLessonRecords: [],
      academyAttendanceRecords: [],
      academyStudentEvents: [],
      academyExamResults: [],
      academyConsultations: [],
      academyPayrolls: [],
    });
    get().showToast('모든 데이터가 초기화되었어요.');
  },

  resetDataExceptTeachers: () => {
    const { teachers, tutorProfile, geminiApiKey, role } = get();
    set({
      students: [],
      classes: [],
      attendanceRecords: [],
      lessonRecords: [],
      payments: [],
      consultations: [],
      payrolls: [],
      repeatGroups: [],
      schoolNames: [],
      studentEvents: [],
      examResults: [],
      teachers,
      tutorProfile,
      geminiApiKey,
      role,
    });
    get().showToast('강사 정보를 제외한 데이터가 초기화되었어요.');
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

  // ─── Class Groups (반) ────────────────────────────
  // Phase 38 — group.weekdayTimes (옵션) 가 있으면 각 요일별 시간을 사용한다.
  //   weekdayTimes 구조: { '월': { startTime: '16:00', endTime: '18:00' }, ... }
  //   keys 는 한글 요일 문자열 ('월','화','수','목','금','토','일').
  //   해당 키가 없으면 group.startTime / group.endTime 으로 fallback.
  generateClassSessions: (group, options = {}) => {
    const { id: classGroupId, weekdays, startDate, endDate, startTime, endTime, room, teacherId, teacherUserId, studentIds, weekdayTimes } = group;
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
      const [y, m, d] = date.split('-').map(Number);
      const dayName = numToDayName[new Date(y, m - 1, d).getDay()];
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
        status: 'scheduled',
        memo: '',
        createdAt: new Date().toISOString(),
      };
    });
  },
  addClassGroup: (groupData) => {
    const groupId = `cg${Date.now()}`;
    const newGroup = { ...groupData, id: groupId, createdAt: new Date().toISOString() };
    const sessions = get().generateClassSessions(newGroup);
    set((s) => ({
      classGroups: [...s.classGroups, newGroup],
      classSessions: [...s.classSessions, ...sessions],
    }));
    const monthLabel = (newGroup.startDate || getTodayYMD()).slice(0, 7);
    get().showToast(`반이 생성되었어요. ${monthLabel} 수업 ${sessions.length}회차를 만들었어요.`);
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
  updateClassSession: (sessionId, updates) => {
    set((s) => ({
      classSessions: s.classSessions.map((session) =>
        session.id === sessionId ? { ...session, ...updates, updatedAt: new Date().toISOString() } : session
      ),
    }));
    get().showToast('수업 회차가 수정되었습니다.');
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
  deleteClassSession: (sessionId) => {
    set((s) => ({
      classSessions: s.classSessions.filter((s2) => s2.id !== sessionId),
      academyAttendanceRecords: s.academyAttendanceRecords.filter((a) => a.sessionId !== sessionId),
      academyLessonRecords: s.academyLessonRecords.filter((lr) => lr.sessionId !== sessionId),
    }));
    get().showToast('수업 회차가 삭제되었습니다.');
  },

  // ─── Academy Attendance ───────────────────────────
  // Phase 42 — source / checkedAt 같이 받음. 선생님이 버튼을 눌러 수정한
  // 경우 호출자는 source='teacher_manual' 을 명시한다. 비지정 시 기존 row 의
  // source 를 유지하고, 신규 row 면 'manual' (직접 체크) 로 default.
  updateAcademyAttendance: (sessionId, studentId, status, { source, checkedAt, silent } = {}) => {
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
                source: source ?? a.source ?? 'manual',
                checkedAt: checkedAt ?? (source ? now : a.checkedAt ?? null),
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
            source: source || 'manual',
            checkedAt: checkedAt || now,
          },
        ],
      }));
    }
    if (!silent) get().showToast('출결이 저장되었습니다.');
  },

  // 수업 기록 저장 시 호출 — 출결 버튼을 누르지 않은 학생에 대해 기본 present record 보장.
  // toast 없이 조용히 동작. 이미 record가 있는 학생은 그대로 둔다.
  ensureAttendanceRecordsForSession: ({ sessionId, studentIds, date }) => {
    if (!sessionId || !Array.isArray(studentIds) || studentIds.length === 0) return [];
    const existing = get().academyAttendanceRecords;
    const existingForSession = new Set(
      existing.filter((a) => a.sessionId === sessionId).map((a) => a.studentId)
    );
    const missing = studentIds.filter((sid) => sid && !existingForSession.has(sid));
    if (missing.length === 0) return [];
    const now = Date.now();
    const toAdd = missing.map((sid, idx) => ({
      id: `aa${now}_${idx}_${sid}`,
      sessionId,
      studentId: sid,
      date: date || '',
      status: 'present',
    }));
    set((s) => ({
      academyAttendanceRecords: [...s.academyAttendanceRecords, ...toAdd],
    }));
    return toAdd;
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
  batchSaveSessionRecords: ({ sessionId, date, commonRecord, studentRecords }) => {
    const ts = new Date().toISOString();
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
  addClinicRecord: (record) => {
    const newRecord = {
      ...record,
      id: `cr${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set((s) => ({ clinicRecords: [...(s.clinicRecords || []), newRecord] }));
    get().showToast('클리닉 기록이 저장되었어요.');
    return newRecord;
  },
  updateClinicRecord: (recordId, updates) => {
    set((s) => ({
      clinicRecords: (s.clinicRecords || []).map((r) =>
        r.id === recordId ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
      ),
    }));
    get().showToast('클리닉 기록이 수정되었어요.');
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
  changeLocalStaffRole: (staffId, fromRole, toRole, updates = {}) => {
    if (!staffId || fromRole === toRole) return null;
    const fromKey = fromRole === 'assistant' ? 'academyAssistants' : 'academyTeachers';
    const toKey = toRole === 'assistant' ? 'academyAssistants' : 'academyTeachers';
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
  //   - never delete (matches the spec; orphans stay until the owner removes
  //     them via the existing list UI)
  //
  // Quiet by design — these are triggered from sync orchestration on the
  // workspace store, not direct user action, so no toast.
  upsertLocalTeacherFromServerStaff: (payload = {}) => {
    const {
      userId, memberId, email, displayName, phone,
      subject, subjects, wageType, hourlyWage, monthlySalary, hourlyMode, memo, status,
    } = payload;
    if (!userId) return null;
    const normalizedEmail = (email || '').trim().toLowerCase() || null;

    let saved = null;
    set((s) => {
      const idx = s.academyTeachers.findIndex((t) =>
        (t.serverUserId && t.serverUserId === userId) ||
        (memberId && t.academyMemberId && t.academyMemberId === memberId) ||
        (normalizedEmail && (t.email || '').trim().toLowerCase() === normalizedEmail)
      );
      const existing = idx >= 0 ? s.academyTeachers[idx] : null;
      const stableId = existing?.id || `teacher_${userId}`;

      const merged = {
        ...(existing || {}),
        id: stableId,
        serverUserId: userId,
        academyMemberId: memberId || existing?.academyMemberId || null,
        email: normalizedEmail,
        name: displayName || existing?.name || normalizedEmail || '(이름 없음)',
        phone: phone || existing?.phone || '',
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

      if (existing) {
        const next = s.academyTeachers.slice();
        next[idx] = merged;
        return { academyTeachers: next };
      }
      return { academyTeachers: [...s.academyTeachers, merged] };
    });
    return saved;
  },

  upsertLocalAssistantFromServerStaff: (payload = {}) => {
    const {
      userId, memberId, email, displayName, phone,
      subject, subjects, wageType, hourlyWage, monthlySalary, hourlyMode, memo, status,
    } = payload;
    if (!userId) return null;
    const normalizedEmail = (email || '').trim().toLowerCase() || null;

    let saved = null;
    set((s) => {
      const idx = s.academyAssistants.findIndex((a) =>
        (a.serverUserId && a.serverUserId === userId) ||
        (memberId && a.academyMemberId && a.academyMemberId === memberId) ||
        (normalizedEmail && (a.email || '').trim().toLowerCase() === normalizedEmail)
      );
      const existing = idx >= 0 ? s.academyAssistants[idx] : null;
      const stableId = existing?.id || `assistant_${userId}`;

      const merged = {
        ...(existing || {}),
        id: stableId,
        serverUserId: userId,
        academyMemberId: memberId || existing?.academyMemberId || null,
        email: normalizedEmail,
        name: displayName || existing?.name || normalizedEmail || '(이름 없음)',
        phone: phone || existing?.phone || '',
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

      if (existing) {
        const next = s.academyAssistants.slice();
        next[idx] = merged;
        return { academyAssistants: next };
      }
      return { academyAssistants: [...s.academyAssistants, merged] };
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
    const { classGroups, classSessions, academyPayments } = get();
    const newPayments = [];
    for (const group of classGroups) {
      if (!group.monthlyFee || group.monthlyFee <= 0) continue;
      const monthSessions = classSessions.filter(
        (s) => s.classGroupId === group.id && s.date?.startsWith(month) && s.status !== 'canceled'
      );
      if (monthSessions.length === 0) continue;
      const studentIds = group.studentIds || [];
      for (const studentId of studentIds) {
        const exists = academyPayments.some(
          (p) => p.classGroupId === group.id && p.studentId === studentId && p.month === month
        );
        if (exists) continue;
        newPayments.push({
          id: `ap${Date.now()}_${group.id}_${studentId}`,
          studentId,
          classGroupId: group.id,
          month,
          amount: group.monthlyFee,
          status: 'unpaid',
          createdAt: new Date().toISOString(),
        });
      }
    }
    if (newPayments.length > 0) {
      set((s) => ({ academyPayments: [...s.academyPayments, ...newPayments] }));
      get().showToast(`수납 항목 ${newPayments.length}건이 생성되었습니다.`);
    } else {
      get().showToast('생성할 수납 항목이 없습니다. (이미 존재하거나 수강료 미설정)');
    }
    return newPayments;
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
  //   hourly          : 승인된 실제 근퇴 기록 합계로 계산
  //   teacher lessons : 급여에는 영향 없이 업무 참고 정보로 유지
  //   assistant clinic: 급여에는 영향 없이 업무 참고 정보로 유지
  //   monthly         : monthlySalary 그대로
  // 클리닉 카운트(completedClinicCount) 는 보조강사 카드에 참고 정보로만 남는다.
  // Phase 44.7 / Phase C — staff_attendance_logs 의 approved 실제 시간만 시급제 금액에 반영.
  generatePayrollsForMonth: (month, opts = {}) => {
    const { academyTeachers, academyAssistants, classSessions, clinicTasks } = get();
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
      if (existing.status === 'completed') {
        return {
          ...existing,
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

    academyTeachers.forEach((teacher, i) => {
      // 시급제 급여는 승인된 실제 근퇴 기록만 기준으로 한다.
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

    academyAssistants.forEach((assistant, i) => {
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

    const payrollKeys = new Set(payrolls.map((p) => `${p.staffType}__${p.staffId}`));
    const lockedPayrollsToKeep = (get().academyPayrolls || []).filter(
      (p) => p.month === month && p.status === 'completed' && !payrollKeys.has(`${p.staffType}__${p.staffId}`),
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
        p.id === payrollId ? { ...p, status: 'completed', paidDate: new Date().toISOString().slice(0, 10) } : p
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
  // 과외(private) 모드 데이터는 건드리지 않는다. private store 분리 구조라 자동 안전.
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
      const mergedPayrolls = mergeByIdOrServerId(s.academyPayrolls, newPayrolls);

      counts = {
        students: newStudents.length,
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

  // Phase 44.7 / Phase C — staff_attendance_logs 기반 시간 계산.
  // logs 배열은 호출처가 주입 (useWorkspaceStore.getState().staffAttendanceLogs).
  // approvedOnly=true 면 approved 만 합산. false 면 아직 정산 반영 전인 pending/completed 만 합산.
  computeStaffHoursFromLogs: (staffUserId, month, logs = [], { approvedOnly = true } = {}) => {
    if (!staffUserId || !month) return 0;
    let totalMinutes = 0;
    for (const log of logs) {
      if (!log) continue;
      if (log.staff_user_id !== staffUserId) continue;
      if (!log.work_date?.startsWith(month)) continue;
      if (approvedOnly && log.status !== 'approved') continue;
      if (!approvedOnly && !['pending', 'completed'].includes(log.status)) continue;
      const start = log.actual_start_time;
      const end = log.actual_end_time;
      if (!start || !end) continue;
      const [sh1, sm1] = String(start).slice(0, 5).split(':').map(Number);
      const [sh2, sm2] = String(end).slice(0, 5).split(':').map(Number);
      if (Number.isNaN(sh1) || Number.isNaN(sh2)) continue;
      const minutes = (sh2 * 60 + sm2) - (sh1 * 60 + sm1) - (log.break_minutes || 0);
      if (minutes > 0) totalMinutes += minutes;
    }
    return totalMinutes / 60;
  },

  // ─── Account scoping (Phase 29) ──────────────────────
  // 로그인된 사용자가 변경되었을 때 academy-scoped 로컬 데이터만 비운다.
  // tutor / private 데이터는 건드리지 않는다 (사용자가 명시적 fresh 가입한 게
  // 아니라 로그인만 바뀐 경우라도, 개인 워크스페이스는 그 자체로 격리되도록).
  // App.jsx 가 인증 직후 호출.
  ensureAcademyDataOwner: (userId) => {
    if (!userId) return;
    const current = get().academyDataOwnerUserId;
    if (current === userId) return;
    // 다른 사용자였거나 처음 로그인. academy 데이터를 깨끗하게 리셋.
    set({
      academyProfile: { name: '우리 학원', ownerName: '', address: '', phone: '', salaryPaymentDay: 10, tuitionDueDay: 1 },
      academyStudents: [],
      classGroups: [],
      classSessions: [],
      clinicTasks: [],
      clinicRecords: [],
      academyTeachers: [],
      academyAssistants: [],
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
      academyDataOwnerUserId: userId,
    });
  },

  // ─── Academy Reset ────────────────────────────────
  resetAcademyData: () => {
    set({
      academyProfile: { name: '우리 학원', ownerName: '', address: '', phone: '', salaryPaymentDay: 10, tuitionDueDay: 1 },
      academyStudents: [],
      classGroups: [],
      classSessions: [],
      clinicTasks: [],
      clinicRecords: [],
      academyTeachers: [],
      academyAssistants: [],
      academyPayments: [],
      academyLessonRecords: [],
      academyAttendanceRecords: [],
      academyStudentEvents: [],
      academyExamResults: [],
      academyConsultations: [],
      academyPayrolls: [],
      // Clear academy-related navigation state too
      selectedClassGroupId: null,
      selectedClassSessionId: null,
      selectedAcademyStudentId: null,
    });
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
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const startDate = `${y}-${m}-01`;

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

    const todayStr = `${y}-${m}-${String(now.getDate()).padStart(2, '0')}`;
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

  // ─── Consultations ─────────────────────────────────
  addConsultation: (consultation) => {
    const newCon = { ...consultation, id: `con${Date.now()}` };
    set((s) => ({ consultations: [...s.consultations, newCon] }));
    get().showToast('상담 기록이 추가되었습니다.');
  },
  updateConsultation: (id, data) => {
    set((s) => ({
      consultations: s.consultations.map((c) => (c.id === id ? { ...c, ...data } : c)),
    }));
    get().showToast('상담 기록이 수정되었습니다.');
  },
}),
    {
      name: 'academy-store',
      storage: createJSONStorage(() => createDeferredLocalStorage()),
      partialize: (s) => ({
        // Auth
        currentMode: s.currentMode,
        // Private workspace
        tutorProfile: s.tutorProfile,
        geminiApiKey: s.geminiApiKey,
        schoolNames: s.schoolNames,
        students: s.students,
        teachers: s.teachers,
        classes: s.classes,
        attendanceRecords: s.attendanceRecords,
        lessonRecords: s.lessonRecords,
        payments: s.payments,
        consultations: s.consultations,
        payrolls: s.payrolls,
        repeatGroups: s.repeatGroups,
        studentEvents: s.studentEvents,
        examResults: s.examResults,
        // Academy workspace
        academyProfile: s.academyProfile,
        academyStudents: s.academyStudents,
        classGroups: s.classGroups,
        classSessions: s.classSessions,
        clinicTasks: s.clinicTasks,
        clinicRecords: s.clinicRecords || [],
        academyTeachers: s.academyTeachers,
        academyAssistants: s.academyAssistants,
        academyPayments: s.academyPayments,
        academyLessonRecords: s.academyLessonRecords,
        academyAttendanceRecords: s.academyAttendanceRecords,
        academyStudentEvents: s.academyStudentEvents,
        academyExamResults: s.academyExamResults,
        academyConsultations: s.academyConsultations,
        academyPayrolls: s.academyPayrolls,
        academyStaffShifts: s.academyStaffShifts,
        // Phase 29 — 학원 데이터 소유자 (cross-account leak 방지용 marker)
        academyDataOwnerUserId: s.academyDataOwnerUserId,
      }),
      // Migrate persisted profile to add prompt fields if missing
      onRehydrateStorage: () => (state) => {
        if (state?.tutorProfile) {
          if (!state.tutorProfile.parentNoticePrompt) {
            state.tutorProfile.parentNoticePrompt = DEFAULT_PARENT_NOTICE_PROMPT;
          }
          if (!state.tutorProfile.studentHomeworkPrompt) {
            state.tutorProfile.studentHomeworkPrompt = DEFAULT_STUDENT_HOMEWORK_PROMPT;
          }
        }
      },
    }
  )
);

export default useAcademyStore;
