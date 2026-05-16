import { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../store/useAcademyStore';
import EmptyState from '../../components/EmptyState';
import StudentLessonDetail from './StudentLessonDetail';
import { formatDateShort, today } from '../../utils/date';
import { formatDays } from '../../utils/recurringClass';
import { attendanceStatusMap } from '../../utils/format';

export default function StudentLessonsTab({ student, onAddClass }) {
  const { repeatGroups, classes, lessonRecords, attendanceRecords } = useAcademyStore();
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedStandaloneId, setSelectedStandaloneId] = useState(null);

  const todayStr = today();

  const studentGroups = useMemo(
    () => repeatGroups.filter((g) => g.studentIds?.includes(student.id) || g.studentId === student.id),
    [repeatGroups, student.id]
  );

  const standaloneClasses = useMemo(
    () => classes
      .filter((c) => !c.repeatGroupId && c.studentIds?.includes(student.id))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [classes, student.id]
  );

  const summaryMap = useMemo(() => {
    const map = new Map();
    for (const group of studentGroups) {
      const groupClasses = classes
        .filter((c) => c.repeatGroupId === group.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      const pastClasses = groupClasses.filter((c) => c.date <= todayStr);
      const futureClasses = groupClasses.filter((c) => c.date > todayStr);
      const lastClass = pastClasses[pastClasses.length - 1];
      const nextClass = futureClasses[0];
      const classIds = new Set(groupClasses.map((c) => c.id));
      const attList = attendanceRecords.filter(
        (a) => a.studentId === student.id && classIds.has(a.classId)
      );
      map.set(group.id, {
        groupClasses,
        lastClass,
        nextClass,
        present: attList.filter((a) => a.status === 'present').length,
        late:    attList.filter((a) => a.status === 'late').length,
        absent:  attList.filter((a) => a.status === 'absent').length,
        makeup:  attList.filter((a) => a.status === 'makeup').length,
      });
    }
    return map;
  }, [studentGroups, classes, attendanceRecords, student.id, todayStr]);

  if (selectedGroupId) {
    const group = repeatGroups.find((g) => g.id === selectedGroupId);
    return (
      <StudentLessonDetail
        student={student}
        group={group}
        onBack={() => setSelectedGroupId(null)}
      />
    );
  }

  if (selectedStandaloneId) {
    const cls = standaloneClasses.find((c) => c.id === selectedStandaloneId);
    return (
      <StudentLessonDetail
        student={student}
        standaloneClass={cls}
        onBack={() => setSelectedStandaloneId(null)}
      />
    );
  }

  const hasLessons = studentGroups.length > 0 || standaloneClasses.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {!hasLessons ? (
        <EmptyState
          icon="📚"
          title="아직 등록된 수업이 없어요"
          description={"수업을 등록하면 회차별 기록과 출결을\n한눈에 볼 수 있어요"}
          action={
            <button
              onClick={onAddClass}
              className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl"
            >
              수업 등록하기
            </button>
          }
        />
      ) : (
        <>
          {studentGroups.map((group) => {
            const { groupClasses, lastClass, nextClass, present, late, absent, makeup } = summaryMap.get(group.id);
            const isGroup = group.studentIds?.length > 1;
            return (
              <motion.button
                key={group.id}
                onClick={() => setSelectedGroupId(group.id)}
                whileTap={{ scale: 0.97 }}
                className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isGroup ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {isGroup ? '그룹 과외' : '정기 과외'}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                        {group.subject}
                      </span>
                    </div>
                    <p className="font-bold text-gray-900 truncate">
                      {student.name} {group.subject} 과외
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      매주 {formatDays(group.daysOfWeek)}요일 · {group.startTime}
                      {group.location ? ` · ${group.location}` : ''}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 mt-1 flex-shrink-0" />
                </div>

                <div className="flex gap-1.5 flex-wrap mb-3">
                  <AttBadge color="green" label={`출석 ${present}회`} />
                  {late > 0 && <AttBadge color="orange" label={`지각 ${late}회`} />}
                  {absent > 0 && <AttBadge color="red" label={`결석 ${absent}회`} />}
                  {makeup > 0 && <AttBadge color="yellow" label={`보강 ${makeup}회`} />}
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-50">
                  <span>총 {groupClasses.length}회</span>
                  <div className="flex flex-col items-end gap-0.5">
                    {lastClass && <span>최근 {formatDateShort(lastClass.date)}</span>}
                    {nextClass && (
                      <span className="text-blue-500 font-medium">다음 {formatDateShort(nextClass.date)}</span>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}

          {standaloneClasses.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 mb-2 px-1">단발 수업</p>
              {standaloneClasses.map((cls) => {
                const att = attendanceRecords.find(
                  (a) => a.classId === cls.id && a.studentId === student.id
                );
                const attMeta = att ? attendanceStatusMap[att.status] : null;
                return (
                  <motion.button
                    key={cls.id}
                    onClick={() => setSelectedStandaloneId(cls.id)}
                    whileTap={{ scale: 0.97 }}
                    className="bg-white rounded-2xl p-4 shadow-sm text-left w-full mb-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{cls.name || cls.subject}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDateShort(cls.date)} · {cls.startTime}
                          {cls.location ? ` · ${cls.location}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {attMeta && (
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${attMeta.bg} ${attMeta.color}`}>
                            {attMeta.label}
                          </span>
                        )}
                        <ChevronRight size={18} className="text-gray-300" />
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}

          <button
            onClick={onAddClass}
            className="w-full py-3 rounded-xl border-2 border-dashed border-blue-200 text-blue-600 text-sm font-semibold"
          >
            + 수업 추가하기
          </button>
        </>
      )}
    </div>
  );
}

function AttBadge({ color, label }) {
  const colorMap = {
    green:  'bg-green-50 text-green-700',
    orange: 'bg-orange-50 text-orange-700',
    red:    'bg-red-50 text-red-700',
    yellow: 'bg-yellow-50 text-yellow-700',
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${colorMap[color]}`}>
      {label}
    </span>
  );
}
