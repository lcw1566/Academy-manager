import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, MapPin, Users } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import WeeklyExpandableCalendar from '../../components/calendar/WeeklyExpandableCalendar';
import AttendancePanel from '../attendance/AttendancePanel';
import LessonNotePanel, { SharedNoteSection } from '../notes/LessonNotePanel';
import { today, formatDateShort } from '../../utils/date';
import { classTypeColors } from '../../utils/format';
import { DAY_NAMES } from '../../utils/recurringClass';

const formatDaysBullet = (daysOfWeek) =>
  daysOfWeek
    .slice()
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((d) => DAY_NAMES[d])
    .join(' · ');

const SESSION_TABS = [
  { id: 'attendance', label: '출결' },
  { id: 'record',     label: '수업 기록' },
];

export default function LessonGroupDetailPage() {
  const {
    selectedRepeatGroupId, repeatGroups, classes, students,
    goBackFromRepeatGroup,
  } = useAcademyStore();

  const [selectedDate, setSelectedDate] = useState(today());
  const [sessionTab, setSessionTab] = useState('attendance');
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  const group = repeatGroups.find((g) => g.id === selectedRepeatGroupId);

  if (!group) {
    return (
      <div className="pt-14 p-4 text-center text-gray-500">
        <p>수업 그룹을 찾을 수 없습니다.</p>
        <button onClick={goBackFromRepeatGroup} className="block mt-4 text-blue-600 mx-auto">
          돌아가기
        </button>
      </div>
    );
  }

  const todayStr = today();

  const groupClasses = classes
    .filter((c) => c.repeatGroupId === group.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const groupStudents = students.filter((s) => group.studentIds.includes(s.id));
  const firstStudent = groupStudents[0];
  const studentCount = groupStudents.length;
  const namePrefix =
    studentCount <= 1
      ? firstStudent?.name || ''
      : `${firstStudent?.name || ''} 외 ${studentCount - 1}명`;
  const groupType = studentCount <= 1 ? '정기 과외' : '그룹 과외';
  const groupName = `${namePrefix} ${group.subject} ${groupType}`;

  const totalCount = groupClasses.length;
  const completedCount = groupClasses.filter((c) => c.date < todayStr).length;

  // 이 수업 그룹의 날짜만 dot 표시
  const schedules = groupClasses.map((c) => ({ date: c.date, type: 'class' }));

  // 선택 날짜의 이 수업 회차
  const selectedClass = groupClasses.find((c) => c.date === selectedDate);

  const effectiveStudentId = selectedStudentId || groupStudents[0]?.id || null;
  const isMultiStudent = groupStudents.length > 1;

  const handleSelectDate = (date) => {
    setSelectedDate(date);
    setSelectedStudentId(null);
    setSessionTab('attendance');
  };

  return (
    <div>
      <Header title={groupName} onBack={goBackFromRepeatGroup} />

      <div className="pt-14">
        {/* 수업 그룹 정보 카드 */}
        <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                classTypeColors[groupType] || 'bg-blue-50 text-blue-700'
              }`}
            >
              {groupType}
            </span>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {group.repeatType}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-gray-400 flex-shrink-0" />
              <span>
                {formatDaysBullet(group.daysOfWeek)}요일 · {group.startTime} – {group.endTime}
              </span>
            </div>
            {group.location && (
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-gray-400 flex-shrink-0" />
                <span>{group.location}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Users size={14} className="text-gray-400 flex-shrink-0" />
              <span>
                {groupStudents.map((s) => s.name).join(', ')} ({studentCount}명)
              </span>
            </div>
          </div>

          <div className="mt-3 flex gap-3 text-xs text-gray-400 border-t border-gray-50 pt-3">
            <span>총 {totalCount}회</span>
            <span>·</span>
            <span>완료 {completedCount}회</span>
            <span>·</span>
            <span>남은 수업 {Math.max(0, totalCount - completedCount)}회</span>
          </div>
        </div>

        {/* 이 수업 전용 캘린더 */}
        <div className="mt-4 mb-2">
          <WeeklyExpandableCalendar
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            schedules={schedules}
          />
        </div>

        {/* 선택 날짜 수업 회차 패널 */}
        <div className="px-4 mt-4 pb-8">
          <AnimatePresence mode="wait">
            {!selectedClass ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-white rounded-2xl p-8 shadow-sm text-center"
              >
                <p className="text-3xl mb-3">📅</p>
                <p className="font-semibold text-gray-700 mb-1">
                  선택한 날짜에는 이 수업이 없어요.
                </p>
                <p className="text-xs text-gray-400">수업이 있는 날짜를 선택해주세요</p>
              </motion.div>
            ) : (
              <motion.div
                key={selectedClass.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* 회차 정보 */}
                <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                  <p className="text-base font-bold text-gray-900 mb-0.5">
                    {formatDateShort(selectedClass.date)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {selectedClass.startTime} – {selectedClass.endTime}
                  </p>
                  {selectedClass.location && (
                    <p className="text-xs text-gray-400 mt-0.5">{selectedClass.location}</p>
                  )}
                </div>

                {/* 탭 */}
                <div className="flex gap-0 bg-gray-100 rounded-xl p-1 mb-4">
                  {SESSION_TABS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSessionTab(t.id)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                        sessionTab === t.id
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* 출결 */}
                {sessionTab === 'attendance' && (
                  <AttendancePanel cls={selectedClass} />
                )}

                {/* 수업 기록 */}
                {sessionTab === 'record' && (
                  <>
                    {isMultiStudent && <SharedNoteSection cls={selectedClass} />}

                    {isMultiStudent && (
                      <div className="mb-4">
                        <p className="text-xs font-bold text-gray-500 mb-2">학생별 기록 선택</p>
                        <div className="flex gap-2 flex-wrap">
                          {groupStudents.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => setSelectedStudentId(s.id)}
                              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                effectiveStudentId === s.id
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-600 border border-gray-200'
                              }`}
                            >
                              {s.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {effectiveStudentId && (
                      <LessonNotePanel
                        cls={selectedClass}
                        studentId={effectiveStudentId}
                        groupMode={isMultiStudent}
                      />
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
