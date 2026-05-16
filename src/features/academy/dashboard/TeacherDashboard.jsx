import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import { today, formatDateShort, greetingByTime } from '../../../utils/date';
import WeeklyExpandableCalendar from '../../../components/calendar/WeeklyExpandableCalendar';

export default function TeacherDashboard() {
  const {
    academyStudents, classGroups, classSessions, clinicTasks,
    academyLessonRecords, academyAttendanceRecords,
    academyTeachers, navigateToClassGroup, setActiveTab,
  } = useAcademyStore();

  const [selectedDate, setSelectedDate] = useState(today());
  const todayStr = today();

  // MVP: 모든 세션을 본인 담당으로 취급 (실제 teacher ID 매핑은 추후 계정 연동 시)
  const mySessions = useMemo(
    () => classSessions.filter((s) => s.status !== 'canceled'),
    [classSessions]
  );

  const todaySessions = useMemo(
    () => mySessions.filter((s) => s.date === todayStr).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [mySessions, todayStr]
  );

  const daySessions = useMemo(
    () => mySessions.filter((s) => s.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [mySessions, selectedDate]
  );

  const schedules = useMemo(() => mySessions.map((s) => ({ date: s.date, type: 'class' })), [mySessions]);

  const myClinics = useMemo(
    () => clinicTasks.filter((t) => t.status !== 'completed'),
    [clinicTasks]
  );

  const todayStudentIds = useMemo(
    () => [...new Set(todaySessions.flatMap((s) => s.studentIds))],
    [todaySessions]
  );

  const checkedTodayIds = useMemo(
    () => new Set(academyAttendanceRecords.filter((a) => todaySessions.some((s) => s.id === a.sessionId)).map((a) => a.studentId)),
    [academyAttendanceRecords, todaySessions]
  );

  const notesWrittenToday = useMemo(
    () => new Set(academyLessonRecords.filter((lr) => todaySessions.some((s) => s.id === lr.sessionId)).map((lr) => lr.studentId)),
    [academyLessonRecords, todaySessions]
  );

  const isToday = selectedDate === todayStr;
  const dateLabel = isToday ? '오늘 내 수업' : formatDateShort(selectedDate);

  return (
    <div className="pt-6 pb-4">
      <div className="px-5 mb-5">
        <p className="text-gray-500 text-sm">{greetingByTime()}</p>
        <h2 className="text-xl font-bold text-gray-900 mt-0.5">오늘 내 수업</h2>
        <p className="text-sm text-gray-400 mt-0.5">{formatDateShort(todayStr)}</p>
      </div>

      <div className="mb-5">
        <WeeklyExpandableCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} schedules={schedules} />
      </div>

      {/* 선택 날짜 수업 */}
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
              const sessionAttended = academyAttendanceRecords.filter((a) => a.sessionId === session.id).length;
              return (
                <motion.button
                  key={session.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigateToClassGroup(session.classGroupId)}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm flex-1">{group?.name || '수업'}</span>
                    <span className="text-xs text-blue-600 font-medium">{session.startTime}</span>
                  </div>
                  <div className="flex items-center gap-3 ml-4 mt-1">
                    <span className="text-xs text-gray-400">{session.studentIds?.length || 0}명</span>
                    {sessionAttended > 0 && (
                      <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-medium">
                        출결 {sessionAttended}/{session.studentIds?.length || 0}
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-5">
        <SummaryCard label="오늘 수업" value={`${todaySessions.length}개`} onClick={() => setActiveTab('classes')} />
        <SummaryCard
          label="출결 미체크"
          value={`${todayStudentIds.filter((id) => !checkedTodayIds.has(id)).length}명`}
          color={todayStudentIds.some((id) => !checkedTodayIds.has(id)) ? 'text-orange-500' : 'text-gray-900'}
        />
        <SummaryCard
          label="기록 미작성"
          value={`${todayStudentIds.filter((id) => !notesWrittenToday.has(id)).length}건`}
          color={todayStudentIds.some((id) => !notesWrittenToday.has(id)) ? 'text-blue-600' : 'text-gray-900'}
        />
        <SummaryCard
          label="클리닉 요청"
          value={`${myClinics.length}건`}
          color={myClinics.length > 0 ? 'text-purple-600' : 'text-gray-900'}
          onClick={() => setActiveTab('clinic')}
        />
      </div>

      {/* 클리닉 현황 */}
      {myClinics.length > 0 && (
        <div className="px-4">
          <p className="text-sm font-bold text-gray-700 mb-3">클리닉 요청 현황</p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {myClinics.slice(0, 4).map((task) => {
              const student = academyStudents.find((s) => s.id === task.studentId);
              const statusColor = task.status === 'in_progress' ? 'text-blue-600' : 'text-orange-500';
              const statusLabel = task.status === 'in_progress' ? '진행 중' : '대기';
              return (
                <motion.button
                  key={task.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveTab('clinic')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-gray-50 last:border-0"
                >
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${task.priority === 'urgent' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                    {task.priority === 'urgent' ? '긴급' : '일반'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{student?.name} · {task.title}</p>
                  </div>
                  <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {classGroups.length === 0 && (
        <div className="mx-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="text-4xl mb-3">✏️</div>
            <p className="font-bold text-gray-900 mb-1">배정된 수업이 없어요</p>
            <p className="text-sm text-gray-500">원장이 반을 생성하고 배정하면 여기 표시됩니다.</p>
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
