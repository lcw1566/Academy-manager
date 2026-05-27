import { useState, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import EmptyState from '../../components/EmptyState';
import StudentFormModal from './StudentFormModal';
import ClassFormModal from '../classes/ClassFormModal';
import { paymentStatusMap } from '../../utils/format';
import { getCurrentMonth } from '../../utils/date';

const SCHOOL_TYPE_COLORS = {
  elementary: 'bg-green-50 text-green-700 border-green-200',
  middle:     'bg-blue-50 text-blue-700 border-blue-200',
  high:       'bg-purple-50 text-purple-700 border-purple-200',
};

const SCHOOL_TYPE_TAG_COLORS = {
  elementary: 'bg-green-50 text-green-700',
  middle:     'bg-blue-50 text-blue-700',
  high:       'bg-purple-50 text-purple-700',
};

export default function StudentsPage() {
  const { students, payments, navigateToStudent } = useAcademyStore();
  const [search, setSearch] = useState('');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showClassForm, setShowClassForm] = useState(false);

  const currentMonth = getCurrentMonth();

  // Unique school list from students
  const schoolList = useMemo(() => {
    const map = {};
    students.forEach((s) => {
      const name = s.schoolName || s.school;
      if (!name) return;
      if (!map[name]) map[name] = { name, type: s.schoolType };
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const filtered = students.filter((s) => {
    const school = s.schoolName || s.school;
    if (selectedSchool && school !== selectedSchool) return false;
    if (!search) return true;
    return (
      s.name.includes(search) ||
      school?.includes(search) ||
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

      <div className="pt-14 md:pt-0">
        {/* 검색 */}
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

        {/* 학교 필터 */}
        {schoolList.length > 0 && (
          <div className="px-4 pb-2">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setSelectedSchool('')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  !selectedSchool
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-500 border-gray-200'
                }`}
              >
                전체
              </button>
              {schoolList.map(({ name, type }) => {
                const isSelected = selectedSchool === name;
                const colorClass = SCHOOL_TYPE_COLORS[type] || 'bg-gray-50 text-gray-600 border-gray-200';
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedSchool(isSelected ? '' : name)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      isSelected
                        ? colorClass
                        : `bg-white text-gray-500 border-gray-200`
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 학생 수 */}
        <div className="px-4 py-1">
          <p className="text-xs text-gray-400">
            {selectedSchool ? `${selectedSchool} · ` : ''}총 {filtered.length}명
          </p>
        </div>

        {/* 학생 목록 */}
        <div className="px-4 flex flex-col gap-2 pb-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon="👨‍🎓"
              title={selectedSchool ? '해당 학교 학생이 없어요' : search ? '검색 결과가 없어요' : '학생이 없어요'}
              description={selectedSchool ? '다른 학교를 선택해보세요' : search ? '검색어를 바꿔보세요' : '새 학생을 추가해보세요'}
              action={
                !search && !selectedSchool && (
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
              const schoolName = student.schoolName || student.school;
              const schoolTagColor = SCHOOL_TYPE_TAG_COLORS[student.schoolType] || 'bg-gray-100 text-gray-600';

              return (
                <button
                  key={student.id}
                  onClick={() => navigateToStudent(student.id)}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left active:scale-[0.97] transition-transform"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-base">{student.name}</span>
                      {payMeta && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${payMeta.bg} ${payMeta.color}`}>
                          {payMeta.label}
                        </span>
                      )}
                    </div>
                    {student.grade && (
                      <span className="text-xs text-gray-400">{student.grade}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {schoolName && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${schoolTagColor}`}>
                        {schoolName}
                      </span>
                    )}
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
