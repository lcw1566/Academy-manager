import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateClassDates } from '../utils/recurringClass';
import { getCurrentMonth } from '../utils/date';

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
  deleteClass: (id) => {
    set((s) => ({ classes: s.classes.filter((c) => c.id !== id) }));
    get().showToast('수업이 삭제되었습니다.');
  },

  // ─── Recurring class (정기 과외) ───────────────────
  addRepeatGroup: (groupData) => {
    const groupId = `rg${Date.now()}`;
    const newGroup = { ...groupData, id: groupId };

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

    const currentMonth = getCurrentMonth();
    const [year, month] = currentMonth.split('-');
    const day = String(groupData.paymentDay || 10).padStart(2, '0');

    const newPayments = [];
    if (groupData.monthlyFee > 0) {
      for (const studentId of studentIds) {
        const existingPayment = get().payments.find(
          (p) => p.studentId === studentId && p.month === currentMonth
        );
        if (!existingPayment) {
          const student = allStudents.find((s) => s.id === studentId);
          newPayments.push({
            id: `p${ts}_${studentId}`,
            studentId,
            month: currentMonth,
            amount: groupData.monthlyFee,
            dueDate: `${year}-${month}-${day}`,
            status: 'pending',
            paidDate: null,
            paidAmount: null,
            depositorName: student?.depositorName || '',
            memo: '',
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
    }
  )
);

export default useAcademyStore;
