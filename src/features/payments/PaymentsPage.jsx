import { useState, useEffect } from 'react';
import { MessageSquare, Copy, ChevronLeft, ChevronRight } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import EmptyState from '../../components/EmptyState';
import Modal from '../../components/Modal';
import { formatCurrency, paymentStatusMap } from '../../utils/format';
import { getCurrentMonth, formatMonth, prevMonth, nextMonth, getTodayYMD } from '../../utils/date';
import { generatePaymentNotice } from '../../utils/aiNotice';
import { formatBillingDetail } from '../../utils/billing';

const STATUS_ORDER = { unpaid: 0, partial: 1, pending: 2, paid: 3, exempt: 4 };

export default function PaymentsPage() {
  const { students, payments, updatePayment, showToast, tutorProfile, ensurePaymentsForRecurringLessons } = useAcademyStore();
  const [month, setMonth] = useState(getCurrentMonth());
  const [actionPayment, setActionPayment] = useState(null);

  useEffect(() => {
    ensurePaymentsForRecurringLessons();
  // 탭 진입 시 1회 실행 — 함수는 멱등성 보장
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthPayments = payments
    .filter((p) => p.month === month)
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const totalExpected = monthPayments
    .filter((p) => p.status !== 'exempt')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = monthPayments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + (p.paidAmount ?? p.amount), 0);
  const totalUnpaid = monthPayments
    .filter((p) => p.status === 'unpaid')
    .reduce((sum, p) => sum + p.amount, 0);
  const unpaidCount = monthPayments.filter((p) => p.status === 'unpaid').length;
  const paidRate = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;

  return (
    <div>
      <Header title="수납 관리" />

      <div className="pt-14">
        {/* Month selector */}
        <div className="pt-4 flex items-center justify-center gap-4">
          <button
            onClick={() => setMonth(prevMonth(month))}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-500 active:bg-gray-100"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-[20px] font-extrabold text-gray-900 tracking-tight">
            {formatMonth(month)}
          </span>
          <button
            onClick={() => setMonth(nextMonth(month))}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-500 active:bg-gray-100"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {monthPayments.length === 0 ? (
          <EmptyState
            icon="💳"
            title="수납 항목이 없어요"
            description="정기 과외를 등록하면 월 수업료가 자동으로 등록됩니다"
          />
        ) : (
          <>
            {/* Summary */}
            <div className="px-4 mt-4 grid grid-cols-3 gap-2">
              <SummaryCard label="예상 수납" value={formatCurrency(totalExpected)} color="text-gray-900" />
              <SummaryCard label="수납 완료" value={formatCurrency(totalPaid)} color="text-green-600" />
              <SummaryCard
                label={`미납 (${unpaidCount}명)`}
                value={formatCurrency(totalUnpaid)}
                color={totalUnpaid > 0 ? 'text-red-500' : 'text-gray-400'}
              />
            </div>

            {/* Progress */}
            <div className="px-4 mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>수납률</span>
                <span className="font-semibold">{paidRate}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${paidRate}%` }}
                />
              </div>
            </div>

            {/* Payment list */}
            <div className="px-4 mt-5 flex flex-col gap-2 pb-6">
              {monthPayments.map((payment) => {
                const student = students.find((s) => s.id === payment.studentId);
                const meta = paymentStatusMap[payment.status];
                if (!student) return null;

                const effectiveDepositorName = payment.depositorName || student.depositorName || '';

                const billingDetail = formatBillingDetail(payment);
                return (
                  <div key={payment.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-bold text-gray-900">{student.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          결제 예정일 매월 {payment.dueDate?.split('-')[2]}일
                        </p>
                        {effectiveDepositorName && (
                          <p className="text-xs text-gray-500 mt-0.5">입금자명: {effectiveDepositorName}</p>
                        )}
                        {billingDetail && (
                          <p className="text-xs text-blue-500 mt-0.5">{billingDetail}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">{formatCurrency(payment.amount)}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta?.bg} ${meta?.color}`}>
                          {meta?.label}
                        </span>
                      </div>
                    </div>
                    {payment.isProrated && (
                      <div className="bg-blue-50 rounded-xl px-3 py-1.5 mb-2">
                        <p className="text-xs text-blue-600">
                          월 중간 시작으로 {payment.calculatedSessionCount}/{payment.fullMonthSessionCount}회 기준 계산됐어요
                        </p>
                      </div>
                    )}

                    {payment.status === 'partial' && payment.paidAmount != null && (
                      <p className="text-xs text-orange-600 mb-2">
                        납부액: {formatCurrency(payment.paidAmount)} / 미납: {formatCurrency(payment.amount - payment.paidAmount)}
                      </p>
                    )}

                    {payment.memo && (
                      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5 mb-2">{payment.memo}</p>
                    )}

                    {payment.status === 'paid' && payment.paidDate && (
                      <p className="text-xs text-gray-400 mb-2">✓ {payment.paidDate} 수납 완료</p>
                    )}

                    {/* Actions */}
                    {payment.status !== 'paid' && payment.status !== 'exempt' && (
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => setActionPayment(payment)}
                          className="flex-1 bg-blue-600 text-white text-xs font-bold py-2.5 rounded-xl"
                        >
                          수납 처리
                        </button>
                        <NoticeButton
                          payment={payment}
                          student={student}
                          showToast={showToast}
                          depositorName={effectiveDepositorName}
                          tutorProfile={tutorProfile}
                        />
                      </div>
                    )}
                    {payment.status === 'paid' && (
                      <NoticeButton
                        payment={payment}
                        student={student}
                        showToast={showToast}
                        depositorName={effectiveDepositorName}
                        tutorProfile={tutorProfile}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {actionPayment && (
        <PaymentActionModal
          payment={actionPayment}
          student={students.find((s) => s.id === actionPayment.studentId)}
          onClose={() => setActionPayment(null)}
          onUpdate={(data) => {
            updatePayment(actionPayment.id, data);
            setActionPayment(null);
          }}
        />
      )}
    </div>
  );
}

// ── 수납 처리 모달 ──────────────────────────────────────────────────────────────

function PaymentActionModal({ payment, student, onClose, onUpdate }) {
  const [status, setStatus] = useState('paid');
  const [paidAmount, setPaidAmount] = useState(String(payment.amount));
  const [memo, setMemo] = useState(payment.memo || '');

  const handleConfirm = () => {
    const todayYMD = getTodayYMD();
    if (status === 'paid') {
      onUpdate({ status: 'paid', paidDate: todayYMD, paidAmount: payment.amount, memo });
    } else if (status === 'partial') {
      const amt = Number(paidAmount);
      if (!amt || amt <= 0) return alert('납부 금액을 입력해주세요.');
      onUpdate({ status: 'partial', paidDate: todayYMD, paidAmount: amt, memo });
    } else if (status === 'unpaid') {
      onUpdate({ status: 'unpaid', paidDate: null, paidAmount: null, memo });
    } else if (status === 'exempt') {
      onUpdate({ status: 'exempt', paidDate: todayYMD, memo });
    }
  };

  const statusOptions = [
    { id: 'paid',    label: '완료',  color: 'border-green-500 bg-green-50 text-green-700' },
    { id: 'partial', label: '부분납', color: 'border-orange-500 bg-orange-50 text-orange-700' },
    { id: 'unpaid',  label: '미납',  color: 'border-red-500 bg-red-50 text-red-700' },
    { id: 'exempt',  label: '면제',  color: 'border-gray-400 bg-gray-50 text-gray-600' },
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="수납 처리"
      footer={
        <button
          onClick={handleConfirm}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl"
        >
          처리 완료
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="bg-gray-50 rounded-xl px-4 py-3">
          <p className="font-semibold text-gray-900">{student?.name}</p>
          <p className="text-sm text-gray-500">{formatCurrency(payment.amount)} · {payment.month.replace('-', '년 ')}월</p>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">수납 상태</p>
          <div className="grid grid-cols-2 gap-2">
            {statusOptions.map(({ id, label, color }) => (
              <button
                key={id}
                onClick={() => setStatus(id)}
                className={`py-3 rounded-xl text-sm font-bold border-2 transition-colors ${
                  status === id ? color : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {status === 'partial' && (
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">납부 금액</p>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder="실제 납부 금액"
              className="input"
            />
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1.5">메모 (선택)</p>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 현금 납부, 계좌이체 등"
            className="input"
          />
        </div>
      </div>
    </Modal>
  );
}

// ── 알림 문구 버튼 ──────────────────────────────────────────────────────────────

function NoticeButton({ payment, student, showToast, depositorName, tutorProfile }) {
  const [showNotice, setShowNotice] = useState(false);

  const isOverdue = payment.status === 'unpaid';
  const noticeText = generatePaymentNotice({
    month: payment.month,
    amount: payment.amount,
    dueDate: payment.dueDate?.split('-')[2] ? `${payment.dueDate.split('-')[2]}일` : '',
    isOverdue,
    depositorName,
    bankName: tutorProfile?.bankName || '',
    bankAccount: tutorProfile?.bankAccount || '',
    accountHolder: tutorProfile?.accountHolder || '',
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(noticeText).then(() => {
      showToast('알림 문구가 복사되었습니다.');
      setShowNotice(false);
    });
  };

  const handleSms = () => {
    const phone = student?.parentPhone?.replace(/-/g, '') || student?.phone?.replace(/-/g, '') || '';
    if (!phone) return alert('연락처가 없어요. 학생 정보에서 추가해주세요.');
    const encoded = encodeURIComponent(noticeText);
    window.open(`sms:${phone}?body=${encoded}`, '_self');
  };

  return (
    <>
      <button
        onClick={() => setShowNotice(true)}
        className="flex-1 bg-gray-100 text-gray-700 text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1"
      >
        <MessageSquare size={12} />
        알림 문구
      </button>

      {showNotice && (
        <Modal
          isOpen
          onClose={() => setShowNotice(false)}
          title={isOverdue ? '미납 안내 문구' : '수납 안내 문구'}
          footer={
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"
              >
                <Copy size={14} />
                복사하기
              </button>
              <button
                onClick={handleSms}
                className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"
              >
                <MessageSquare size={14} />
                문자 앱 열기
              </button>
            </div>
          }
        >
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{noticeText}</p>
          </div>
          {!tutorProfile?.bankAccount && (
            <p className="text-xs text-orange-500 mt-3 text-center">
              계좌 정보를 등록하면 문자에 자동으로 포함돼요 → 더보기 탭에서 설정
            </p>
          )}
          <p className="text-xs text-gray-400 mt-2 text-center">
            복사 후 카카오톡, 문자로 직접 전송하세요
          </p>
        </Modal>
      )}
    </>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}
