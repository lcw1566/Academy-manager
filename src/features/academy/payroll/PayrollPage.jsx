import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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

function getStaffId(role, academyTeachers, academyAssistants) {
  // MVP: 단일 강사/보조강사가 본인 역할에 해당하는 첫 번째 레코드를 자신으로 간주
  // 실제 계정 연동 시 userId와 매핑
  if (role === 'teacher') return academyTeachers[0]?.id || null;
  if (role === 'assistant') return academyAssistants[0]?.id || null;
  return null;
}

export default function PayrollPage() {
  const {
    role,
    academyTeachers, academyAssistants, academyPayrolls,
    classSessions, classGroups, clinicTasks,
  } = useAcademyStore();

  const months = getRecentMonths();
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const staffId = useMemo(
    () => getStaffId(role, academyTeachers, academyAssistants),
    [role, academyTeachers, academyAssistants]
  );

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
      .filter((s) => s.teacherId === staffId && s.date?.startsWith(selectedMonth))
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

  if (!staffInfo) {
    return (
      <div>
        <Header title="급여" />
        <div className="pt-14 px-4">
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
    ? `시간당 ${(staffInfo.hourlyWage || 0).toLocaleString()}원`
    : `월 ${(staffInfo.monthlySalary || 0).toLocaleString()}원`;

  return (
    <div>
      <Header title="급여" />

      <div className="pt-14 pb-6">
        {/* 월 선택 */}
        <div className="px-4 pt-4 mb-4">
          <button onClick={() => setMonthPickerOpen(!monthPickerOpen)}
            className="flex items-center gap-2 bg-white rounded-2xl px-4 py-2.5 shadow-sm">
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
            <div className="bg-blue-600 rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-blue-200 mb-1">{selectedMonth.replace('-', '년 ')}월 예상 급여</p>
              <p className="text-3xl font-bold text-white">{(myPayroll.amount || 0).toLocaleString()}원</p>
              <div className="flex items-center gap-3 mt-3">
                {role === 'teacher' && (
                  <span className="text-xs text-blue-200">수업 {myPayroll.completedSessionCount}회 · {myPayroll.totalHours}시간</span>
                )}
                {role === 'assistant' && (
                  <span className="text-xs text-blue-200">완료 클리닉 {myPayroll.completedClinicCount}건</span>
                )}
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${myPayroll.status === 'completed' ? 'bg-green-400/30 text-green-100' : 'bg-white/20 text-white'}`}>
                  {myPayroll.status === 'completed' ? `지급완료 ${myPayroll.paidDate}` : '지급 예정'}
                </span>
              </div>
            </div>
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
            <p className="text-xs font-semibold text-gray-400 px-1">{selectedMonth.replace('-', '년 ')}월 수업 이력</p>
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
                      <p className="text-sm font-semibold text-gray-700">{hours}시간</p>
                      {staffInfo.wageType === 'hourly' && (
                        <p className="text-xs text-blue-600">{((staffInfo.hourlyWage || 0) * hours).toLocaleString()}원</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 클리닉 이력 (보조강사) */}
        {role === 'assistant' && (
          <div className="px-4 flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-400 px-1">{selectedMonth.replace('-', '년 ')}월 완료 클리닉</p>
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
