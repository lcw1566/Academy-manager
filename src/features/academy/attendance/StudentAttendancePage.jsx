import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LogIn,
  LogOut,
  QrCode,
  Users,
} from 'lucide-react';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import WeeklyExpandableCalendar from '../../../components/calendar/WeeklyExpandableCalendar';
import { ListSearchField, ListFilterChips } from '../../../components/filters/ListFilters';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { formatDateShort } from '../../../utils/date';
import { currentUserCan } from '../../../utils/staffPermissions';
import { getRoomTagClassName } from '../../../utils/roomTags';
import {
  buildPlannedClassSessions,
  mergePlannedAndActualClassSessions,
  plannedToClassSessionShape,
} from '../../../utils/schedule';
import {
  getAcademyYmd,
  getStudentDayCheckState,
  openQrDisplayWindow,
  readAttendanceSettings,
} from './attendanceHelpers';

const VIEW_FILTERS = [
  { id: 'expected', label: '예정·기록' },
  { id: 'inside', label: '학원에 있음' },
  { id: 'left', label: '하원' },
  { id: 'all', label: '전체 학생' },
];

function formatEventTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getPresenceMeta(state) {
  if (!state.latest) {
    return {
      label: '등원 전',
      detail: '아직 기록이 없어요',
      badge: 'bg-gray-100 text-gray-500',
      icon: Clock3,
    };
  }
  if (state.isInside) {
    return {
      label: '학원에 있어요',
      detail: `${formatEventTime(state.latest.event_time)} 등원`,
      badge: 'bg-emerald-50 text-emerald-700',
      icon: LogIn,
    };
  }
  return {
    label: '하원',
    detail: `${formatEventTime(state.latest.event_time)} 하원`,
    badge: 'bg-blue-50 text-blue-700',
    icon: LogOut,
  };
}

export default function StudentAttendancePage() {
  const role = useAcademyStore((state) => state.role);
  const academyStudents = useAcademyStore((state) => state.academyStudents) ?? [];
  const academyTeachers = useAcademyStore((state) => state.academyTeachers) ?? [];
  const classGroups = useAcademyStore((state) => state.classGroups) ?? [];
  const classSessions = useAcademyStore((state) => state.classSessions) ?? [];
  const navigateToClassSession = useAcademyStore((state) => state.navigateToClassSession);
  const showToast = useAcademyStore((state) => state.showToast);

  const authUserId = useAuthStore((state) => state.user?.id);
  const currentAcademyId = useWorkspaceStore((state) => state.currentAcademyId);
  const memberships = useWorkspaceStore((state) => state.memberships) ?? [];
  const academyStaffProfiles = useWorkspaceStore((state) => state.academyStaffProfiles) ?? [];
  const classScheduleRules = useWorkspaceStore((state) => state.classScheduleRules) ?? [];
  const classSessionExceptions = useWorkspaceStore((state) => state.classSessionExceptions) ?? [];
  const studentCheckEvents = useWorkspaceStore((state) => state.studentCheckEvents) ?? [];
  const isEventsLoading = useWorkspaceStore((state) => state.isStudentCheckEventsLoading);
  const isStudentsLoading = useWorkspaceStore((state) => state.isServerStudentsLoading);
  const isClassGroupsLoading = useWorkspaceStore((state) => state.isServerClassGroupsLoading);
  const isClassSessionsLoading = useWorkspaceStore((state) => state.isServerClassSessionsLoading);
  const eventsError = useWorkspaceStore((state) => state.studentCheckEventsError);
  const studentsError = useWorkspaceStore((state) => state.serverStudentsError);
  const classGroupsError = useWorkspaceStore((state) => state.serverClassGroupsError);
  const classSessionsError = useWorkspaceStore((state) => state.serverClassSessionsError);
  const loadStudentCheckEvents = useWorkspaceStore((state) => state.loadStudentCheckEvents);
  const loadServerStudents = useWorkspaceStore((state) => state.loadServerStudents);
  const loadServerClassGroups = useWorkspaceStore((state) => state.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((state) => state.loadServerClassSessions);
  const loadClassScheduleRules = useWorkspaceStore((state) => state.loadClassScheduleRules);
  const loadClassSessionExceptions = useWorkspaceStore(
    (state) => state.loadClassSessionExceptions,
  );
  const ensureClassSessionsForRangeLocal = useWorkspaceStore(
    (state) => state.ensureClassSessionsForRangeLocal,
  );
  const materializePlannedClassSession = useWorkspaceStore(
    (state) => state.materializePlannedClassSession,
  );
  const toggleStudentCheckEventLocal = useWorkspaceStore((state) => state.toggleStudentCheckEventLocal);
  const createStudentCheckEventLocal = useWorkspaceStore((state) => state.createStudentCheckEventLocal);

  const todayYmd = getAcademyYmd() || '';
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const [viewFilter, setViewFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set());
  const [savingStudentId, setSavingStudentId] = useState(null);
  const [manualEntryTarget, setManualEntryTarget] = useState(null);
  const [manualEntry, setManualEntry] = useState({ eventType: 'check_in', time: '15:00' });

  const currentAcademy = useMemo(
    () => memberships.find((membership) => membership.academy_id === currentAcademyId)?.academy || null,
    [memberships, currentAcademyId],
  );
  const settings = useMemo(() => readAttendanceSettings(currentAcademy), [currentAcademy]);
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((profile) => profile.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );
  const canEdit = role === 'owner' || currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canEditAttendance',
  );
  const canSeeAllClasses = role === 'owner' || currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canManageClasses',
  );
  const canSeeAllStudents = role === 'owner' || currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canViewStudents',
  );
  const canRecordNow = canEdit
    && selectedDate === todayYmd
    && settings.studentCheckMethod !== 'disabled'
    && settings.studentManualOverrideEnabled;
  const myTeacher = useMemo(
    () => academyTeachers.find((teacher) => teacher.serverUserId === authUserId) || null,
    [academyTeachers, authUserId],
  );

  useEffect(() => {
    if (!currentAcademyId || !role) return;
    // 전역 초기 로딩의 완료 시점과 무관하게 등하원 화면 진입 시 필요한 세
    // 테이블을 직접 확인한다. 로그인 직후 역할 캐시가 초기화되는 경합에서도
    // 화면이 스스로 복구된다.
    void Promise.all([
      loadServerStudents(),
      loadServerClassGroups(),
      loadServerClassSessions(),
      loadClassScheduleRules(),
    ]);
  }, [
    currentAcademyId,
    role,
    loadServerStudents,
    loadServerClassGroups,
    loadServerClassSessions,
    loadClassScheduleRules,
  ]);

  useEffect(() => {
    if (!selectedDate || !currentAcademyId) return;
    loadStudentCheckEvents({ sinceDateYMD: selectedDate, limit: 1000 });
    loadClassSessionExceptions({ fromDate: selectedDate, toDate: selectedDate });
    void ensureClassSessionsForRangeLocal({
      fromDate: selectedDate,
      toDate: selectedDate,
    }).catch((error) => {
      console.warn('[attendance] 선택일 수업 회차 준비 실패', error);
    });
  }, [
    selectedDate,
    currentAcademyId,
    ensureClassSessionsForRangeLocal,
    loadStudentCheckEvents,
    loadClassSessionExceptions,
  ]);

  const daySessions = useMemo(() => {
    const planned = plannedToClassSessionShape(
      buildPlannedClassSessions({
        rules: classScheduleRules,
        exceptions: classSessionExceptions,
        fromDate: selectedDate,
        toDate: selectedDate,
      }),
      classGroups,
    );
    const merged = mergePlannedAndActualClassSessions(planned, classSessions)
      .filter((session) => session.date === selectedDate && session.status !== 'canceled')
      .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
    if (canSeeAllClasses) return merged;
    return merged.filter((session) => {
      const group = classGroups.find((item) => item.id === session.classGroupId);
      if (session.substituteTeacherUserId || session.substituteTeacherId) {
        return session.substituteTeacherUserId === authUserId
          || (!!myTeacher && session.substituteTeacherId === myTeacher.id);
      }
      return session.teacherUserId === authUserId
        || (!!myTeacher && session.teacherId === myTeacher.id)
        || group?.teacherUserId === authUserId
        || (!!myTeacher && group?.teacherId === myTeacher.id);
    });
  }, [
    selectedDate,
    classScheduleRules,
    classSessionExceptions,
    classGroups,
    classSessions,
    canSeeAllClasses,
    authUserId,
    myTeacher,
  ]);

  const sessionsByStudentId = useMemo(() => {
    const map = new Map();
    for (const session of daySessions) {
      for (const studentId of session.studentIds || []) {
        const list = map.get(studentId) || [];
        list.push(session);
        map.set(studentId, list);
      }
    }
    return map;
  }, [daySessions]);

  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return academyStudents
      .filter((student) => {
        const status = student.status || 'active';
        if (status === 'active') return true;
        // 재원 예정 학생은 실제 시작일부터만 등하원 대상에 포함한다.
        // 서버 RPC(SQL 063)도 같은 기준을 사용한다.
        return status === 'scheduled'
          && (!student.enrollmentDate || student.enrollmentDate <= selectedDate);
      })
      .map((student) => {
        const state = getStudentDayCheckState(student.serverId, selectedDate, studentCheckEvents);
        const sessions = sessionsByStudentId.get(student.id) || [];
        return {
          student,
          state,
          sessions,
          expected: sessions.length > 0,
          presence: getPresenceMeta(state),
        };
      })
      .filter((row) => {
        if (!canSeeAllStudents && !row.expected) return false;
        if (normalizedSearch) {
          const haystack = [
            row.student.name,
            row.student.school,
            row.student.grade,
          ].filter(Boolean).join(' ').toLowerCase();
          if (!haystack.includes(normalizedSearch)) return false;
        }
        if (viewFilter === 'inside') return row.state.isInside;
        if (viewFilter === 'left') return row.state.latest && !row.state.isInside;
        if (viewFilter === 'expected') return row.expected || row.state.events.length > 0;
        return true;
      })
      .sort((a, b) => {
        if (a.state.isInside !== b.state.isInside) return a.state.isInside ? -1 : 1;
        if (a.expected !== b.expected) return a.expected ? -1 : 1;
        const aTime = a.sessions[0]?.startTime || '99:99';
        const bTime = b.sessions[0]?.startTime || '99:99';
        const byTime = aTime.localeCompare(bTime);
        if (byTime !== 0) return byTime;
        return String(a.student.name || '').localeCompare(String(b.student.name || ''), 'ko');
      });
  }, [
    academyStudents,
    selectedDate,
    studentCheckEvents,
    sessionsByStudentId,
    search,
    viewFilter,
    canSeeAllStudents,
  ]);

  const attendanceGroups = useMemo(() => {
    const rowsByStudentId = new Map(rows.map((row) => [row.student.id, row]));
    const assignedStudentIds = new Set();
    const groups = [];

    for (const session of daySessions) {
      const sessionRows = [];
      const seenInSession = new Set();
      for (const studentId of session.studentIds || []) {
        if (seenInSession.has(studentId)) continue;
        const row = rowsByStudentId.get(studentId);
        if (!row) continue;
        seenInSession.add(studentId);
        sessionRows.push(row);
        assignedStudentIds.add(studentId);
      }
      if (sessionRows.length === 0) continue;
      groups.push({
        id: session.id,
        session,
        classGroup: classGroups.find((item) => item.id === session.classGroupId) || null,
        rows: sessionRows,
        isUnassigned: false,
      });
    }

    // 등·하원 상태 자체는 학생의 하루 기록이지만, 운영 화면의 묶음은 반별이다.
    // 따라서 여러 반에 속한 학생은 각 반에 모두 표시하고 동일한 하루 상태를 공유한다.
    const unassignedRows = rows.filter(
      (row) => !assignedStudentIds.has(row.student.id),
    );
    if (unassignedRows.length > 0) {
      groups.push({
        id: 'attendance-unassigned',
        session: null,
        classGroup: null,
        rows: unassignedRows,
        isUnassigned: true,
      });
    }
    return groups;
  }, [rows, daySessions, classGroups]);

  const attendanceGroupKey = attendanceGroups.map((group) => group.id).join('|');
  useEffect(() => {
    const availableIds = attendanceGroups.map((group) => group.id);
    setExpandedGroupIds((current) => {
      if (availableIds.some((id) => current.has(id))) return current;
      return availableIds[0] ? new Set([availableIds[0]]) : new Set();
    });
  }, [selectedDate, attendanceGroupKey]);

  const toggleAttendanceGroup = (groupId) => {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const summary = useMemo(() => {
    const expectedIds = new Set();
    const checkedInIds = new Set();
    const insideIds = new Set();
    const leftIds = new Set();
    for (const student of academyStudents) {
      if (!canSeeAllStudents && !sessionsByStudentId.has(student.id)) continue;
      if (sessionsByStudentId.has(student.id)) expectedIds.add(student.id);
      const state = getStudentDayCheckState(student.serverId, selectedDate, studentCheckEvents);
      if (state.events.some((event) => event.event_type === 'check_in')) checkedInIds.add(student.id);
      if (state.isInside) insideIds.add(student.id);
      else if (state.latest) leftIds.add(student.id);
    }
    return {
      expected: expectedIds.size,
      checkedIn: checkedInIds.size,
      inside: insideIds.size,
      left: leftIds.size,
    };
  }, [
    academyStudents,
    sessionsByStudentId,
    selectedDate,
    studentCheckEvents,
    canSeeAllStudents,
  ]);
  const openSession = async (session) => {
    try {
      const actual = session?.isPlanned
        ? await materializePlannedClassSession(session)
        : session;
      if (!actual?.id) throw new Error('수업 회차를 준비하지 못했어요.');
      navigateToClassSession(actual.id);
    } catch (error) {
      showToast(error?.message || '수업 회차를 열지 못했어요.', 'error');
    }
  };

  const recordNextEvent = async (row) => {
    if (!canRecordNow || savingStudentId || !row.student.serverId) return;
    setSavingStudentId(row.student.id);
    try {
      // 예정 회차가 아직 DB에 만들어지지 않은 상태에서 등원이 먼저 저장되면
      // 수업 출석 자동 연결이 빠질 수 있다. 해당 날짜 회차를 먼저 준비하되,
      // 준비 실패가 하루 단위 등하원 기록 자체를 막지는 않게 한다.
      if (row.sessions.some((session) => session.isPlanned)) {
        try {
          await ensureClassSessionsForRangeLocal({
            fromDate: selectedDate,
            toDate: selectedDate,
          });
        } catch (materializeError) {
          console.warn('[attendance] 등원 전 수업 회차 준비 실패', materializeError);
        }
      }
      const result = await toggleStudentCheckEventLocal({
        studentId: row.student.serverId,
        source: 'teacher_manual',
      });
      const eventType = result?.event?.event_type;
      if (!eventType) throw new Error('저장 결과를 확인할 수 없어요.');
      const eventLabel = eventType === 'check_out' ? '하원' : '등원';
      showToast(
        result.duplicate
          ? `이미 ${eventLabel} 처리되어 있어요.`
          : `${row.student.name} 학생을 ${eventLabel} 처리했어요.`,
      );
    } catch (error) {
      showToast(error?.message || '등하원 기록을 저장하지 못했어요.', 'error');
    } finally {
      setSavingStudentId(null);
    }
  };

  const saveManualEntry = async () => {
    if (!manualEntryTarget?.student?.serverId || savingStudentId) return;
    setSavingStudentId(manualEntryTarget.student.id);
    try {
      const eventTime = new Date(
        `${selectedDate}T${manualEntry.time || '00:00'}:00+09:00`,
      ).toISOString();
      await createStudentCheckEventLocal({
        studentId: manualEntryTarget.student.serverId,
        eventType: manualEntry.eventType,
        source: 'teacher_manual',
        eventTime,
      });
      showToast(`${manualEntryTarget.student.name} 학생의 누락 기록을 추가했어요.`);
      setManualEntryTarget(null);
    } catch (error) {
      showToast(error?.message || '누락 기록을 추가하지 못했어요.', 'error');
    } finally {
      setSavingStudentId(null);
    }
  };

  const isToday = selectedDate === todayYmd;
  const qrEnabled = settings.studentCheckMethod === 'qr' && isToday;
  const isAttendanceDataLoading = isEventsLoading
    || isStudentsLoading
    || isClassGroupsLoading
    || isClassSessionsLoading;
  const attendanceDataError = studentsError
    || classGroupsError
    || classSessionsError
    || eventsError;
  const retryAttendanceData = () => {
    void Promise.all([
      loadServerStudents(),
      loadServerClassGroups(),
      loadServerClassSessions(),
      loadClassScheduleRules(),
      loadClassSessionExceptions({ fromDate: selectedDate, toDate: selectedDate }),
      loadStudentCheckEvents({ sinceDateYMD: selectedDate, limit: 1000 }),
    ]).then(() => ensureClassSessionsForRangeLocal({
      fromDate: selectedDate,
      toDate: selectedDate,
    })).catch((error) => {
      console.warn('[attendance] 데이터 다시 불러오기 실패', error);
    });
  };
  const calendarSchedules = useMemo(() => {
    const classDots = classSessions
      .filter((session) => session?.date && session.status !== 'canceled')
      .map((session) => ({ date: session.date, type: 'class' }));
    const attendanceDots = studentCheckEvents
      .map((event) => ({ date: getAcademyYmd(event.event_time), type: 'performance' }))
      .filter((event) => event.date);
    return [...classDots, ...attendanceDots];
  }, [classSessions, studentCheckEvents]);

  return (
    <div>
      <Header
        title="등하원"
        right={qrEnabled ? (
          <button
            type="button"
            onClick={openQrDisplayWindow}
            className="flex h-9 items-center gap-1 rounded-xl bg-blue-50 px-3 text-xs font-bold text-blue-700"
          >
            <QrCode size={14} />
            QR
          </button>
        ) : null}
      />

      <div className="pt-14 pb-6 md:pt-0">
        <div className="pt-4">
          <WeeklyExpandableCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            schedules={calendarSchedules}
          />
        </div>

        <div className="px-4 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-base font-black text-[#191F28]">
                {isToday ? '오늘' : formatDateShort(selectedDate)}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-[#8B95A1]">{selectedDate}</p>
            </div>
            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(todayYmd)}
                className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"
              >
                오늘
              </button>
            )}
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <SummaryItem label="예정" value={summary.expected} Icon={CalendarDays} tone="gray" />
            <SummaryItem label="등원" value={summary.checkedIn} Icon={CheckCircle2} tone="blue" />
            <SummaryItem label="원내" value={summary.inside} Icon={LogIn} tone="green" />
            <SummaryItem label="하원" value={summary.left} Icon={LogOut} tone="indigo" />
          </div>

          {settings.studentCheckMethod === 'disabled' && (
            <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium leading-5 text-amber-800">
              등하원을 사용하지 않도록 설정했어요. 학원 설정에서 다시 켤 수 있어요.
            </div>
          )}
          {!isToday && (
            <div className="mb-4 rounded-2xl bg-gray-100 px-4 py-3 text-xs font-medium text-gray-600">
              지난 날짜에 빠진 등원·하원은 학생별로 기록을 추가할 수 있어요.
            </div>
          )}

          <div className="mb-4 space-y-2">
            <ListSearchField
              value={search}
              onChange={setSearch}
              placeholder="학생 이름, 학교, 학년 검색"
            />
            <ListFilterChips
              value={viewFilter}
              onChange={setViewFilter}
              ariaLabel="등하원 상태 필터"
              options={VIEW_FILTERS.map((filter) => ({
                value: filter.id,
                label: filter.label,
              }))}
            />
          </div>

          {attendanceDataError && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3">
              <p className="min-w-0 text-xs font-medium text-red-700">
                {attendanceDataError}
              </p>
              <button
                type="button"
                onClick={retryAttendanceData}
                className="flex-shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-red-600"
              >
                다시 불러오기
              </button>
            </div>
          )}

          {isAttendanceDataLoading && rows.length === 0 ? (
            <div className="rounded-2xl bg-white px-5 py-10 text-center text-sm text-gray-400">
              학생과 수업을 불러오는 중...
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl bg-white px-5 py-10 text-center shadow-sm">
              <Users size={24} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-bold text-gray-700">표시할 학생이 없어요</p>
              <p className="mt-1 text-xs text-gray-400">검색어나 필터를 바꿔보세요.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 md:gap-2.5">
              {attendanceGroups.map((attendanceGroup) => {
                const {
                  id,
                  session,
                  classGroup,
                  rows: groupRows,
                  isUnassigned,
                } = attendanceGroup;
                const expanded = expandedGroupIds.has(id) || search.trim().length > 0;
                const checkedInCount = groupRows.filter((row) => (
                  row.state.events.some((event) => event.event_type === 'check_in')
                )).length;
                const title = isUnassigned
                  ? '그 외 학생'
                  : classGroup?.name || session?.activityName || '수업';
                const detail = isUnassigned
                  ? '수업 미배정 또는 별도 등하원 기록'
                  : [
                      session?.startTime && session?.endTime
                        ? `${session.startTime}–${session.endTime}`
                        : session?.startTime,
                      classGroup?.subject,
                      session?.room || classGroup?.room,
                    ].filter(Boolean).join(' · ');
                const GroupIcon = isUnassigned ? Users : Clock3;

                return (
                  <section
                    key={id}
                    className="overflow-hidden rounded-2xl border border-[#E5E8EB] bg-white md:rounded-[22px]"
                  >
                    <button
                      type="button"
                      onClick={() => toggleAttendanceGroup(id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors active:bg-[#F9FAFB] md:gap-3 md:px-4 md:py-3.5"
                      aria-expanded={expanded}
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#E8F3FF] text-[#1B64DA] md:h-9 md:w-9 md:rounded-xl">
                        <GroupIcon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold text-[#191F28]">
                          {title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-medium text-[#8B95A1]">
                          {detail || `${groupRows.length}명`}
                        </span>
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-1.5 md:gap-2">
                        <span className="text-[11px] font-bold text-[#6B7684]">
                          <span className="hidden sm:inline">등원 </span>{checkedInCount}/{groupRows.length}
                        </span>
                        <ChevronDown
                          size={17}
                          className={`text-[#8B95A1] transition-transform duration-200 ${
                            expanded ? 'rotate-180' : ''
                          }`}
                        />
                      </span>
                    </button>
                    <div
                      className="grid transition-[grid-template-rows] duration-200 ease-out"
                      style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
                    >
                      <div className="overflow-hidden">
                        {groupRows.map((row) => (
                          <StudentPresenceRow
                            key={row.student.id}
                            row={row}
                            nested
                            canRecord={canRecordNow}
                            canAddPast={canEdit && !isToday && selectedDate < todayYmd}
                            saving={savingStudentId === row.student.id}
                            hasServerId={!!row.student.serverId}
                            classGroups={classGroups}
                            onRecord={() => recordNextEvent(row)}
                            onAddPast={() => {
                              setManualEntryTarget(row);
                              setManualEntry({ eventType: 'check_in', time: '15:00' });
                            }}
                            onOpenSession={(targetSession) => void openSession(targetSession)}
                          />
                        ))}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {manualEntryTarget && (
        <Modal
          isOpen
          onClose={() => setManualEntryTarget(null)}
          title="누락 기록 추가"
          footer={(
            <button
              type="button"
              onClick={saveManualEntry}
              disabled={savingStudentId === manualEntryTarget.student.id}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {savingStudentId === manualEntryTarget.student.id ? '저장 중...' : '기록 추가'}
            </button>
          )}
        >
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-bold text-gray-900">{manualEntryTarget.student.name}</p>
              <p className="mt-0.5 text-xs text-gray-400">{selectedDate}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'check_in', label: '등원' },
                { value: 'check_out', label: '하원' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setManualEntry((entry) => ({ ...entry, eventType: option.value }))}
                  className={`rounded-xl border py-3 text-sm font-bold ${
                    manualEntry.eventType === option.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-500'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <input
              type="time"
              value={manualEntry.time}
              onChange={(event) => setManualEntry((entry) => ({ ...entry, time: event.target.value }))}
              className="h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-900 outline-none focus:border-blue-500"
            />
            <p className="text-xs leading-5 text-gray-500">
              빠진 기록만 추가해요. 기존 기록은 그대로 보존됩니다.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryItem({ label, value, Icon, tone }) {
  const tones = {
    gray: { icon: 'bg-gray-100 text-gray-600', value: 'text-[#191F28]' },
    blue: { icon: 'bg-blue-50 text-blue-600', value: 'text-blue-700' },
    green: { icon: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-700' },
    indigo: { icon: 'bg-indigo-50 text-indigo-600', value: 'text-indigo-700' },
  };
  const selectedTone = tones[tone] || tones.gray;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E5E8EB] bg-white px-3.5 py-3.5">
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${selectedTone.icon}`}>
        <Icon size={16} />
      </div>
      <div>
        <p className={`text-xl font-black leading-none ${selectedTone.value}`}>{value}</p>
        <p className="mt-1 text-[11px] font-bold text-[#6B7684]">{label}</p>
      </div>
    </div>
  );
}

function StudentPresenceRow({
  row,
  canRecord,
  canAddPast,
  saving,
  hasServerId,
  classGroups,
  onRecord,
  onAddPast,
  onOpenSession,
  nested = false,
}) {
  const { student, state, sessions, presence } = row;
  const PresenceIcon = presence.icon;
  const actionLabel = state.isInside ? '하원 처리' : state.latest ? '재등원' : '등원 처리';

  return (
    <div className={
      nested
        ? 'border-t border-[#F2F4F6] bg-white p-3 transition-colors hover:bg-[#F9FAFB] md:p-4'
        : 'rounded-[22px] border border-[#E5E8EB] bg-white p-4 transition-colors hover:border-[#D1D6DB]'
    }>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 md:grid-cols-[minmax(200px,0.9fr)_minmax(280px,1.35fr)_auto] md:gap-4">
        <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#E8F3FF] text-sm font-black text-[#1B64DA] md:h-11 md:w-11 md:text-base">
            {(student.name || '?')[0]}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-sm font-extrabold text-[#191F28] md:text-[15px]">{student.name}</p>
              <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold md:hidden ${presence.badge}`}>
                <PresenceIcon size={10} />
                {presence.label}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-medium text-[#6B7684] md:mt-1 md:text-xs">
              {[student.school, student.grade].filter(Boolean).join(' · ') || '학교 정보 없음'}
            </p>
          </div>
        </div>

        <div className="col-span-2 row-start-2 min-w-0 border-t border-gray-100 pt-2 md:col-span-1 md:row-start-auto md:border-l md:border-t-0 md:pl-4 md:pt-0">
          <p className="mb-1.5 hidden text-[10px] font-bold text-[#8B95A1] md:block">오늘 수업</p>
          {sessions.length > 0 ? (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              {sessions.map((session) => {
                const group = classGroups.find((item) => item.id === session.classGroupId);
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onOpenSession(session)}
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-left active:bg-gray-100 md:rounded-xl md:px-2.5 md:py-2"
                  >
                    <span className="text-xs font-black text-[#191F28]">{session.startTime || '미정'}</span>
                    <span className="max-w-28 truncate text-[11px] font-semibold text-[#4E5968]">{group?.name || '수업'}</span>
                    {session.room && (
                      <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${getRoomTagClassName(session.room)}`}>
                        {session.room}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs font-semibold text-[#8B95A1]">예정된 수업이 없어요</p>
          )}
        </div>

        <div className="col-start-2 row-start-1 flex items-center justify-end gap-3 md:col-start-auto md:row-start-auto md:justify-end">
          <div className="hidden min-w-0 text-right md:block">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${presence.badge}`}>
              <PresenceIcon size={11} />
              {presence.label}
            </span>
            <p className="mt-1 text-[11px] font-semibold text-[#6B7684]">{presence.detail}</p>
          </div>
          {(canRecord || canAddPast) && (
            <button
              type="button"
              onClick={canRecord ? onRecord : onAddPast}
              disabled={saving || !hasServerId}
              className={`h-9 min-w-[68px] flex-shrink-0 rounded-[10px] px-2.5 text-[11px] font-extrabold transition-transform active:scale-[0.97] disabled:opacity-40 md:h-11 md:min-w-[76px] md:rounded-xl md:px-3 md:text-xs ${
                canAddPast
                  ? 'border border-[#D1D6DB] bg-white text-[#4E5968]'
                  : state.isInside
                  ? 'bg-[#191F28] text-white'
                  : 'bg-[#3182F6] text-white'
              }`}
            >
              {saving ? '저장 중' : canAddPast ? '기록 추가' : actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
