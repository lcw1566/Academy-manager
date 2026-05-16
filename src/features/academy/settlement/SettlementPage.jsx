import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Check, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';

const MONTHS_BACK = 5;

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
    updateAcademyPayment, addAcademyPayment,
    generatePayrollsForMonth, markPayrollPaid,
  } = useAcademyStore();

  const months = getRecentMonths();
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [segment, setSegment] = useState('payments'); // 'payments' | 'payroll'
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

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

  const handleTogglePaid = (payment) => {
    updateAcademyPayment(payment.id, { status: payment.status === 'paid' ? 'unpaid' : 'paid' });
  };

  const handleAutoGeneratePayrolls = () => {
    generatePayrollsForMonth(selectedMonth);
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
            <span className="font-bold text-gray-900">{selectedMonth.replace('-', '년 ')}월</span>
            <ChevronRight size={16} className="text-gray-400" />
          </button>
          {monthPickerOpen && (
            <div className="mt-2 bg-white rounded-2xl shadow-sm overflow-hidden">
              {months.map((m) => (
                <button key={m} onClick={() => { setSelectedMonth(m); setMonthPickerOpen(false); }}
                  className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 last:border-0 ${m === selectedMonth ? 'font-bold text-blue-600' : 'text-gray-700'}`}>
                  {m.replace('-', '년 ')}월
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
                <p className="text-xs text-gray-300 mt-1">반 수강료를 등록하면 자동으로 생성됩니다</p>
              </div>
            ) : (
              monthPayments.map((p) => (
                <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{getStudentName(p.studentId)}</p>
                    <p className="text-xs text-gray-400">{getGroupName(p.classGroupId)} {p.month}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-bold text-gray-900">{p.amount?.toLocaleString()}원</p>
                    <motion.button whileTap={{ scale: 0.95 }}
                      onClick={() => handleTogglePaid(p)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${p.status === 'paid' ? 'bg-green-500' : 'border-2 border-gray-200'}`}>
                      {p.status === 'paid' && <Check size={14} className="text-white" />}
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
                          ? `시급 ${(pr.hourlyWage || 0).toLocaleString()}원 × ${pr.totalHours}시간`
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
                      onClick={() => markPayrollPaid(pr.id)}
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
