import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateClassDates } from '../utils/recurringClass';
import { getCurrentMonth, getMonthsBetween } from '../utils/date';
import { generatePaymentForMonth, groupHasPayment, resolveStudentBilling } from '../utils/billing';
import { DEFAULT_PARENT_NOTICE_PROMPT, DEFAULT_STUDENT_HOMEWORK_PROMPT } from '../constants/aiPrompts';

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
  // === Auth ===
  role: null,

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
  academyProfile: { name: '우리 학원', address: '', phone: '' },
  academyStudents: [],
  classGroups: [],
  classSessions: [],
  clinicTasks: [],
  academyTeachers: [],
  academyAssistants: [],
  academyPayments: [],
  academyLessonRecords: [],
  academyAttendanceRecords: [],
  academyStudentEvents: [],
  academyExamResults: [],
  academyConsultations: [],

  // === Toast ===
  toast: null,

  // ─── Auth ──────────────────────────────────────────
  setRole: (role) => set({
    role,
    activeTab: 'home',
    selectedClassId: null,
    selectedStudentId: null,
    selectedRepeatGroupId: null,
    selectedClassGroupId: null,
    selectedClassSessionId: null,
    selectedAcademyStudentId: null,
  }),
  logout: () => set({ role: null }),

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
  showToast: (message, type = 'success') => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 2500);
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
      academyStudents: [],
      classGroups: [],
      classSessions: [],
      clinicTasks: [],
      academyTeachers: [],
      academyAssistants: [],
      academyPayments: [],
      academyLessonRecords: [],
      academyAttendanceRecords: [],
      academyStudentEvents: [],
      academyExamResults: [],
      academyConsultations: [],
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

  // ─── Class Groups (반) ────────────────────────────
  generateClassSessions: (group) => {
    const { id: classGroupId, weekdays, startDate, endDate, startTime, endTime, room, teacherId, assistantIds, studentIds } = group;
    const dayNameToNum = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 0 };
    const daysOfWeek = (weekdays || []).map((d) => dayNameToNum[d]).filter((d) => d !== undefined);
    const dates = generateClassDates({ daysOfWeek, startDate, endDate: endDate || null, repeatType: '매주' });
    const ts = Date.now();
    return dates.map((date, i) => ({
      id: `cs${ts}_${i}`,
      classGroupId,
      date,
      startTime,
      endTime,
      room: room || '',
      teacherId: teacherId || '',
      assistantIds: assistantIds || [],
      studentIds: studentIds || [],
      status: 'scheduled',
      memo: '',
      createdAt: new Date().toISOString(),
    }));
  },
  addClassGroup: (groupData) => {
    const groupId = `cg${Date.now()}`;
    const newGroup = { ...groupData, id: groupId, createdAt: new Date().toISOString() };
    const sessions = get().generateClassSessions(newGroup);
    set((s) => ({
      classGroups: [...s.classGroups, newGroup],
      classSessions: [...s.classSessions, ...sessions],
    }));
    get().showToast(`반이 생성되었습니다. 수업 회차 ${sessions.length}개가 만들어졌어요.`);
    return newGroup;
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

  // ─── Class Sessions (수업 회차) ───────────────────
  updateClassSession: (sessionId, updates) => {
    set((s) => ({
      classSessions: s.classSessions.map((session) =>
        session.id === sessionId ? { ...session, ...updates, updatedAt: new Date().toISOString() } : session
      ),
    }));
    get().showToast('수업 회차가 수정되었습니다.');
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
  updateAcademyAttendance: (sessionId, studentId, status) => {
    const existing = get().academyAttendanceRecords.find(
      (a) => a.sessionId === sessionId && a.studentId === studentId
    );
    const session = get().classSessions.find((s) => s.id === sessionId);
    if (existing) {
      set((s) => ({
        academyAttendanceRecords: s.academyAttendanceRecords.map((a) =>
          a.id === existing.id ? { ...a, status } : a
        ),
      }));
    } else {
      set((s) => ({
        academyAttendanceRecords: [
          ...s.academyAttendanceRecords,
          { id: `aa${Date.now()}`, sessionId, studentId, date: session?.date || '', status },
        ],
      }));
    }
    get().showToast('출결이 저장되었습니다.');
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

  // ─── Clinic Tasks ─────────────────────────────────
  addClinicTask: (task) => {
    const newTask = { ...task, id: `clinic${Date.now()}`, status: task.status || 'pending', createdAt: new Date().toISOString() };
    set((s) => ({ clinicTasks: [...s.clinicTasks, newTask] }));
    get().showToast('클리닉 요청이 생성되었습니다.');
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

  // ─── Academy Payments ─────────────────────────────
  addAcademyPayment: (payment) => {
    const newPayment = { ...payment, id: `ap${Date.now()}` };
    set((s) => ({ academyPayments: [...s.academyPayments, newPayment] }));
    get().showToast('수납 항목이 추가되었습니다.');
  },
  updateAcademyPayment: (id, data) => {
    set((s) => ({ academyPayments: s.academyPayments.map((p) => (p.id === id ? { ...p, ...data } : p)) }));
    get().showToast('수납 정보가 업데이트되었습니다.');
  },
  deleteAcademyPayment: (id) => {
    set((s) => ({ academyPayments: s.academyPayments.filter((p) => p.id !== id) }));
    get().showToast('수납 항목이 삭제되었습니다.');
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

  // ─── Academy Reset ────────────────────────────────
  resetAcademyData: () => {
    set({
      academyStudents: [],
      classGroups: [],
      classSessions: [],
      clinicTasks: [],
      academyTeachers: [],
      academyAssistants: [],
      academyPayments: [],
      academyLessonRecords: [],
      academyAttendanceRecords: [],
      academyStudentEvents: [],
      academyExamResults: [],
      academyConsultations: [],
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
      assistantIds: [sampleAssistant.id],
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
      assistantIds: [sampleAssistant.id],
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
        requestedByRole: 'teacher',
        requestedById: sampleTeacher.id,
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
        requestedByRole: 'teacher',
        requestedById: sampleTeacher.id,
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

    set((s) => ({
      academyStudents: [...s.academyStudents, ...sampleStudents],
      academyTeachers: [...s.academyTeachers, sampleTeacher],
      academyAssistants: [...s.academyAssistants, sampleAssistant],
      classGroups: [...s.classGroups, sampleGroup],
      classSessions: [...s.classSessions, ...sampleSessions],
      clinicTasks: [...s.clinicTasks, ...sampleClinics],
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
      partialize: (s) => ({
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
        academyTeachers: s.academyTeachers,
        academyAssistants: s.academyAssistants,
        academyPayments: s.academyPayments,
        academyLessonRecords: s.academyLessonRecords,
        academyAttendanceRecords: s.academyAttendanceRecords,
        academyStudentEvents: s.academyStudentEvents,
        academyExamResults: s.academyExamResults,
        academyConsultations: s.academyConsultations,
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
