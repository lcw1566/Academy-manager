import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../store/useAcademyStore';
import StatCard from '../../components/StatCard';
import ClassFormModal from '../classes/ClassFormModal';
import StudentFormModal from '../students/StudentFormModal';
import WeeklyExpandableCalendar from '../../components/calendar/WeeklyExpandableCalendar';
import { today, formatDateShort, greetingByTime, getCurrentMonth, getDDay, getDDayLabel } from '../../utils/date';
import { formatCurrency, roleMap } from '../../utils/format';
import { STUDENT_EVENT_TYPES } from '../../constants/studentSchedule';

export default function DashboardPage() {
  const {
    role, students, classes, attendanceRecords,
    lessonRecords, payments, consultations,
    studentEvents,
    navigateToClass, navigateToStudent, setActiveTab,
  } = useAcademyStore();

  const [showClassForm, setShowClassForm] = useState(false);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today());

  const todayStr = today();
  const currentMonth = getCurrentMonth();

  // 다가오는 학생 일정 (오늘 이후 30일 이내)
  const upcomingStudentEvents = useMemo(() =>
    (studentEvents || [])
      .filter((e) => { const diff = getDDay(e.date); return diff !== null && diff >= 0 && diff <= 30; })
      .sort((a, b) => a.date.localeCompare(b.date)),
    [studentEvents]
  );

  // 캘린더 dot 데이터
  const schedules = useMemo(() => [
    ...classes.map((c) => ({ date: c.date, type: 'class' })),
    ...consultations.map((c) => ({ date: c.date, type: 'consultation' })),
    ...payments.filter((p) => p.dueDate && p.status !== 'paid').map((p) => ({ date: p.dueDate, type: 'payment' })),
    ...(studentEvents || []).map((e) => ({ date: e.date, type: STUDENT_EVENT_TYPES[e.eventType]?.dot || 'school' })),
  ], [classes, consultations, payments, studentEvents]);

  // 선택 날짜의 일정
  const dayClasses = useMemo(() =>
    classes.filter((c) => c.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [classes, selectedDate]
  );
  const dayConsultations = useMemo(() =>
    consultations.filter((c) => c.date === selectedDate),
    [consultations, selectedDate]
  );
  const dayPayments = useMemo(() =>
    payments.filter((p) => p.dueDate === selectedDate && p.status !== 'paid'),
    [payments, selectedDate]
  );

  // 오늘 기준 요약 카드 데이터
  const todayClasses = useMemo(() =>
    classes.filter((c) => c.date === todayStr),
    [classes, todayStr]
  );

  const { uncheckedCount, notesUnwrittenCount, unpaidPayments, unpaidAmount } = useMemo(() => {
    const todayStudentIds = [...new Set(todayClasses.flatMap((c) => c.studentIds))];
    const checkedTodayIds = new Set(
      attendanceRecords.filter((a) => a.date === todayStr).map((a) => a.studentId)
    );
    const notesWrittenToday = new Set(
      lessonRecords
        .filter((lr) => todayClasses.some((c) => c.id === lr.classId) && lr.date === todayStr)
        .map((lr) => lr.studentId)
    );
    const unpaidPayments = payments.filter((p) => p.month === currentMonth && p.status === 'unpaid');
    return {
      uncheckedCount: todayStudentIds.filter((id) => !checkedTodayIds.has(id)).length,
      notesUnwrittenCount: todayStudentIds.filter((id) => !notesWrittenToday.has(id)).length,
      unpaidPayments,
      unpaidAmount: unpaidPayments.reduce((sum, p) => sum + p.amount, 0),
      checkedTodayIds,
      notesWrittenToday,
    };
  }, [todayClasses, attendanceRecords, lessonRecords, payments, todayStr, currentMonth]);

  // 할 일 목록
  const todos = useMemo(() => {
    const todayStudentIds = [...new Set(todayClasses.flatMap((c) => c.studentIds))];
    const checkedTodayIds = new Set(
      attendanceRecords.filter((a) => a.date === todayStr).map((a) => a.studentId)
    );
    const notesWrittenToday = new Set(
      lessonRecords
        .filter((lr) => todayClasses.some((c) => c.id === lr.classId) && lr.date === todayStr)
        .map((lr) => lr.studentId)
    );
    const result = [];
    todayClasses.forEach((cls) => {
      cls.studentIds.forEach((sid) => {
        const student = students.find((s) => s.id === sid);
        if (!student) return;
        if (!checkedTodayIds.has(sid))
          result.push({ label: `${cls.startTime} ${student.name} 출결 체크 필요`, color: 'text-orange-600', dot: 'bg-orange-400', action: () => navigateToClass(cls.id) });
        if (!notesWrittenToday.has(sid))
          result.push({ label: `${student.name} 수업 기록 미작성`, color: 'text-blue-600', dot: 'bg-blue-400', action: () => navigateToClass(cls.id) });
      });
    });
    unpaidPayments.forEach((p) => {
      const student = students.find((s) => s.id === p.studentId);
      if (!student) return;
      result.push({ label: `${student.name} ${formatCurrency(p.amount)} 미납`, color: 'text-red-600', dot: 'bg-red-400', action: () => setActiveTab('payments') });
    });
    return result;
  }, [todayClasses, attendanceRecords, lessonRecords, students, unpaidPayments, todayStr, navigateToClass, setActiveTab]);

  const isEmpty = students.length === 0;
  const isToday = selectedDate === todayStr;
  const dateLabel = isToday ? '오늘 일정' : formatDateShort(selectedDate);
  const hasDayEvents = dayClasses.length > 0 || dayConsultations.length > 0 || dayPayments.length > 0;

  return (
    <div className="pt-6 pb-4">
      {/* 인사 */}
      <div className="px-5 mb-5">
        <p className="text-gray-500 text-sm">{greetingByTime()}</p>
        <h2 className="text-xl font-bold text-gray-900 mt-0.5">{formatDateShort(todayStr)}</h2>
        <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-600 font-medium px-2 py-0.5 rounded-full">
          {roleMap[role]}
        </span>
      </div>

      {/* 주간 캘린더 */}
      <div className="mb-5">
        <WeeklyExpandableCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          schedules={schedules}
        />
      </div>

      {/* 선택 날짜 일정 */}
      <div className="px-4 mb-5">
        <p className="text-sm font-bold text-gray-700 mb-3">{dateLabel}</p>
        {!hasDayEvents ? (
          <div className="bg-white rounded-2xl px-4 py-5 text-center shadow-sm">
            <p className="text-sm text-gray-400">일정이 없어요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {dayClasses.map((cls) => {
              const clsStudents = students.filter((s) => cls.studentIds.includes(s.id));
              return (
                <motion.button
                  key={cls.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigateToClass(cls.id)}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm flex-1">{cls.name}</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-4">
                    {cls.startTime} – {cls.endTime}
                    {cls.location ? ` · ${cls.location}` : ''}
                  </p>
                  {clsStudents.length > 0 && (
                    <p className="text-xs text-gray-400 ml-4 mt-0.5">{clsStudents.map((s) => s.name).join(', ')}</p>
                  )}
                </motion.button>
              );
            })}
            {dayConsultations.map((con) => {
              const student = students.find((s) => s.id === con.studentId);
              return (
                <div key={con.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm">{student?.name} 학부모 상담</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-4">{con.method} · {con.content?.slice(0, 30)}</p>
                </div>
              );
            })}
            {dayPayments.map((p) => {
              const student = students.find((s) => s.id === p.studentId);
              return (
                <motion.button
                  key={p.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setActiveTab('payments')}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm">{student?.name} 수납 예정</span>
                    <span className="ml-auto text-sm font-bold text-orange-500">{formatCurrency(p.amount)}</span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="mx-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="text-4xl mb-3">📚</div>
            <p className="font-bold text-gray-900 mb-1">아직 등록된 학생이 없어요</p>
            <p className="text-sm text-gray-500 mb-5">학생을 등록하고 정기 과외를 시작하면<br />오늘의 수업 관리가 시작돼요</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => setShowStudentForm(true)} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl text-sm">학생 등록하기</button>
              <button onClick={() => setShowClassForm(true)} className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl text-sm">정기 과외 등록하기</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="px-4 grid grid-cols-2 gap-3 mb-5">
            <StatCard label="오늘 수업" value={todayClasses.length} unit="개" onClick={() => setActiveTab('classes')} />
            <StatCard label="출결 미체크" value={uncheckedCount} unit="명" color={uncheckedCount > 0 ? 'text-orange-500' : 'text-gray-900'} onClick={() => setActiveTab('classes')} />
            <StatCard label="수업기록 미작성" value={notesUnwrittenCount} unit="건" color={notesUnwrittenCount > 0 ? 'text-blue-600' : 'text-gray-900'} onClick={() => setActiveTab('classes')} />
            <StatCard label="이달 미납" value={formatCurrency(unpaidAmount)} color={unpaidAmount > 0 ? 'text-red-500' : 'text-gray-900'} onClick={() => setActiveTab('payments')} />
          </div>

          {/* 오늘 할 일 */}
          <div className="px-4">
            <p className="text-sm font-bold text-gray-700 mb-3">오늘의 할 일</p>
            {todos.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm font-semibold text-gray-700">오늘 할 일을 모두 완료했어요!</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {todos.map((todo, i) => (
                  <motion.button
                    key={i}
                    whileTap={{ scale: 0.98 }}
                    onClick={todo.action}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 border-b border-gray-50 last:border-0"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${todo.dot}`} />
                    <span className={`text-sm ${todo.color} font-medium`}>{todo.label}</span>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* 다가오는 시험과 일정 */}
          {upcomingStudentEvents.length > 0 && (
            <div className="px-4 mt-5">
              <p className="text-sm font-bold text-gray-700 mb-3">다가오는 시험과 일정</p>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {upcomingStudentEvents.slice(0, 5).map((ev) => {
                  const student = students.find((s) => s.id === ev.studentId);
                  const typeInfo = STUDENT_EVENT_TYPES[ev.eventType];
                  const dday = getDDay(ev.date);
                  return (
                    <motion.button
                      key={ev.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => navigateToStudent(ev.studentId)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="text-lg flex-shrink-0">{typeInfo?.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {student?.name} · {ev.title || typeInfo?.label}
                          {ev.subject ? ` (${ev.subject})` : ''}
                        </p>
                        <p className="text-xs text-gray-400">{ev.date}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        dday === 0 ? 'bg-red-100 text-red-600' :
                        dday <= 7 ? 'bg-orange-100 text-orange-600' :
                        'bg-amber-50 text-amber-600'
                      }`}>
                        {getDDayLabel(ev.date)}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {showClassForm && <ClassFormModal onClose={() => setShowClassForm(false)} />}
      {showStudentForm && (
        <StudentFormModal
          onClose={() => setShowStudentForm(false)}
          onAddClass={() => { setShowStudentForm(false); setShowClassForm(true); }}
        />
      )}
    </div>
  );
}
