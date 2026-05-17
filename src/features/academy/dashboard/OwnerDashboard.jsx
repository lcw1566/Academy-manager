import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import { today, formatDateShort, greetingByTime } from '../../../utils/date';
import { formatCurrency } from '../../../utils/format';
import WeeklyExpandableCalendar from '../../../components/calendar/WeeklyExpandableCalendar';

export default function OwnerDashboard() {
  const {
    academyStudents, classGroups, classSessions, clinicRecords = [],
    academyTeachers, academyPayments, academyProfile,
    navigateToClassGroup, navigateToClassSession, setActiveTab,
  } = useAcademyStore();

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
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
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
  const unpaidAmount = useMemo(() => unpaidPayments.reduce((s, p) => s + p.amount, 0), [unpaidPayments]);

  const todayStudentIds = useMemo(
    () => [...new Set(todaySessions.flatMap((s) => s.studentIds))],
    [todaySessions]
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
        <SummaryCard
          label="오늘 클리닉 기록"
          value={`${todayClinicCount}건`}
          color={todayClinicCount > 0 ? 'text-blue-600' : 'text-gray-900'}
          onClick={() => setActiveTab('clinic')}
        />
        <SummaryCard
          label="이달 미납"
          value={unpaidPayments.length > 0 ? formatCurrency(unpaidAmount) : '없음'}
          color={unpaidPayments.length > 0 ? 'text-red-500' : 'text-gray-900'}
        />
      </div>

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
