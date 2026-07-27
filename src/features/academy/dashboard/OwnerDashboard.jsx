import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, FileText, Users as UsersIcon, AlertCircle, CheckSquare, QrCode } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { today, formatDateShort, greetingByTime } from '../../../utils/date';
import WeeklyExpandableCalendar from '../../../components/calendar/WeeklyExpandableCalendar';
import { classifyShiftStatus, readAttendanceSettings } from '../attendance/attendanceHelpers';
import QrDisplayPage from '../attendance/QrDisplayPage';
// Phase 44.6 / Phase B — 룰 기반 예정 세션 머지.
import {
  buildPlannedClassSessions,
  buildPlannedStaffSchedule,
  mergePlannedAndActualClassSessions,
  mergePlannedAndActualStaffShifts,
  plannedToClassSessionShape,
  plannedToStaffShiftShape,
} from '../../../utils/schedule';

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

export default function OwnerDashboard({ operationsOnly = false }) {
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
  const navigateToClassGroup = useAcademyStore((s) => s.navigateToClassGroup);
  const navigateToClassSession = useAcademyStore((s) => s.navigateToClassSession);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const academyInvitations = useWorkspaceStore((s) => s.academyInvitations) ?? [];
  const studentCheckEvents = useWorkspaceStore((s) => s.studentCheckEvents) ?? [];
  const staffAttendanceLogs = useWorkspaceStore((s) => s.staffAttendanceLogs) ?? [];
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const currentAcademy = memberships.find((m) => m.academy_id === currentAcademyId)?.academy || null;
  const attendance = readAttendanceSettings(currentAcademy);
  // Phase 44.6 / Phase B — 룰 기반 예정 세션 데이터.
  const classScheduleRules = useWorkspaceStore((s) => s.classScheduleRules) ?? [];
  const classSessionExceptions = useWorkspaceStore((s) => s.classSessionExceptions) ?? [];
  const staffWorkRules = useWorkspaceStore((s) => s.staffWorkRules) ?? [];
  const staffWorkExceptions = useWorkspaceStore((s) => s.staffWorkExceptions) ?? [];

  const [selectedDate, setSelectedDate] = useState(today());
  const [showQrDisplay, setShowQrDisplay] = useState(false);
  const todayStr = today();

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
    const from = todayStr;
    const to = (() => {
      const d = new Date(todayStr);
      d.setDate(d.getDate() + 60);
      return d.toISOString().slice(0, 10);
    })();
    const plannedRaw = buildPlannedClassSessions({
      rules: classScheduleRules,
      exceptions: classSessionExceptions,
      fromDate: from,
      toDate: to,
    });
    const plannedShaped = plannedToClassSessionShape(plannedRaw, classGroups);
    return mergePlannedAndActualClassSessions(plannedShaped, classSessions);
  }, [classSessions, classScheduleRules, classSessionExceptions, classGroups, todayStr]);

  const todaySessions = useMemo(
    () => mergedClassSessions.filter((s) => s.date === todayStr && s.status !== 'canceled'),
    [mergedClassSessions, todayStr]
  );

  const schedules = useMemo(() => [
    ...mergedClassSessions.filter((s) => s.status !== 'canceled').map((s) => ({ date: s.date, type: 'class' })),
  ], [mergedClassSessions]);

  const daySessions = useMemo(
    () => mergedClassSessions.filter((s) => s.date === selectedDate && s.status !== 'canceled')
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [mergedClassSessions, selectedDate]
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

  // 진행 중 / 곧 시작 수업 (시작 90분 이내)
  const nowMinutes = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, []);
  const inProgressOrSoonSessions = useMemo(() => {
    return todaySessions.filter((s) => {
      if (!s.startTime || !s.endTime) return false;
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      const startM = sh * 60 + sm;
      const endM = eh * 60 + em;
      // 진행 중 OR 90분 이내 시작
      return (nowMinutes >= startM && nowMinutes <= endM) || (startM - nowMinutes <= 90 && startM > nowMinutes);
    }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [todaySessions, nowMinutes]);

  // 미작성 수업 기록 — 오늘 또는 어제까지 status='completed' 인데 lesson_records (_common_) 없음
  const unfinishedLessonRecordSessions = useMemo(() => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

  // Phase 41 — 오늘 학생 등·하원 분류
  const todayStudentCheckSummary = useMemo(() => {
    const todayISO = todayStr;
    const checkedStudentIds = new Set();
    for (const ev of studentCheckEvents) {
      if (!ev.event_time) continue;
      if (!String(ev.event_time).startsWith(todayISO)) continue;
      if (ev.event_type === 'check_in') checkedStudentIds.add(ev.student_id);
    }
    return {
      checkedIn: checkedStudentIds.size,
      expected: todayStudentIds.length,
    };
  }, [studentCheckEvents, todayStr, todayStudentIds.length]);

  const isToday = selectedDate === todayStr;
  const dateLabel = isToday ? '오늘 일정' : formatDateShort(selectedDate);

  return (
    <div className="pt-6 pb-4">
      {/* 인사 */}
      <div className="px-5 mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-gray-500 text-sm">{greetingByTime()}</p>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5">오늘 학원 운영</h2>
            <p className="text-sm text-gray-400 mt-0.5">{formatDateShort(todayStr)} · {academyProfile.name || '학원'}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowQrDisplay(true)}
            className="h-11 px-4 rounded-2xl bg-[#0064FF] text-white text-sm font-bold flex items-center gap-1.5 shadow-sm active:bg-[#0050CC]"
          >
            <QrCode size={15} />
            공용 QR
          </button>
        </div>
      </div>

      {/* 주간 캘린더 */}
      <div className="mb-5">
        <WeeklyExpandableCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} schedules={schedules} />
      </div>

      {/* 선택 날짜 일정 */}
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
              return (
                <motion.button
                  key={session.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { navigateToClassGroup(session.classGroupId); }}
                  className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm flex-1">{group?.name || '수업'}</span>
                    <span className="text-xs text-gray-400">{formatTimeRange(session.startTime, session.endTime)}</span>
                  </div>
                  <p className="text-xs text-gray-400 ml-4">
                    {[session.room, `${session.studentIds?.length || 0}명`].filter(Boolean).join(' · ')}
                  </p>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-5">
        <SummaryCard label="오늘 수업" value={`${todaySessions.length}개`} onClick={() => setActiveTab('classes')} />
        <SummaryCard label="출석 예정" value={`${todayStudentIds.length}명`} onClick={() => setActiveTab('classes')} />
        <SummaryCard label="오늘 출근 예정" value={`${todayShiftStaffIds.length}명`} onClick={() => setActiveTab('staff')} />
        <SummaryCard
          label="오늘 클리닉 기록"
          value={`${todayClinicCount}건`}
          color={todayClinicCount > 0 ? 'text-blue-600' : 'text-gray-900'}
        />
        <SummaryCard
          label="이달 미납"
          value="준비 중"
          onClick={() => setActiveTab('payments')}
          pilotLocked
        />
        {!operationsOnly && (
          <SummaryCard
            label="급여 확인 필요"
            value="준비 중"
            onClick={() => setActiveTab('owner-payroll')}
            pilotLocked
          />
        )}
      </div>

      {/* Phase 41 — 오늘 출결 요약 카드 */}
      <div className="px-4 mb-5">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <CheckSquare size={14} className="text-emerald-600" />
              오늘 출결
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <AttendanceChip label="정상" value={todayShiftSummary.present} tone="emerald" />
            <AttendanceChip label="지각" value={todayShiftSummary.late} tone="amber" />
            <AttendanceChip label="미출근" value={todayShiftSummary.absent} tone="red" />
            <AttendanceChip label="퇴근" value={todayShiftSummary.completed} tone="gray" />
          </div>
          <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-500">학생 등원</span>
            <span className="text-sm font-bold text-gray-900">
              {todayStudentCheckSummary.checkedIn}
              <span className="text-xs text-gray-400 font-medium ml-1">
                / {todayStudentCheckSummary.expected}명
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Phase 30 — 운영 알림 카드 */}
      {(inProgressOrSoonSessions.length > 0
        || unfinishedLessonRecordSessions.length > 0
        || pendingInvitations.length > 0
        || recentAttendanceEvents.length > 0) && (
        <div className="px-4 mb-5 flex flex-col gap-2">
          {recentAttendanceEvents.length > 0 && (
            <OpsCard
              icon={CheckSquare}
              tone="green"
              title={`오늘 근퇴 알림 ${recentAttendanceEvents.length}건`}
              detail={recentAttendanceEvents
                .map((event) => `${event.name} ${event.action} ${event.time}`)
                .join(' · ')}
              onClick={() => setActiveTab('staff')}
            />
          )}
          {inProgressOrSoonSessions.length > 0 && (
            <OpsCard
              icon={Clock}
              tone="blue"
              title={`진행 중/곧 시작 수업 ${inProgressOrSoonSessions.length}개`}
              detail={inProgressOrSoonSessions
                .slice(0, 3)
                .map((s) => `${formatTimeRange(s.startTime, s.endTime)} ${classGroups.find((g) => g.id === s.classGroupId)?.name || ''}`)
                .join(' · ')}
              onClick={() => {
                const first = inProgressOrSoonSessions[0];
                if (first) navigateToClassSession(first.id);
              }}
            />
          )}
          {unfinishedLessonRecordSessions.length > 0 && (
            <OpsCard
              icon={FileText}
              tone="amber"
              title={`미작성 수업 기록 ${unfinishedLessonRecordSessions.length}개`}
              detail="완료된 수업에 기록이 비어 있어요."
              onClick={() => {
                const first = unfinishedLessonRecordSessions[0];
                if (first) navigateToClassSession(first.id);
              }}
            />
          )}
          {pendingInvitations.length > 0 && (
            <OpsCard
              icon={UsersIcon}
              tone="purple"
              title={`초대 대기 ${pendingInvitations.length}명`}
              detail="구성원 관리에서 상태를 확인할 수 있어요."
              onClick={() => setActiveTab('more')}
            />
          )}
        </div>
      )}

      {/* 강사별 수업 현황 */}
      {academyTeachers.length > 0 && (
        <div className="px-4 mb-4">
          <p className="text-sm font-bold text-gray-700 mb-3">강사별 오늘 수업</p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {academyTeachers.map((teacher) => {
              const teacherSessions = todaySessions.filter((s) => s.teacherId === teacher.id);
              return (
                <div key={teacher.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                  <span className="text-sm font-medium text-gray-800">{teacher.name}</span>
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
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
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

      {showQrDisplay && (
        <QrDisplayPage onClose={() => setShowQrDisplay(false)} />
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

function SummaryCard({ label, value, color = 'text-gray-900', onClick, pilotLocked = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={pilotLocked ? `${label}, 추후 제공 예정` : label}
      className={`bg-white rounded-2xl p-4 shadow-sm text-left w-full active:scale-[0.97] transition-all ${
        pilotLocked ? 'opacity-50 grayscale' : ''
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        {pilotLocked && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-400">
            추후 제공
          </span>
        )}
      </div>
      <p className={`${pilotLocked ? 'text-lg text-gray-500' : `text-2xl ${color}`} font-bold leading-none`}>
        {value}
      </p>
    </button>
  );
}

// Phase 30 — 운영 알림 카드.
function OpsCard({ icon: Icon, tone = 'blue', title, detail, onClick }) {
  const tones = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   iconColor: 'text-blue-600' },
    green:  { bg: 'bg-emerald-50', text: 'text-emerald-700', iconColor: 'text-emerald-600' },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  iconColor: 'text-amber-600' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', iconColor: 'text-purple-600' },
    red:    { bg: 'bg-red-50',    text: 'text-red-700',    iconColor: 'text-red-600' },
  };
  const t = tones[tone] || tones.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 shadow-sm text-left active:scale-[0.98] transition-transform ${t.bg}`}
    >
      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0">
        <Icon size={16} className={t.iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${t.text}`}>{title}</p>
        {detail && <p className="text-xs text-gray-500 mt-0.5 truncate">{detail}</p>}
      </div>
      <AlertCircle size={14} className="text-gray-300 flex-shrink-0" />
    </button>
  );
}
