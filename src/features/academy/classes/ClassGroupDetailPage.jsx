import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Trash2, CalendarDays } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyClassSessionsBulk,
  deleteClassGroup as deleteServerClassGroup,
} from '../../../services/supabase/domainApi';
import EmptyState from '../../../components/EmptyState';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
// Phase 44.6 / Phase B — 룰 기반 예정 세션 머지.
import {
  buildPlannedClassSessions,
  mergePlannedAndActualClassSessions,
  plannedToClassSessionShape,
} from '../../../utils/schedule';
import {
  today, addDaysYMD, formatDateShort, compareYMD, getKoreanWeekdayFromYMD, getWeekDates,
} from '../../../utils/date';
import { hhmmToMin } from '../../../utils/shiftCoverage';
import { getTeacherDisplayName } from '../../../utils/format';
import ClassGroupFormModal, {
  mapClassSessionToServerPayload,
  matchSessionPairs,
} from './ClassGroupFormModal';

const SESSION_STATUS = {
  scheduled:   { label: '예정',  color: 'bg-blue-50 text-blue-600' },
  completed:   { label: '완료',  color: 'bg-green-50 text-green-600' },
  canceled:    { label: '취소',  color: 'bg-gray-100 text-gray-400' },
  rescheduled: { label: '변경',  color: 'bg-yellow-50 text-yellow-600' },
};

function formatTimelineHour(minutes) {
  const h = Math.floor((Number(minutes) || 0) / 60);
  return `${String(h).padStart(2, '0')}:00`;
}

function formatSessionTimeRange(start, end) {
  return `${String(start || '').slice(0, 5)}-${String(end || '').slice(0, 5)}`;
}

// 오늘/지난/다음 수업을 3개씩 미리보기로 나누어 반환.
// 원본 sessions 배열을 mutate하지 않음.
export function getSessionPreviewGroups({ sessions, todayYMD, limit = 3 }) {
  const safe = Array.isArray(sessions) ? sessions : [];
  const todaySessions = safe
    .filter((s) => s?.date === todayYMD)
    .slice()
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const pastSessions = safe
    .filter((s) => s?.date && compareYMD(s.date, todayYMD) < 0)
    .slice()
    .sort((a, b) => compareYMD(b.date, a.date) || (b.startTime || '').localeCompare(a.startTime || ''));
  const nextSessions = safe
    .filter((s) => s?.date && compareYMD(s.date, todayYMD) > 0)
    .slice()
    .sort((a, b) => compareYMD(a.date, b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
  return {
    todaySessions: todaySessions.slice(0, limit),
    pastSessions: pastSessions.slice(0, limit),
    nextSessions: nextSessions.slice(0, limit),
    todayTotal: todaySessions.length,
    pastTotal: pastSessions.length,
    nextTotal: nextSessions.length,
  };
}

export default function ClassGroupDetailPage() {
  const {
    role, selectedClassGroupId, classGroups, classSessions,
    academyStudents, academyTeachers, academyAssistants = [], academyProfile, academyAttendanceRecords,
    clinicRecords = [], navigateToClassSession, goBackFromClassGroup, setActiveTab,
    deleteClassGroup, showToast, ensureClassSessionsForMonth, setClassSessionServerIds,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUserId = useAuthStore((s) => s.user?.id);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerClassGroups = useWorkspaceStore((s) => s.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);

  const [showEditForm, setShowEditForm] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [weekAnchor, setWeekAnchor] = useState(today());
  const todayStr = today();

  const group = classGroups.find((g) => g.id === selectedClassGroupId) ?? null;
  const activeMonth = weekAnchor.slice(0, 7);

  useEffect(() => {
    if (!group || !activeMonth) return;
    const created = ensureClassSessionsForMonth?.(group.id, activeMonth) || [];
    if (created.length === 0) return;
    showToast(`${activeMonth} 수업 ${created.length}회차를 준비했어요.`);

    if (!group.serverId || !isAuthenticated || !currentAcademyId) return;
    void (async () => {
      try {
        const sessionPayloads = created.map((session) =>
          mapClassSessionToServerPayload(
            session,
            group.serverId,
            academyStudents,
            academyAssistants,
            academyTeachers,
            authUserId,
          )
        );
        const serverSessions = await createAcademyClassSessionsBulk({
          academyId: currentAcademyId,
          sessions: sessionPayloads,
        });
        setClassSessionServerIds?.(matchSessionPairs(created, serverSessions));
        await loadServerClassSessions?.();
      } catch (err) {
        console.error('[supabase] monthly class session sync failed', err);
        showToast(
          err?.message
            ? `월별 수업은 준비됐지만 서버 동기화에 실패했어요: ${err.message}`
            : '월별 수업은 준비됐지만 서버 동기화에 실패했어요.',
          'error',
        );
      }
    })();
  }, [
    group,
    activeMonth,
    ensureClassSessionsForMonth,
    showToast,
    isAuthenticated,
    currentAcademyId,
    academyStudents,
    academyAssistants,
    academyTeachers,
    authUserId,
    setClassSessionServerIds,
    loadServerClassSessions,
  ]);

  // Phase 44.6 / Phase B — 룰 기반 planned 세션 + 기존 classSessions 머지.
  const classScheduleRules = useWorkspaceStore((s) => s.classScheduleRules) ?? [];
  const classSessionExceptions = useWorkspaceStore((s) => s.classSessionExceptions) ?? [];
  const mergedClassSessions = useMemo(() => {
    if (!group) return [];
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
      // 룰 row 의 class_group_id 는 server uuid 이므로 group.serverId 로 필터.
      classGroupId: group.serverId || null,
    });
    const plannedShaped = plannedToClassSessionShape(plannedRaw, classGroups);
    const groupActual = classSessions.filter((s) => s.classGroupId === selectedClassGroupId);
    return mergePlannedAndActualClassSessions(plannedShaped, groupActual);
  }, [group, classSessions, classScheduleRules, classSessionExceptions, classGroups, selectedClassGroupId, todayStr]);

  const sessions = useMemo(
    () => group
      ? mergedClassSessions
          .slice()
          .sort((a, b) => compareYMD(a.date || '', b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''))
      : [],
    [mergedClassSessions, group]
  );

  const students = useMemo(
    () => group ? academyStudents.filter((s) => (group.studentIds || []).includes(s.id)) : [],
    [academyStudents, group]
  );

  const groupClinicRecords = useMemo(
    () => (clinicRecords || []).filter((r) => r.classGroupId === selectedClassGroupId),
    [clinicRecords, selectedClassGroupId]
  );

  if (!group) {
    return (
      <div className="min-h-[60vh] flex items-center">
        <EmptyState
          title="반 정보를 찾을 수 없어요"
          description="삭제되었거나 더 이상 사용할 수 없는 반입니다."
          action={(
            <button
              type="button"
              onClick={goBackFromClassGroup}
              className="px-5 py-3 bg-blue-600 text-white text-sm font-bold rounded-2xl"
            >
              수업 목록으로 돌아가기
            </button>
          )}
        />
      </div>
    );
  }

  const teacherName = (group.teacherId || group.teacherUserId)
    ? getTeacherDisplayName(group.teacherId, academyTeachers, academyProfile, group.teacherUserId)
    : null;

  const handleDeleteClassGroup = async () => {
    if (!window.confirm(`'${group.name}' 반과 모든 수업 회차를 삭제할까요?`)) return;

    const serverId = group.serverId;

    // 1) localStorage 삭제 (source of truth) — class_sessions / clinicTasks cascade 포함
    deleteClassGroup(selectedClassGroupId);

    // 2) Supabase write-through — serverId 있을 때만.
    //    class_sessions 는 FK on delete cascade 로 자동 삭제됨.
    if (serverId && isAuthenticated && currentAcademyId) {
      try {
        await deleteServerClassGroup(serverId);
        await Promise.all([loadServerClassGroups(), loadServerClassSessions()]);
      } catch (err) {
        console.error('[supabase] deleteClassGroup failed', err);
        showToast(
          err?.message
            ? `서버 삭제 실패: ${err.message}`
            : '반은 삭제되었지만 서버 삭제는 실패했어요.',
          'error',
        );
      }
    }

    goBackFromClassGroup();
  };

  return (
    <div>
      <Header
        title={group.name}
        onBack={goBackFromClassGroup}
        right={role === 'owner' ? (
          <div className="flex items-center gap-1">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowEditForm(true)}
              aria-label="반 수정"
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 md:hover:bg-gray-100"
            >
              <Pencil size={17} />
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleDeleteClassGroup}
              aria-label="반 삭제"
              className="w-9 h-9 flex items-center justify-center rounded-full text-red-400 active:bg-red-50 md:hover:bg-red-50"
            >
              <Trash2 size={17} />
            </motion.button>
          </div>
        ) : null}
      />

      <div className="pt-14 md:pt-0 pb-6">
        {/* 반 정보 카드 */}
        <div className="px-4 pt-4 mb-5">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <InfoRow label="요일" value={`${group.weekdays?.join('·')}요일`} />
              <InfoRow
                label="시간"
                value={
                  group.weekdayTimes && Object.keys(group.weekdayTimes).length > 0
                    ? '요일별 다름'
                    : `${group.startTime}–${group.endTime}`
                }
              />
              {group.room && <InfoRow label="강의실" value={group.room} />}
              {teacherName && <InfoRow label="담당강사" value={teacherName} />}
              <InfoRow label="학생" value={`${students.length}명`} />
              {group.monthlyFee > 0 && <InfoRow label="월 수강료" value={`${group.monthlyFee.toLocaleString()}원`} />}
            </div>
          </div>
        </div>

        {/* 학생 목록 */}
        {students.length > 0 && (
          <div className="px-4 mb-5">
            <p className="text-sm font-bold text-gray-700 mb-2">수강 학생</p>
            <div className="flex gap-2 flex-wrap">
              {students.map((s) => (
                <span key={s.id} className="bg-white shadow-sm text-sm font-medium text-gray-700 px-3 py-1.5 rounded-full border border-gray-100">
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 최근 클리닉 기록 */}
        {groupClinicRecords.length > 0 && (
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-gray-700">최근 클리닉 기록</p>
              <button type="button" onClick={() => setActiveTab('clinic')} className="text-xs text-blue-600 font-semibold">
                전체 보기
              </button>
            </div>
            <div className="bg-blue-50 rounded-2xl px-4 py-3">
              <p className="text-sm font-semibold text-blue-700">총 {groupClinicRecords.length}건 기록됨</p>
              <p className="text-xs text-blue-500 mt-0.5">
                {groupClinicRecords.slice(0, 2).map((r) => {
                  const stu = academyStudents.find((s) => s.id === r.studentId);
                  return `${stu?.name || '학생'}: ${r.subject}`;
                }).join(' / ')}
              </p>
            </div>
          </div>
        )}

        <ClassGroupWeekCalendar
          sessions={sessions}
          students={students}
          attendanceRecords={academyAttendanceRecords}
          weekAnchor={weekAnchor}
          todayYMD={todayStr}
          onPrevWeek={() => setWeekAnchor((d) => addDaysYMD(d, -7))}
          onNextWeek={() => setWeekAnchor((d) => addDaysYMD(d, 7))}
          onToday={() => setWeekAnchor(today())}
          onSessionClick={(session) => {
            if (session.isPlanned) {
              showToast('아직 실제 회차로 저장되지 않은 예정 수업이에요. 기록을 시작할 때 회차를 생성하도록 바꾸는 게 좋아요.', 'info');
              return;
            }
            navigateToClassSession(session.id);
          }}
        />

        {/* 전체 수업일 보기 */}
        {sessions.length > 0 && (
          <div className="px-4 mt-4">
            <button
              type="button"
              onClick={() => setShowAllSessions(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-gray-200 text-sm font-bold text-gray-700 active:bg-gray-50"
            >
              <CalendarDays size={16} className="text-gray-500" />
              전체 수업일 보기
              <span className="text-xs text-gray-400 font-medium">({sessions.length}회)</span>
            </button>
          </div>
        )}
      </div>

      {showEditForm && (
        <ClassGroupFormModal
          editGroup={group}
          onClose={() => setShowEditForm(false)}
        />
      )}

      {showAllSessions && (
        <AllSessionsModal
          sessions={sessions}
          students={students}
          attendanceRecords={academyAttendanceRecords}
          todayYMD={todayStr}
          onSessionClick={(session) => {
            if (session.isPlanned) {
              showToast('아직 실제 회차로 저장되지 않은 예정 수업이에요. 기록을 시작할 때 회차를 생성하도록 바꾸는 게 좋아요.', 'info');
              return;
            }
            setShowAllSessions(false);
            navigateToClassSession(session.id);
          }}
          onClose={() => setShowAllSessions(false)}
        />
      )}
    </div>
  );
}

function ClassGroupWeekCalendar({
  sessions, students, attendanceRecords, weekAnchor, todayYMD,
  onPrevWeek, onNextWeek, onSessionClick,
}) {
  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);
  const sessionsByDate = useMemo(() => {
    const map = new Map();
    weekDates.forEach((date) => map.set(date, []));
    for (const session of sessions || []) {
      if (!session.date || !map.has(session.date) || session.status === 'canceled') continue;
      map.get(session.date).push(session);
    }
    for (const date of weekDates) {
      map.get(date).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    }
    return map;
  }, [sessions, weekDates]);

  const calendarRange = useMemo(() => {
    const bounds = [];
    for (const date of weekDates) {
      for (const session of sessionsByDate.get(date) || []) {
        const start = hhmmToMin(session.startTime);
        const end = hhmmToMin(session.endTime);
        if (start != null) bounds.push(start);
        if (end != null) bounds.push(end);
      }
    }
    const min = bounds.length ? Math.min(...bounds) : 9 * 60;
    const max = bounds.length ? Math.max(...bounds) : 22 * 60;
    const startMin = Math.max(0, Math.floor((min - 60) / 60) * 60);
    const endMin = Math.min(24 * 60, Math.ceil((max + 60) / 60) * 60);
    const ticks = [];
    for (let t = startMin; t <= endMin; t += 60) ticks.push(t);
    return {
      startMin,
      endMin,
      ticks,
      height: Math.max(360, Math.round((endMin - startMin) * 0.72)),
    };
  }, [sessionsByDate, weekDates]);

  const weekLabel = `${formatDateShort(weekDates[0])} - ${formatDateShort(weekDates[6])}`;
  const weekCount = weekDates.reduce((sum, date) => sum + (sessionsByDate.get(date)?.length || 0), 0);
  const totalRange = calendarRange.endMin - calendarRange.startMin || 1;

  return (
    <div className="px-4 mb-5">
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-[#F2F4F6] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#191F28]">주간 수업표</p>
            <p className="text-[11px] text-[#8B95A1] mt-0.5 truncate">
              {weekLabel} · {weekCount}회
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onPrevWeek} className="w-8 h-8 rounded-lg text-[#4E5968] active:bg-[#F2F4F6] flex items-center justify-center" aria-label="이전 주">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={onNextWeek} className="w-8 h-8 rounded-lg text-[#4E5968] active:bg-[#F2F4F6] flex items-center justify-center" aria-label="다음 주">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[56px_repeat(7,minmax(96px,1fr))] border-b border-[#F2F4F6] bg-[#FBFCFD]">
              <div className="px-2 py-2 text-[10px] font-bold text-[#8B95A1]">시간</div>
              {weekDates.map((date) => {
                const isTodayCell = date === todayYMD;
                return (
                  <div key={date} className="px-2 py-2 border-l border-[#F2F4F6]">
                    <p className={`text-xs font-extrabold ${isTodayCell ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
                      {getKoreanWeekdayFromYMD(date)}
                      <span className="ml-1 text-[10px] font-bold text-[#8B95A1]">{date.slice(5).replace('-', '.')}</span>
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-[56px_repeat(7,minmax(96px,1fr))]">
              <div className="relative bg-[#FBFCFD] border-r border-[#F2F4F6]" style={{ height: calendarRange.height }}>
                {calendarRange.ticks.map((tick) => (
                  <div
                    key={tick}
                    className="absolute right-2 text-[10px] font-medium text-[#8B95A1]"
                    style={{
                      top: `clamp(10px, ${((tick - calendarRange.startMin) / totalRange) * 100}%, calc(100% - 16px))`,
                      transform: 'translateY(-50%)',
                    }}
                  >
                    {formatTimelineHour(tick)}
                  </div>
                ))}
              </div>
              {weekDates.map((date) => {
                const daySessions = sessionsByDate.get(date) || [];
                const isTodayColumn = date === todayYMD;
                return (
                  <div
                    key={date}
                    className={`relative border-l border-[#F2F4F6] ${isTodayColumn ? 'bg-blue-50/20' : 'bg-white'}`}
                    style={{ height: calendarRange.height }}
                  >
                    {calendarRange.ticks.map((tick) => (
                      <div
                        key={tick}
                        className="absolute left-0 right-0 border-t border-[#F2F4F6]"
                        style={{ top: `${((tick - calendarRange.startMin) / totalRange) * 100}%` }}
                      />
                    ))}
                    {daySessions.length === 0 && (
                      <div className="absolute inset-x-2 top-4 rounded-xl border border-dashed border-[#F2F4F6] px-2 py-3 text-center text-[11px] font-semibold text-[#B0B8C1]">
                        수업 없음
                      </div>
                    )}
                    {daySessions.map((session) => {
                      const start = hhmmToMin(session.startTime) ?? calendarRange.startMin;
                      const rawEnd = hhmmToMin(session.endTime) ?? start + 30;
                      const end = Math.max(start + 30, rawEnd);
                      const top = ((Math.max(calendarRange.startMin, start) - calendarRange.startMin) / totalRange) * 100;
                      const height = ((Math.min(calendarRange.endMin, end) - Math.max(calendarRange.startMin, start)) / totalRange) * 100;
                      const statusInfo = SESSION_STATUS[session.status] || SESSION_STATUS.scheduled;
                      const attendedCount = attendanceRecords.filter((a) => a.sessionId === session.id && a.status === 'present').length;
                      const isTodaySession = session.date === todayYMD;
                      const title = [
                        formatSessionTimeRange(session.startTime, session.endTime),
                        session.room || '',
                        `${students.length}명`,
                        session.isPlanned ? '규칙 예정' : statusInfo.label,
                      ].filter(Boolean).join(' · ');
                      return (
                        <button
                          key={session.id}
                          type="button"
                          title={title}
                          aria-label={title}
                          onClick={() => onSessionClick(session)}
                          className={`absolute left-2 right-2 rounded-xl border px-2 py-2 text-left overflow-hidden active:scale-[0.99] ${
                            isTodaySession
                              ? 'border-[#3182F6] bg-blue-100 shadow-[0_8px_20px_rgba(49,130,246,0.18)] ring-2 ring-blue-100'
                              : 'border-blue-200 bg-blue-50/80 shadow-sm'
                          }`}
                          style={{ top: `${top}%`, height: `${Math.max(5, height)}%`, minHeight: 48, zIndex: isTodaySession ? 12 : 8 }}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <p className={`min-w-0 truncate text-xs font-extrabold ${isTodaySession ? 'text-[#0054C8]' : 'text-[#191F28]'}`}>
                              {isTodaySession ? '오늘 수업' : '수업'}
                            </p>
                            <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${session.isPlanned ? 'bg-indigo-50 text-indigo-600' : statusInfo.color}`}>
                              {session.isPlanned ? '규칙' : statusInfo.label}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-[#8B95A1]">
                            {session.room && <span className="truncate">{session.room}</span>}
                            <span>{students.length}명</span>
                            {attendedCount > 0 && <span className="text-green-600">출석 {attendedCount}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AllSessionsModal({ sessions, students, attendanceRecords, todayYMD, onSessionClick, onClose }) {
  const [filter, setFilter] = useState('all'); // all | upcoming | past

  const filtered = useMemo(() => {
    if (filter === 'upcoming') {
      return sessions
        .filter((s) => compareYMD(s.date || '', todayYMD) >= 0)
        .slice()
        .sort((a, b) => compareYMD(a.date || '', b.date || ''));
    }
    if (filter === 'past') {
      return sessions
        .filter((s) => compareYMD(s.date || '', todayYMD) < 0)
        .slice()
        .sort((a, b) => compareYMD(b.date || '', a.date || ''));
    }
    // all: 오늘부터 미래는 가까운 순, 과거는 최신순으로 뒤에 붙임
    const upcoming = sessions
      .filter((s) => compareYMD(s.date || '', todayYMD) >= 0)
      .slice()
      .sort((a, b) => compareYMD(a.date || '', b.date || ''));
    const past = sessions
      .filter((s) => compareYMD(s.date || '', todayYMD) < 0)
      .slice()
      .sort((a, b) => compareYMD(b.date || '', a.date || ''));
    return [...upcoming, ...past];
  }, [sessions, todayYMD, filter]);

  const FILTERS = [
    { id: 'all', label: '전체' },
    { id: 'upcoming', label: '예정' },
    { id: 'past', label: '지난 수업' },
  ];

  return (
    <Modal isOpen onClose={onClose} title="전체 수업일">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                filter === f.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center">
            <p className="text-sm text-gray-400">해당 수업일이 없어요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((session) => {
              const isPast = compareYMD(session.date || '', todayYMD) < 0;
              return (
                <SessionCard key={session.id} session={session} students={students}
                  attendanceRecords={attendanceRecords}
                  onClick={() => onSessionClick(session)}
                  isPast={isPast}
                />
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function SessionCard({ session, students, attendanceRecords, onClick, isPast }) {
  const attendedCount = attendanceRecords.filter((a) => a.sessionId === session.id && a.status === 'present').length;
  const statusInfo = SESSION_STATUS[session.status] || SESSION_STATUS.scheduled;

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`bg-white rounded-2xl p-4 shadow-sm text-left w-full ${isPast ? 'opacity-80' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-gray-900 text-sm">{formatDateShort(session.date)}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>{session.startTime}–{session.endTime}</span>
        {session.room && <span>{session.room}</span>}
        <span>{students.length}명</span>
        {isPast && attendedCount > 0 && (
          <span className="text-green-600 font-medium">출석 {attendedCount}명</span>
        )}
      </div>
    </motion.button>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-gray-400 mb-0.5">{label}</p>
      <p className="font-semibold text-gray-800">{value}</p>
    </div>
  );
}
