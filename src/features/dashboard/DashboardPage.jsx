import useAcademyStore from '../../store/useAcademyStore';
import StatCard from '../../components/StatCard';
import ClassFormModal from '../classes/ClassFormModal';
import StudentFormModal from '../students/StudentFormModal';
import { today, formatDateShort, greetingByTime, getCurrentMonth } from '../../utils/date';
import { formatCurrency, roleMap } from '../../utils/format';
import { useState } from 'react';

export default function DashboardPage() {
  const {
    role, students, classes, attendanceRecords,
    lessonRecords, payments, consultations,
    navigateToClass, setActiveTab,
  } = useAcademyStore();

  const [showClassForm, setShowClassForm] = useState(false);
  const [showStudentForm, setShowStudentForm] = useState(false);

  const todayStr = today();
  const currentMonth = getCurrentMonth();

  const todayClasses = classes.filter((c) => c.date === todayStr);
  const todayStudentIds = [...new Set(todayClasses.flatMap((c) => c.studentIds))];

  const checkedTodayIds = new Set(
    attendanceRecords.filter((a) => a.date === todayStr).map((a) => a.studentId)
  );
  const uncheckedCount = todayStudentIds.filter((id) => !checkedTodayIds.has(id)).length;

  const notesWrittenToday = new Set(
    lessonRecords
      .filter((lr) => todayClasses.some((c) => c.id === lr.classId) && lr.date === todayStr)
      .map((lr) => lr.studentId)
  );
  const notesUnwrittenCount = todayStudentIds.filter((id) => !notesWrittenToday.has(id)).length;

  const unpaidPayments = payments.filter(
    (p) => p.month === currentMonth && p.status === 'unpaid'
  );
  const unpaidAmount = unpaidPayments.reduce((sum, p) => sum + p.amount, 0);

  const todayConsultations = consultations.filter((c) => c.date === todayStr);

  // Build todo items
  const todos = [];
  todayClasses.forEach((cls) => {
    cls.studentIds.forEach((sid) => {
      const student = students.find((s) => s.id === sid);
      if (!student) return;
      if (!checkedTodayIds.has(sid)) {
        todos.push({
          label: `${cls.startTime} ${student.name} 출결 체크 필요`,
          color: 'text-orange-600', dot: 'bg-orange-400',
          action: () => navigateToClass(cls.id),
        });
      }
      if (!notesWrittenToday.has(sid)) {
        todos.push({
          label: `${student.name} 수업 기록 미작성`,
          color: 'text-blue-600', dot: 'bg-blue-400',
          action: () => navigateToClass(cls.id),
        });
      }
    });
  });
  unpaidPayments.forEach((p) => {
    const student = students.find((s) => s.id === p.studentId);
    if (!student) return;
    todos.push({
      label: `${student.name} ${formatCurrency(p.amount)} 미납`,
      color: 'text-red-600', dot: 'bg-red-400',
      action: () => setActiveTab('payments'),
    });
  });
  todayConsultations.forEach((con) => {
    const student = students.find((s) => s.id === con.studentId);
    if (!student) return;
    todos.push({
      label: `${student.name} 학부모 상담 예정`,
      color: 'text-purple-600', dot: 'bg-purple-400',
      action: () => setActiveTab('more'),
    });
  });

  const isEmpty = students.length === 0;

  return (
    <div className="pt-6 pb-4">
      {/* Greeting */}
      <div className="px-5 mb-6">
        <p className="text-gray-500 text-sm">{greetingByTime()}</p>
        <h2 className="text-xl font-bold text-gray-900 mt-0.5">{formatDateShort(todayStr)}</h2>
        <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-600 font-medium px-2 py-0.5 rounded-full">
          {roleMap[role]}
        </span>
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div className="mx-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="text-4xl mb-3">📚</div>
            <p className="font-bold text-gray-900 mb-1">아직 등록된 학생이 없어요</p>
            <p className="text-sm text-gray-500 mb-5">
              학생을 등록하고 정기 과외를 시작하면<br />오늘의 수업 관리가 시작돼요
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowStudentForm(true)}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl text-sm"
              >
                학생 등록하기
              </button>
              <button
                onClick={() => setShowClassForm(true)}
                className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl text-sm"
              >
                정기 과외 등록하기
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="px-4 grid grid-cols-2 gap-3 mb-6">
            <StatCard
              label="오늘 수업"
              value={todayClasses.length}
              unit="개"
              onClick={() => setActiveTab('classes')}
            />
            <StatCard
              label="출결 미체크"
              value={uncheckedCount}
              unit="명"
              color={uncheckedCount > 0 ? 'text-orange-500' : 'text-gray-900'}
              onClick={() => setActiveTab('classes')}
            />
            <StatCard
              label="수업기록 미작성"
              value={notesUnwrittenCount}
              unit="건"
              color={notesUnwrittenCount > 0 ? 'text-blue-600' : 'text-gray-900'}
              onClick={() => setActiveTab('classes')}
            />
            <StatCard
              label="이달 미납"
              value={formatCurrency(unpaidAmount)}
              color={unpaidAmount > 0 ? 'text-red-500' : 'text-gray-900'}
              onClick={() => setActiveTab('payments')}
            />
          </div>

          {/* Today's classes */}
          {todayClasses.length > 0 && (
            <div className="px-4 mb-6">
              <p className="text-sm font-bold text-gray-700 mb-3">오늘 수업</p>
              <div className="flex flex-col gap-2">
                {todayClasses
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((cls) => {
                    const clsStudents = students.filter((s) => cls.studentIds.includes(s.id));
                    const allChecked = cls.studentIds.every((sid) =>
                      attendanceRecords.some(
                        (a) => a.classId === cls.id && a.studentId === sid && a.date === todayStr
                      )
                    );
                    return (
                      <button
                        key={cls.id}
                        onClick={() => navigateToClass(cls.id)}
                        className="bg-white rounded-2xl p-4 shadow-sm text-left active:scale-95 transition-transform"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-gray-900 text-sm">{cls.name}</span>
                          {allChecked
                            ? <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">출결완료</span>
                            : <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">출결필요</span>
                          }
                        </div>
                        <p className="text-xs text-gray-500">
                          {cls.startTime} – {cls.endTime}
                          {cls.location ? ` · ${cls.location}` : ''}
                        </p>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* No classes today */}
          {todayClasses.length === 0 && (
            <div className="px-4 mb-6">
              <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
                <p className="text-gray-500 text-sm mb-3">오늘 수업이 없어요</p>
                <button
                  onClick={() => setShowClassForm(true)}
                  className="text-blue-600 text-sm font-semibold"
                >
                  정기 과외 등록하기 →
                </button>
              </div>
            </div>
          )}

          {/* Todo list */}
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
                  <button
                    key={i}
                    onClick={todo.action}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 border-b border-gray-50 last:border-0"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${todo.dot}`} />
                    <span className={`text-sm ${todo.color} font-medium`}>{todo.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showClassForm && <ClassFormModal onClose={() => setShowClassForm(false)} />}
      {showStudentForm && (
        <StudentFormModal
          onClose={() => setShowStudentForm(false)}
          onAddClass={() => {
            setShowStudentForm(false);
            setShowClassForm(true);
          }}
        />
      )}
    </div>
  );
}
