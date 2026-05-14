import { useState } from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import ClassFormModal from './ClassFormModal';
import { today, formatDateShort } from '../../utils/date';
import { classTypeColors } from '../../utils/format';
import { DAY_NAMES } from '../../utils/recurringClass';

const formatDaysBullet = (daysOfWeek) =>
  daysOfWeek
    .slice()
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((d) => DAY_NAMES[d])
    .join(' · ');

export default function ClassesPage() {
  const {
    repeatGroups, classes, students, attendanceRecords,
    navigateToRepeatGroup, navigateToClass,
  } = useAcademyStore();
  const [showForm, setShowForm] = useState(false);
  const todayStr = today();

  const singleClasses = classes.filter((c) => !c.repeatGroupId);
  const isEmpty = repeatGroups.length === 0 && singleClasses.length === 0;

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

      <div className="pt-14 pb-6">
        {/* 상단 설명 + 버튼 */}
        <div className="px-4 pt-5 mb-4">
          <p className="text-sm text-gray-400 mb-3">등록한 정기 과외와 수업을 한눈에 관리해요.</p>
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowForm(true)}
              className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl"
            >
              정기 과외 등록
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowForm(true)}
              className="flex-1 bg-white text-gray-700 text-sm font-semibold py-2.5 rounded-xl shadow-sm border border-gray-100"
            >
              수업 추가
            </motion.button>
          </div>
        </div>

        {/* Empty state */}
        {isEmpty && (
          <div className="mx-4 bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-3xl mb-3">📚</p>
            <p className="font-semibold text-gray-700 mb-1">아직 등록된 수업이 없어요.</p>
            <p className="text-xs text-gray-400 mb-5">
              정기 과외를 등록하면 수업별로<br />일정과 기록을 관리할 수 있어요.
            </p>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowForm(true)}
              className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl"
            >
              정기 과외 등록하기
            </motion.button>
          </div>
        )}

        {/* 정기 과외 / 그룹 과외 */}
        {repeatGroups.length > 0 && (
          <div className="px-4 flex flex-col gap-3">
            {repeatGroups.map((group) => {
              const groupClasses = classes.filter((c) => c.repeatGroupId === group.id);
              const totalCount = groupClasses.length;
              const completedCount = groupClasses.filter((c) => c.date < todayStr).length;
              const nextClass = groupClasses
                .filter((c) => c.date >= todayStr)
                .sort((a, b) => a.date.localeCompare(b.date))[0];

              const pastClasses = groupClasses.filter((c) => c.date <= todayStr);
              const incompleteAttendance = pastClasses.filter(
                (c) =>
                  !c.studentIds.every((sid) =>
                    attendanceRecords.some((a) => a.classId === c.id && a.studentId === sid)
                  )
              ).length;

              const groupStudents = students.filter((s) => group.studentIds.includes(s.id));
              const firstStudent = groupStudents[0];
              const studentCount = groupStudents.length;
              const namePrefix =
                studentCount <= 1
                  ? firstStudent?.name || ''
                  : `${firstStudent?.name || ''} 외 ${studentCount - 1}명`;
              const groupType = studentCount <= 1 ? '정기 과외' : '그룹 과외';
              const groupName = `${namePrefix} ${group.subject} ${groupType}`;

              return (
                <motion.button
                  key={group.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigateToRepeatGroup(group.id)}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        classTypeColors[groupType] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {groupType}
                    </span>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>

                  <p className="font-bold text-gray-900 mb-1">{groupName}</p>

                  <p className="text-xs text-gray-500 mb-1">
                    {group.repeatType} {formatDaysBullet(group.daysOfWeek)}요일 · {group.startTime} – {group.endTime}
                  </p>

                  {group.location && (
                    <p className="text-xs text-gray-400 mb-2">{group.location}</p>
                  )}

                  {nextClass && (
                    <p className="text-xs text-blue-600 font-medium mb-2">
                      다음 수업: {formatDateShort(nextClass.date)}
                    </p>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    <span className="text-xs bg-gray-50 text-gray-500 px-2.5 py-1 rounded-lg">
                      총 {totalCount}회 · 완료 {completedCount}회
                    </span>
                    <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg">
                      수강생 {studentCount}명
                    </span>
                    {incompleteAttendance > 0 && (
                      <span className="text-xs bg-orange-50 text-orange-600 px-2.5 py-1 rounded-lg font-medium">
                        출결 미완료 {incompleteAttendance}건
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* 단발 수업 / 보강 */}
        {singleClasses.length > 0 && (
          <div className={`px-4 flex flex-col gap-3 ${repeatGroups.length > 0 ? 'mt-5' : ''}`}>
            {repeatGroups.length > 0 && (
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1">단발 수업 / 보강</p>
            )}
            {singleClasses
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((cls) => {
                const clsStudents = students.filter((s) => cls.studentIds.includes(s.id));
                return (
                  <motion.button
                    key={cls.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigateToClass(cls.id)}
                    className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          classTypeColors[cls.type] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {cls.type}
                      </span>
                      <ChevronRight size={16} className="text-gray-300" />
                    </div>
                    <p className="font-bold text-gray-900 mb-1">{cls.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatDateShort(cls.date)} · {cls.startTime} – {cls.endTime}
                    </p>
                    {clsStudents.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        {clsStudents.map((s) => s.name).join(', ')}
                      </p>
                    )}
                  </motion.button>
                );
              })}
          </div>
        )}
      </div>

      {showForm && <ClassFormModal onClose={() => setShowForm(false)} />}
    </div>
  );
}
