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

  // === Data ===
  students: [],
  teachers: [],
  classes: [],
  attendanceRecords: [],
  lessonRecords: [],
  payments: [],
  consultations: [],
  payrolls: [],
  repeatGroups: [],

  // === Toast ===
  toast: null,

  // ─── Auth ──────────────────────────────────────────
  setRole: (role) => set({ role, activeTab: 'home', selectedClassId: null, selectedStudentId: null, selectedRepeatGroupId: null }),
  logout: () => set({ role: null }),

  // ─── Navigation ────────────────────────────────────
  setActiveTab: (tab) => set({ activeTab: tab, selectedClassId: null, selectedStudentId: null, selectedRepeatGroupId: null }),
  navigateToClass: (id) => set({ selectedClassId: id, activeTab: 'classes', selectedRepeatGroupId: null }),
  navigateToStudent: (id) => set({ selectedStudentId: id, activeTab: 'students' }),
  navigateToRepeatGroup: (id) => set({ selectedRepeatGroupId: id, activeTab: 'classes', selectedClassId: null }),
  goBackFromClass: () => set({ selectedClassId: null }),
  goBackFromStudent: () => set({ selectedStudentId: null }),
  goBackFromRepeatGroup: () => set({ selectedRepeatGroupId: null }),

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
      tutorProfile: defaultTutorProfile,
      geminiApiKey: '',
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
      teachers,
      tutorProfile,
      geminiApiKey,
      role,
    });
    get().showToast('강사 정보를 제외한 데이터가 초기화되었어요.');
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
