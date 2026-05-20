import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Check, RefreshCw, Plus, X, Trash2 } from 'lucide-react';
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
import Header from '../../../components/Header';
import { formatMonth } from '../../../utils/date';

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
  };
}

// local 급여 → server payrolls 컬럼 매핑. staff_id 는 local id 그대로 (text).
function mapLocalPayrollToServerPayload(payroll) {
  return {
    staff_type: payroll.staffType,
    staff_id: payroll.staffId,
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

const MONTHS_BACK = 5;

function formatHours(h) {
  if (!h) return '0';
  const n = Number(h);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function getRecentMonths() {
  const result = [];
  const now = new Date();
  for (let i = 0; i <= MONTHS_BACK; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

export default function SettlementPage() {
  const {
    academyStudents, classGroups, academyPayments,
    academyTeachers, academyAssistants, academyPayrolls,
    updateAcademyPayment, addAcademyPayment, deleteAcademyPayment,
    generatePayrollsForMonth, markPayrollPaid,
    generateAcademyPaymentsForMonth, setPaymentServerId,
    setPayrollServerId,
    showToast,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerPayments = useWorkspaceStore((s) => s.loadServerPayments);
  const loadServerPayrolls = useWorkspaceStore((s) => s.loadServerPayrolls);

  const months = getRecentMonths();
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [segment, setSegment] = useState('payments'); // 'payments' | 'payroll'
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [addForm, setAddForm] = useState({ studentId: '', classGroupId: '', amount: '' });

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
    return academyAssistants.find((a) => a.id === payroll.staffId)?.name || '보조강사';
  };
  const getStaffTypeLabel = (type) => type === 'teacher' ? '강사' : '보조강사';

  const unpaidStudents = useMemo(
    () => academyStudents.filter((s) => {
      const p = monthPayments.find((p) => p.studentId === s.id);
      return p && p.status !== 'paid';
    }),
    [academyStudents, monthPayments]
  );

  const canSyncServer = isAuthenticated && currentAcademyId;

  const handleTogglePaid = async (payment) => {
    const nextStatus = payment.status === 'paid' ? 'unpaid' : 'paid';
    const todayStr = new Date().toISOString().slice(0, 10);
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
    const newPayrolls = generatePayrollsForMonth(selectedMonth) || [];
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
          paid_date: new Date().toISOString().slice(0, 10),
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
    if (!addForm.studentId || !addForm.amount) return;
    const group = classGroups.find((g) => g.id === addForm.classGroupId);
    const student = academyStudents.find((s) => s.id === addForm.studentId);
    const localPayment = addAcademyPayment({
      studentId: addForm.studentId,
      classGroupId: addForm.classGroupId || '',
      month: selectedMonth,
      amount: Number(addForm.amount) || 0,
      status: 'unpaid',
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
    const newPayments = generateAcademyPaymentsForMonth(selectedMonth) || [];
    if (newPayments.length === 0) return;
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

    if (eligible.length === 0) return;

    try {
      const inserted = await createAcademyPaymentsBulk({
        academyId: currentAcademyId,
        payments: eligible.map((e) => e.server),
      });
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
      await loadServerPayments();
    } catch (err) {
      console.error('[supabase] createAcademyPaymentsBulk failed', err);
      showToast(
        err?.message
          ? `자동 수납 서버 동기화 실패: ${err.message}`
          : '자동 생성된 수납 중 일부는 서버 동기화에 실패했어요.',
        'error',
      );
    }
  };

  return (
    <div>
      <Header title="정산" />

      <div className="pt-14 pb-6">
        {/* 월 선택 */}
        <div className="px-4 pt-4 mb-4">
          <button
            onClick={() => setMonthPickerOpen(!monthPickerOpen)}
            className="flex items-center gap-2 bg-white rounded-2xl px-4 py-2.5 shadow-sm"
          >
            <ChevronLeft size={16} className="text-gray-400" />
            <span className="font-bold text-gray-900">{formatMonth(selectedMonth)}</span>
            <ChevronRight size={16} className="text-gray-400" />
          </button>
          {monthPickerOpen && (
            <div className="mt-2 bg-white rounded-2xl shadow-sm overflow-hidden">
              {months.map((m) => (
                <button key={m} onClick={() => { setSelectedMonth(m); setMonthPickerOpen(false); }}
                  className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 last:border-0 ${m === selectedMonth ? 'font-bold text-blue-600' : 'text-gray-700'}`}>
                  {formatMonth(m)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 요약 카드 */}
        <div className="px-4 mb-4 grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center col-span-1">
            <p className="text-lg font-bold text-blue-600">{paymentSummary.paid.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">수납 완료</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center col-span-1">
            <p className="text-lg font-bold text-red-500">{paymentSummary.unpaid.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">미납</p>
          </div>
          <div className={`rounded-2xl p-3 shadow-sm text-center col-span-1 ${netSummary >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`text-lg font-bold ${netSummary >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {netSummary.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">급여 차감 후</p>
          </div>
        </div>

        {/* 세그먼트 */}
        <div className="px-4 mb-4 flex gap-1 bg-gray-100 rounded-2xl p-1">
          <button onClick={() => setSegment('payments')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${segment === 'payments' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
            수납
          </button>
          <button onClick={() => setSegment('payroll')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${segment === 'payroll' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
            급여
          </button>
        </div>

        {/* 수납 섹션 */}
        {segment === 'payments' && (
          <div className="px-4 flex flex-col gap-3">
            {/* 액션 버튼 */}
            <div className="flex gap-2">
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
            </div>

            {/* 수납 직접 추가 폼 */}
            {showAddPayment && (
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
                    setAddForm((f) => ({ ...f, classGroupId: e.target.value, amount: g?.monthlyFee ? String(g.monthlyFee) : f.amount }));
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
                    <motion.button whileTap={{ scale: 0.95 }}
                      onClick={() => handleTogglePaid(p)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${p.status === 'paid' ? 'bg-green-500' : 'border-2 border-gray-200'}`}>
                      {p.status === 'paid' && <Check size={14} className="text-white" />}
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.95 }}
                      onClick={() => handleDeletePayment(p)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-red-300 active:bg-red-50">
                      <Trash2 size={13} />
                    </motion.button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 급여 섹션 */}
        {segment === 'payroll' && (
          <div className="px-4 flex flex-col gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400">급여 요약</p>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleAutoGeneratePayrolls}
                  className="flex items-center gap-1 text-xs text-blue-600 font-semibold px-3 py-1.5 bg-blue-50 rounded-xl">
                  <RefreshCw size={12} />
                  자동 계산
                </motion.button>
              </div>
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
                          ? `시급 ${(pr.hourlyWage || 0).toLocaleString()}원 × ${formatHours(pr.totalHours)}시간`
                          : `월급제`
                        }
                        {pr.staffType === 'teacher' && ` · ${pr.completedSessionCount}회 수업`}
                        {pr.staffType === 'assistant' && ` · 클리닉 ${pr.completedClinicCount}건`}
                      </p>
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
    </div>
  );
}
