import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, FileText, Users as UsersIcon, AlertCircle } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { today, formatDateShort, greetingByTime } from '../../../utils/date';
import { formatCurrency } from '../../../utils/format';
import WeeklyExpandableCalendar from '../../../components/calendar/WeeklyExpandableCalendar';

export default function OwnerDashboard() {
  const academyStudents = useAcademyStore((s) => s.academyStudents);
  const classGroups = useAcademyStore((s) => s.classGroups);
  const classSessions = useAcademyStore((s) => s.classSessions);
  const clinicRecords = useAcademyStore((s) => s.clinicRecords) ?? [];
  const academyTeachers = useAcademyStore((s) => s.academyTeachers);
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const academyPayments = useAcademyStore((s) => s.academyPayments);
  const academyProfile = useAcademyStore((s) => s.academyProfile);
  const academyLessonRecords = useAcademyStore((s) => s.academyLessonRecords) ?? [];
  const academyPayrolls = useAcademyStore((s) => s.academyPayrolls) ?? [];
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const navigateToClassGroup = useAcademyStore((s) => s.navigateToClassGroup);
  const navigateToClassSession = useAcademyStore((s) => s.navigateToClassSession);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const academyInvitations = useWorkspaceStore((s) => s.academyInvitations) ?? [];

  const [selectedDate, setSelectedDate] = useState(today());
  const todayStr = today();

  const todaySessions = useMemo(
    () => classSessions.filter((s) => s.date === todayStr && s.status !== 'canceled'),
    [classSessions, todayStr]
  );

  const schedules = useMemo(() => [
    ...classSessions.filter((s) => s.status !== 'canceled').map((s) => ({ date: s.date, type: 'class' })),
  ], [classSessions]);

  const daySessions = useMemo(
    () => classSessions.filter((s) => s.date === selectedDate && s.status !== 'canceled')
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [classSessions, selectedDate]
  );

  const todayClinicCount = useMemo(
    () => clinicRecords.filter((r) => r.date === todayStr).length,
    [clinicRecords, todayStr]
  );

  const currentMonth = todayStr.slice(0, 7);
  const unpaidPayments = useMemo(
    () => academyPayments.filter((p) => p.month === currentMonth && p.status === 'unpaid'),
    [academyPayments, currentMonth]
  );
  const unpaidAmount = useMemo(() => unpaidPayments.reduce((s, p) => s + (p.amount || 0), 0), [unpaidPayments]);

  const todayStudentIds = useMemo(
    () => [...new Set(todaySessions.flatMap((s) => s.studentIds || []))],
    [todaySessions]
  );

  // Phase 30 운영 메트릭
  // 오늘 출근 예정 staff (shift 가 오늘이고 status != canceled)
  const todayShifts = useMemo(
    () => academyStaffShifts.filter((sh) => sh.date === todayStr && sh.status !== 'canceled'),
    [academyStaffShifts, todayStr],
  );
  const todayShiftStaffIds = useMemo(
    () => [...new Set(todayShifts.map((sh) => sh.staffId).filter(Boolean))],
    [todayShifts],
  );

  // 진행 중 / 곧 시작 수업 (시작 90분 이내)
  const nowMinutes = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, []);
  const inProgressOrSoonSessions = useMemo(() => {
    return todaySessions.filter((s) => {
      if (!s.startTime || !s.endTime) return false;
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      const startM = sh * 60 + sm;
      const endM = eh * 60 + em;
      // 진행 중 OR 90분 이내 시작
      return (nowMinutes >= startM && nowMinutes <= endM) || (startM - nowMinutes <= 90 && startM > nowMinutes);
    }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [todaySessions, nowMinutes]);

  // 미작성 수업 기록 — 오늘 또는 어제까지 status='completed' 인데 lesson_records (_common_) 없음
  const unfinishedLessonRecordSessions = useMemo(() => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return classSessions.filter((s) => {
      if (s.status !== 'completed') return false;
      if (s.date !== todayStr && s.date !== yesterday) return false;
      const hasRecord = academyLessonRecords.some((lr) => lr.sessionId === s.id && lr.studentId === '_common_');
      return !hasRecord;
    });
  }, [classSessions, academyLessonRecords, todayStr]);

  // 급여 확인 필요 — 이번 달 status='scheduled' (미지급)
  const pendingPayrolls = useMemo(
    () => academyPayrolls.filter((p) => p.month === currentMonth && p.status !== 'paid'),
    [academyPayrolls, currentMonth],
  );

  // pending 초대
  const pendingInvitations = useMemo(
    () => academyInvitations.filter((inv) => inv.status === 'pending'),
    [academyInvitations],
  );

  const isToday = selectedDate === todayStr;
  const dateLabel = isToday ? '오늘 일정' : formatDateShort(selectedDate);

  return (
    <div className="pt-6 pb-4">
      {/* 인사 */}
      <div className="px-5 mb-5">
        <p className="text-gray-500 text-sm">{greetingByTime()}</p>
        <h2 className="text-xl font-bold text-gray-900 mt-0.5">오늘 학원 운영</h2>
        <p className="text-sm text-gray-400 mt-0.5">{formatDateShort(todayStr)} · {academyProfile.name || '학원'}</p>
      </div>

      {/* 주간 캘린더 */}
      <div className="mb-5">
        <WeeklyExpandableCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} schedules={schedules} />
      </div>

      {/* 선택 날짜 일정 */}
      <div className="px-4 mb-5">
        <p className="text-sm font-bold text-gray-700 mb-3">{dateLabel}</p>
        {daySessions.length === 0 ? (
          <div className="bg-white rounded-2xl px-4 py-5 text-center shadow-sm">
            <p className="text-sm text-gray-400">수업이 없어요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {daySessions.map((session) => {
              const group = classGroups.find((g) => g.id === session.classGroupId);
              return (
                <motion.button
                  key={session.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { navigateToClassGroup(session.classGroupId); }}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm flex-1">{group?.name || '수업'}</span>
                    <span className="text-xs text-gray-400">{session.startTime}–{session.endTime}</span>
                  </div>
                  <p className="text-xs text-gray-400 ml-4">
                    {session.room || ''} · {session.studentIds?.length || 0}명
                  </p>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-5">
        <SummaryCard label="오늘 수업" value={`${todaySessions.length}개`} onClick={() => setActiveTab('classes')} />
        <SummaryCard label="출석 예정" value={`${todayStudentIds.length}명`} onClick={() => setActiveTab('classes')} />
        <SummaryCard label="오늘 출근 예정" value={`${todayShiftStaffIds.length}명`} onClick={() => setActiveTab('work')} />
        <SummaryCard
          label="오늘 클리닉 기록"
          value={`${todayClinicCount}건`}
          color={todayClinicCount > 0 ? 'text-blue-600' : 'text-gray-900'}
        />
        <SummaryCard
          label="이달 미납"
          value={unpaidPayments.length > 0 ? formatCurrency(unpaidAmount) : '없음'}
          color={unpaidPayments.length > 0 ? 'text-red-500' : 'text-gray-900'}
        />
        <SummaryCard
          label="급여 확인 필요"
          value={pendingPayrolls.length > 0 ? `${pendingPayrolls.length}건` : '없음'}
          color={pendingPayrolls.length > 0 ? 'text-amber-600' : 'text-gray-900'}
          onClick={() => setActiveTab('settlement')}
        />
      </div>

      {/* Phase 30 — 운영 알림 카드 */}
      {(inProgressOrSoonSessions.length > 0
        || unfinishedLessonRecordSessions.length > 0
        || pendingInvitations.length > 0) && (
        <div className="px-4 mb-5 flex flex-col gap-2">
          {inProgressOrSoonSessions.length > 0 && (
            <OpsCard
              icon={Clock}
              tone="blue"
              title={`진행 중/곧 시작 수업 ${inProgressOrSoonSessions.length}개`}
              detail={inProgressOrSoonSessions
                .slice(0, 3)
                .map((s) => `${s.startTime}–${s.endTime} ${classGroups.find((g) => g.id === s.classGroupId)?.name || ''}`)
                .join(' · ')}
              onClick={() => {
                const first = inProgressOrSoonSessions[0];
                if (first) navigateToClassSession(first.id);
              }}
            />
          )}
          {unfinishedLessonRecordSessions.length > 0 && (
            <OpsCard
              icon={FileText}
              tone="amber"
              title={`미작성 수업 기록 ${unfinishedLessonRecordSessions.length}개`}
              detail="완료된 수업에 기록이 비어 있어요."
              onClick={() => {
                const first = unfinishedLessonRecordSessions[0];
                if (first) navigateToClassSession(first.id);
              }}
            />
          )}
          {pendingInvitations.length > 0 && (
            <OpsCard
              icon={UsersIcon}
              tone="purple"
              title={`초대 대기 ${pendingInvitations.length}명`}
              detail="구성원 관리에서 상태를 확인할 수 있어요."
              onClick={() => setActiveTab('more')}
            />
          )}
        </div>
      )}

      {/* 강사별 수업 현황 */}
      {academyTeachers.length > 0 && (
        <div className="px-4 mb-4">
          <p className="text-sm font-bold text-gray-700 mb-3">강사별 오늘 수업</p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {academyTeachers.map((teacher) => {
              const teacherSessions = todaySessions.filter((s) => s.teacherId === teacher.id);
              return (
                <div key={teacher.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                  <span className="text-sm font-medium text-gray-800">{teacher.name}</span>
                  <span className={`text-sm font-bold ${teacherSessions.length > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                    {teacherSessions.length}개
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 빈 상태 */}
      {classGroups.length === 0 && (
        <div className="mx-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="text-4xl mb-3">🏫</div>
            <p className="font-bold text-gray-900 mb-1">아직 반이 없어요</p>
            <p className="text-sm text-gray-500 mb-5">반을 만들고 학원 운영을 시작해요</p>
            <button
              onClick={() => setActiveTab('classes')}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl text-sm"
            >
              반 만들기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color = 'text-gray-900', onClick }) {
  return (
    <button onClick={onClick} className="bg-white rounded-2xl p-4 shadow-sm text-left w-full active:scale-[0.97] transition-transform">
      <p className="text-xs text-gray-500 mb-1 font-medium">{label}</p>
      <p className={`text-2xl font-bold leading-none ${color}`}>{value}</p>
    </button>
  );
}

// Phase 30 — 운영 알림 카드.
function OpsCard({ icon: Icon, tone = 'blue', title, detail, onClick }) {
  const tones = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   iconColor: 'text-blue-600' },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  iconColor: 'text-amber-600' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', iconColor: 'text-purple-600' },
    red:    { bg: 'bg-red-50',    text: 'text-red-700',    iconColor: 'text-red-600' },
  };
  const t = tones[tone] || tones.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 shadow-sm text-left active:scale-[0.98] transition-transform ${t.bg}`}
    >
      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0">
        <Icon size={16} className={t.iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${t.text}`}>{title}</p>
        {detail && <p className="text-xs text-gray-500 mt-0.5 truncate">{detail}</p>}
      </div>
      <AlertCircle size={14} className="text-gray-300 flex-shrink-0" />
    </button>
  );
}
