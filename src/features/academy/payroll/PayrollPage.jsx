import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import Header from '../../../components/Header';
import {
  formatMonth,
  getCurrentMonth,
  getDaysInMonth,
  prevMonth,
} from '../../../utils/date';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import { currentUserCan } from '../../../utils/staffPermissions';

const MONTHS_BACK = 5;

function formatHours(h) {
  const n = Number(h);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatWon(value) {
  return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString()}원`;
}

function getRecentMonths() {
  const result = [];
  let month = getCurrentMonth();
  for (let i = 0; i <= MONTHS_BACK; i += 1) {
    result.push(month);
    month = prevMonth(month);
  }
  return result;
}

function getMonthRange(month) {
  const [year, monthNo] = String(month).split('-').map(Number);
  const last = getDaysInMonth(year, monthNo);
  return {
    fromDate: `${month}-01`,
    toDate: `${month}-${String(last).padStart(2, '0')}`,
  };
}

function timeToMinutes(value) {
  if (!value) return null;
  const [hh, mm] = String(value).slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return (hh * 60) + mm;
}

function minutesFromLog(log) {
  const start = timeToMinutes(log?.actual_start_time);
  const end = timeToMinutes(log?.actual_end_time);
  if (start === null || end === null) return 0;
  const minutes = end - start - (Number(log?.break_minutes) || 0);
  return Math.max(0, minutes);
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '-';
}

function getStatusMeta(status) {
  if (status === 'approved') return { label: '저장 완료', className: 'bg-emerald-50 text-emerald-700' };
  if (status === 'completed') return { label: '확인 대기', className: 'bg-blue-50 text-blue-700' };
  if (status === 'pending') return { label: '확인 대기', className: 'bg-amber-50 text-amber-700' };
  return { label: '기록중', className: 'bg-gray-100 text-gray-600' };
}

function buildFallbackStaff({ localStaff, staffProfile, membership, authUserId, authUserEmail, role }) {
  if (localStaff) return localStaff;
  const profileRole = staffProfile?.role || role || 'teacher';
  if (!authUserId && !staffProfile && !membership) return null;
  return {
    id: `${profileRole}_${authUserId || membership?.id || 'me'}`,
    serverUserId: authUserId || staffProfile?.user_id || membership?.user_id || null,
    academyMemberId: staffProfile?.member_id || membership?.id || null,
    email: authUserEmail || membership?.email || '',
    name: membership?.display_name || authUserEmail || '내 계정',
    wageType: staffProfile?.wage_type || 'hourly',
    hourlyWage: Math.max(0, Math.round(Number(staffProfile?.hourly_wage) || 0)),
    monthlySalary: Math.max(0, Math.round(Number(staffProfile?.monthly_salary) || 0)),
    _role: profileRole === 'assistant' ? 'assistant' : 'teacher',
  };
}

export default function PayrollPage() {
  const {
    role,
    academyTeachers, academyAssistants, academyPayrolls,
    classSessions, classGroups, clinicTasks, academyProfile,
  } = useAcademyStore();

  const authUserId = useAuthStore((s) => s.user?.id);
  const authUserEmail = useAuthStore((s) => s.user?.email);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const staffAttendanceLogs = useWorkspaceStore((s) => s.staffAttendanceLogs) ?? [];
  const loadStaffAttendanceLogs = useWorkspaceStore((s) => s.loadStaffAttendanceLogs);

  const months = getRecentMonths();
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const myMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((sp) => sp.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );

  const effectiveRole = myStaffProfile?.role || role;
  const localStaff = useMemo(() => {
    const list = effectiveRole === 'assistant' ? academyAssistants : academyTeachers;
    return findLocalStaffForUser(list, {
      userId: authUserId,
      memberId: myMembership?.id,
      email: authUserEmail,
    });
  }, [effectiveRole, academyTeachers, academyAssistants, authUserId, myMembership?.id, authUserEmail]);

  const staffInfo = useMemo(
    () => buildFallbackStaff({
      localStaff,
      staffProfile: myStaffProfile,
      membership: myMembership,
      authUserId,
      authUserEmail,
      role: effectiveRole,
    }),
    [localStaff, myStaffProfile, myMembership, authUserId, authUserEmail, effectiveRole],
  );

  const staffUserId = staffInfo?.serverUserId || authUserId || null;
  const staffId = staffInfo?.id || null;
  const staffType = effectiveRole === 'assistant' ? 'assistant' : 'teacher';

  useEffect(() => {
    const { fromDate, toDate } = getMonthRange(selectedMonth);
    loadStaffAttendanceLogs?.({ fromDate, toDate, limit: 120 });
  }, [loadStaffAttendanceLogs, selectedMonth]);

  const salaryPaymentDay =
    myMembership?.academy?.salary_payment_day
    ?? academyProfile?.salaryPaymentDay
    ?? 10;

  const canViewPayroll = currentUserCan({ role, staffProfile: myStaffProfile }, 'canViewPayroll');

  const myPayroll = useMemo(
    () => academyPayrolls.find((p) =>
      p.month === selectedMonth
      && p.staffType === staffType
      && (p.staffId === staffId || p.staffId === localStaff?.id)
    ) || null,
    [academyPayrolls, selectedMonth, staffType, staffId, localStaff?.id],
  );

  const monthLogs = useMemo(
    () => (staffAttendanceLogs || [])
      .filter((log) => log.staff_user_id === staffUserId && log.work_date?.startsWith(selectedMonth))
      .sort((a, b) => (b.work_date || '').localeCompare(a.work_date || '')),
    [staffAttendanceLogs, staffUserId, selectedMonth],
  );

  const logSummary = useMemo(() => {
    let totalMinutes = 0;
    let approvedMinutes = 0;
    let pendingMinutes = 0;
    let openCount = 0;
    monthLogs.forEach((log) => {
      const minutes = minutesFromLog(log);
      if (!log.actual_end_time) openCount += 1;
      totalMinutes += minutes;
      if (log.status === 'approved') approvedMinutes += minutes;
      else if (['pending', 'completed'].includes(log.status)) pendingMinutes += minutes;
    });
    return {
      totalHours: totalMinutes / 60,
      approvedHours: approvedMinutes / 60,
      pendingHours: pendingMinutes / 60,
      openCount,
      completedCount: monthLogs.filter((log) => log.actual_start_time && log.actual_end_time).length,
    };
  }, [monthLogs]);

  const estimatedPayroll = useMemo(() => {
    if (myPayroll) return myPayroll;
    if (!staffInfo) return null;
    const wageType = staffInfo.wageType || 'hourly';
    const totalHours = logSummary.totalHours;
    const amount = wageType === 'hourly'
      ? (Number(staffInfo.hourlyWage) || 0) * totalHours
      : Number(staffInfo.monthlySalary) || 0;
    return {
      staffId,
      staffType,
      month: selectedMonth,
      wageType,
      hourlyWage: Number(staffInfo.hourlyWage) || 0,
      monthlySalary: Number(staffInfo.monthlySalary) || 0,
      totalHours,
      shiftHours: totalHours,
      approvedLogHours: logSummary.approvedHours,
      pendingLogHours: logSummary.pendingHours,
      amount,
      status: 'estimated',
    };
  }, [myPayroll, staffInfo, logSummary, staffId, staffType, selectedMonth]);

  const recentPayrolls = useMemo(
    () => academyPayrolls
      .filter((p) =>
        p.staffType === staffType
        && (p.staffId === staffId || p.staffId === localStaff?.id)
        && p.month !== selectedMonth
      )
      .sort((a, b) => (b.month || '').localeCompare(a.month || ''))
      .slice(0, 4),
    [academyPayrolls, staffType, staffId, localStaff?.id, selectedMonth],
  );

  const mySessions = useMemo(() => {
    if (staffType !== 'teacher' || !staffId) return [];
    return classSessions
      .filter((s) => {
        if (s.status !== 'completed' || !s.date?.startsWith(selectedMonth)) return false;
        return (s.teacherId === staffId && !s.substituteTeacherId) || s.substituteTeacherId === staffId;
      })
      .sort((a, b) => b.date?.localeCompare(a.date || '') || 0);
  }, [classSessions, staffId, selectedMonth, staffType]);

  const myClinics = useMemo(() => {
    if (staffType !== 'assistant' || !staffId) return [];
    return clinicTasks
      .filter((t) => t.assignedToId === staffId && t.completedAt?.startsWith(selectedMonth) && t.status === 'completed')
      .sort((a, b) => b.completedAt?.localeCompare(a.completedAt || '') || 0);
  }, [clinicTasks, staffId, selectedMonth, staffType]);

  const getGroupName = (id) => classGroups.find((g) => g.id === id)?.name || '';

  if (!canViewPayroll) {
    return (
      <div>
        <Header title="급여" />
        <div className="pt-14 md:pt-0 px-4">
          <EmptyState title="급여 조회 권한이 없어요" detail="원장에게 권한을 요청해 주세요" />
        </div>
      </div>
    );
  }

  if (!staffInfo) {
    return (
      <div>
        <Header title="급여" />
        <div className="pt-14 md:pt-0 px-4">
          <EmptyState title="내 직원 정보를 불러오지 못했어요" detail="잠시 후 새로고침하거나 원장에게 직원 설정을 확인해 주세요" />
        </div>
      </div>
    );
  }

  const wageTypeLabel = estimatedPayroll?.wageType === 'hourly' ? '시급제' : '월급제';
  const wageDetail = estimatedPayroll?.wageType === 'hourly'
    ? `시간당 ${formatWon(estimatedPayroll.hourlyWage)}`
    : `월 ${formatWon(estimatedPayroll.monthlySalary)}`;
  const isConfirmedPayroll = !!myPayroll;

  return (
    <div>
      <Header title="급여" />

      <div className="pt-14 md:pt-0 pb-8">
        <div className="px-4 pt-4 mb-4">
          <button
            type="button"
            onClick={() => setMonthPickerOpen(!monthPickerOpen)}
            className="h-10 px-3 rounded-xl bg-white border border-[#E5E8EB] text-sm font-bold text-[#191F28] inline-flex items-center gap-2"
          >
            <ChevronLeft size={15} className="text-[#8B95A1]" />
            {formatMonth(selectedMonth)}
            <ChevronRight size={15} className="text-[#8B95A1]" />
          </button>
          {monthPickerOpen && (
            <div className="mt-2 bg-white rounded-xl border border-[#E5E8EB] overflow-hidden">
              {months.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setSelectedMonth(m); setMonthPickerOpen(false); }}
                  className={`w-full text-left px-4 py-3 text-sm border-b border-[#F2F4F6] last:border-0 ${
                    m === selectedMonth ? 'font-bold text-[#0064FF]' : 'text-[#4E5968]'
                  }`}
                >
                  {formatMonth(m)}
                </button>
              ))}
            </div>
          )}
        </div>

        <section className="px-4 mb-4">
          <div className="bg-white rounded-2xl p-5 border border-[#E5E8EB]">
            <p className="text-[12px] font-bold text-[#8B95A1] mb-1">
              {isConfirmedPayroll ? '이번 달 급여' : '이번 달 예상 급여'}
            </p>
            <p className="text-[34px] leading-tight font-extrabold text-[#191F28] tracking-normal">
              {formatWon(estimatedPayroll?.amount)}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Pill icon={Wallet} label={`${wageTypeLabel} · ${wageDetail}`} />
              <Pill
                icon={isConfirmedPayroll ? BadgeCheck : AlertCircle}
                label={isConfirmedPayroll ? '명세 생성됨' : '근퇴 기준 예상'}
                tone={isConfirmedPayroll ? 'green' : 'blue'}
              />
              <Pill icon={CalendarClock} label={`매월 ${salaryPaymentDay}일 지급 예정`} />
              {estimatedPayroll?.status === 'completed' && estimatedPayroll?.paidDate && (
                <Pill icon={BadgeCheck} label={`${estimatedPayroll.paidDate} 지급완료`} tone="green" />
              )}
            </div>
          </div>
        </section>

        <section className="px-4 mb-4 grid grid-cols-3 gap-2">
          <MetricCard label="근무시간" value={`${formatHours(logSummary.totalHours)}시간`} />
          <MetricCard label="저장 완료" value={`${formatHours(logSummary.approvedHours)}시간`} tone="green" />
          <MetricCard label="미확정" value={`${formatHours(logSummary.pendingHours)}시간`} tone="amber" />
        </section>

        <section className="px-4 mb-5">
          <div className="bg-white rounded-2xl border border-[#E5E8EB] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#F2F4F6] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock size={15} className="text-[#0064FF]" />
                <p className="text-sm font-bold text-[#191F28]">근퇴 기록</p>
              </div>
              <p className="text-xs text-[#8B95A1]">{logSummary.completedCount}건</p>
            </div>
            {monthLogs.length === 0 ? (
              <div className="p-5 text-center">
                <p className="text-sm text-[#8B95A1]">아직 근퇴 기록이 없어요</p>
              </div>
            ) : (
              monthLogs.slice(0, 8).map((log) => (
                <AttendanceRow key={log.id || `${log.work_date}_${log.actual_start_time}`} log={log} />
              ))
            )}
          </div>
        </section>

        <section className="px-4 mb-5">
          <div className="bg-white rounded-2xl border border-[#E5E8EB] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#F2F4F6] flex items-center gap-2">
              <ReceiptText size={15} className="text-[#0064FF]" />
              <p className="text-sm font-bold text-[#191F28]">이전 급여 기록</p>
            </div>
            {recentPayrolls.length === 0 ? (
              <div className="p-5 text-center">
                <p className="text-sm text-[#8B95A1]">아직 이전 급여 기록이 없어요</p>
              </div>
            ) : (
              recentPayrolls.map((payroll) => (
                <PayrollHistoryRow key={payroll.id || `${payroll.month}_${payroll.staffId}`} payroll={payroll} />
              ))
            )}
          </div>
        </section>

        {staffType === 'teacher' && (
          <ReferenceList
            title={`${formatMonth(selectedMonth)} 수업 참고`}
            empty="이 달 수업 기록이 없어요"
            items={mySessions.map((session) => ({
              id: session.id,
              title: session.date,
              detail: `${getGroupName(session.classGroupId)} · ${session.startTime}~${session.endTime}`,
            }))}
          />
        )}

        {staffType === 'assistant' && (
          <ReferenceList
            title={`${formatMonth(selectedMonth)} 완료 클리닉`}
            empty="이 달 완료한 클리닉이 없어요"
            items={myClinics.map((task) => ({
              id: task.id,
              title: task.title,
              detail: `${task.completedAt?.slice(0, 10)} · ${task.resultMemo || '결과 메모 없음'}`,
            }))}
          />
        )}
      </div>
    </div>
  );
}

function Pill({ icon: Icon, label, tone = 'gray' }) {
  const toneClass = tone === 'green'
    ? 'bg-emerald-50 text-emerald-700'
    : tone === 'blue'
    ? 'bg-blue-50 text-blue-700'
    : 'bg-[#F2F4F6] text-[#4E5968]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${toneClass}`}>
      <Icon size={11} />
      {label}
    </span>
  );
}

function MetricCard({ label, value, tone = 'default' }) {
  const valueClass = tone === 'green'
    ? 'text-emerald-700'
    : tone === 'amber'
    ? 'text-amber-700'
    : 'text-[#191F28]';
  return (
    <div className="bg-white rounded-xl border border-[#E5E8EB] px-3 py-3">
      <p className="text-[11px] text-[#8B95A1]">{label}</p>
      <p className={`text-base font-extrabold mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}

function AttendanceRow({ log }) {
  const minutes = minutesFromLog(log);
  const status = getStatusMeta(log.status);
  return (
    <div className="px-4 py-3 border-b border-[#F2F4F6] last:border-0 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#191F28]">{log.work_date}</p>
        <p className="text-xs text-[#8B95A1] mt-0.5">
          {formatTime(log.actual_start_time)} - {formatTime(log.actual_end_time)}
          {log.break_minutes ? ` · 휴게 ${log.break_minutes}분` : ''}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-[#191F28]">{formatHours(minutes / 60)}시간</p>
        <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>
          {status.label}
        </span>
      </div>
    </div>
  );
}

function PayrollHistoryRow({ payroll }) {
  const paid = payroll.status === 'completed' || payroll.status === 'paid';
  return (
    <div className="px-4 py-3 border-b border-[#F2F4F6] last:border-0 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-[#191F28]">{formatMonth(payroll.month)}</p>
        <p className="text-xs text-[#8B95A1] mt-0.5">
          {payroll.wageType === 'hourly'
            ? `${formatHours(payroll.totalHours)}시간 · 시급 ${formatWon(payroll.hourlyWage)}`
            : `월급 ${formatWon(payroll.monthlySalary)}`}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-extrabold text-[#191F28]">{formatWon(payroll.amount)}</p>
        <p className={`text-[11px] mt-0.5 ${paid ? 'text-emerald-600' : 'text-[#8B95A1]'}`}>
          {paid ? '지급 완료' : '지급 예정'}
        </p>
      </div>
    </div>
  );
}

function ReferenceList({ title, empty, items }) {
  return (
    <section className="px-4 mb-5">
      <p className="text-xs font-bold text-[#8B95A1] mb-2 px-1">{title}</p>
      <div className="bg-white rounded-2xl border border-[#E5E8EB] overflow-hidden">
        {items.length === 0 ? (
          <div className="p-5 text-center">
            <p className="text-sm text-[#8B95A1]">{empty}</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="px-4 py-3 border-b border-[#F2F4F6] last:border-0 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#F2F4F6] flex items-center justify-center flex-shrink-0">
                <Clock3 size={14} className="text-[#4E5968]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#191F28] truncate">{item.title}</p>
                <p className="text-xs text-[#8B95A1] mt-0.5 truncate">{item.detail}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="mt-8 bg-white rounded-2xl p-6 text-center border border-[#E5E8EB]">
      <p className="text-sm font-bold text-[#4E5968]">{title}</p>
      <p className="text-xs text-[#8B95A1] mt-1">{detail}</p>
    </div>
  );
}
