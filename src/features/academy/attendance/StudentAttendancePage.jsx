import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogIn,
  LogOut,
  QrCode,
  Search,
  Users,
} from 'lucide-react';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { addDaysYMD, formatDateShort } from '../../../utils/date';
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
  const isLoading = useWorkspaceStore((state) => state.isStudentCheckEventsLoading);
  const eventsError = useWorkspaceStore((state) => state.studentCheckEventsError);
  const loadStudentCheckEvents = useWorkspaceStore((state) => state.loadStudentCheckEvents);
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
  const [viewFilter, setViewFilter] = useState('expected');
  const [search, setSearch] = useState('');
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
  const canRecordNow = canEdit
    && selectedDate === todayYmd
    && settings.studentCheckMethod !== 'disabled'
    && settings.studentManualOverrideEnabled;
  const myTeacher = useMemo(
    () => academyTeachers.find((teacher) => teacher.serverUserId === authUserId) || null,
    [academyTeachers, authUserId],
  );

  useEffect(() => {
    if (!selectedDate || !currentAcademyId) return;
    loadStudentCheckEvents({ sinceDateYMD: selectedDate, limit: 1000 });
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
    if (role !== 'teacher') return merged;
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
    role,
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
      .filter((student) => ['active', 'scheduled'].includes(student.status || 'active'))
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
        if (role === 'teacher' && !row.expected) return false;
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
    role,
  ]);

  const summary = useMemo(() => {
    const expectedIds = new Set();
    const checkedInIds = new Set();
    const insideIds = new Set();
    const leftIds = new Set();
    for (const student of academyStudents) {
      if (role === 'teacher' && !sessionsByStudentId.has(student.id)) continue;
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
  }, [academyStudents, sessionsByStudentId, selectedDate, studentCheckEvents, role]);
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

  const goDate = (days) => setSelectedDate((date) => addDaysYMD(date, days));
  const isToday = selectedDate === todayYmd;
  const qrEnabled = settings.studentCheckMethod === 'qr' && isToday;

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

      <div className="px-4 pt-[72px] pb-6 md:pt-0">
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-[#E5E8EB] bg-white px-3 py-2">
          <button type="button" onClick={() => goDate(-1)} className="h-10 w-10 rounded-xl text-gray-500 active:bg-gray-100">
            <ChevronLeft size={20} className="mx-auto" />
          </button>
          <button type="button" onClick={() => setSelectedDate(todayYmd)} className="min-w-0 px-3 text-center">
            <p className="text-sm font-extrabold text-gray-900">
              {isToday ? '오늘' : formatDateShort(selectedDate)}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-gray-400">{selectedDate}</p>
          </button>
          <button type="button" onClick={() => goDate(1)} className="h-10 w-10 rounded-xl text-gray-500 active:bg-gray-100">
            <ChevronRight size={20} className="mx-auto" />
          </button>
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

        <div className="mb-3 flex h-[52px] items-center gap-2.5 rounded-2xl border border-[#D1D6DB] bg-white px-4 focus-within:border-[#3182F6] focus-within:ring-2 focus-within:ring-blue-100">
          <Search size={18} className="flex-shrink-0 text-[#8B95A1]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="학생 이름, 학교, 학년 검색"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#191F28] outline-none placeholder:text-[#8B95A1]"
          />
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {VIEW_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setViewFilter(filter.id)}
              className={`flex-shrink-0 rounded-full px-3.5 py-2 text-xs font-bold ${
                viewFilter === filter.id
                  ? 'bg-[#191F28] text-white'
                  : 'border border-gray-200 bg-white text-gray-500'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {eventsError && (
          <div className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
            {eventsError}
          </div>
        )}

        {isLoading && rows.length === 0 ? (
          <div className="rounded-2xl bg-white px-5 py-10 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-white px-5 py-10 text-center shadow-sm">
            <Users size={24} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-bold text-gray-700">표시할 학생이 없어요</p>
            <p className="mt-1 text-xs text-gray-400">검색어나 필터를 바꿔보세요.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <StudentPresenceRow
                key={row.student.id}
                row={row}
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
                onOpenSession={(session) => void openSession(session)}
              />
            ))}
          </div>
        )}
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
}) {
  const { student, state, sessions, presence } = row;
  const PresenceIcon = presence.icon;
  const actionLabel = state.isInside ? '하원 처리' : state.latest ? '재등원' : '등원 처리';

  return (
    <div className="rounded-[22px] border border-[#E5E8EB] bg-white p-4 transition-colors hover:border-[#D1D6DB]">
      <div className="grid items-center gap-4 md:grid-cols-[minmax(200px,0.9fr)_minmax(280px,1.35fr)_auto]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#E8F3FF] text-base font-black text-[#1B64DA]">
            {(student.name || '?')[0]}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold text-[#191F28]">{student.name}</p>
            <p className="mt-1 truncate text-xs font-medium text-[#6B7684]">
              {[student.school, student.grade].filter(Boolean).join(' · ') || '학교 정보 없음'}
            </p>
          </div>
        </div>

        <div className="min-w-0 border-t border-gray-100 pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
          <p className="mb-2 text-[10px] font-bold text-[#8B95A1]">오늘 수업</p>
          {sessions.length > 0 ? (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              {sessions.map((session) => {
                const group = classGroups.find((item) => item.id === session.classGroupId);
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onOpenSession(session)}
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-2 text-left active:bg-gray-100"
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

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 md:justify-end md:border-t-0 md:pt-0">
          <div className="min-w-0 text-left md:text-right">
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
              className={`h-11 min-w-[76px] flex-shrink-0 rounded-xl px-3 text-xs font-extrabold transition-transform active:scale-[0.97] disabled:opacity-40 ${
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
