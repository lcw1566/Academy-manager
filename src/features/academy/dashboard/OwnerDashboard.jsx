import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock,
  FileText,
  Users as UsersIcon,
  CheckSquare,
  LogIn,
} from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  today,
  addDaysYMD,
  formatDateShort,
  getKoreaMinutes,
  greetingByTime,
} from '../../../utils/date';
import AcademyScheduleCalendar from '../calendar/AcademyScheduleCalendar';
import {
  classifyShiftStatus,
  getAcademyYmd,
  readAttendanceSettings,
} from '../attendance/attendanceHelpers';
// Phase 44.6 / Phase B — 룰 기반 예정 세션 머지.
import {
  buildPlannedClassSessions,
  buildPlannedStaffSchedule,
  mergePlannedAndActualClassSessions,
  mergePlannedAndActualStaffShifts,
  plannedToClassSessionShape,
  plannedToStaffShiftShape,
} from '../../../utils/schedule';
import HomeActionList from './HomeActionList';
import HomeSummaryBar from '../../../components/HomeSummaryBar';
import { getActionableClassSessions, summarizeStudentPresence } from './homeDashboardUtils';

function formatClock(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function formatTimeRange(start, end) {
  const s = formatClock(start);
  const e = formatClock(end);
  if (!s && !e) return '';
  return `${s || '-'} - ${e || '-'}`;
}

export default function OwnerDashboard({ operationsOnly = false, pilotFeaturesEnabled = false }) {
  const role = useAcademyStore((s) => s.role);
  const academyStudents = useAcademyStore((s) => s.academyStudents);
  const classGroups = useAcademyStore((s) => s.classGroups);
  const classSessions = useAcademyStore((s) => s.classSessions);
  const clinicRecords = useAcademyStore((s) => s.clinicRecords) ?? [];
  const academyTeachers = useAcademyStore((s) => s.academyTeachers);
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const academyManagers = useAcademyStore((s) => s.academyManagers) ?? [];
  const academyProfile = useAcademyStore((s) => s.academyProfile);
  const academyLessonRecords = useAcademyStore((s) => s.academyLessonRecords) ?? [];
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const academyPayments = useAcademyStore((s) => s.academyPayments) ?? [];
  const academyPayrolls = useAcademyStore((s) => s.academyPayrolls) ?? [];
  const navigateToClassSession = useAcademyStore((s) => s.navigateToClassSession);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const showToast = useAcademyStore((s) => s.showToast);
  const academyInvitations = useWorkspaceStore((s) => s.academyInvitations) ?? [];
  const authUserId = useAuthStore((s) => s.user?.id);
  const studentCheckEvents = useWorkspaceStore((s) => s.studentCheckEvents) ?? [];
  const loadStudentCheckEvents = useWorkspaceStore((s) => s.loadStudentCheckEvents);
  const staffAttendanceLogs = useWorkspaceStore((s) => s.staffAttendanceLogs) ?? [];
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const currentAcademy = memberships.find((m) => m.academy_id === currentAcademyId)?.academy || null;
  const attendance = readAttendanceSettings(currentAcademy);
  const studentAttendanceEnabled = attendance.studentCheckMethod !== 'disabled';
  // Phase 44.6 / Phase B — 룰 기반 예정 세션 데이터.
  const classScheduleRules = useWorkspaceStore((s) => s.classScheduleRules) ?? [];
  const classSessionExceptions = useWorkspaceStore((s) => s.classSessionExceptions) ?? [];
  const materializePlannedClassSession = useWorkspaceStore(
    (s) => s.materializePlannedClassSession,
  );
  const staffWorkRules = useWorkspaceStore((s) => s.staffWorkRules) ?? [];
  const staffWorkExceptions = useWorkspaceStore((s) => s.staffWorkExceptions) ?? [];

  const [selectedDate, setSelectedDate] = useState(() => getAcademyYmd() || today());
  const [now, setNow] = useState(() => new Date());
  const todayStr = getAcademyYmd() || today();
  const currentMonth = todayStr.slice(0, 7);
  const unpaidThisMonth = academyPayments.filter(
    (payment) => payment.month === currentMonth && payment.status !== 'paid' && payment.status !== 'waived',
  );
  const unpaidAmountThisMonth = unpaidThisMonth.reduce(
    (sum, payment) => sum + (Number(payment.amount) || 0),
    0,
  );
  const payrollReviewCount = academyPayrolls.filter(
    (payroll) => payroll.month === currentMonth
      && (payroll.status !== 'completed' || payroll.requiresReview === true),
  ).length;

  const openSession = useCallback(async (session) => {
    try {
      const actual = session?.isPlanned
        ? await materializePlannedClassSession(session)
        : session;
      if (!actual?.id) throw new Error('수업 회차를 준비하지 못했어요.');
      navigateToClassSession(actual.id);
    } catch (error) {
      showToast(error?.message || '수업 회차를 열지 못했어요.', 'error');
    }
  }, [materializePlannedClassSession, navigateToClassSession, showToast]);

  useEffect(() => {
    if (!studentAttendanceEnabled || !currentAcademyId || !todayStr) return;
    loadStudentCheckEvents({ sinceDateYMD: todayStr, limit: 1000 });
  }, [studentAttendanceEnabled, currentAcademyId, todayStr, loadStudentCheckEvents]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const recentAttendanceEvents = useMemo(() => {
    const staffByUserId = new Map(
      [...academyTeachers, ...academyAssistants, ...academyManagers]
        .filter((staff) => staff?.serverUserId)
        .map((staff) => [staff.serverUserId, staff]),
    );
    return (staffAttendanceLogs || [])
      .filter((log) => log.work_date === todayStr && (log.actual_start_time || log.actual_end_time))
      .sort((a, b) => String(b.updated_at || b.approved_at || b.created_at || '').localeCompare(
        String(a.updated_at || a.approved_at || a.created_at || ''),
      ))
      .slice(0, 3)
      .map((log) => {
        const staff = staffByUserId.get(log.staff_user_id);
        const isClockOut = !!log.actual_end_time;
        return {
          id: log.id,
          name: staff?.name || '직원',
          action: isClockOut ? '퇴근' : '출근',
          time: formatClock(isClockOut ? log.actual_end_time : log.actual_start_time),
        };
      });
  }, [staffAttendanceLogs, academyTeachers, academyAssistants, academyManagers, todayStr]);

  // Phase 44.6 / Phase B — 향후 60일 윈도우 안에서 룰+예외로 planned 세션 산출 후
  // 기존 classSessions 와 머지. 14일 너머에도 자연스럽게 예정 세션이 노출됨.
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

  const todaySessions = useMemo(
    () => mergedClassSessions.filter((s) => s.date === todayStr && s.status !== 'canceled'),
    [mergedClassSessions, todayStr]
  );
  const myStaffIds = useMemo(
    () => new Set(
      [...academyTeachers, ...academyAssistants, ...academyManagers]
        .filter((staff) => staff.serverUserId === authUserId)
        .map((staff) => staff.id),
    ),
    [academyTeachers, academyAssistants, academyManagers, authUserId],
  );

  const schedules = useMemo(
    () => mergedClassSessions
      .filter((session) => session.status !== 'canceled')
      .map((session) => {
        const group = classGroups.find((item) => item.id === session.classGroupId);
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
          onClick: () => void openSession(session),
        };
      }),
    [mergedClassSessions, classGroups, openSession],
  );

  const todayClinicCount = useMemo(
    () => clinicRecords.filter((r) => r.date === todayStr).length,
    [clinicRecords, todayStr]
  );

  const todayStudentIds = useMemo(
    () => [...new Set(todaySessions.flatMap((s) => s.studentIds || []))],
    [todaySessions]
  );

  // Phase 30 운영 메트릭
  // Phase 44.6 / Phase B — 오늘 출근 예정 staff: 룰 기반 planned + 기존 shift 머지.
  // 14일 너머 oncall 도 본 카드에 반영된다.
  const mergedTodayShifts = useMemo(() => {
    const plannedRaw = buildPlannedStaffSchedule({
      rules: staffWorkRules,
      exceptions: staffWorkExceptions,
      fromDate: todayStr,
      toDate: todayStr,
    });
    const plannedShaped = plannedToStaffShiftShape(plannedRaw, {
      academyTeachers,
      academyAssistants,
      academyManagers,
    });
    const actualToday = academyStaffShifts.filter(
      (sh) => sh.date === todayStr && sh.status !== 'canceled',
    );
    return mergePlannedAndActualStaffShifts(plannedShaped, actualToday);
  }, [staffWorkRules, staffWorkExceptions, academyStaffShifts, academyTeachers, academyAssistants, academyManagers, todayStr]);
  const todayShifts = mergedTodayShifts;
  const todayShiftStaffIds = useMemo(
    () => [...new Set(todayShifts.map((sh) => sh.staffId).filter(Boolean))],
    [todayShifts],
  );

  const nowMinutes = useMemo(() => {
    return getKoreaMinutes(now);
  }, [now]);
  const actionableSessions = useMemo(() => getActionableClassSessions({
    sessions: todaySessions,
    groups: classGroups,
    lessonRecords: academyLessonRecords,
    nowMinutes,
    assignment: {
      userId: authUserId,
      staffIds: myStaffIds,
      isOwner: role === 'owner' && !operationsOnly,
    },
  }), [
    todaySessions,
    classGroups,
    academyLessonRecords,
    nowMinutes,
    authUserId,
    myStaffIds,
    role,
    operationsOnly,
  ]);

  // 미작성 수업 기록 — 오늘 또는 어제까지 status='completed' 인데 lesson_records (_common_) 없음
  const unfinishedLessonRecordSessions = useMemo(() => {
    const yesterday = addDaysYMD(todayStr, -1);
    return classSessions.filter((s) => {
      if (s.status !== 'completed') return false;
      if (s.date !== todayStr && s.date !== yesterday) return false;
      const hasRecord = academyLessonRecords.some((lr) => lr.sessionId === s.id && lr.studentId === '_common_');
      return !hasRecord;
    });
  }, [classSessions, academyLessonRecords, todayStr]);

  // pending 초대
  const pendingInvitations = useMemo(
    () => academyInvitations.filter((inv) => inv.status === 'pending'),
    [academyInvitations],
  );

  // Phase 41 — 오늘 직원 출결 분류
  const todayShiftSummary = useMemo(() => {
    let present = 0, late = 0, absent = 0, completed = 0;
    for (const sh of todayShifts) {
      const status = classifyShiftStatus(sh);
      if (status === 'present') present += 1;
      else if (status === 'late') late += 1;
      else if (status === 'absent') absent += 1;
      else if (status === 'clockedOut') completed += 1;
    }
    return { present, late, absent, completed };
  }, [todayShifts]);

  const todayStudentPresence = useMemo(
    () => summarizeStudentPresence(studentCheckEvents, todayStr),
    [studentCheckEvents, todayStr],
  );

  const homeActions = useMemo(() => {
    const actions = [];
    actionableSessions.forEach(({ session, phase, startsIn }) => {
      const group = classGroups.find((item) => item.id === session.classGroupId);
      const status = phase === 'soon'
        ? `${formatClock(session.startTime)} 시작 · ${startsIn}분 후`
        : phase === 'live' ? '진행 중 · 수업 기록하기' : '수업 기록 마무리';
      actions.push({
        id: `session-${session.id}`,
        icon: phase === 'finish' ? FileText : Clock,
        tone: phase === 'finish' ? 'amber' : 'blue',
        title: group?.name || '오늘 수업',
        detail: `${status} · ${formatTimeRange(session.startTime, session.endTime)}`,
        onClick: () => void openSession(session),
      });
    });

    const actionableIds = new Set(actionableSessions.map(({ session }) => session.id));
    const remainingRecords = unfinishedLessonRecordSessions.filter(
      (session) => !actionableIds.has(session.id),
    );
    const missingRecord = remainingRecords[0];
    if (missingRecord) {
      const group = classGroups.find((item) => item.id === missingRecord.classGroupId);
      actions.push({
        id: `record-${missingRecord.id}`,
        icon: FileText,
        tone: 'amber',
        title: `수업 기록 ${remainingRecords.length}건 미작성`,
        detail: group?.name || '완료된 수업 기록을 작성해주세요.',
        onClick: () => navigateToClassSession(missingRecord.id),
      });
    }

    if (studentAttendanceEnabled) {
      actions.push({
        id: 'attendance',
        icon: LogIn,
        tone: 'green',
        title: '등하원',
        detail: `오늘 등원 ${todayStudentPresence.checkedInToday}명`,
        value: `현재 원내 ${todayStudentPresence.inside}명`,
        live: true,
        onClick: () => setActiveTab('attendance'),
      });
    }

    if (pendingInvitations.length > 0) {
      actions.push({
        id: 'pending-invitations',
        icon: UsersIcon,
        tone: 'purple',
        title: `직원 초대 ${pendingInvitations.length}명 대기`,
        detail: '초대 현황 확인하기',
        onClick: () => setActiveTab('staff'),
      });
    }

    return actions;
  }, [
    actionableSessions,
    classGroups,
    openSession,
    navigateToClassSession,
    pendingInvitations.length,
    setActiveTab,
    studentAttendanceEnabled,
    todayStudentPresence,
    unfinishedLessonRecordSessions,
  ]);

  return (
    <div className="pt-6 pb-4">
      {/* 인사 */}
      <div className="px-5 mb-5">
        <p className="text-seenit-muted text-sm">{greetingByTime()}</p>
        <h2 className="text-xl font-bold text-seenit-ink mt-0.5">오늘 학원 운영</h2>
        <p className="text-sm text-seenit-subtle mt-0.5">{formatDateShort(todayStr)} · {academyProfile.name || '학원'}</p>
      </div>

      <HomeActionList items={homeActions} />

      {/* 주간 캘린더 */}
      <div className="mb-5">
        <AcademyScheduleCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          schedules={schedules}
          title="학원 수업 일정"
          emptyText="수업 일정이 없어요"
          compact
          homeOverview
        />
      </div>

      {/* 핵심 지표 — 큰 개별 카드 대신 한 줄 요약 바 */}
      <HomeSummaryBar
        className="mb-3"
        items={[
          { label: '오늘 수업', value: `${todaySessions.length}개`, onClick: () => setActiveTab('classes') },
          studentAttendanceEnabled && { label: '등원 예정', value: `${todayStudentIds.length}명`, onClick: () => setActiveTab('attendance') },
          { label: '오늘 출근 예정', value: `${todayShiftStaffIds.length}명`, onClick: () => setActiveTab('staff') },
          academyProfile?.clinicRequired !== false && {
            label: '오늘 클리닉 기록',
            value: `${todayClinicCount}건`,
            color: todayClinicCount > 0 ? 'text-blue-600' : 'text-seenit-ink',
          },
        ]}
      />

      {/* 준비 중인 지표는 핵심 운영 요약과 분리 */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-5">
        <SummaryCard
          label="이달 미납"
          value={pilotFeaturesEnabled ? `${unpaidAmountThisMonth.toLocaleString()}원` : '준비 중'}
          onClick={() => setActiveTab('payments')}
          pilotLocked={!pilotFeaturesEnabled}
        />
        {!operationsOnly && (
          <SummaryCard
            label="급여 확인 필요"
            value={pilotFeaturesEnabled ? `${payrollReviewCount}건` : '준비 중'}
            onClick={() => setActiveTab('owner-payroll')}
            pilotLocked={!pilotFeaturesEnabled}
          />
        )}
      </div>

      {/* 오늘 직원 근무 요약 */}
      <div className="px-4 mb-5">
        <div className="bg-seenit-surface rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-seenit-ink flex items-center gap-1.5">
              <CheckSquare size={14} className="text-emerald-600" />
              오늘 직원 근무
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <AttendanceChip label="정상" value={todayShiftSummary.present} tone="emerald" />
            <AttendanceChip label="지각" value={todayShiftSummary.late} tone="amber" />
            <AttendanceChip label="미출근" value={todayShiftSummary.absent} tone="red" />
            <AttendanceChip label="퇴근" value={todayShiftSummary.completed} tone="gray" />
          </div>
          {recentAttendanceEvents.length > 0 && (
            <div className="mt-3 border-t border-seenit-border-soft pt-3">
              <p className="mb-2 text-[11px] font-bold text-seenit-muted">최근 출퇴근</p>
              <div className="space-y-1.5">
                {recentAttendanceEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setActiveTab('staff')}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="truncate text-xs font-semibold text-seenit-secondary">
                      {event.name} {event.action}
                    </span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-seenit-muted">
                      {event.time}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 강사별 수업 현황 */}
      {academyTeachers.length > 0 && (
        <div className="px-4 mb-4">
          <p className="text-sm font-bold text-seenit-secondary mb-3">강사별 오늘 수업</p>
          <div className="bg-seenit-surface rounded-2xl shadow-sm overflow-hidden">
            {academyTeachers.map((teacher) => {
              const teacherSessions = todaySessions.filter((s) => s.teacherId === teacher.id);
              return (
                <div key={teacher.id} className="flex items-center justify-between px-4 py-3 border-b border-seenit-border-soft last:border-0">
                  <span className="text-sm font-medium text-seenit-ink">{teacher.name}</span>
                  <span className={`text-sm font-bold ${teacherSessions.length > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                    {teacherSessions.length}개
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 빈 상태 */}
      {classGroups.length === 0 && (
        <div className="mx-4">
          <div className="bg-seenit-surface rounded-2xl p-6 shadow-sm text-center">
            <div className="text-4xl mb-3">🏫</div>
            <p className="font-bold text-gray-900 mb-1">아직 반이 없어요</p>
            <p className="text-sm text-gray-500 mb-5">반을 만들고 학원 운영을 시작해요</p>
            <button
              onClick={() => setActiveTab('classes')}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl text-sm"
            >
              반 만들기
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// Phase 41 — 출결 chip
function AttendanceChip({ label, value, tone = 'gray' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber:   'bg-amber-50 text-amber-700',
    red:     'bg-red-50 text-red-600',
    gray:    'bg-gray-50 text-gray-600',
  };
  return (
    <div className={`rounded-xl px-2 py-2 text-center ${tones[tone] || tones.gray}`}>
      <p className="text-base font-extrabold leading-tight">{value}</p>
      <p className="text-[10px] font-semibold mt-0.5">{label}</p>
    </div>
  );
}

function SummaryCard({ label, value, color = 'text-seenit-ink', onClick, pilotLocked = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={pilotLocked ? `${label}, 추후 제공 예정` : label}
      className={`pressable-surface bg-seenit-surface rounded-2xl p-4 shadow-sm text-left w-full ${
        pilotLocked ? 'opacity-50 grayscale' : ''
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs text-seenit-muted font-medium">{label}</p>
        {pilotLocked && (
          <span className="rounded-full bg-seenit-control px-1.5 py-0.5 text-[9px] font-bold text-seenit-subtle">
            추후 제공
          </span>
        )}
      </div>
      <p className={`${pilotLocked ? 'text-lg text-seenit-muted' : `text-2xl ${color}`} font-bold leading-none`}>
        {value}
      </p>
    </button>
  );
}
