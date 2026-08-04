import { useMemo, useState } from 'react';
import { Plus, ChevronRight, Users, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import Header from '../../../components/Header';
import EmptyState from '../../../components/EmptyState';
import AcademyScheduleCalendar from '../calendar/AcademyScheduleCalendar';
import {
  ListSearchFilterBar,
  ListFilterChips,
  ListFilterSelect,
  ListFilterSelectGrid,
} from '../../../components/filters/ListFilters';
import ClassGroupFormModal from './ClassGroupFormModal';
import { today, addDaysYMD, formatDateShort } from '../../../utils/date';
import { getTeacherDisplayName, OWNER_TEACHER_ID } from '../../../utils/format';
import { currentUserCan } from '../../../utils/staffPermissions';
import { getRoomTagClassName } from '../../../utils/roomTags';
import {
  CLASS_ACTIVITY_TYPES,
  getActivityLabel,
} from '../../../constants/learningActivitySettings';
// Phase 44.6 / Phase B — 룰 기반 예정 세션 머지.
import {
  buildPlannedClassSessions,
  mergePlannedAndActualClassSessions,
  plannedToClassSessionShape,
} from '../../../utils/schedule';

const STATUS_MAP = {
  active:   { label: '운영 중', color: 'bg-green-50 text-green-700' },
  inactive: { label: '종료',   color: 'bg-gray-100 text-gray-500' },
  pending:  { label: '대기',   color: 'bg-yellow-50 text-yellow-700' },
};

export default function ClassGroupsPage() {
  const {
    role, classGroups, classSessions, academyStudents, academyTeachers,
    academyAssistants = [], academyManagers = [], academyProfile,
    navigateToClassGroup,
  } = useAcademyStore();

  const [showForm, setShowForm] = useState(false);
  const todayStr = today();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Phase 30 — canManageClasses 권한이 있으면 owner 가 아닌 staff 도 + 버튼 노출.
  // owner 는 항상 true. teacher/assistant 는 default false 이지만 owner 가 명시적으로
  // 토글하면 활성화된다.
  const authUserId = useAuthStore((s) => s.user?.id);
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((sp) => sp.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );
  const canManage = currentUserCan({ role, staffProfile: myStaffProfile }, 'canManageClasses');
  const instructors = useMemo(
    () => [...academyTeachers, ...academyManagers, ...academyAssistants],
    [academyTeachers, academyManagers, academyAssistants],
  );
  const myInstructorIds = useMemo(
    () => new Set(
      instructors
        .filter((staff) => staff.serverUserId && staff.serverUserId === authUserId)
        .map((staff) => staff.id),
    ),
    [instructors, authUserId],
  );

  // Phase 44.6 / Phase B — 룰 기반 planned + 기존 classSessions 머지로 nextSession 산출.
  const classScheduleRules = useWorkspaceStore((s) => s.classScheduleRules) ?? [];
  const classSessionExceptions = useWorkspaceStore((s) => s.classSessionExceptions) ?? [];
  const mergedClassSessions = useMemo(() => {
    const from = [addDaysYMD(todayStr, -31), addDaysYMD(selectedDate, -45)].sort()[0];
    const toCandidates = [addDaysYMD(todayStr, 90), addDaysYMD(selectedDate, 75)].sort();
    const to = toCandidates[toCandidates.length - 1];
    const plannedRaw = buildPlannedClassSessions({
      rules: classScheduleRules,
      exceptions: classSessionExceptions,
      fromDate: from,
      toDate: to,
    });
    const plannedShaped = plannedToClassSessionShape(plannedRaw, classGroups);
    return mergePlannedAndActualClassSessions(plannedShaped, classSessions);
  }, [classSessions, classScheduleRules, classSessionExceptions, classGroups, todayStr, selectedDate]);

  const enriched = useMemo(() =>
    classGroups
    .filter((group) => {
      if (canManage) return true;
      if (group.teacherUserId && authUserId && group.teacherUserId === authUserId) return true;
      if (authUserId && (group.assistantUserIds || []).includes(authUserId)) return true;
      if ((group.assistantIds || []).some((id) => myInstructorIds.has(id))) return true;
      return myInstructorIds.has(group.teacherId);
    })
    .map((group) => {
      const sessions = mergedClassSessions.filter((s) => s.classGroupId === group.id);
      const nextSession = sessions.filter((s) => s.date >= todayStr && s.status !== 'canceled')
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
      const studentCount = (group.studentIds || []).length;
      const teacherName = (group.teacherId || group.teacherUserId)
        ? getTeacherDisplayName(group.teacherId, instructors, academyProfile, group.teacherUserId)
        : null;
      const studentNames = (group.studentIds || [])
        .map((studentId) => academyStudents.find((student) => student.id === studentId)?.name)
        .filter(Boolean);
      return { ...group, sessions, nextSession, studentCount, teacherName, studentNames };
    }).sort((a, b) => {
      const ad = a.nextSession?.date || '9999';
      const bd = b.nextSession?.date || '9999';
      return ad.localeCompare(bd);
    }),
    [classGroups, mergedClassSessions, instructors, academyProfile, academyStudents, todayStr, canManage, authUserId, myInstructorIds]
  );
  const filterOptions = useMemo(() => ({
    subjects: [...new Set(enriched.map((group) => group.subject).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ko')),
    levels: [...new Set(enriched.map((group) => group.level).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })),
    teachers: [...new Set(enriched.map((group) => group.teacherName).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ko')),
  }), [enriched]);
  const activeFilterCount = [subjectFilter, levelFilter, teacherFilter]
    .filter((value) => value !== 'all').length + (statusFilter !== 'all' ? 1 : 0);
  const filteredGroups = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return enriched.filter((group) => {
      const searchText = [
        group.name,
        group.subject,
        group.level,
        group.teacherName,
        group.room,
        ...(group.studentNames || []),
      ].filter(Boolean).join(' ').toLowerCase();
      return (!keyword || searchText.includes(keyword))
        && (subjectFilter === 'all' || group.subject === subjectFilter)
        && (levelFilter === 'all' || group.level === levelFilter)
        && (teacherFilter === 'all' || group.teacherName === teacherFilter)
        && (statusFilter === 'all' || (group.status || 'active') === statusFilter);
    });
  }, [enriched, search, subjectFilter, levelFilter, teacherFilter, statusFilter]);
  const resetFilters = () => {
    setSubjectFilter('all');
    setLevelFilter('all');
    setTeacherFilter('all');
    setStatusFilter('all');
  };
  const calendarSchedules = useMemo(() => {
    const visibleGroupIds = new Set(filteredGroups.map((group) => group.id));
    return mergedClassSessions
      .filter((session) => (
        session.status !== 'canceled'
        && visibleGroupIds.has(session.classGroupId)
      ))
      .map((session) => {
        const group = filteredGroups.find((item) => item.id === session.classGroupId);
        return {
          id: session.id,
          classGroupId: session.classGroupId,
          classGroupServerId: group?.serverId || group?.id,
          date: session.date,
          type: 'class',
          startTime: session.startTime,
          endTime: session.endTime,
          title: group?.name || '수업',
          subtitle: [
            session.room || group?.room,
            `${session.studentIds?.length || 0}명`,
          ].filter(Boolean).join(' · '),
          badge: session.sessionKind === 'makeup' ? '보강' : '',
          onClick: () => navigateToClassGroup(session.classGroupId),
        };
      });
  }, [mergedClassSessions, filteredGroups, navigateToClassGroup]);

  return (
    <div>
      <Header
        title="수업"
        right={
          canManage ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowForm(true)}
              className="h-9 w-9 md:w-auto md:px-4 flex items-center justify-center gap-1.5 rounded-xl bg-[#0064FF] text-white text-sm font-bold shadow-sm active:bg-[#0050CC]"
            >
              <Plus size={14} />
              <span className="hidden md:inline">수업 추가</span>
            </motion.button>
          ) : null
        }
      />

      <div className="pt-14 md:pt-0 pb-6">
        <div className="px-4 pt-4 mb-4">
          <ListSearchFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            placeholder="반·학생·선생님 검색"
            filterCount={activeFilterCount}
            filtersOpen={filtersOpen}
            onToggleFilters={() => setFiltersOpen((open) => !open)}
            onResetFilters={resetFilters}
            resultText={`${filteredGroups.length}개 반`}
          >
            <ListFilterChips
              value={statusFilter}
              onChange={setStatusFilter}
              ariaLabel="수업 상태 필터"
              options={[
                { value: 'all', label: '전체' },
                { value: 'active', label: '운영 중' },
                { value: 'pending', label: '대기' },
                { value: 'inactive', label: '종료' },
              ]}
            />
            <ListFilterSelectGrid columns={3}>
              <ListFilterSelect
                value={subjectFilter}
                onChange={setSubjectFilter}
                ariaLabel="과목 필터"
                options={[
                  { value: 'all', label: '과목 전체' },
                  ...filterOptions.subjects.map((value) => ({ value, label: value })),
                ]}
              />
              <ListFilterSelect
                value={levelFilter}
                onChange={setLevelFilter}
                ariaLabel="학년 또는 레벨 필터"
                options={[
                  { value: 'all', label: '학년/레벨 전체' },
                  ...filterOptions.levels.map((value) => ({ value, label: value })),
                ]}
              />
              <ListFilterSelect
                value={teacherFilter}
                onChange={setTeacherFilter}
                ariaLabel="담당 선생님 필터"
                options={[
                  { value: 'all', label: '선생님 전체' },
                  ...filterOptions.teachers.map((value) => ({ value, label: value })),
                ]}
                className="col-span-2 md:col-span-1"
              />
            </ListFilterSelectGrid>
          </ListSearchFilterBar>
        </div>

        <div className="mb-4">
          <AcademyScheduleCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            schedules={calendarSchedules}
            title="전체 수업 일정"
            emptyText="수업 일정이 없어요"
          />
        </div>

        {enriched.length === 0 ? (
          <EmptyState
            icon="📚"
            title="아직 반이 없어요"
            description={canManage ? '반을 만들고 학생과 강사를 배정해요.' : '원장이 반을 생성하면 여기 표시됩니다.'}
            action={
              canManage ? (
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl"
                >
                  반 만들기
                </button>
              ) : null
            }
          />
        ) : filteredGroups.length === 0 ? (
          <div className="mx-4 rounded-2xl bg-white px-5 py-10 text-center shadow-sm">
            <p className="text-sm font-bold text-[#333D4B]">조건에 맞는 반이 없어요.</p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                resetFilters();
              }}
              className="mt-3 rounded-xl bg-[#F2F4F6] px-4 py-2 text-xs font-bold text-[#4E5968]"
            >
              검색·필터 초기화
            </button>
          </div>
        ) : (
          <div className="px-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredGroups.map((group) => {
              const statusInfo = STATUS_MAP[group.status] || STATUS_MAP.active;
              const activityLabel = getActivityLabel(
                CLASS_ACTIVITY_TYPES,
                group.activityType || 'regular_class',
                group.activityName,
              );
              return (
                <motion.div
                  key={group.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigateToClassGroup(group.id)}
                  className="flex min-h-[142px] cursor-pointer select-none flex-col rounded-2xl bg-white p-3 shadow-sm transition-shadow hover:shadow-md md:min-h-[150px]"
                >
                  <div className="mb-2 flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 md:text-[11px]">
                      {group.subject || '과목'}
                    </span>
                    {group.activityType && group.activityType !== 'regular_class' && (
                      <span className="hidden truncate rounded-lg bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-600 sm:inline-flex">
                        {activityLabel}
                      </span>
                    )}
                    <span className={`ml-auto flex-shrink-0 rounded-lg px-1.5 py-1 text-[9px] font-bold md:text-[10px] ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  <p className="truncate text-sm font-extrabold leading-snug text-[#191F28] md:text-base">
                    {group.name}
                  </p>
                  {group.level && <p className="mt-0.5 truncate text-[11px] font-semibold text-[#8B95A1]">{group.level}</p>}

                  <div className="mt-2 flex min-w-0 items-center gap-2 text-[11px] font-medium text-[#6B7684]">
                    <span className="flex flex-shrink-0 items-center gap-1">
                      <Users size={11} /> {group.studentCount}명
                    </span>
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      <Clock size={11} className="flex-shrink-0" />
                      <span className="truncate">
                        {group.weekdays?.join('·') || '요일 미정'}요일{' '}
                        {group.weekdayTimes && Object.keys(group.weekdayTimes).length > 0
                          ? '요일별 시간'
                          : group.startTime || ''}
                      </span>
                    </span>
                  </div>

                  <div className="mt-auto flex min-w-0 items-center gap-1.5 border-t border-[#F2F4F6] pt-2">
                    {group.room && (
                      <span className={`inline-flex max-w-[38%] truncate rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${getRoomTagClassName(group.room)}`}>
                        {group.room}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-[#8B95A1]">
                      {group.nextSession
                        ? `${formatDateShort(group.nextSession.date)} · ${group.teacherName || '담당 미정'}`
                        : group.teacherName || '다음 수업 미정'}
                    </span>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <ClassGroupFormModal onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}
