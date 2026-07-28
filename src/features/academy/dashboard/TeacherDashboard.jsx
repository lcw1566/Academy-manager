import { useCallback, useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, FileText, LogIn } from 'lucide-react';
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
import WeeklyExpandableCalendar from '../../../components/calendar/WeeklyExpandableCalendar';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import MyTodayShiftCard from './MyTodayShiftCard';
import MyPayrollCard from './MyPayrollCard';
import StaffHomeQrButton from './StaffHomeQrButton';
import HomeActionList from './HomeActionList';
import { summarizeStudentPresence } from './homeDashboardUtils';
import { isConfirmedAttendance } from '../../../utils/attendanceRecords';
import { readAttendanceSettings } from '../attendance/attendanceHelpers';
// Phase 44.6 / Phase B — 룰 기반 예정 세션 머지.
import {
  buildPlannedClassSessions,
  mergePlannedAndActualClassSessions,
  plannedToClassSessionShape,
} from '../../../utils/schedule';

// "HH:mm" 문자열을 분 단위로 변환 (00:00 기준)
function parseHHmmToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

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

export default function TeacherDashboard() {
  const academyStudents = useAcademyStore((s) => s.academyStudents);
  const classGroups = useAcademyStore((s) => s.classGroups);
  const classSessions = useAcademyStore((s) => s.classSessions);
  const clinicTasks = useAcademyStore((s) => s.clinicTasks);
  const academyLessonRecords = useAcademyStore((s) => s.academyLessonRecords);
  const academyAttendanceRecords = useAcademyStore((s) => s.academyAttendanceRecords);
  const academyTeachers = useAcademyStore((s) => s.academyTeachers);
  const academyProfile = useAcademyStore((s) => s.academyProfile);
  const navigateToClassGroup = useAcademyStore((s) => s.navigateToClassGroup);
  const navigateToClassSession = useAcademyStore((s) => s.navigateToClassSession);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const showToast = useAcademyStore((s) => s.showToast);

  // Phase 25 — 본인(local academyTeachers) 식별. 서버 멤버십 정보 기반.
  const authUserId = useAuthStore((s) => s.user?.id);
  const authUserEmail = useAuthStore((s) => s.user?.email);
  const memberships = useWorkspaceStore((s) => s.memberships);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const studentCheckEvents = useWorkspaceStore((s) => s.studentCheckEvents) ?? [];
  const loadStudentCheckEvents = useWorkspaceStore((s) => s.loadStudentCheckEvents);
  // Phase 44.6 / Phase B — 룰/예외 데이터.
  const classScheduleRules = useWorkspaceStore((s) => s.classScheduleRules) ?? [];
  const classSessionExceptions = useWorkspaceStore((s) => s.classSessionExceptions) ?? [];
  const materializePlannedClassSession = useWorkspaceStore(
    (s) => s.materializePlannedClassSession,
  );
  const myMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );
  const studentAttendanceEnabled =
    readAttendanceSettings(myMembership?.academy).studentCheckMethod !== 'disabled';
  const myTeacher = useMemo(
    () => findLocalStaffForUser(academyTeachers, {
      userId: authUserId,
      memberId: myMembership?.id,
      email: authUserEmail,
    }),
    [academyTeachers, authUserId, myMembership?.id, authUserEmail],
  );

  const [selectedDate, setSelectedDate] = useState(today());
  const todayStr = today();

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

  // 1분마다 갱신 — "곧 시작" 카드 표시/숨김 자동 업데이트
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Phase 44 — 본인 담당 반 매칭. server-stable auth.users.id (teacherUserId)
  // 우선, 없으면 local teacherId 동등성으로 fallback. 두 경로를 OR 로 묶어
  // cross-device 에서 학원장이 PC 에서 만든 반을 강사 폰에서도 인식하도록 한다.
  const myGroupIds = useMemo(() => {
    if (!myTeacher && !authUserId) return new Set();
    return new Set(
      classGroups
        .filter((g) => {
          if (g.teacherUserId && authUserId && g.teacherUserId === authUserId) return true;
          if (myTeacher && g.teacherId === myTeacher.id) return true;
          // 이전 보조강사 배정도 역할 통합 뒤에는 선생님 담당 수업으로 이어간다.
          if (authUserId && (g.assistantUserIds || []).includes(authUserId)) return true;
          if (myTeacher && (g.assistantIds || []).includes(myTeacher.id)) return true;
          return false;
        })
        .map((g) => g.id),
    );
  }, [classGroups, myTeacher, authUserId]);

  // Phase 44.6 / Phase B — 룰 기반 planned 세션 + 기존 classSessions 머지.
  // 향후 60일 윈도우. teacher_user_id 매칭이 있는 rule 도 자동으로 포함된다.
  const mergedClassSessions = useMemo(() => {
    const from = todayStr;
    const to = addDaysYMD(todayStr, 60);
    const plannedRaw = buildPlannedClassSessions({
      rules: classScheduleRules,
      exceptions: classSessionExceptions,
      fromDate: from,
      toDate: to,
    });
    const plannedShaped = plannedToClassSessionShape(plannedRaw, classGroups);
    return mergePlannedAndActualClassSessions(plannedShaped, classSessions);
  }, [classSessions, classScheduleRules, classSessionExceptions, classGroups, todayStr]);

  // 본인 담당 세션 — teacherId / teacherUserId / 본인 담당 반 / Phase 30 대체 강사.
  // 대체 강사로 배정된 세션은 원래 강사 대신 본인이 담당이므로 그대로 노출한다.
  // substitute 매칭: local id (substituteTeacherId) 우선, server user_id (substituteTeacherUserId) fallback.
  const mySessions = useMemo(() => {
    if (!myTeacher && !authUserId) return [];
    const subMatchesMe = (s) => {
      if (s.substituteTeacherId && myTeacher && s.substituteTeacherId === myTeacher.id) return true;
      if (s.substituteTeacherUserId && authUserId && s.substituteTeacherUserId === authUserId) return true;
      return false;
    };
    return mergedClassSessions.filter((s) => {
      if (s.status === 'canceled') return false;
      const hasSubstitute = !!(s.substituteTeacherId || s.substituteTeacherUserId);
      if (hasSubstitute) {
        // 대체 강사 배정 — 그 사람이 본인이면 노출, 원 강사면 제외.
        return subMatchesMe(s);
      }
      if (s.teacherUserId && authUserId && s.teacherUserId === authUserId) return true;
      if (myTeacher && s.teacherId === myTeacher.id) return true;
      if (authUserId && (s.assistantUserIds || []).includes(authUserId)) return true;
      if (myTeacher && (s.assistantIds || []).includes(myTeacher.id)) return true;
      return myGroupIds.has(s.classGroupId);
    });
  }, [mergedClassSessions, myTeacher, myGroupIds, authUserId]);

  const todaySessions = useMemo(
    () => mySessions.filter((s) => s.date === todayStr).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [mySessions, todayStr]
  );

  const daySessions = useMemo(
    () => mySessions.filter((s) => s.date === selectedDate).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [mySessions, selectedDate]
  );

  const schedules = useMemo(() => mySessions.map((s) => ({ date: s.date, type: 'class' })), [mySessions]);

  const myClinics = useMemo(() => {
    if (!myTeacher) return [];
    return clinicTasks.filter(
      (t) =>
        t.status !== 'completed' &&
        (t.createdById === myTeacher.id || myGroupIds.has(t.classGroupId)),
    );
  }, [clinicTasks, myTeacher, myGroupIds]);

  const todayStudentIds = useMemo(
    () => [...new Set(todaySessions.flatMap((s) => s.studentIds || []))],
    [todaySessions]
  );

  const checkedTodayIds = useMemo(
    () => new Set(
      academyAttendanceRecords
        .filter((a) => (
          isConfirmedAttendance(a)
          && todaySessions.some((s) => s.id === a.sessionId)
        ))
        .map((a) => a.studentId),
    ),
    [academyAttendanceRecords, todaySessions]
  );

  const notesWrittenToday = useMemo(
    () => new Set(academyLessonRecords.filter((lr) => todaySessions.some((s) => s.id === lr.sessionId)).map((lr) => lr.studentId)),
    [academyLessonRecords, todaySessions]
  );

  const isToday = selectedDate === todayStr;
  const dateLabel = isToday ? '오늘 내 수업' : formatDateShort(selectedDate);

  // Phase 32 — 작성 필요한 수업 기록: 본인 담당 완료 세션 중 _common_ 기록 없는 것
  const unfinishedRecordSessions = useMemo(() => {
    if (!myTeacher) return [];
    return mySessions
      .filter((s) => s.status === 'completed')
      .filter((s) => !academyLessonRecords.some((lr) => lr.sessionId === s.id && lr.studentId === '_common_'))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [mySessions, myTeacher, academyLessonRecords]);

  const todayStudentPresence = useMemo(
    () => summarizeStudentPresence(studentCheckEvents, todayStr),
    [studentCheckEvents, todayStr],
  );

  const currentOrNextSession = useMemo(() => {
    const nowMinutes = getKoreaMinutes(now);
    return todaySessions
      .map((session) => ({
        session,
        start: parseHHmmToMinutes(session.startTime),
        end: parseHHmmToMinutes(session.endTime),
      }))
      .filter(({ end }) => end === null || end >= nowMinutes)
      .sort((a, b) => (a.start ?? Number.MAX_SAFE_INTEGER) - (b.start ?? Number.MAX_SAFE_INTEGER))[0]
      || null;
  }, [now, todaySessions]);

  const homeActions = useMemo(() => {
    const actions = [];
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

    if (currentOrNextSession) {
      const { session, start, end } = currentOrNextSession;
      const nowMinutes = getKoreaMinutes(now);
      const group = classGroups.find((item) => item.id === session.classGroupId);
      const status = start !== null && end !== null && start <= nowMinutes && nowMinutes <= end
        ? '진행 중'
        : `${formatClock(session.startTime)} 시작`;
      actions.push({
        id: `session-${session.id}`,
        icon: Clock,
        tone: 'blue',
        title: group?.name || '다음 수업',
        detail: `${status} · 수업 기록 열기`,
        onClick: () => void openSession(session),
      });
    }

    const missingRecord = unfinishedRecordSessions[0];
    if (missingRecord) {
      const group = classGroups.find((item) => item.id === missingRecord.classGroupId);
      actions.push({
        id: `record-${missingRecord.id}`,
        icon: FileText,
        tone: 'amber',
        title: `수업 기록 ${unfinishedRecordSessions.length}건 미작성`,
        detail: group?.name || '완료된 수업 기록을 작성해주세요.',
        onClick: () => navigateToClassSession(missingRecord.id),
      });
    }

    return actions;
  }, [
    classGroups,
    currentOrNextSession,
    navigateToClassSession,
    now,
    openSession,
    setActiveTab,
    studentAttendanceEnabled,
    todayStudentPresence,
    unfinishedRecordSessions,
  ]);

  // Phase 32 — 내 급여 요약 (이번 달)
  const academyPayrolls = useAcademyStore((s) => s.academyPayrolls) ?? [];
  const currentMonth = todayStr.slice(0, 7);
  const myPayroll = useMemo(() => {
    if (!myTeacher) return null;
    return academyPayrolls.find(
      (p) => p.month === currentMonth && p.staffType === 'teacher' && p.staffId === myTeacher.id,
    ) || null;
  }, [academyPayrolls, currentMonth, myTeacher]);

  return (
    <div className="pt-6 pb-4">
      <div className="px-5 mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-gray-500 text-sm">{greetingByTime()}</p>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5">오늘 내 수업</h2>
            <p className="text-sm text-gray-400 mt-0.5">{formatDateShort(todayStr)}</p>
          </div>
          <div className="flex items-center gap-2">
            <StaffHomeQrButton staff={myTeacher} staffRole="teacher" />
          </div>
        </div>
      </div>

      <HomeActionList items={homeActions} />

      <div className="mb-5">
        <WeeklyExpandableCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} schedules={schedules} />
      </div>

      {/* Phase 31 — 오늘 근무 카드 + 출/퇴근 */}
      <MyTodayShiftCard staff={myTeacher} staffRole="teacher" />

      {/* 선택 날짜 수업 */}
      <div className="px-4 mb-5">
        <p className="text-sm font-bold text-gray-700 mb-3">{dateLabel}</p>
        {daySessions.length === 0 ? (
          <div className="bg-white rounded-2xl px-4 py-5 text-center shadow-sm">
            <p className="text-sm text-gray-400">수업이 없어요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {daySessions.map((session) => {
              const group = classGroups.find((g) => g.id === session.classGroupId);
              const sessionAttended = academyAttendanceRecords.filter((a) => (
                a.sessionId === session.id && isConfirmedAttendance(a)
              )).length;
              return (
                <motion.button
                  key={session.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigateToClassGroup(session.classGroupId)}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm flex-1">{group?.name || '수업'}</span>
                    <span className="text-xs text-blue-600 font-medium">{formatClock(session.startTime)}</span>
                  </div>
                  <div className="flex items-center gap-3 ml-4 mt-1">
                    <span className="text-xs text-gray-400">{session.studentIds?.length || 0}명</span>
                    {sessionAttended > 0 && (
                      <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-medium">
                        출결 {sessionAttended}/{session.studentIds?.length || 0}
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-5">
        <SummaryCard label="오늘 수업" value={`${todaySessions.length}개`} onClick={() => setActiveTab('classes')} />
        <SummaryCard
          label="출결 미체크"
          value={`${todayStudentIds.filter((id) => !checkedTodayIds.has(id)).length}명`}
          color={todayStudentIds.some((id) => !checkedTodayIds.has(id)) ? 'text-orange-500' : 'text-gray-900'}
        />
        <SummaryCard
          label="기록 미작성"
          value={`${todayStudentIds.filter((id) => !notesWrittenToday.has(id)).length}건`}
          color={todayStudentIds.some((id) => !notesWrittenToday.has(id)) ? 'text-blue-600' : 'text-gray-900'}
        />
        {academyProfile?.clinicRequired !== false && (
          <SummaryCard
            label="클리닉"
            value={`${myClinics.length}건`}
            color={myClinics.length > 0 ? 'text-purple-600' : 'text-gray-900'}
          />
        )}
      </div>

      {/* Phase 32 — 작성 필요한 수업 기록 (본인 담당 완료 세션 중 기록 없음) */}
      {unfinishedRecordSessions.length > 0 && (
        <div className="mx-4 mb-5">
          <p className="text-sm font-bold text-gray-700 mb-2">작성 필요한 수업 기록</p>
          <div className="bg-amber-50 rounded-2xl border border-amber-100 overflow-hidden">
            {unfinishedRecordSessions.slice(0, 3).map((s) => {
              const group = classGroups.find((g) => g.id === s.classGroupId);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => navigateToClassSession(s.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-amber-100 last:border-0 text-left active:bg-amber-100/40"
                >
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                    <FileText size={14} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {group?.name || '수업'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {s.date} {formatTimeRange(s.startTime, s.endTime)}
                    </p>
                  </div>
                </button>
              );
            })}
            {unfinishedRecordSessions.length > 3 && (
              <p className="text-[11px] text-amber-600 text-center px-3 py-2 bg-white/40">
                외 {unfinishedRecordSessions.length - 3}건 더 있어요
              </p>
            )}
          </div>
        </div>
      )}

      {/* Phase 32 — 내 급여 요약 (이번 달) — 권한 있을 때만 */}
      <MyPayrollCard
        role="teacher"
        myPayroll={myPayroll}
        myStaffProfile={myTeacher}
        onOpen={() => setActiveTab('payroll')}
      />

      {/* 클리닉 현황 */}
      {academyProfile?.clinicRequired !== false && myClinics.length > 0 && (
        <div className="px-4">
          <p className="text-sm font-bold text-gray-700 mb-3">클리닉 현황</p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {myClinics.slice(0, 4).map((task) => {
              const student = academyStudents.find((s) => s.id === task.studentId);
              const statusColor = task.status === 'in_progress' ? 'text-blue-600' : 'text-orange-500';
              const statusLabel = task.status === 'in_progress' ? '진행 중' : '대기';
              return (
                <div
                  key={task.id}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-gray-50 last:border-0"
                >
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${task.priority === 'urgent' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                    {task.priority === 'urgent' ? '긴급' : '일반'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{student?.name} · {task.title}</p>
                  </div>
                  <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mySessions.length === 0 && (
        <div className="mx-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="text-4xl mb-3">✏️</div>
            <p className="font-bold text-gray-900 mb-1">아직 배정된 수업이 없어요</p>
            <p className="text-sm text-gray-500">원장에게 배정을 요청해주세요.</p>
            {!myTeacher && (
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                계정과 연결된 강사 정보가 없어요.<br />
                원장이 강사로 등록하면 여기에 수업이 표시됩니다.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color = 'text-gray-900', onClick }) {
  return (
    <button onClick={onClick} className="bg-white rounded-2xl p-4 shadow-sm text-left w-full active:scale-[0.97] transition-transform">
      <p className="text-xs text-gray-500 mb-1 font-medium">{label}</p>
      <p className={`text-2xl font-bold leading-none ${color}`}>{value}</p>
    </button>
  );
}
