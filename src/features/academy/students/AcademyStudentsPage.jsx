import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, ChevronRight, Phone, Loader2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { currentUserCan } from '../../../utils/staffPermissions';
import Header from '../../../components/Header';
import EmptyState from '../../../components/EmptyState';
import AcademyStudentFormModal from './AcademyStudentFormModal';
import { getSchoolTagStyle } from '../../../utils/schoolTags';
import { getStudentStatusMeta, STUDENT_STATUS_OPTIONS } from '../../../utils/studentStatus';
import { toTelHref } from '../../../utils/format';
import { getMissingStudentInformation } from '../../../utils/studentCompleteness';

export default function AcademyStudentsPage() {
  const { role, academyStudents, classGroups, clinicTasks, navigateToAcademyStudent } = useAcademyStore();
  const authUserId = useAuthStore((s) => s.user?.id);
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const isStudentsLoading = useWorkspaceStore((s) => s.isServerStudentsLoading);
  const studentsError = useWorkspaceStore((s) => s.serverStudentsError);
  const loadServerStudents = useWorkspaceStore((s) => s.loadServerStudents);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);

  const myStaffProfile = academyStaffProfiles.find((profile) => profile.user_id === authUserId) || null;
  const canManageStudents = role === 'owner' || currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canManageStudents',
  );

  // 앱 진입 시 다른 데이터보다 학생 조회가 늦어져 빈 상태가 먼저 굳는 일을 막는다.
  // 탭이 열릴 때 현재 학원 기준으로 한 번 더 동기화하며 store가 academyId를 검증한다.
  useEffect(() => {
    if (!currentAcademyId) return;
    void loadServerStudents();
  }, [currentAcademyId, loadServerStudents]);

  const schoolOptions = useMemo(
    () => [...new Set(academyStudents.map((student) => student.school).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ko')),
    [academyStudents],
  );
  const gradeOptions = useMemo(
    () => [...new Set(academyStudents.map((student) => student.grade).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })),
    [academyStudents],
  );
  const hasActiveFilter = !!search.trim()
    || statusFilter !== 'all'
    || schoolFilter !== 'all'
    || gradeFilter !== 'all';

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return academyStudents.filter((student) => {
      if (
        query
        && !String(student.name || '').toLowerCase().includes(query)
        && !String(student.school || '').toLowerCase().includes(query)
      ) return false;
      if (statusFilter !== 'all' && (student.status || 'active') !== statusFilter) return false;
      if (schoolFilter !== 'all' && student.school !== schoolFilter) return false;
      if (gradeFilter !== 'all' && student.grade !== gradeFilter) return false;
      return true;
    });
  }, [academyStudents, search, statusFilter, schoolFilter, gradeFilter]);

  const getStudentGroups = (studentId) =>
    classGroups.filter((g) => g.studentIds?.includes(studentId));

  const getPendingClinics = (studentId) =>
    clinicTasks.filter((t) => t.studentId === studentId && t.status !== 'completed').length;

  return (
    <div>
      <Header
        title="학생"
        right={
          canManageStudents ? (
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowForm(true)}
              className="h-9 w-9 md:w-auto md:px-4 flex items-center justify-center gap-1.5 rounded-xl bg-[#0064FF] text-white text-sm font-bold shadow-sm active:bg-[#0050CC]">
              <Plus size={14} />
              <span className="hidden md:inline">학생 추가</span>
            </motion.button>
          ) : null
        }
      />

      <div className="pt-14 md:pt-0 pb-6">
        {/* 검색 */}
        <div className="px-4 pt-4 mb-3">
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

        {academyStudents.length > 0 && (
          <div className="mb-4 px-4">
            <div
              className="flex gap-2 overflow-x-auto pb-2"
              style={{ scrollbarWidth: 'none' }}
              aria-label="재원 상태 필터"
            >
              {[{ value: 'all', label: '전체' }, ...STUDENT_STATUS_OPTIONS].map((option) => (
                <motion.button
                  key={option.value}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  aria-pressed={statusFilter === option.value}
                  onClick={() => setStatusFilter(option.value)}
                  className={`flex-shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                    statusFilter === option.value
                      ? 'border-[#0064FF] bg-[#0064FF] text-white'
                      : 'border-[#E5E8EB] bg-white text-[#6B7684]'
                  }`}
                >
                  {option.label}
                </motion.button>
              ))}
            </div>
            {(schoolOptions.length > 0 || gradeOptions.length > 0) && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={schoolFilter}
                  onChange={(event) => setSchoolFilter(event.target.value)}
                  aria-label="학교 필터"
                  className="h-10 min-w-0 rounded-xl border border-[#E5E8EB] bg-white px-3 text-xs font-bold text-[#4E5968] outline-none"
                >
                  <option value="all">학교 전체</option>
                  {schoolOptions.map((school) => (
                    <option key={school} value={school}>{school}</option>
                  ))}
                </select>
                <select
                  value={gradeFilter}
                  onChange={(event) => setGradeFilter(event.target.value)}
                  aria-label="학년 필터"
                  className="h-10 min-w-0 rounded-xl border border-[#E5E8EB] bg-white px-3 text-xs font-bold text-[#4E5968] outline-none"
                >
                  <option value="all">학년 전체</option>
                  {gradeOptions.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* 학생 수 */}
        {academyStudents.length > 0 && (
          <div className="px-4 mb-3">
            <p className="text-xs text-gray-400">
              {hasActiveFilter ? `${filtered.length}명 · 전체 ${academyStudents.length}명` : `총 ${academyStudents.length}명`}
            </p>
          </div>
        )}

        {studentsError && (
          <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3">
            <p className="min-w-0 text-xs font-semibold leading-5 text-red-700">
              학생 목록을 불러오지 못했어요.
            </p>
            <button
              type="button"
              onClick={() => void loadServerStudents()}
              disabled={isStudentsLoading}
              className="flex flex-shrink-0 items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-50"
            >
              <RefreshCw size={13} className={isStudentsLoading ? 'animate-spin' : ''} />
              다시 시도
            </button>
          </div>
        )}

        {isStudentsLoading && academyStudents.length === 0 ? (
          <div className="mx-4 flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-12 text-sm font-semibold text-[#8B95A1] shadow-sm">
            <Loader2 size={17} className="animate-spin text-blue-500" />
            학생 목록을 불러오는 중이에요
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="👤"
            title={academyStudents.length === 0 ? '학생이 없어요' : '조건에 맞는 학생이 없어요'}
            description={academyStudents.length === 0 && canManageStudents ? '학생을 등록하고 반에 배정해요.' : ''}
            action={
              academyStudents.length === 0 && canManageStudents ? (
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
              const statusMeta = getStudentStatusMeta(student.status);
              const callNumber = student.phone || student.parentPhone || '';
              const missingInformation = getMissingStudentInformation(student);
              return (
                <motion.div
                  key={student.id}
                  whileTap={{ scale: 0.97 }}
                  className="flex w-full items-center overflow-hidden rounded-2xl bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => navigateToAcademyStudent(student.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 pr-2 text-left md:px-4"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50">
                      <span className="font-bold text-blue-600">{(student.name || '?')[0]}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-bold text-gray-900">{student.name}</p>
                        {missingInformation.length > 0 && (
                          <span
                            className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500 ring-4 ring-red-50"
                            title={`${missingInformation.map((item) => item.label).join(', ')} 확인 필요`}
                            aria-label={`${missingInformation.map((item) => item.label).join(', ')} 확인 필요`}
                          />
                        )}
                      </div>
                      {groups.length > 0 && (
                        <p className="mt-0.5 hidden min-w-0 truncate text-xs font-medium text-blue-600 sm:block">
                          {groups.map((g) => g.name).join(', ')}
                        </p>
                      )}
                      {pendingCount > 0 && (
                        <span className="hidden flex-shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-600 md:inline">
                          클리닉 {pendingCount}
                        </span>
                      )}
                    </div>
                    <div className="ml-auto flex min-w-0 flex-shrink items-center justify-end gap-2">
                      {(student.school || student.grade) && (
                        <div className="flex min-w-0 items-center justify-end gap-1.5">
                          {student.school && (
                            <span
                              className="max-w-20 truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold sm:max-w-32 sm:px-2 sm:text-[11px] lg:max-w-48"
                              style={getSchoolTagStyle(student.school)}
                            >
                              {student.school}
                            </span>
                          )}
                          {student.grade && (
                            <span className="flex-shrink-0 text-[10px] font-semibold text-gray-500 sm:text-xs">
                              {student.grade}
                            </span>
                          )}
                        </div>
                      )}
                      <span className={`flex-shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold md:px-2.5 md:text-[11px] ${statusMeta.badgeClassName}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                    <ChevronRight size={16} className="hidden text-gray-300 flex-shrink-0 md:block" />
                  </button>
                  {callNumber && (
                    <a
                      href={toTelHref(callNumber)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`${student.name} ${student.phone ? '학생' : '학부모'} 연락처로 전화`}
                      className="mr-3 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 active:scale-95 md:hidden"
                    >
                      <Phone size={17} />
                    </a>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && <AcademyStudentFormModal onClose={() => setShowForm(false)} />}
    </div>
  );
}
