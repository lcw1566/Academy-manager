import { useEffect, useState, useMemo } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Check, RefreshCw, Plus, X, Trash2, Calendar, Wallet, Settings, Clock3, ReceiptText, SlidersHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyPayment,
  createAcademyPaymentsBulk,
  updatePayment as updateServerPayment,
  deletePayment as deleteServerPayment,
  createAcademyPayrollsBulk,
  updatePayroll as updateServerPayroll,
} from '../../../services/supabase/domainApi';
import { updateAcademyBillingSettings } from '../../../services/supabase/workspaceApi';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import {
  formatMonth,
  getCurrentMonth,
  getDaysInMonth,
  nextMonth,
  prevMonth,
  today,
} from '../../../utils/date';
import { currentUserCan } from '../../../utils/staffPermissions';
import { isPayableStaffAttendance, staffAttendanceMinutes } from '../../../utils/staffAttendance';

// local 수납 → server payments 컬럼 매핑. student.serverId 없으면 null 반환.
function mapLocalPaymentToServerPayload({ payment, student, group }) {
  if (!student?.serverId) return null;
  return {
    student_id: student.serverId,
    class_group_id: group?.serverId || null,
    month: payment.month,
    amount: Number(payment.amount) || 0,
    due_date: payment.dueDate || null,
    paid_date: payment.paidDate || null,
    status: payment.status || 'unpaid',
    payer_name: payment.payerName || null,
    memo: payment.memo || null,
    payment_kind: payment.paymentKind || (group ? 'legacy_class' : 'manual'),
    billing_snapshot: payment.billingSnapshot || {},
  };
}

// local 급여 → server payrolls 컬럼 매핑. staff_id 는 local id 그대로 (text).
function mapLocalPayrollToServerPayload(payroll) {
  return {
    staff_type: payroll.staffType,
    staff_id: payroll.staffId,
    staff_user_id: payroll.staffUserId || null,
    month: payroll.month,
    wage_type: payroll.wageType || null,
    hourly_wage: Number(payroll.hourlyWage) || 0,
    monthly_salary: Number(payroll.monthlySalary) || 0,
    total_hours: Number(payroll.totalHours) || 0,
    completed_session_count: Number(payroll.completedSessionCount) || 0,
    completed_clinic_count: Number(payroll.completedClinicCount) || 0,
    amount: Number(payroll.amount) || 0,
    status: payroll.status || 'scheduled',
    paid_date: payroll.paidDate || null,
    memo: payroll.memo || null,
  };
}

const MONTHS_BACK = 11;

function formatHours(h) {
  if (!h) return '0';
  const n = Number(h);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatWon(value) {
  return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString()}원`;
}

function getRecentMonths() {
  const result = [];
  let month = getCurrentMonth();
  for (let i = 0; i <= MONTHS_BACK; i++) {
    result.push(month);
    month = prevMonth(month);
  }
  return result;
}

function addMonth(value, delta) {
  let result = value;
  const move = delta >= 0 ? nextMonth : prevMonth;
  for (let i = 0; i < Math.abs(delta); i += 1) result = move(result);
  return result;
}

function getMonthDateRange(month) {
  return {
    fromDate: `${month}-01`,
    toDate: `${month}-${String(getDaysInMonth(month)).padStart(2, '0')}`,
  };
}

export default function SettlementPage({ operationsOnly = false, initialSegment = 'payments', title = '정산', testLabMode = false }) {
  const {
    role, academyStudents, classGroups, academyPayments,
    academyTeachers, academyAssistants, academyManagers = [], academyPayrolls,
    academyProfile, setAcademyProfile,
    updateAcademyPayment, addAcademyPayment, deleteAcademyPayment,
    generatePayrollsForMonth, markPayrollPaid,
    generateAcademyPaymentsForMonth, setPaymentServerId,
    setPayrollServerId,
    showToast,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUserId = useAuthStore((s) => s.user?.id);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerPayments = useWorkspaceStore((s) => s.loadServerPayments);
  const loadServerPayrolls = useWorkspaceStore((s) => s.loadServerPayrolls);
  const loadMemberships = useWorkspaceStore((s) => s.loadMemberships);
  const loadStaffAttendanceLogs = useWorkspaceStore((s) => s.loadStaffAttendanceLogs);
  const staffAttendanceLogs = useWorkspaceStore((s) => s.staffAttendanceLogs) ?? [];
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((profile) => profile.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );
  const canManagePayments = role === 'owner' || currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canManagePayments',
  );
  // Phase 39 — memberships 에 academy:academies(*) 로 fetch 되므로 최신값 우선 사용.
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const myAcademy = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId)?.academy ?? null,
    [memberships, currentAcademyId],
  );
  const salaryPaymentDay = myAcademy?.salary_payment_day ?? academyProfile?.salaryPaymentDay ?? 10;
  const tuitionDueDay = myAcademy?.tuition_due_day ?? academyProfile?.tuitionDueDay ?? 1;

  const months = getRecentMonths();
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [segment, setSegment] = useState(
    operationsOnly || !['payments', 'payroll', 'settings'].includes(initialSegment)
      ? 'payments'
      : initialSegment,
  ); // 'payments' | 'payroll' | 'settings'
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [addForm, setAddForm] = useState({ studentId: '', classGroupId: '', amount: '' });
  // Phase 39 — 일자 선택 시트.
  const [daySheet, setDaySheet] = useState(null); // 'salary' | 'tuition' | null
  const [adjustmentPayment, setAdjustmentPayment] = useState(null);
  const [adjustmentForm, setAdjustmentForm] = useState({ amount: '', reason: '', dueDate: '' });
  const [payrollDetail, setPayrollDetail] = useState(null);
  const currentMonth = months[0];
  const canMoveNextMonth = selectedMonth < currentMonth;

  useEffect(() => {
    if (!testLabMode || initialSegment !== 'payroll' || !loadStaffAttendanceLogs) return;
    void loadStaffAttendanceLogs(getMonthDateRange(selectedMonth));
  }, [initialSegment, loadStaffAttendanceLogs, selectedMonth, testLabMode]);

  const moveMonth = (delta) => {
    const nextMonth = addMonth(selectedMonth, delta);
    if (nextMonth > currentMonth) return;
    setSelectedMonth(nextMonth);
    setMonthPickerOpen(false);
  };

  // Phase 39 — 일자 저장. 로컬 store 즉시 반영 + (가능하면) 서버 write-through.
  const saveBillingDay = async (kind, day) => {
    const patch = kind === 'salary'
      ? { salaryPaymentDay: day }
      : { tuitionDueDay: day };
    setAcademyProfile(patch);
    setDaySheet(null);
    if (isAuthenticated && currentAcademyId) {
      try {
        await updateAcademyBillingSettings(currentAcademyId, patch);
        await loadMemberships();
        showToast(kind === 'salary' ? '급여 지급일을 저장했어요.' : '수강료 납부일을 저장했어요.');
      } catch (err) {
        console.warn('[supabase] update billing settings failed', err);
        showToast(
          err?.message
            ? `설정은 저장됐지만 동기화에 실패했어요: ${err.message}`
            : '설정은 저장됐지만 동기화에 실패했어요.',
          'error',
        );
      }
    } else {
      showToast(kind === 'salary' ? '급여 지급일을 저장했어요.' : '수강료 납부일을 저장했어요.');
    }
  };

  // ─── 수납 계산 ───────────────────────────────────
  const monthPayments = useMemo(
    () => academyPayments.filter((p) => p.month === selectedMonth),
    [academyPayments, selectedMonth]
  );

  const paymentSummary = useMemo(() => {
    const expected = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const paid = monthPayments.filter((p) => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);
    const unpaid = expected - paid;
    return { expected, paid, unpaid };
  }, [monthPayments]);

  // ─── 급여 계산 ───────────────────────────────────
  const monthPayrolls = useMemo(
    () => academyPayrolls.filter((p) => p.month === selectedMonth),
    [academyPayrolls, selectedMonth]
  );

  const payrollSummary = useMemo(() => {
    const total = monthPayrolls.reduce((s, p) => s + (p.amount || 0), 0);
    const paid = monthPayrolls.filter((p) => p.status === 'completed').reduce((s, p) => s + (p.amount || 0), 0);
    return { total, paid, pending: total - paid };
  }, [monthPayrolls]);

  const netSummary = paymentSummary.paid - payrollSummary.total;

  const getStudentName = (id) => academyStudents.find((s) => s.id === id)?.name || '학생';
  const getGroupName = (id) => classGroups.find((g) => g.id === id)?.name || '';
  const getStaffName = (payroll) => {
    if (payroll.staffType === 'teacher') return academyTeachers.find((t) => t.id === payroll.staffId)?.name || '강사';
    if (payroll.staffType === 'assistant') return academyAssistants.find((a) => a.id === payroll.staffId)?.name || '보조강사';
    return academyManagers.find((m) => m.id === payroll.staffId)?.name || '운영 매니저';
  };
  const getStaffTypeLabel = (type) => type === 'teacher' ? '강사' : type === 'assistant' ? '보조강사' : '운영 매니저';
  const getHourlyModeLabel = () => '실제 근퇴 기준';

  const unpaidStudents = useMemo(
    () => academyStudents.filter((s) => {
      const p = monthPayments.find((p) => p.studentId === s.id);
      return p && p.status !== 'paid';
    }),
    [academyStudents, monthPayments]
  );

  const canSyncServer = isAuthenticated && currentAcademyId;

  const handleTogglePaid = async (payment) => {
    if (!canManagePayments) return;
    const nextStatus = payment.status === 'paid' ? 'unpaid' : 'paid';
    const todayStr = today();
    const patch = nextStatus === 'paid'
      ? { status: 'paid', paidDate: payment.paidDate || todayStr }
      : { status: 'unpaid', paidDate: null };
    updateAcademyPayment(payment.id, patch);
    if (payment.serverId && canSyncServer) {
      try {
        await updateServerPayment(payment.serverId, {
          status: patch.status,
          paid_date: patch.paidDate || null,
        });
        await loadServerPayments();
      } catch (err) {
        console.error('[supabase] updatePayment(status) failed', err);
        showToast(
          err?.message
            ? `수납 서버 동기화 실패: ${err.message}`
            : '수납 기록은 수정되었지만 서버 동기화는 실패했어요.',
          'error',
        );
      }
    }
  };

  const handleAutoGeneratePayrolls = async () => {
    // Phase 44.7 / Phase C — approved attendance logs 우선 사용.
    let attendanceLogs = useWorkspaceStore.getState().staffAttendanceLogs || [];
    if (canSyncServer && loadStaffAttendanceLogs) {
      const range = getMonthDateRange(selectedMonth);
      attendanceLogs = await loadStaffAttendanceLogs(range);
    }
    const newPayrolls = generatePayrollsForMonth(selectedMonth, { attendanceLogs }) || [];
    if (newPayrolls.length === 0) return;
    if (!canSyncServer) return;
    try {
      const inserted = await createAcademyPayrollsBulk({
        academyId: currentAcademyId,
        payrolls: newPayrolls.map(mapLocalPayrollToServerPayload),
      });
      // (staff_type, staff_id, month) 키 기준으로 local newPayroll ↔ server row 매핑
      const byKey = new Map(
        (inserted || []).map((row) => [
          `${row.staff_type}__${row.staff_id}__${row.month}`,
          row.id,
        ]),
      );
      for (const local of newPayrolls) {
        const key = `${local.staffType}__${local.staffId}__${local.month}`;
        const serverId = byKey.get(key);
        if (serverId) setPayrollServerId(local.id, serverId);
      }
      await loadServerPayrolls();
    } catch (err) {
      console.error('[supabase] createAcademyPayrollsBulk failed', err);
      showToast(
        err?.message
          ? `급여 서버 동기화 실패: ${err.message}`
          : '급여 명세는 저장되었지만 서버 동기화는 실패했어요.',
        'error',
      );
    }
  };

  const handleMarkPayrollPaid = async (payroll) => {
    markPayrollPaid(payroll.id);
    if (payroll.serverId && canSyncServer) {
      try {
        await updateServerPayroll(payroll.serverId, {
          status: 'completed',
          paid_date: today(),
        });
        await loadServerPayrolls();
      } catch (err) {
        console.error('[supabase] updatePayroll failed', err);
        showToast(
          err?.message
            ? `급여 서버 동기화 실패: ${err.message}`
            : '급여 기록은 수정되었지만 서버 동기화는 실패했어요.',
          'error',
        );
      }
    }
  };

  const handleAddPayment = async () => {
    if (!canManagePayments) return;
    if (!addForm.studentId || !addForm.amount) return;
    const group = classGroups.find((g) => g.id === addForm.classGroupId);
    const student = academyStudents.find((s) => s.id === addForm.studentId);
    const localPayment = addAcademyPayment({
      studentId: addForm.studentId,
      classGroupId: addForm.classGroupId || '',
      month: selectedMonth,
      amount: Number(addForm.amount) || 0,
      status: 'unpaid',
      paymentKind: 'manual',
      billingSnapshot: {},
      memo: group ? `${group.name} 수강료` : '',
      createdAt: new Date().toISOString(),
    });
    setShowAddPayment(false);
    setAddForm({ studentId: '', classGroupId: '', amount: '' });

    if (canSyncServer && student?.serverId && localPayment?.id) {
      const serverPayload = mapLocalPaymentToServerPayload({
        payment: localPayment,
        student,
        group,
      });
      if (serverPayload) {
        try {
          const created = await createAcademyPayment({
            academyId: currentAcademyId,
            ...serverPayload,
          });
          if (created?.id) setPaymentServerId(localPayment.id, created.id);
          await loadServerPayments();
        } catch (err) {
          console.error('[supabase] createAcademyPayment failed', err);
          showToast(
            err?.message
              ? `수납 서버 저장 실패: ${err.message}`
              : '수납 기록은 저장되었지만 서버 동기화는 실패했어요.',
            'error',
          );
        }
      }
    }
  };

  const handleDeletePayment = async (payment) => {
    if (!canManagePayments) return;
    const serverId = payment.serverId || null;
    deleteAcademyPayment(payment.id);
    if (serverId && canSyncServer) {
      try {
        await deleteServerPayment(serverId);
        await loadServerPayments();
      } catch (err) {
        console.error('[supabase] deletePayment failed', err);
        showToast(
          err?.message
            ? `수납 서버 삭제 실패: ${err.message}`
            : '수납 기록은 삭제되었지만 서버 삭제는 실패했어요.',
          'error',
        );
      }
    }
  };

  const handleAutoGeneratePayments = async () => {
    const generated = generateAcademyPaymentsForMonth(selectedMonth) || {};
    const newPayments = generated.created || [];
    const updatedPayments = generated.updated || [];
    if (newPayments.length === 0 && updatedPayments.length === 0) return;
    if (!canSyncServer) return;

    // server payload 변환 — student.serverId 있는 행만 서버 동기화 대상
    const studentById = new Map(academyStudents.map((s) => [s.id, s]));
    const groupById = new Map(classGroups.map((g) => [g.id, g]));
    const eligible = newPayments
      .map((p) => {
        const student = studentById.get(p.studentId);
        const group = groupById.get(p.classGroupId);
        const serverPayload = mapLocalPaymentToServerPayload({ payment: p, student, group });
        return serverPayload ? { local: p, server: serverPayload } : null;
      })
      .filter(Boolean);

    try {
      const inserted = eligible.length > 0
        ? await createAcademyPaymentsBulk({
            academyId: currentAcademyId,
            payments: eligible.map((e) => e.server),
          })
        : [];
      // (student_id, class_group_id, month) 키 기준으로 local newPayment ↔ server row 매핑
      const byKey = new Map(
        (inserted || []).map((row) => [
          `${row.student_id}__${row.class_group_id ?? ''}__${row.month}`,
          row.id,
        ]),
      );
      for (const e of eligible) {
        const key = `${e.server.student_id}__${e.server.class_group_id ?? ''}__${e.server.month}`;
        const serverId = byKey.get(key);
        if (serverId) setPaymentServerId(e.local.id, serverId);
      }
      await Promise.all(
        updatedPayments
          .filter((payment) => payment.serverId)
          .map((payment) => updateServerPayment(payment.serverId, {
            amount: Number(payment.amount) || 0,
            due_date: payment.dueDate || null,
            memo: payment.memo || null,
            billing_snapshot: payment.billingSnapshot || {},
          })),
      );
      await loadServerPayments();
    } catch (err) {
      console.error('[supabase] createAcademyPaymentsBulk failed', err);
      // 서버 저장에 실패한 자동 청구를 이 기기에만 남기지 않는다.
      // 서버 목록으로 되돌려 다음 재시도 결과가 모든 기기에서 같게 보이게 한다.
      await loadServerPayments().catch(() => {});
      showToast(
        err?.message
          ? `자동 수납을 저장하지 못해 이전 상태로 되돌렸어요: ${err.message}`
          : '자동 수납을 저장하지 못해 이전 상태로 되돌렸어요.',
        'error',
      );
    }
  };

  const openStudentAdjustment = (student, payment) => {
    const lastDay = getDaysInMonth(selectedMonth);
    const defaultDueDate = `${selectedMonth}-${String(Math.min(tuitionDueDay, lastDay)).padStart(2, '0')}`;
    setAdjustmentPayment({ student, payment: payment || null });
    setAdjustmentForm({
      amount: String(payment?.amount ?? student?.baseTuition ?? ''),
      reason: payment?.billingSnapshot?.manualAdjustment?.reason || '',
      dueDate: payment?.dueDate || defaultDueDate,
    });
  };

  const handleSaveStudentAdjustment = async () => {
    if (!canManagePayments || !adjustmentPayment?.student) return;
    const amount = Math.max(0, Math.round(Number(adjustmentForm.amount) || 0));
    const reason = adjustmentForm.reason.trim();
    const student = adjustmentPayment.student;
    const existing = adjustmentPayment.payment;
    const originalAmount = Number(existing?.billingSnapshot?.manualAdjustment?.originalAmount)
      || Number(existing?.amount)
      || Number(student.baseTuition)
      || 0;
    const billingSnapshot = {
      ...(existing?.billingSnapshot || {}),
      manualAdjustment: {
        originalAmount,
        adjustedAmount: amount,
        reason: reason || '개별 학원비 조정',
        adjustedAt: new Date().toISOString(),
      },
    };
    const patch = {
      amount,
      dueDate: adjustmentForm.dueDate || null,
      memo: reason ? `예외 조정 · ${reason}` : '학생별 학원비 조정',
      billingSnapshot,
    };

    try {
      if (existing) {
        updateAcademyPayment(existing.id, patch);
        if (existing.serverId && canSyncServer) {
          await updateServerPayment(existing.serverId, {
            amount,
            due_date: patch.dueDate,
            memo: patch.memo,
            billing_snapshot: billingSnapshot,
          });
        }
      } else {
        const localPayment = addAcademyPayment({
          studentId: student.id,
          classGroupId: '',
          month: selectedMonth,
          amount,
          dueDate: patch.dueDate,
          paidDate: null,
          status: 'unpaid',
          paymentKind: 'student_monthly',
          billingSnapshot,
          memo: patch.memo,
          createdAt: new Date().toISOString(),
        });
        if (canSyncServer && student.serverId && localPayment?.id) {
          const created = await createAcademyPayment({
            academyId: currentAcademyId,
            ...mapLocalPaymentToServerPayload({ payment: localPayment, student, group: null }),
          });
          if (created?.id) setPaymentServerId(localPayment.id, created.id);
        }
      }
      if (canSyncServer) await loadServerPayments();
      setAdjustmentPayment(null);
      showToast(`${student.name} 학생의 ${formatMonth(selectedMonth)} 학원비를 조정했어요.`);
    } catch (err) {
      console.error('[supabase] save student payment adjustment failed', err);
      if (canSyncServer) await loadServerPayments().catch(() => {});
      showToast(err?.message ? `학원비 조정 실패: ${err.message}` : '학원비 조정을 저장하지 못했어요.', 'error');
    }
  };

  if (testLabMode) {
    return (
      <TestLabSettlementView
        title={title}
        mode={initialSegment === 'payroll' ? 'payroll' : 'payments'}
        selectedMonth={selectedMonth}
        months={months}
        monthPickerOpen={monthPickerOpen}
        setMonthPickerOpen={setMonthPickerOpen}
        setSelectedMonth={setSelectedMonth}
        moveMonth={moveMonth}
        canMoveNextMonth={canMoveNextMonth}
        currentMonth={currentMonth}
        paymentSummary={paymentSummary}
        payrollSummary={payrollSummary}
        monthPayments={monthPayments}
        monthPayrolls={monthPayrolls}
        academyStudents={academyStudents}
        canManagePayments={canManagePayments}
        tuitionDueDay={tuitionDueDay}
        salaryPaymentDay={salaryPaymentDay}
        onOpenSettings={setDaySheet}
        onAutoGeneratePayments={handleAutoGeneratePayments}
        onAutoGeneratePayrolls={handleAutoGeneratePayrolls}
        onTogglePaid={handleTogglePaid}
        onOpenAdjustment={openStudentAdjustment}
        onOpenPayrollDetail={setPayrollDetail}
        onMarkPayrollPaid={handleMarkPayrollPaid}
        getStaffName={getStaffName}
        staffAttendanceLogs={staffAttendanceLogs}
        adjustmentPayment={adjustmentPayment}
        adjustmentForm={adjustmentForm}
        setAdjustmentForm={setAdjustmentForm}
        onCloseAdjustment={() => setAdjustmentPayment(null)}
        onSaveAdjustment={handleSaveStudentAdjustment}
        payrollDetail={payrollDetail}
        onClosePayrollDetail={() => setPayrollDetail(null)}
        daySheet={daySheet}
        onCloseDaySheet={() => setDaySheet(null)}
        onSaveBillingDay={saveBillingDay}
      />
    );
  }

  return (
    <div>
      <Header title={title} />

      <div className="pt-14 md:pt-0 pb-6">
        {/* 월 선택 */}
        <div className="relative px-4 pt-4 md:pt-0 mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center overflow-hidden bg-white rounded-2xl border border-[#E5E8EB] shadow-sm">
            <button
              type="button"
              aria-label="이전 달"
              onClick={() => moveMonth(-1)}
              className="w-11 h-11 flex items-center justify-center text-[#8B95A1] active:bg-[#F2F4F6] md:hover:bg-[#F8F9FA]"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setMonthPickerOpen(!monthPickerOpen)}
              className="h-11 min-w-[132px] px-2 flex items-center justify-center gap-1.5 border-x border-[#F2F4F6] active:bg-[#F8F9FA] md:hover:bg-[#F8F9FA]"
            >
              <span className="font-extrabold text-[#191F28]">{formatMonth(selectedMonth)}</span>
              <ChevronDown size={16} className={`text-[#8B95A1] transform-gpu ${monthPickerOpen ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              aria-label="다음 달"
              onClick={() => moveMonth(1)}
              disabled={!canMoveNextMonth}
              className="w-11 h-11 flex items-center justify-center text-[#8B95A1] active:bg-[#F2F4F6] md:hover:bg-[#F8F9FA] disabled:text-[#D1D6DB] disabled:bg-white"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {selectedMonth !== currentMonth && (
            <button
              type="button"
              onClick={() => { setSelectedMonth(currentMonth); setMonthPickerOpen(false); }}
              className="h-11 px-4 rounded-2xl bg-white border border-[#E5E8EB] text-sm font-bold text-[#0064FF] shadow-sm active:bg-blue-50 md:hover:bg-blue-50"
            >
              이번 달
            </button>
          )}
          {monthPickerOpen && (
            <div className="absolute left-4 top-full z-20 mt-2 w-[280px] bg-white rounded-2xl border border-[#E5E8EB] shadow-lg p-2 grid grid-cols-2 gap-1">
              {months.map((m) => (
                <button key={m} onClick={() => { setSelectedMonth(m); setMonthPickerOpen(false); }}
                  className={`rounded-xl px-3 py-2.5 text-left text-sm ${m === selectedMonth ? 'font-extrabold text-[#0064FF] bg-blue-50' : 'font-semibold text-[#4E5968] active:bg-[#F8F9FA] md:hover:bg-[#F8F9FA]'}`}>
                  {formatMonth(m)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 요약 카드 */}
        <div className="px-4 mb-4 flex gap-2">
          <div className={`grid ${operationsOnly ? 'grid-cols-2' : 'grid-cols-3'} gap-2 flex-1 min-w-0`}>
            <div className="bg-white rounded-2xl p-3 shadow-sm text-center col-span-1">
              <p className="text-lg font-bold text-blue-600">{paymentSummary.paid.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">수납 완료</p>
            </div>
            <div className="bg-white rounded-2xl p-3 shadow-sm text-center col-span-1">
              <p className="text-lg font-bold text-red-500">{paymentSummary.unpaid.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">미납</p>
            </div>
            {!operationsOnly && <div className={`rounded-2xl p-3 shadow-sm text-center col-span-1 ${netSummary >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className={`text-lg font-bold ${netSummary >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {netSummary.toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">급여 차감 후</p>
            </div>}
          </div>
          {!operationsOnly && <button
            type="button"
            aria-label="정산 설정"
            title="정산 설정"
            onClick={() => setSegment('settings')}
            className={`w-12 flex-shrink-0 rounded-2xl shadow-sm flex items-center justify-center active:scale-95 transform-gpu ${
              segment === 'settings'
                ? 'bg-[#0064FF] text-white'
                : 'bg-white text-[#6B7684] active:bg-[#F2F4F6] md:hover:bg-[#F8F9FA]'
            }`}
          >
            <Settings size={18} />
          </button>}
        </div>

        {/* 세그먼트 */}
        {!operationsOnly && <div className="px-4 mb-4 flex gap-1 bg-gray-100 rounded-2xl p-1">
          <button onClick={() => setSegment('payments')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${segment === 'payments' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
            수납
          </button>
          <button onClick={() => setSegment('payroll')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${segment === 'payroll' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
            급여
          </button>
        </div>}

        {/* Phase 39 — 정산 설정 (학원별 급여/수강료 일자) */}
        {segment === 'settings' && (
          <div className="px-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setDaySheet('salary')}
              className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-4 shadow-sm active:bg-gray-50 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Wallet size={18} className="text-[#0064FF]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#191F28]">급여 지급일</p>
                <p className="text-[11px] text-[#8B95A1] mt-0.5">매월 강사·보조강사 급여 지급 예정일</p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-[#0064FF]">매월 {salaryPaymentDay}일</p>
                <ChevronRight size={12} className="text-gray-300 ml-auto" />
              </div>
            </button>
            <button
              type="button"
              onClick={() => setDaySheet('tuition')}
              className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-4 shadow-sm active:bg-gray-50 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Calendar size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#191F28]">수강료 납부일</p>
                <p className="text-[11px] text-[#8B95A1] mt-0.5">매월 자동 생성될 수납 항목의 기본 납부 예정일</p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-emerald-600">매월 {tuitionDueDay}일</p>
                <ChevronRight size={12} className="text-gray-300 ml-auto" />
              </div>
            </button>
            <p className="text-[11px] text-[#8B95A1] leading-relaxed mt-2 px-1">
              저장한 일자는 다른 기기에도 동기화돼요. 1~31 범위 안의 숫자만 선택할 수 있어요.
            </p>
          </div>
        )}

        {/* 수납 섹션 */}
        {segment === 'payments' && (
          <div className="px-4 flex flex-col gap-3">
            {/* Phase 39 — 학원 정책: 매월 납부일 안내 */}
            <div className="bg-blue-50 rounded-2xl px-4 py-2.5 flex items-center gap-2">
              <Calendar size={14} className="text-[#0064FF]" />
              <p className="text-xs text-[#0064FF] font-semibold">
                수강료 납부일은 매월 <span className="font-bold">{tuitionDueDay}일</span> 이에요
              </p>
            </div>
            {/* 액션 버튼 */}
            {canManagePayments && <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={handleAutoGeneratePayments}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-xl">
                <RefreshCw size={13} /> 자동 생성
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => setShowAddPayment(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl">
                <Plus size={13} /> 직접 추가
              </motion.button>
            </div>}

            {/* 수납 직접 추가 폼 */}
            {canManagePayments && showAddPayment && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-800">수납 항목 추가</p>
                  <button onClick={() => setShowAddPayment(false)}><X size={16} className="text-gray-400" /></button>
                </div>
                <div className="flex flex-col gap-2">
                  <select value={addForm.studentId} onChange={(e) => setAddForm((f) => ({ ...f, studentId: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
                    <option value="">학생 선택</option>
                    {academyStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select value={addForm.classGroupId} onChange={(e) => {
                    const g = classGroups.find((g) => g.id === e.target.value);
                    const additionalAmount = g?.feePolicy === 'additional'
                      ? Number(g.additionalFeeAmount || g.monthlyFee || 0)
                      : 0;
                    setAddForm((f) => ({
                      ...f,
                      classGroupId: e.target.value,
                      amount: additionalAmount > 0 ? String(additionalAmount) : f.amount,
                    }));
                  }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
                    <option value="">반 선택 (선택사항)</option>
                    {classGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <input type="number" value={addForm.amount} onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="금액 (원)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleAddPayment}
                    disabled={!addForm.studentId || !addForm.amount}
                    className="w-full py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl disabled:opacity-40">
                    추가하기
                  </motion.button>
                </div>
              </div>
            )}

            {unpaidStudents.length > 0 && (
              <div className="bg-red-50 rounded-2xl p-4">
                <p className="text-xs font-semibold text-red-600 mb-2">미납 학생 {unpaidStudents.length}명</p>
                {unpaidStudents.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-red-100 last:border-0">
                    <p className="text-sm font-medium text-red-700">{s.name}</p>
                    <p className="text-xs text-red-500">
                      {monthPayments.find((p) => p.studentId === s.id)?.amount?.toLocaleString()}원
                    </p>
                  </div>
                ))}
              </div>
            )}

            {monthPayments.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
                <p className="text-sm text-gray-400">이 달 수납 기록이 없어요</p>
                <p className="text-xs text-gray-300 mt-1">"자동 생성"으로 반 수강료를 일괄 생성하거나 직접 추가하세요</p>
              </div>
            ) : (
              monthPayments.map((p) => (
                <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{getStudentName(p.studentId)}</p>
                    <p className="text-xs text-gray-400">{getGroupName(p.classGroupId)} {p.month}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900">{p.amount?.toLocaleString()}원</p>
                    {canManagePayments && <motion.button whileTap={{ scale: 0.95 }}
                      onClick={() => handleTogglePaid(p)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${p.status === 'paid' ? 'bg-green-500' : 'border-2 border-gray-200'}`}>
                      {p.status === 'paid' && <Check size={14} className="text-white" />}
                    </motion.button>}
                    {canManagePayments && <motion.button whileTap={{ scale: 0.95 }}
                      onClick={() => handleDeletePayment(p)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-red-300 active:bg-red-50">
                      <Trash2 size={13} />
                    </motion.button>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 급여 섹션 */}
        {segment === 'payroll' && (
          <div className="px-4 flex flex-col gap-3">
            {/* Phase 39 — 학원 정책: 매월 급여 지급일 안내 */}
            <div className="bg-emerald-50 rounded-2xl px-4 py-2.5 flex items-center gap-2">
              <Wallet size={14} className="text-emerald-600" />
              <p className="text-xs text-emerald-700 font-semibold">
                급여 지급일은 매월 <span className="font-bold">{salaryPaymentDay}일</span> 이에요
              </p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400">급여 요약</p>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleAutoGeneratePayrolls}
                  className="flex items-center gap-1 text-xs text-blue-600 font-semibold px-3 py-1.5 bg-blue-50 rounded-xl">
                  <RefreshCw size={12} />
                  {monthPayrolls.length > 0 ? '다시 계산' : '자동 계산'}
                </motion.button>
              </div>
              {monthPayrolls.length > 0 && (
                <p className="text-[11px] text-[#8B95A1] mb-3 -mt-1">
                  다시 계산해도 지급 완료된 명세는 바뀌지 않아요.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="text-xl font-bold text-gray-900">{payrollSummary.total.toLocaleString()}원</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">이번 달 급여 합계</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-green-600">{payrollSummary.paid.toLocaleString()}원</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">지급 완료</p>
                </div>
              </div>
            </div>

            {monthPayrolls.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
                <p className="text-sm text-gray-400">이 달 급여 명세가 없어요</p>
                <p className="text-xs text-gray-300 mt-1">"자동 계산" 버튼으로 생성할 수 있어요</p>
              </div>
            ) : (
              monthPayrolls.map((pr) => (
                <div key={pr.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{getStaffName(pr)}</p>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {getStaffTypeLabel(pr.staffType)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {pr.wageType === 'hourly'
                          ? `${getHourlyModeLabel(pr.hourlyMode)} · 시급 ${(pr.hourlyWage || 0).toLocaleString()}원 × ${formatHours(pr.totalHours)}시간`
                          : `월급제`
                        }
                        {pr.staffType === 'teacher' && ` · ${pr.completedSessionCount}회 수업`}
                        {pr.staffType === 'assistant' && ` · 클리닉 ${pr.completedClinicCount}건`}
                      </p>
                      {pr.wageType === 'hourly' && pr.pendingLogHours > 0 && (
                        <p className="text-[11px] text-amber-600 mt-1">
                          미확정 근퇴 {formatHours(pr.pendingLogHours)}시간은 미반영
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{(pr.amount || 0).toLocaleString()}원</p>
                      <span className={`text-xs font-medium ${pr.status === 'completed' ? 'text-green-600' : 'text-orange-500'}`}>
                        {pr.status === 'completed' ? '지급 완료' : '지급 예정'}
                      </span>
                    </div>
                  </div>
                  {pr.status !== 'completed' && (
                    <motion.button whileTap={{ scale: 0.97 }}
                      onClick={() => handleMarkPayrollPaid(pr)}
                      className="w-full mt-2 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl">
                      지급 완료 처리
                    </motion.button>
                  )}
                  {pr.status === 'completed' && pr.paidDate && (
                    <p className="text-xs text-gray-400 mt-1">지급일: {pr.paidDate}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Phase 39 — 일자 선택 시트 (1~31) */}
      {daySheet && (
        <Modal
          isOpen
          onClose={() => setDaySheet(null)}
          title={daySheet === 'salary' ? '급여 지급일 선택' : '수강료 납부일 선택'}
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[#4E5968] leading-relaxed">
              {daySheet === 'salary'
                ? '매월 강사·보조강사에게 급여를 지급하는 날을 선택해주세요. 28~31일은 해당 월에 없을 수 있어요.'
                : '매월 학생 수강료 납부 기준일을 선택해주세요. 28~31일은 해당 월에 없을 수 있어요.'}
            </p>
            <div className="grid grid-cols-7 gap-1.5 max-h-72 overflow-y-auto pb-1">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                const cur = daySheet === 'salary' ? salaryPaymentDay : tuitionDueDay;
                const active = d === cur;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => saveBillingDay(daySheet, d)}
                    className={`aspect-square rounded-xl text-sm font-bold transition-colors ${
                      active
                        ? 'bg-[#0064FF] text-white'
                        : 'bg-[#F2F4F6] text-[#191F28] active:bg-blue-50'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TestLabSettlementView({
  title,
  mode,
  selectedMonth,
  months,
  monthPickerOpen,
  setMonthPickerOpen,
  setSelectedMonth,
  moveMonth,
  canMoveNextMonth,
  currentMonth,
  paymentSummary,
  payrollSummary,
  monthPayments,
  monthPayrolls,
  academyStudents,
  canManagePayments,
  tuitionDueDay,
  salaryPaymentDay,
  onOpenSettings,
  onAutoGeneratePayments,
  onAutoGeneratePayrolls,
  onTogglePaid,
  onOpenAdjustment,
  onOpenPayrollDetail,
  onMarkPayrollPaid,
  getStaffName,
  staffAttendanceLogs,
  adjustmentPayment,
  adjustmentForm,
  setAdjustmentForm,
  onCloseAdjustment,
  onSaveAdjustment,
  payrollDetail,
  onClosePayrollDetail,
  daySheet,
  onCloseDaySheet,
  onSaveBillingDay,
}) {
  const isPayments = mode === 'payments';
  const settingsDay = isPayments ? tuitionDueDay : salaryPaymentDay;
  const settingKind = isPayments ? 'tuition' : 'salary';

  return (
    <div>
      <Header title={title} />
      <div className="pt-14 md:pt-0 pb-8">
        <section className="px-4 pt-4 md:pt-0">
          <div className="relative flex items-center justify-between gap-2">
            <MonthControl
              selectedMonth={selectedMonth}
              months={months}
              open={monthPickerOpen}
              setOpen={setMonthPickerOpen}
              setSelectedMonth={setSelectedMonth}
              moveMonth={moveMonth}
              canMoveNextMonth={canMoveNextMonth}
            />
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => onOpenSettings(settingKind)}
              className="pressable-surface h-11 shrink-0 rounded-2xl border border-seenit-border-soft bg-seenit-surface px-3 text-xs font-bold text-seenit-secondary shadow-sm inline-flex items-center gap-1.5"
            >
              <Settings size={15} /> 매월 {settingsDay}일
            </motion.button>
          </div>
          {selectedMonth !== currentMonth && (
            <button
              type="button"
              onClick={() => { setSelectedMonth(currentMonth); setMonthPickerOpen(false); }}
              className="mt-2 text-xs font-bold text-seenit-brand"
            >
              이번 달로 돌아가기
            </button>
          )}
        </section>

        {isPayments ? (
          <TestLabPayments
            summary={paymentSummary}
            students={academyStudents}
            payments={monthPayments}
            canManage={canManagePayments}
            onGenerate={onAutoGeneratePayments}
            onTogglePaid={onTogglePaid}
            onAdjust={onOpenAdjustment}
          />
        ) : (
          <TestLabPayrolls
            summary={payrollSummary}
            payrolls={monthPayrolls}
            onGenerate={onAutoGeneratePayrolls}
            onOpenDetail={onOpenPayrollDetail}
            onMarkPaid={onMarkPayrollPaid}
            getStaffName={getStaffName}
          />
        )}
      </div>

      <PaymentAdjustmentModal
        data={adjustmentPayment}
        form={adjustmentForm}
        setForm={setAdjustmentForm}
        onClose={onCloseAdjustment}
        onSave={onSaveAdjustment}
        month={selectedMonth}
      />
      <PayrollDetailModal
        detail={payrollDetail}
        onClose={onClosePayrollDetail}
        getStaffName={getStaffName}
        attendanceLogs={staffAttendanceLogs}
      />
      <BillingDayModal
        kind={daySheet}
        salaryPaymentDay={salaryPaymentDay}
        tuitionDueDay={tuitionDueDay}
        onClose={onCloseDaySheet}
        onSave={onSaveBillingDay}
      />
    </div>
  );
}

function MonthControl({ selectedMonth, months, open, setOpen, setSelectedMonth, moveMonth, canMoveNextMonth }) {
  return (
    <div className="relative min-w-0">
      <div className="inline-flex h-11 items-center overflow-hidden rounded-2xl border border-seenit-border-soft bg-seenit-surface shadow-sm">
        <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)} className="pressable-surface h-11 w-10 grid place-items-center text-seenit-subtle">
          <ChevronLeft size={17} />
        </button>
        <button type="button" onClick={() => setOpen(!open)} className="pressable-surface h-11 min-w-[112px] px-2 border-x border-seenit-border-soft inline-flex items-center justify-center gap-1 text-sm font-extrabold text-seenit-ink">
          {formatMonth(selectedMonth)} <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
        </button>
        <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)} disabled={!canMoveNextMonth} className="pressable-surface h-11 w-10 grid place-items-center text-seenit-subtle disabled:opacity-30">
          <ChevronRight size={17} />
        </button>
      </div>
      {open && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="absolute left-0 top-full z-20 mt-2 w-[260px] grid grid-cols-2 gap-1 rounded-2xl border border-seenit-border-soft bg-seenit-surface p-2 shadow-xl">
          {months.map((month) => (
            <button key={month} type="button" onClick={() => { setSelectedMonth(month); setOpen(false); }} className={`pressable-surface rounded-xl px-3 py-2.5 text-left text-sm font-bold ${month === selectedMonth ? 'bg-seenit-brand-soft text-seenit-brand' : 'text-seenit-secondary'}`}>
              {formatMonth(month)}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function TestLabPayments({ summary, students, payments, canManage, onGenerate, onTogglePaid, onAdjust }) {
  const activeStudents = students.filter((student) => student.status !== 'inactive');
  const paymentFor = (student) => payments.find((payment) => payment.studentId === student.id || payment.studentId === student.serverId);
  return (
    <>
      <section className="px-4 mt-4 grid grid-cols-2 gap-2">
        <FinanceMetric label="받은 학원비" value={formatWon(summary.paid)} tone="blue" />
        <FinanceMetric label="아직 미납" value={formatWon(summary.unpaid)} tone="red" />
      </section>
      <section className="px-4 mt-5">
        <div className="flex items-end justify-between gap-3 mb-2 px-1">
          <div>
            <p className="text-base font-bold text-seenit-ink">학생별 학원비</p>
            <p className="text-xs text-seenit-subtle mt-0.5">할인·형제 할인 같은 이번 달 예외를 학생별로 조정해요.</p>
          </div>
          {canManage && (
            <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onGenerate} className="pressable-surface shrink-0 rounded-xl bg-seenit-brand-soft px-3 py-2 text-xs font-bold text-seenit-brand inline-flex items-center gap-1">
              <RefreshCw size={13} /> 청구 생성
            </motion.button>
          )}
        </div>
        <div className="overflow-hidden rounded-2xl border border-seenit-border-soft bg-seenit-surface shadow-sm">
          {activeStudents.length === 0 ? (
            <EmptyFinanceState text="등록된 학생이 없어요." />
          ) : activeStudents.map((student) => {
            const payment = paymentFor(student);
            const adjusted = Boolean(payment?.billingSnapshot?.manualAdjustment);
            return (
              <div key={student.id} className="flex items-center gap-3 border-b border-seenit-border-soft px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-seenit-ink">{student.name}</p>
                    {adjusted && <span className="rounded-full bg-seenit-purple-soft px-2 py-0.5 text-[10px] font-bold text-seenit-purple">예외 적용</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-seenit-subtle">
                    {payment ? `${formatWon(payment.amount)} · ${payment.status === 'paid' ? '납부 완료' : '미납'}` : '아직 청구 없음'}
                  </p>
                </div>
                {payment && canManage && (
                  <button type="button" onClick={() => onTogglePaid(payment)} className={`pressable-surface h-9 rounded-xl px-3 text-xs font-bold ${payment.status === 'paid' ? 'bg-seenit-success-soft text-seenit-success' : 'bg-seenit-brand text-seenit-on-brand'}`}>
                    {payment.status === 'paid' ? '완료' : '입금 확인'}
                  </button>
                )}
                {canManage && (
                  <button type="button" onClick={() => onAdjust(student, payment)} className="pressable-surface h-9 rounded-xl bg-seenit-control px-3 text-xs font-bold text-seenit-secondary inline-flex items-center gap-1">
                    <SlidersHorizontal size={13} /> 조정
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function TestLabPayrolls({ summary, payrolls, onGenerate, onOpenDetail, onMarkPaid, getStaffName }) {
  return (
    <>
      <section className="px-4 mt-4 grid grid-cols-2 gap-2">
        <FinanceMetric label="이번 달 급여" value={formatWon(summary.total)} />
        <FinanceMetric label="지급 완료" value={formatWon(summary.paid)} tone="green" />
      </section>
      <section className="px-4 mt-5">
        <div className="flex items-end justify-between gap-3 mb-2 px-1">
          <div>
            <p className="text-base font-bold text-seenit-ink">직원 급여</p>
            <p className="text-xs text-seenit-subtle mt-0.5">확정된 근무 기록으로 계산된 금액이에요.</p>
          </div>
          <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onGenerate} className="pressable-surface shrink-0 rounded-xl bg-seenit-brand-soft px-3 py-2 text-xs font-bold text-seenit-brand inline-flex items-center gap-1">
            <RefreshCw size={13} /> {payrolls.length ? '다시 계산' : '급여 계산'}
          </motion.button>
        </div>
        <div className="flex flex-col gap-2">
          {payrolls.length === 0 ? (
            <div className="rounded-2xl border border-seenit-border-soft bg-seenit-surface shadow-sm"><EmptyFinanceState text="아직 계산된 급여가 없어요." /></div>
          ) : payrolls.map((payroll) => (
            <div key={payroll.id} className="rounded-2xl border border-seenit-border-soft bg-seenit-surface px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-seenit-ink">{getStaffName(payroll)}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${payroll.status === 'completed' ? 'bg-seenit-success-soft text-seenit-success' : 'bg-seenit-warning-soft text-seenit-warning'}`}>
                      {payroll.status === 'completed' ? '지급 완료' : '지급 예정'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-base font-extrabold tabular-nums text-seenit-ink">{formatWon(payroll.amount)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => onOpenDetail({ payroll, section: 'attendance' })} className="pressable-surface h-9 rounded-xl bg-seenit-control px-2.5 text-[11px] font-bold text-seenit-secondary inline-flex items-center gap-1">
                    <Clock3 size={13} /> 근무 확인
                  </button>
                  <button type="button" onClick={() => onOpenDetail({ payroll, section: 'calculation' })} className="pressable-surface h-9 rounded-xl bg-seenit-brand-soft px-2.5 text-[11px] font-bold text-seenit-brand inline-flex items-center gap-1">
                    <ReceiptText size={13} /> 상세
                  </button>
                </div>
              </div>
              {payroll.status !== 'completed' && (
                <button type="button" onClick={() => onMarkPaid(payroll)} className="pressable-surface mt-3 w-full rounded-xl bg-seenit-brand py-2.5 text-xs font-bold text-seenit-on-brand shadow-sm">
                  지급 완료로 표시
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function FinanceMetric({ label, value, tone = 'default' }) {
  const color = tone === 'blue' ? 'text-seenit-brand' : tone === 'red' ? 'text-seenit-danger' : tone === 'green' ? 'text-seenit-success' : 'text-seenit-ink';
  return (
    <div className="rounded-2xl border border-seenit-border-soft bg-seenit-surface p-4 shadow-sm">
      <p className="text-[11px] font-semibold text-seenit-subtle">{label}</p>
      <p className={`mt-1 text-xl font-extrabold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function EmptyFinanceState({ text }) {
  return <div className="p-8 text-center text-sm font-medium text-seenit-subtle">{text}</div>;
}

function PaymentAdjustmentModal({ data, form, setForm, onClose, onSave, month }) {
  return (
    <Modal
      isOpen={Boolean(data)}
      onClose={onClose}
      title="학생별 학원비 조정"
      fitContent
      footer={(
        <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onSave} disabled={!form.amount} className="w-full rounded-2xl bg-seenit-brand py-3.5 text-sm font-bold text-seenit-on-brand disabled:opacity-40">
          이 금액으로 적용
        </motion.button>
      )}
    >
      {data && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-seenit-brand-soft p-4">
            <p className="text-sm font-bold text-seenit-ink">{data.student.name} · {formatMonth(month)}</p>
            <p className="mt-1 text-xs leading-relaxed text-seenit-secondary">이번 달 청구에만 적용되는 예외예요. 다음 달 자동 청구는 원래 학원비 기준으로 계산돼요.</p>
          </div>
          <label className="block">
            <span className="text-xs font-bold text-seenit-secondary">조정 금액</span>
            <div className="mt-2 flex items-center rounded-2xl border border-seenit-border-soft bg-seenit-surface px-4 focus-within:border-seenit-brand">
              <input type="number" min="0" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} className="h-12 min-w-0 flex-1 bg-transparent text-lg font-extrabold text-seenit-ink outline-none tabular-nums" />
              <span className="text-sm font-bold text-seenit-subtle">원</span>
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-seenit-secondary">조정 이유</span>
            <input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="예: 형제 할인, 휴원 일할 계산" className="mt-2 h-12 w-full rounded-2xl border border-seenit-border-soft bg-seenit-surface px-4 text-sm text-seenit-ink outline-none focus:border-seenit-brand" />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-seenit-secondary">납부 예정일</span>
            <input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-seenit-border-soft bg-seenit-surface px-4 text-sm font-semibold text-seenit-ink outline-none focus:border-seenit-brand" />
          </label>
        </div>
      )}
    </Modal>
  );
}

function PayrollDetailModal({ detail, onClose, getStaffName, attendanceLogs }) {
  const payroll = detail?.payroll;
  const logs = payroll
    ? attendanceLogs.filter((log) => log.staff_user_id === payroll.staffUserId && log.work_date?.startsWith(payroll.month)).sort((a, b) => (b.work_date || '').localeCompare(a.work_date || ''))
    : [];
  const approvedMinutes = logs.filter(isPayableStaffAttendance).reduce((sum, log) => sum + staffAttendanceMinutes(log), 0);
  return (
    <Modal isOpen={Boolean(payroll)} onClose={onClose} title={detail?.section === 'attendance' ? '근무 확인' : '급여 산정 상세'} size="wide">
      {payroll && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-seenit-control p-4">
            <p className="text-sm font-bold text-seenit-ink">{getStaffName(payroll)} · {formatMonth(payroll.month)}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-seenit-ink">{formatWon(payroll.amount)}</p>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${payroll.status === 'completed' ? 'bg-seenit-success-soft text-seenit-success' : 'bg-seenit-warning-soft text-seenit-warning'}`}>
              {payroll.status === 'completed' ? `${payroll.paidDate || ''} 지급 완료` : '지급 예정'}
            </span>
          </div>
          <section>
            <p className="mb-2 text-xs font-bold text-seenit-subtle">계산 방법</p>
            <div className="overflow-hidden rounded-2xl border border-seenit-border-soft">
              <DetailLine label="급여 방식" value={payroll.wageType === 'hourly' ? '시급제' : '월급제'} />
              {payroll.wageType === 'hourly' ? (
                <>
                  <DetailLine label="확정 근무" value={`${formatHours(payroll.approvedLogHours ?? payroll.totalHours)}시간`} />
                  <DetailLine label="시급" value={formatWon(payroll.hourlyWage)} />
                  <DetailLine label="계산식" value={`${formatWon(payroll.hourlyWage)} × ${formatHours(payroll.totalHours)}시간`} />
                  {Number(payroll.pendingLogHours) > 0 && <DetailLine label="미반영 근무" value={`${formatHours(payroll.pendingLogHours)}시간`} tone="amber" />}
                </>
              ) : <DetailLine label="월 급여" value={formatWon(payroll.monthlySalary)} />}
              <DetailLine label="최종 급여" value={formatWon(payroll.amount)} strong />
            </div>
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold text-seenit-subtle">근무 기록</p>
              <p className="text-xs font-bold text-seenit-secondary">확정 {formatHours(approvedMinutes / 60)}시간 · {logs.length}건</p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-seenit-border-soft">
              {logs.length === 0 ? <EmptyFinanceState text="이 직원의 근무 기록이 없어요." /> : logs.map((log) => (
                <div key={log.id || `${log.work_date}-${log.actual_start_time}`} className="flex items-center justify-between gap-3 border-b border-seenit-border-soft px-4 py-3 last:border-0">
                  <div>
                    <p className="text-sm font-bold text-seenit-ink">{log.work_date}</p>
                    <p className="mt-0.5 text-xs text-seenit-subtle">{String(log.actual_start_time || '-').slice(0, 5)}–{String(log.actual_end_time || '-').slice(0, 5)}{log.break_minutes ? ` · 휴게 ${log.break_minutes}분` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-seenit-ink">{formatHours(staffAttendanceMinutes(log) / 60)}시간</p>
                    <p className={`text-[10px] font-bold ${isPayableStaffAttendance(log) ? 'text-seenit-success' : 'text-seenit-warning'}`}>{isPayableStaffAttendance(log) ? '급여 반영' : '미확정'}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}

function DetailLine({ label, value, tone = 'default', strong = false }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-seenit-border-soft px-4 py-3 last:border-0">
      <p className="text-xs font-semibold text-seenit-subtle">{label}</p>
      <p className={`${strong ? 'text-base font-extrabold' : 'text-sm font-bold'} ${tone === 'amber' ? 'text-seenit-warning' : 'text-seenit-ink'} tabular-nums`}>{value}</p>
    </div>
  );
}

function BillingDayModal({ kind, salaryPaymentDay, tuitionDueDay, onClose, onSave }) {
  if (!kind) return null;
  const current = kind === 'salary' ? salaryPaymentDay : tuitionDueDay;
  return (
    <Modal isOpen onClose={onClose} title={kind === 'salary' ? '급여 지급일 설정' : '학원비 납부일 설정'} fitContent>
      <p className="mb-4 text-xs leading-relaxed text-seenit-secondary">이 탭에 필요한 날짜 설정만 간단하게 바꿀 수 있어요.</p>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
          <button key={day} type="button" onClick={() => onSave(kind, day)} className={`pressable-surface aspect-square rounded-xl text-sm font-bold ${day === current ? 'bg-seenit-brand text-seenit-on-brand' : 'bg-seenit-control text-seenit-ink'}`}>
            {day}
          </button>
        ))}
      </div>
    </Modal>
  );
}
