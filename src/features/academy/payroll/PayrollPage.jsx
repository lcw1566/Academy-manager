import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import Header from '../../../components/Header';
import { formatMonth } from '../../../utils/date';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import { currentUserCan } from '../../../utils/staffPermissions';
import { Wallet } from 'lucide-react';

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

export default function PayrollPage() {
  const {
    role,
    academyTeachers, academyAssistants, academyPayrolls,
    classSessions, classGroups, clinicTasks, academyProfile,
  } = useAcademyStore();

  // Phase 25 — 본인 식별 (auth → local 강사/보조강사 매칭)
  const authUserId = useAuthStore((s) => s.user?.id);
  const authUserEmail = useAuthStore((s) => s.user?.email);
  const memberships = useWorkspaceStore((s) => s.memberships);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const myMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );
  // Phase 39 — 학원 급여 지급일 (서버 > 로컬 profile > 10일 순).
  const salaryPaymentDay =
    myMembership?.academy?.salary_payment_day
    ?? academyProfile?.salaryPaymentDay
    ?? 10;

  const months = getRecentMonths();
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const staffId = useMemo(() => {
    if (role === 'teacher') {
      const me = findLocalStaffForUser(academyTeachers, {
        userId: authUserId, memberId: myMembership?.id, email: authUserEmail,
      });
      return me?.id || null;
    }
    if (role === 'assistant') {
      const me = findLocalStaffForUser(academyAssistants, {
        userId: authUserId, memberId: myMembership?.id, email: authUserEmail,
      });
      return me?.id || null;
    }
    return null;
  }, [role, academyTeachers, academyAssistants, authUserId, myMembership?.id, authUserEmail]);

  const staffInfo = useMemo(() => {
    if (role === 'teacher') return academyTeachers.find((t) => t.id === staffId);
    if (role === 'assistant') return academyAssistants.find((a) => a.id === staffId);
    return null;
  }, [role, staffId, academyTeachers, academyAssistants]);

  const myPayroll = useMemo(
    () => academyPayrolls.find((p) => p.staffId === staffId && p.month === selectedMonth),
    [academyPayrolls, staffId, selectedMonth]
  );

  // 수업 이력 (강사용)
  const mySessions = useMemo(() => {
    if (role !== 'teacher') return [];
    return classSessions
      .filter((s) => {
        if (s.status !== 'completed' || !s.date?.startsWith(selectedMonth)) return false;
        const isMainAndNoSubstitute = s.teacherId === staffId && !s.substituteTeacherId;
        const isSubstitute = s.substituteTeacherId === staffId;
        return isMainAndNoSubstitute || isSubstitute;
      })
      .sort((a, b) => b.date?.localeCompare(a.date || '') || 0);
  }, [classSessions, staffId, selectedMonth, role]);

  // 클리닉 이력 (보조강사용)
  const myClinics = useMemo(() => {
    if (role !== 'assistant') return [];
    return clinicTasks
      .filter((t) => t.assignedToId === staffId && t.completedAt?.startsWith(selectedMonth) && t.status === 'completed')
      .sort((a, b) => b.completedAt?.localeCompare(a.completedAt || '') || 0);
  }, [clinicTasks, staffId, selectedMonth, role]);

  const getGroupName = (id) => classGroups.find((g) => g.id === id)?.name || '';

  // Phase 31 — 본문에서도 canViewPayroll 가드 (탭 hide 외 직접 navigate 방어)
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((sp) => sp.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );
  const canViewPayroll = currentUserCan({ role, staffProfile: myStaffProfile }, 'canViewPayroll');
  if (!canViewPayroll) {
    return (
      <div>
        <Header title="급여" />
        <div className="pt-14 md:pt-0 px-4">
          <div className="mt-8 bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-sm text-gray-400">급여 조회 권한이 없어요</p>
            <p className="text-xs text-gray-300 mt-1">원장에게 권한을 요청해 주세요</p>
          </div>
        </div>
      </div>
    );
  }

  if (!staffInfo) {
    return (
      <div>
        <Header title="급여" />
        <div className="pt-14 md:pt-0 px-4">
          <div className="mt-8 bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-sm text-gray-400">등록된 강사 정보가 없어요</p>
            <p className="text-xs text-gray-300 mt-1">원장에게 강사 등록을 요청해 주세요</p>
          </div>
        </div>
      </div>
    );
  }

  const wageTypeLabel = staffInfo.wageType === 'hourly' ? '시급제' : '월급제';
  const wageDetail = staffInfo.wageType === 'hourly'
    ? `시간당 ${(staffInfo.hourlyWage || 0).toLocaleString()}원 · 실제 근퇴 기준`
    : `월 ${(staffInfo.monthlySalary || 0).toLocaleString()}원`;

  return (
    <div>
      <Header title="급여" />

      <div className="pt-14 md:pt-0 pb-6">
        {/* 월 선택 */}
        <div className="px-4 pt-4 mb-4">
          <button onClick={() => setMonthPickerOpen(!monthPickerOpen)}
            className="flex items-center gap-2 bg-white rounded-2xl px-4 py-2.5 shadow-sm">
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

        {/* 내 정보 */}
        <div className="px-4 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                <span className="font-bold text-blue-600 text-lg">{staffInfo.name?.[0]}</span>
              </div>
              <div>
                <p className="font-bold text-gray-900">{staffInfo.name}</p>
                <p className="text-xs text-gray-400">{role === 'teacher' ? '강사' : '보조강사'} · {wageTypeLabel} · {wageDetail}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 이번 달 급여 요약 */}
        <div className="px-4 mb-4">
          {myPayroll ? (
            <>
              <div className="bg-[#0064FF] rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-blue-100 mb-1">{formatMonth(selectedMonth)} 예상 급여</p>
                <p className="text-3xl font-bold text-white">{(myPayroll.amount || 0).toLocaleString()}원</p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${myPayroll.status === 'completed' ? 'bg-green-400/30 text-green-100' : 'bg-white/20 text-white'}`}>
                    {myPayroll.status === 'completed' ? `지급완료 ${myPayroll.paidDate}` : '지급 예정'}
                  </span>
                  {myPayroll.status !== 'completed' && (
                    <span className="text-xs font-semibold text-blue-100 inline-flex items-center gap-1">
                      <Wallet size={11} /> 매월 {salaryPaymentDay}일 지급
                    </span>
                  )}
                </div>
              </div>

              {/* Phase 34 — 시간 breakdown (시급일 때만 의미 있음) */}
              {staffInfo.wageType === 'hourly' && (
                <div className="bg-white rounded-2xl p-4 mt-3 shadow-sm">
                  <p className="text-xs font-bold text-[#191F28] mb-3">시간 내역</p>
                  <div className="grid grid-cols-3 gap-2">
                    <BreakdownCell
                      label="승인 근퇴"
                      value={`${formatHours(myPayroll.shiftHours ?? myPayroll.totalHours)}시간`}
                    />
                    <BreakdownCell
                      label="수업 참고"
                      value={`${formatHours(myPayroll.lessonHours)}시간`}
                      tone="primary"
                    />
                    <BreakdownCell
                      label="수업 외"
                      value={`${formatHours(myPayroll.gapHours)}시간`}
                      tone="muted"
                    />
                  </div>
                  {myPayroll.pendingLogHours > 0 && (
                    <p className="mt-2 text-[11px] text-amber-600">
                      승인 대기 근퇴 {formatHours(myPayroll.pendingLogHours)}시간은 급여에 아직 반영되지 않았어요.
                    </p>
                  )}
                  <div className="mt-3 pt-3 border-t border-[#F2F4F6] flex items-center justify-between">
                    <p className="text-xs text-[#4E5968]">
                      정산 기준 ·{' '}
                      <span className="font-semibold text-[#191F28]">
                        승인된 실제 근퇴 기록
                      </span>
                    </p>
                    <p className="text-xs text-[#4E5968]">
                      시급 {(myPayroll.hourlyWage || 0).toLocaleString()}원 × {formatHours(myPayroll.totalHours)}시간
                    </p>
                  </div>
                </div>
              )}

              {(role === 'teacher' || role === 'assistant') && (
                <p className="text-[11px] text-gray-400 mt-2 px-1">
                  {role === 'teacher'
                    ? `수업 ${myPayroll.completedSessionCount}회 완료`
                    : `클리닉 ${myPayroll.completedClinicCount}건 완료 (정산 영향 없음)`}
                </p>
              )}
            </>
          ) : (
            <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
              <p className="text-sm text-gray-400">이 달 급여 명세가 아직 없어요</p>
              <p className="text-xs text-gray-300 mt-1">원장이 급여를 계산하면 여기서 확인할 수 있어요</p>
            </div>
          )}
        </div>

        {/* 수업 이력 (강사) */}
        {role === 'teacher' && (
          <div className="px-4 flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-400 px-1">{formatMonth(selectedMonth)} 수업 이력</p>
            {mySessions.length === 0 ? (
              <div className="bg-white rounded-2xl p-5 text-center shadow-sm">
                <p className="text-sm text-gray-400">이 달 수업 기록이 없어요</p>
              </div>
            ) : (
              mySessions.map((session) => {
                const hours = (() => {
                  if (!session.startTime || !session.endTime) return 0;
                  const [sh, sm] = session.startTime.split(':').map(Number);
                  const [eh, em] = session.endTime.split(':').map(Number);
                  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
                })();
                return (
                  <div key={session.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{session.date}</p>
                      <p className="text-xs text-gray-400">{getGroupName(session.classGroupId)} · {session.startTime}~{session.endTime}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-700">{formatHours(hours)}시간</p>
                      {staffInfo.wageType === 'hourly' && <p className="text-xs text-gray-400">수업 참고</p>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* (보조강사) 클리닉 이력은 정산에 영향 없지만 참고 정보로 표시 */}
{/* Phase 34 — 클리닉 이력 (보조강사) */}
        {role === 'assistant' && (
          <div className="px-4 flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-400 px-1">{formatMonth(selectedMonth)} 완료 클리닉</p>
            {myClinics.length === 0 ? (
              <div className="bg-white rounded-2xl p-5 text-center shadow-sm">
                <p className="text-sm text-gray-400">이 달 완료한 클리닉이 없어요</p>
              </div>
            ) : (
              myClinics.map((task) => (
                <div key={task.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="font-semibold text-gray-900 text-sm">{task.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {task.completedAt?.slice(0, 10)} · {task.resultMemo || '결과 메모 없음'}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BreakdownCell({ label, value, tone = 'default' }) {
  const toneClass = tone === 'primary'
    ? 'text-[#0064FF]'
    : tone === 'muted'
    ? 'text-[#8B95A1]'
    : 'text-[#191F28]';
  return (
    <div className="bg-[#F8F9FA] rounded-xl px-3 py-2.5">
      <p className="text-[10px] text-[#8B95A1]">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${toneClass}`}>{value}</p>
    </div>
  );
}
