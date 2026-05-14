import { useState } from 'react';
import { Plus, Check, FileText } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import EmptyState from '../../components/EmptyState';
import ClassFormModal from './ClassFormModal';
import { today, isToday, isThisWeek, formatDateShort } from '../../utils/date';
import { classTypeColors } from '../../utils/format';

const FILTERS = [
  { id: 'today', label: '오늘' },
  { id: 'week',  label: '이번 주' },
  { id: 'all',   label: '전체' },
];

export default function ClassesPage() {
  const { classes, students, attendanceRecords, lessonRecords, navigateToClass } = useAcademyStore();
  const [filter, setFilter] = useState('today');
  const [showForm, setShowForm] = useState(false);

  const todayStr = today();

  const filtered = classes
    .filter((c) => {
      if (filter === 'today') return isToday(c.date);
      if (filter === 'week')  return isThisWeek(c.date);
      return true;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    });

  const isAttendanceDone = (cls) =>
    cls.studentIds.every((sid) =>
      attendanceRecords.some(
        (a) => a.classId === cls.id && a.studentId === sid && a.date === cls.date
      )
    );

  const isNoteDone = (cls) =>
    cls.studentIds.every((sid) =>
      lessonRecords.some(
        (lr) => lr.classId === cls.id && lr.studentId === sid && lr.date === cls.date
      )
    );

  const emptyMessages = {
    today: { title: '오늘 수업이 없어요', desc: '정기 과외를 등록하면 자동으로 일정이 채워져요' },
    week:  { title: '이번 주 수업이 없어요', desc: '정기 과외를 등록해보세요' },
    all:   { title: '등록된 수업이 없어요', desc: '학생을 등록하고 정기 과외를 시작해보세요' },
  };

  return (
    <div>
      <Header
        title="수업"
        right={
          <button
            onClick={() => setShowForm(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white"
          >
            <Plus size={18} />
          </button>
        }
      />

      <div className="pt-14">
        {/* Filter tabs */}
        <div className="flex gap-2 px-4 pt-4 pb-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === f.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Class list */}
        <div className="px-4 py-2 flex flex-col gap-3">
          {filtered.length === 0 ? (
            <EmptyState
              icon="📅"
              title={emptyMessages[filter].title}
              description={emptyMessages[filter].desc}
              action={
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl"
                >
                  정기 과외 등록하기
                </button>
              }
            />
          ) : (
            filtered.map((cls) => {
              const clsStudents = students.filter((s) => cls.studentIds.includes(s.id));
              const attendanceDone = isAttendanceDone(cls);
              const noteDone = isNoteDone(cls);
              const isPastOrToday = cls.date <= todayStr;

              return (
                <button
                  key={cls.id}
                  onClick={() => navigateToClass(cls.id)}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left active:scale-95 transition-transform"
                >
                  {filter !== 'today' && (
                    <p className="text-xs text-gray-400 mb-1.5">{formatDateShort(cls.date)}</p>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-gray-900 text-sm flex-1">{cls.name}</span>
                    {cls.subject && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        {cls.subject}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    {cls.startTime} – {cls.endTime}
                    {cls.location ? ` · ${cls.location}` : ''}
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    {clsStudents.map((s) => s.name).join(', ')}
                  </p>
                  {isPastOrToday ? (
                    <div className="flex gap-2">
                      <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${
                        attendanceDone ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                      }`}>
                        <Check size={11} />
                        출결 {attendanceDone ? '완료' : '미완료'}
                      </span>
                      <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${
                        noteDone ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        <FileText size={11} />
                        기록 {noteDone ? '완료' : '미작성'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">예정된 수업</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {showForm && <ClassFormModal onClose={() => setShowForm(false)} />}
    </div>
  );
}
