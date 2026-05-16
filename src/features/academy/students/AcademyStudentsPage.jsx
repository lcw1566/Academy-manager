import { useState, useMemo } from 'react';
import { Plus, Search, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';
import EmptyState from '../../../components/EmptyState';
import AcademyStudentFormModal from './AcademyStudentFormModal';

export default function AcademyStudentsPage() {
  const { role, academyStudents, classGroups, clinicTasks, navigateToAcademyStudent } = useAcademyStore();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const isOwner = role === 'owner';

  const filtered = useMemo(() =>
    academyStudents.filter((s) => !search || s.name.includes(search) || s.school?.includes(search)),
    [academyStudents, search]
  );

  const getStudentGroups = (studentId) =>
    classGroups.filter((g) => g.studentIds?.includes(studentId));

  const getPendingClinics = (studentId) =>
    clinicTasks.filter((t) => t.studentId === studentId && t.status !== 'completed').length;

  return (
    <div>
      <Header
        title="학생"
        right={
          isOwner ? (
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowForm(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white">
              <Plus size={18} />
            </motion.button>
          ) : null
        }
      />

      <div className="pt-14 pb-6">
        {/* 검색 */}
        <div className="px-4 pt-4 mb-4">
          <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-sm">
            <Search size={16} className="text-gray-400 flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름 또는 학교 검색"
              className="flex-1 text-sm focus:outline-none text-gray-700 bg-transparent"
            />
          </div>
        </div>

        {/* 학생 수 */}
        {academyStudents.length > 0 && (
          <div className="px-4 mb-3">
            <p className="text-xs text-gray-400">총 {academyStudents.length}명</p>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon="👤"
            title={academyStudents.length === 0 ? '학생이 없어요' : '검색 결과가 없어요'}
            description={academyStudents.length === 0 && isOwner ? '학생을 등록하고 반에 배정해요.' : ''}
            action={
              academyStudents.length === 0 && isOwner ? (
                <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl">
                  학생 등록
                </button>
              ) : null
            }
          />
        ) : (
          <div className="px-4 flex flex-col gap-2">
            {filtered.map((student) => {
              const groups = getStudentGroups(student.id);
              const pendingCount = getPendingClinics(student.id);
              return (
                <motion.button
                  key={student.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigateToAcademyStudent(student.id)}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <span className="font-bold text-blue-600">{student.name[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900">{student.name}</p>
                        {student.grade && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{student.grade}</span>
                        )}
                        {pendingCount > 0 && (
                          <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                            클리닉 {pendingCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {student.school && <p className="text-xs text-gray-400">{student.school}</p>}
                        {groups.length > 0 && (
                          <p className="text-xs text-blue-600 font-medium">{groups.map((g) => g.name).join(', ')}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {showForm && <AcademyStudentFormModal onClose={() => setShowForm(false)} />}
    </div>
  );
}
