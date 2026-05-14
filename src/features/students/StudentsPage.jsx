import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import EmptyState from '../../components/EmptyState';
import StudentFormModal from './StudentFormModal';
import ClassFormModal from '../classes/ClassFormModal';
import { paymentStatusMap } from '../../utils/format';
import { getCurrentMonth } from '../../utils/date';

export default function StudentsPage() {
  const { students, payments, navigateToStudent } = useAcademyStore();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showClassForm, setShowClassForm] = useState(false);

  const currentMonth = getCurrentMonth();

  const filtered = students.filter((s) => {
    if (!search) return true;
    return (
      s.name.includes(search) ||
      s.schoolName?.includes(search) ||
      s.school?.includes(search) ||
      s.grade?.includes(search) ||
      s.subjects?.some((sub) => sub.includes(search))
    );
  });

  const getPaymentStatus = (studentId) => {
    const p = payments.find((pay) => pay.studentId === studentId && pay.month === currentMonth);
    return p?.status || null;
  };

  return (
    <div>
      <Header
        title="학생"
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
        {/* Search */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
            <Search size={16} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 학교, 과목 검색"
              className="flex-1 text-sm focus:outline-none text-gray-700 placeholder-gray-400"
            />
          </div>
        </div>

        {/* Count */}
        <div className="px-4 py-2">
          <p className="text-xs text-gray-400">총 {filtered.length}명</p>
        </div>

        {/* Student list */}
        <div className="px-4 flex flex-col gap-2 pb-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon="👨‍🎓"
              title={search ? '검색 결과가 없어요' : '학생이 없어요'}
              description={search ? '검색어를 바꿔보세요' : '새 학생을 추가해보세요'}
              action={
                !search && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl"
                  >
                    학생 추가하기
                  </button>
                )
              }
            />
          ) : (
            filtered.map((student) => {
              const payStatus = getPaymentStatus(student.id);
              const payMeta = payStatus ? paymentStatusMap[payStatus] : null;
              const schoolLabel = [student.schoolName || student.school, student.grade].filter(Boolean).join(' ');

              return (
                <button
                  key={student.id}
                  onClick={() => navigateToStudent(student.id)}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left active:scale-95 transition-transform"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-base">{student.name}</span>
                      {payMeta && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${payMeta.bg} ${payMeta.color}`}>
                          {payMeta.label}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{student.grade}</span>
                  </div>
                  {schoolLabel && <p className="text-xs text-gray-500">{schoolLabel}</p>}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {student.subjects?.map((sub) => (
                      <span key={sub} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                        {sub}
                      </span>
                    ))}
                    {student.tags?.map((tag) => (
                      <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {showForm && (
        <StudentFormModal
          onClose={() => setShowForm(false)}
          onAddClass={() => {
            setShowForm(false);
            setShowClassForm(true);
          }}
        />
      )}
      {showClassForm && <ClassFormModal onClose={() => setShowClassForm(false)} />}
    </div>
  );
}
