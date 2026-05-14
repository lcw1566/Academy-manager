import { useState } from 'react';
import { Plus, Check, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import ClassFormModal from './ClassFormModal';
import WeeklyExpandableCalendar from '../../components/calendar/WeeklyExpandableCalendar';
import { today } from '../../utils/date';

export default function ClassesPage() {
  const { classes, students, attendanceRecords, lessonRecords, navigateToClass } = useAcademyStore();
  const [selectedDate, setSelectedDate] = useState(today());
  const [showForm, setShowForm] = useState(false);

  const todayStr = today();

  // 캘린더 dot (수업만)
  const schedules = classes.map((c) => ({ date: c.date, type: 'class' }));

  // 선택 날짜의 수업
  const dayClasses = classes
    .filter((c) => c.date === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const isAttendanceDone = (cls) =>
    cls.studentIds.every((sid) =>
      attendanceRecords.some((a) => a.classId === cls.id && a.studentId === sid && a.date === cls.date)
    );

  const isNoteDone = (cls) =>
    cls.studentIds.every((sid) =>
      lessonRecords.some((lr) => lr.classId === cls.id && lr.studentId === sid && lr.date === cls.date)
    );

  const isPastOrToday = (dateStr) => dateStr <= todayStr;

  return (
    <div>
      <Header
        title="수업"
        right={
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => setShowForm(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white"
          >
            <Plus size={18} />
          </motion.button>
        }
      />

      <div className="pt-14">
        {/* 캘린더 */}
        <div className="pt-4 mb-4">
          <WeeklyExpandableCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            schedules={schedules}
          />
        </div>

        {/* 선택 날짜 수업 목록 */}
        <div className="px-4 flex flex-col gap-3 pb-4">
          {dayClasses.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
              <p className="text-3xl mb-3">📅</p>
              <p className="font-semibold text-gray-700 mb-1">이 날 수업이 없어요</p>
              <p className="text-xs text-gray-400 mb-4">정기 과외를 등록하면 자동으로 일정이 채워져요</p>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowForm(true)}
                className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl"
              >
                정기 과외 등록하기
              </motion.button>
            </div>
          ) : (
            dayClasses.map((cls) => {
              const clsStudents = students.filter((s) => cls.studentIds.includes(s.id));
              const attendanceDone = isAttendanceDone(cls);
              const noteDone = isNoteDone(cls);
              const pastOrToday = isPastOrToday(cls.date);

              return (
                <motion.button
                  key={cls.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigateToClass(cls.id)}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
                >
                  {/* 시간 + 과목 */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {cls.startTime} – {cls.endTime}
                    </span>
                    {cls.subject && (
                      <span className="text-xs text-gray-500">{cls.subject}</span>
                    )}
                  </div>

                  {/* 수업명 */}
                  <p className="font-bold text-gray-900 text-sm mb-1">{cls.name}</p>

                  {/* 학생 + 장소 */}
                  <p className="text-xs text-gray-400 mb-3">
                    {clsStudents.map((s) => s.name).join(', ')}
                    {cls.location ? ` · ${cls.location}` : ''}
                  </p>

                  {/* 상태 배지 */}
                  {pastOrToday ? (
                    <div className="flex gap-2">
                      <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium ${
                        attendanceDone ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                      }`}>
                        <Check size={11} />
                        출결 {attendanceDone ? '완료' : '미완료'}
                      </span>
                      <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium ${
                        noteDone ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        <FileText size={11} />
                        기록 {noteDone ? '완료' : '미작성'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">예정된 수업</span>
                  )}
                </motion.button>
              );
            })
          )}
        </div>
      </div>

      {showForm && <ClassFormModal onClose={() => setShowForm(false)} />}
    </div>
  );
}
