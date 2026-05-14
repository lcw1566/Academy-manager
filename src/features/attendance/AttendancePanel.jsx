import useAcademyStore from '../../store/useAcademyStore';
import { attendanceStatusMap } from '../../utils/format';

const STATUSES = [
  { id: 'present', label: '출석' },
  { id: 'late',    label: '지각' },
  { id: 'absent',  label: '결석' },
  { id: 'makeup',  label: '보강필요' },
];

export default function AttendancePanel({ cls }) {
  const { students, attendanceRecords, updateAttendance } = useAcademyStore();
  const clsStudents = students.filter((s) => cls.studentIds.includes(s.id));

  const getStatus = (studentId) => {
    const rec = attendanceRecords.find(
      (a) => a.classId === cls.id && a.studentId === studentId && a.date === cls.date
    );
    return rec?.status || null;
  };

  return (
    <div className="flex flex-col gap-4">
      {clsStudents.map((student) => {
        const current = getStatus(student.id);
        return (
          <div key={student.id} className="bg-gray-50 rounded-2xl p-4">
            <p className="font-semibold text-gray-900 text-sm mb-3">{student.name}</p>
            <div className="grid grid-cols-4 gap-2">
              {STATUSES.map(({ id, label }) => {
                const isActive = current === id;
                const meta = attendanceStatusMap[id];
                return (
                  <button
                    key={id}
                    onClick={() => updateAttendance(cls.id, student.id, cls.date, id)}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                      isActive
                        ? `${meta.activeBg} ${meta.activeText} shadow-sm`
                        : `${meta.bg} ${meta.color} border border-transparent`
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
