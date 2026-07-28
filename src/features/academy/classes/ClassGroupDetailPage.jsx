import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Trash2, CalendarDays } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyClassSessionsBulk,
  deleteClassGroup as deleteServerClassGroup,
  updateClassGroup as updateServerClassGroup,
  updateFutureClassSessionRecordSchema,
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
  today, addDaysYMD, formatDateShort, compareYMD, getKoreanWeekdayFromYMD,
  getWeekDates, getMonthDates, formatMonth, nextMonth, prevMonth,
} from '../../../utils/date';
import { hhmmToMin } from '../../../utils/shiftCoverage';
import { getTeacherDisplayName } from '../../../utils/format';
import { currentUserCan } from '../../../utils/staffPermissions';
import { getRoomTagClassName } from '../../../utils/roomTags';
import {
  CLASS_ACTIVITY_TYPES,
  getActivityLabel,
  normalizeRecordSchema,
  recordSchemaToBlockIds,
} from '../../../constants/learningActivitySettings';
import ClassGroupFormModal, {
  mapClassSessionToServerPayload,
  matchSessionPairs,
} from './ClassGroupFormModal';
import RecordTemplateModal from './RecordTemplateModal';
import MakeupSessionModal from './MakeupSessionModal';

const SESSION_STATUS = {
  scheduled:   { label: '예정',  color: 'bg-blue-50 text-blue-600' },
  completed:   { label: '완료',  color: 'bg-green-50 text-green-600' },
  canceled:    { label: '취소',  color: 'bg-gray-100 text-gray-400' },
  rescheduled: { label: '변경',  color: 'bg-yellow-50 text-yellow-600' },
};
const DOW_TO_KO = ['일', '월', '화', '수', '목', '금', '토'];

function monthEndYMD(month) {
  const [year, m] = String(month || '').split('-').map(Number);
  if (!year || !m) return '';
  const last = new Date(year, m, 0).getDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

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
    updateClassGroup, applyRecordSchemaToFutureSessions,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUserId = useAuthStore((s) => s.user?.id);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((profile) => profile.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );
  const canManageClasses = currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canManageClasses',
  );
  const loadServerClassGroups = useWorkspaceStore((s) => s.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);

  const [showEditForm, setShowEditForm] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [calendarAnchor, setCalendarAnchor] = useState(today());
  const [calendarMode, setCalendarMode] = useState('week');
  const [generatingMonth, setGeneratingMonth] = useState(false);
  const [showRecordTemplate, setShowRecordTemplate] = useState(false);
  const [savingRecordTemplate, setSavingRecordTemplate] = useState(false);
  const [showMakeupForm, setShowMakeupForm] = useState(false);
  const todayStr = today();

  const group = classGroups.find((g) => g.id === selectedClassGroupId) ?? null;
  const activityLabel = getActivityLabel(
    CLASS_ACTIVITY_TYPES,
    group?.activityType || 'regular_class',
    group?.activityName,
  );
  const activeMonth = calendarAnchor.slice(0, 7);

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

  const actualGroupSessions = useMemo(
    () => group
      ? classSessions.filter((s) => s.classGroupId === selectedClassGroupId && s.status !== 'canceled')
      : [],
    [classSessions, group, selectedClassGroupId],
  );
  const activeMonthHasGeneratedSessions = useMemo(
    () => actualGroupSessions.some((s) => s.date?.startsWith(activeMonth)),
    [actualGroupSessions, activeMonth],
  );
  const activeMonthCanGenerate = useMemo(() => {
    if (!group || !activeMonth) return false;
    const monthEnd = monthEndYMD(activeMonth);
    if (group.startDate && group.startDate > monthEnd) return false;
    if (group.endDate && group.endDate < `${activeMonth}-01`) return false;
    return true;
  }, [group, activeMonth]);
  const calendarSessions = useMemo(() => {
    if (activeMonthHasGeneratedSessions || !activeMonthCanGenerate) return sessions;
    return sessions.filter((session) => !session.date?.startsWith(activeMonth));
  }, [sessions, activeMonthHasGeneratedSessions, activeMonthCanGenerate, activeMonth]);

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

  const handleGenerateActiveMonth = async () => {
    if (!group || !activeMonth || generatingMonth) return;
    setGeneratingMonth(true);
    try {
      const created = ensureClassSessionsForMonth?.(group.id, activeMonth) || [];
      if (created.length === 0) {
        showToast(`${activeMonth}에 만들 수업 일정이 없어요.`, 'info');
        return;
      }
      showToast(`${activeMonth} 수업 ${created.length}회차를 만들었어요.`);

      if (!group.serverId || !isAuthenticated || !currentAcademyId) return;
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
            ? `월별 수업은 만들어졌지만 서버 동기화에 실패했어요: ${err.message}`
            : '월별 수업은 만들어졌지만 서버 동기화에 실패했어요.',
          'error',
        );
      }
    } finally {
      setGeneratingMonth(false);
    }
  };

  return (
    <div>
      <Header
        title={group.name}
        onBack={goBackFromClassGroup}
        right={canManageClasses ? (
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
              <InfoRow label="유형" value={activityLabel} />
              <InfoRow
                label="시간"
                value={
                  group.weekdayTimes && Object.keys(group.weekdayTimes).length > 0
                    ? '요일별 다름'
                    : `${group.startTime}–${group.endTime}`
                }
              />
              {group.room && <InfoRow label="강의실" value={<RoomTag room={group.room} />} />}
              {teacherName && <InfoRow label="담당강사" value={teacherName} />}
              <InfoRow label="학생" value={`${students.length}명`} />
              {group.monthlyFee > 0 && <InfoRow label="월 수강료" value={`${group.monthlyFee.toLocaleString()}원`} />}
            </div>
            {canManageClasses && (
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRecordTemplate(true)}
                  className="rounded-xl bg-blue-50 py-2.5 text-xs font-bold text-blue-700 active:bg-blue-100"
                >
                  기록 구성
                </button>
                <button
                  type="button"
                  onClick={() => setShowMakeupForm(true)}
                  className="rounded-xl bg-violet-50 py-2.5 text-xs font-bold text-violet-700 active:bg-violet-100"
                >
                  + 보강 만들기
                </button>
              </div>
            )}
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

        <ClassGroupScheduleCalendar
          sessions={calendarSessions}
          students={students}
          attendanceRecords={academyAttendanceRecords}
          calendarAnchor={calendarAnchor}
          calendarMode={calendarMode}
          todayYMD={todayStr}
          monthNeedsGeneration={activeMonthCanGenerate && !activeMonthHasGeneratedSessions}
          generatingMonth={generatingMonth}
          onGenerateMonth={handleGenerateActiveMonth}
          onPrevPeriod={() => setCalendarAnchor((d) =>
            calendarMode === 'month' ? `${prevMonth(d.slice(0, 7))}-01` : addDaysYMD(d, -7)
          )}
          onNextPeriod={() => setCalendarAnchor((d) =>
            calendarMode === 'month' ? `${nextMonth(d.slice(0, 7))}-01` : addDaysYMD(d, 7)
          )}
          onCalendarModeChange={setCalendarMode}
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

      {showRecordTemplate && (
        <RecordTemplateModal
          title={`${group.name} 기록 구성`}
          description="반의 기본 형식으로 저장하고 오늘 이후 아직 끝나지 않은 회차에도 적용해요. 완료된 과거 기록은 바뀌지 않아요."
          initialSchema={group.recordSchema || group.recordBlocks}
          saving={savingRecordTemplate}
          onClose={() => setShowRecordTemplate(false)}
          onSave={async (schema) => {
            const normalized = normalizeRecordSchema(schema, []);
            setSavingRecordTemplate(true);
            try {
              updateClassGroup(group.id, {
                recordSchema: normalized,
                recordBlocks: recordSchemaToBlockIds(normalized),
              });
              applyRecordSchemaToFutureSessions(group.id, normalized, todayStr);
              if (group.serverId && isAuthenticated && currentAcademyId) {
                await updateServerClassGroup(group.serverId, {
                  record_schema: normalized,
                  record_blocks: recordSchemaToBlockIds(normalized),
                });
                await updateFutureClassSessionRecordSchema({
                  academyId: currentAcademyId,
                  classGroupId: group.serverId,
                  fromDate: todayStr,
                  recordSchema: normalized,
                });
                await Promise.all([loadServerClassGroups(), loadServerClassSessions()]);
              }
              setShowRecordTemplate(false);
            } catch (error) {
              showToast(error?.message || '기록 구성을 저장하지 못했어요.', 'error');
            } finally {
              setSavingRecordTemplate(false);
            }
          }}
        />
      )}

      {showMakeupForm && (
        <MakeupSessionModal
          group={group}
          students={students}
          sessions={sessions}
          onClose={() => setShowMakeupForm(false)}
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

function ClassGroupScheduleCalendar({
  sessions, students, attendanceRecords, calendarAnchor, calendarMode, todayYMD,
  monthNeedsGeneration, generatingMonth, onGenerateMonth,
  onPrevPeriod, onNextPeriod, onCalendarModeChange, onSessionClick,
}) {
  const selectedMonth = calendarAnchor.slice(0, 7);
  const weekDates = useMemo(() => getWeekDates(calendarAnchor), [calendarAnchor]);
  const monthDates = useMemo(() => getMonthDates(`${selectedMonth}-01`), [selectedMonth]);
  const visibleDates = calendarMode === 'month' ? monthDates : weekDates;
  const sessionsByDate = useMemo(() => {
    const map = new Map();
    visibleDates.filter(Boolean).forEach((date) => map.set(date, []));
    for (const session of sessions || []) {
      if (!session.date || !map.has(session.date) || session.status === 'canceled') continue;
      map.get(session.date).push(session);
    }
    for (const date of map.keys()) {
      map.get(date).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    }
    return map;
  }, [sessions, visibleDates]);

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
  const monthCount = monthDates
    .filter(Boolean)
    .reduce((sum, date) => sum + (sessionsByDate.get(date)?.length || 0), 0);
  const totalRange = calendarRange.endMin - calendarRange.startMin || 1;

  return (
    <div className="px-4 mb-5">
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-[#F2F4F6] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#191F28]">{calendarMode === 'month' ? '월간 수업표' : '주간 수업표'}</p>
            <p className="text-[11px] text-[#8B95A1] mt-0.5 truncate">
              {calendarMode === 'month'
                ? `${formatMonth(selectedMonth)} · ${monthCount}회`
                : `${weekLabel} · ${weekCount}회`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onPrevPeriod} className="w-9 h-9 rounded-xl bg-[#F2F4F6] text-[#4E5968] active:bg-[#E5E8EB] flex items-center justify-center" aria-label={calendarMode === 'month' ? '이전 달' : '이전 주'}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={onNextPeriod} className="w-9 h-9 rounded-xl bg-[#F2F4F6] text-[#4E5968] active:bg-[#E5E8EB] flex items-center justify-center" aria-label={calendarMode === 'month' ? '다음 달' : '다음 주'}>
              <ChevronRight size={16} />
            </button>
            <div className="flex rounded-xl bg-[#F2F4F6] p-1">
              {[
                { id: 'month', label: '월간' },
                { id: 'week', label: '주간' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onCalendarModeChange(item.id)}
                  className={`h-8 px-3 rounded-lg text-xs font-bold ${
                    calendarMode === item.id
                      ? 'bg-white text-[#3182F6] shadow-sm'
                      : 'text-[#8B95A1]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="relative">
          {calendarMode === 'month' ? (
            <div className={`overflow-hidden transition md:overflow-x-auto ${monthNeedsGeneration ? 'blur-[1.5px] opacity-45 pointer-events-none select-none' : ''}`}>
            <div className="w-full md:min-w-[760px]">
              <div className="grid grid-cols-7 bg-[#FBFCFD] border-b border-[#F2F4F6]">
                {DOW_TO_KO.map((day) => (
                  <div key={day} className="px-1 py-2 text-center text-[10px] font-extrabold text-[#8B95A1] md:px-3 md:text-left md:text-[11px]">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDates.map((date, idx) => {
                  if (!date) {
                    return <div key={`blank-${idx}`} className="min-h-[92px] border-r border-b border-[#F2F4F6] bg-[#FBFCFD] md:min-h-[120px]" />;
                  }
                  const daySessions = sessionsByDate.get(date) || [];
                  return (
                    <MonthSessionCell
                      key={date}
                      date={date}
                      sessions={daySessions}
                      students={students}
                      attendanceRecords={attendanceRecords}
                      todayYMD={todayYMD}
                      onSessionClick={onSessionClick}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          ) : (
            <div className={`overflow-hidden transition md:overflow-x-auto ${monthNeedsGeneration ? 'blur-[1.5px] opacity-45 pointer-events-none select-none' : ''}`}>
            <div className="w-full md:min-w-[760px]">
              <div className="grid grid-cols-[38px_repeat(7,minmax(0,1fr))] border-b border-[#F2F4F6] bg-[#FBFCFD] md:grid-cols-[56px_repeat(7,minmax(96px,1fr))]">
                <div className="px-1 py-2 text-center text-[9px] font-bold text-[#8B95A1] md:px-2 md:text-left md:text-[10px]">시간</div>
                {weekDates.map((date) => {
                  const isTodayCell = date === todayYMD;
                  return (
                    <div key={date} className="border-l border-[#F2F4F6] px-0.5 py-2 text-center md:px-2 md:text-left">
                      <p className={`text-[10px] font-extrabold leading-tight md:text-xs ${isTodayCell ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
                        {getKoreanWeekdayFromYMD(date)}
                        <span className="block text-[9px] font-bold text-[#8B95A1] md:ml-1 md:inline md:text-[10px]">{date.slice(5).replace('-', '.')}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-[38px_repeat(7,minmax(0,1fr))] md:grid-cols-[56px_repeat(7,minmax(96px,1fr))]">
                <div className="relative bg-[#FBFCFD] border-r border-[#F2F4F6]" style={{ height: calendarRange.height }}>
                  {calendarRange.ticks.map((tick) => (
                    <div
                      key={tick}
                      className="absolute right-0.5 text-[8px] font-medium text-[#8B95A1] md:right-2 md:text-[10px]"
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
                        <div className="absolute inset-x-0.5 top-4 rounded-lg border border-dashed border-[#F2F4F6] px-1 py-2 text-center text-[8px] font-semibold text-[#B0B8C1] md:inset-x-2 md:rounded-xl md:px-2 md:py-3 md:text-[11px]">
                          수업 없음
                        </div>
                      )}
                      {daySessions.map((session) => {
                        const start = hhmmToMin(session.startTime) ?? calendarRange.startMin;
                        const rawEnd = hhmmToMin(session.endTime) ?? start + 30;
                        const end = Math.max(start + 30, rawEnd);
                        const top = ((Math.max(calendarRange.startMin, start) - calendarRange.startMin) / totalRange) * 100;
                        const height = ((Math.min(calendarRange.endMin, end) - Math.max(calendarRange.startMin, start)) / totalRange) * 100;
                        return (
                          <WeekSessionBlock
                            key={session.id}
                            session={session}
                            students={students}
                            attendanceRecords={attendanceRecords}
                            todayYMD={todayYMD}
                            top={top}
                            height={height}
                            onSessionClick={onSessionClick}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          {monthNeedsGeneration && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/55 px-4">
              <div className="rounded-2xl bg-white/95 px-5 py-5 shadow-xl border border-blue-100 text-center max-w-[320px]">
                <p className="text-sm font-extrabold text-[#191F28]">아직 이 달 일정이 없어요</p>
                <p className="mt-1 text-xs leading-relaxed text-[#8B95A1]">
                  필요한 달만 수업 회차를 만들어 데이터가 불필요하게 쌓이지 않아요.
                </p>
                <button
                  type="button"
                  onClick={onGenerateMonth}
                  disabled={generatingMonth}
                  className="mt-4 w-full rounded-xl bg-[#3182F6] px-4 py-3 text-sm font-extrabold text-white shadow-sm active:bg-[#1B64DA] disabled:opacity-60"
                >
                  {generatingMonth ? '일정 만드는 중...' : '이 달 수업 일정 만들기'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WeekSessionBlock({ session, students, attendanceRecords, todayYMD, top, height, onSessionClick }) {
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
      type="button"
      title={title}
      aria-label={title}
      onClick={() => onSessionClick(session)}
      className={`absolute left-0.5 right-0.5 rounded-lg border px-1 py-1 text-left overflow-hidden active:scale-[0.99] md:left-2 md:right-2 md:rounded-xl md:px-2 md:py-2 ${
        isTodaySession
          ? 'border-[#3182F6] bg-blue-100 shadow-[0_8px_20px_rgba(49,130,246,0.18)] ring-2 ring-blue-100'
          : 'border-blue-200 bg-blue-50/80 shadow-sm'
      }`}
      style={{ top: `${top}%`, height: `${Math.max(5, height)}%`, minHeight: 40, zIndex: isTodaySession ? 12 : 8 }}
    >
      <div className="flex items-start justify-between gap-1 md:gap-1.5">
        <p className={`min-w-0 truncate text-[9px] font-extrabold md:text-xs ${isTodaySession ? 'text-[#0054C8]' : 'text-[#191F28]'}`}>
          {isTodaySession ? '오늘 수업' : '수업'}
        </p>
        <span className={`hidden shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold sm:inline-flex ${session.isPlanned ? 'bg-indigo-50 text-indigo-600' : statusInfo.color}`}>
          {session.isPlanned ? '규칙' : statusInfo.label}
        </span>
      </div>
      <div className="mt-0.5 hidden items-center gap-1.5 text-[10px] font-semibold text-[#8B95A1] md:flex">
        {session.room && <RoomTag room={session.room} compact />}
        <span>{students.length}명</span>
        {attendedCount > 0 && <span className="text-green-600">출석 {attendedCount}</span>}
      </div>
    </button>
  );
}

function MonthSessionCell({ date, sessions, students, attendanceRecords, todayYMD, onSessionClick }) {
  const isTodayCell = date === todayYMD;
  return (
    <div className={`min-h-[92px] border-r border-b border-[#F2F4F6] p-1.5 md:min-h-[120px] md:p-3 ${isTodayCell ? 'bg-blue-50/40' : 'bg-white'}`}>
      <div className="flex items-start justify-between gap-1 md:gap-2">
        <div>
          <p className={`text-xs font-extrabold md:text-sm ${isTodayCell ? 'text-[#3182F6]' : 'text-[#191F28]'}`}>
            {Number(date.slice(8))}
          </p>
          <p className="text-[9px] font-semibold text-[#8B95A1] md:text-[10px]">{getKoreanWeekdayFromYMD(date)}</p>
        </div>
        {sessions.length > 0 && (
          <span className="rounded-full bg-blue-50 px-1 py-0.5 text-[8px] font-bold text-[#3182F6] md:px-2 md:text-[10px]">
            {sessions.length}회
          </span>
        )}
      </div>
      {sessions.length === 0 ? (
        <p className="mt-3 text-[9px] font-semibold text-[#B0B8C1] md:mt-4 md:text-[11px]">수업 없음</p>
      ) : (
        <div className="mt-2 flex flex-col gap-1 md:mt-3 md:gap-1.5">
          {sessions.slice(0, 3).map((session) => {
            const statusInfo = SESSION_STATUS[session.status] || SESSION_STATUS.scheduled;
            const attendedCount = attendanceRecords.filter((a) => a.sessionId === session.id && a.status === 'present').length;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSessionClick(session)}
                className="rounded-lg border border-blue-100 bg-blue-50 px-1.5 py-1.5 text-left active:scale-[0.99] md:rounded-xl md:px-2.5 md:py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[9px] font-extrabold text-[#191F28] md:text-[11px]">
                    {formatSessionTimeRange(session.startTime, session.endTime)}
                  </p>
                  <span className={`hidden shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold md:inline-flex ${session.isPlanned ? 'bg-indigo-50 text-indigo-600' : statusInfo.color}`}>
                    {session.isPlanned ? '규칙' : statusInfo.label}
                  </span>
                </div>
                <p className="mt-0.5 hidden truncate text-[10px] font-semibold text-[#8B95A1] md:block">
                  {session.room || '강의실 미정'} · {students.length}명
                  {attendedCount > 0 ? ` · 출석 ${attendedCount}` : ''}
                </p>
              </button>
            );
          })}
          {sessions.length > 3 && (
            <p className="text-[9px] font-bold text-[#8B95A1] md:text-[10px]">+{sessions.length - 3}회</p>
          )}
        </div>
      )}
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
        {session.room && <RoomTag room={session.room} compact />}
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

function RoomTag({ room, compact = false }) {
  if (!room) return null;
  return (
    <span className={`inline-flex max-w-full items-center rounded-lg border font-bold ${getRoomTagClassName(room)} ${
      compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
    }`}>
      <span className="truncate">{room}</span>
    </span>
  );
}
