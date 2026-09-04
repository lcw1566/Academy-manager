import { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CalendarDays,
  Pencil, Trash2, Clock3, CheckCircle2, MapPin,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { deleteClinicRecord as deleteServerClinicRecord } from '../../../services/supabase/domainApi';
import Header from '../../../components/Header';
import EmptyState from '../../../components/EmptyState';
import { ListSearchFilterBar, ListFilterChips } from '../../../components/filters/ListFilters';
import ClinicRecordFormModal from './ClinicRecordFormModal';
import ClinicInlineWorksheet from './ClinicInlineWorksheet';
import ClinicEventFormModal from './ClinicEventFormModal';
import {
  today,
  addDaysYMD,
  formatDateShort,
  getKoreanWeekdayFromYMD,
} from '../../../utils/date';
import { CLINIC_SUBJECT_FILTERS } from '../../../constants/labels';
import { currentUserCan } from '../../../utils/staffPermissions';
import {
  CLINIC_ACTIVITY_TYPES,
  getActivityLabel,
} from '../../../constants/learningActivitySettings';
import { ACADEMY_SUBJECT_OPTIONS } from '../../../constants/academySettings';
import {
  buildPlannedClassSessions,
  mergePlannedAndActualClassSessions,
  plannedToClassSessionShape,
} from '../../../utils/schedule';

function DateStepper({ value, todayValue, onChange, recordCount, scheduleCount }) {
  const touchStart = useRef(null);
  const [year, month, day] = String(value || '').split('-').map(Number);
  const [todayYear] = String(todayValue || '').split('-').map(Number);
  const weekday = getKoreanWeekdayFromYMD(value);
  const isToday = value === todayValue;
  const dateLabel = `${year !== todayYear ? `${year}년 ` : ''}${month || ''}월 ${day || ''}일 ${weekday}요일`;

  const handleTouchEnd = (event) => {
    if (!touchStart.current) return;
    const distanceX = touchStart.current.x - event.changedTouches[0].clientX;
    const distanceY = touchStart.current.y - event.changedTouches[0].clientY;
    touchStart.current = null;
    if (Math.abs(distanceX) < 48 || Math.abs(distanceX) <= Math.abs(distanceY) * 1.2) return;
    onChange(addDaysYMD(value, distanceX > 0 ? 1 : -1));
  };

  return (
    <section
      className="mx-4 mt-4 overflow-hidden rounded-2xl border border-seenit-border-soft bg-seenit-surface px-3 py-2 shadow-sm"
      onTouchStart={(event) => {
        touchStart.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      }}
      onTouchEnd={handleTouchEnd}
    >
      <div className="mx-auto flex w-full max-w-xl items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(addDaysYMD(value, -1))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-seenit-muted transition-colors hover:bg-seenit-control active:scale-95"
          aria-label="이전 날짜"
          title="이전 날짜"
        >
          <ChevronLeft size={19} />
        </button>

        <label className="relative flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg text-seenit-ink transition-colors hover:bg-seenit-elevated">
          <CalendarDays size={16} className="shrink-0 text-seenit-brand" />
          <span className="truncate text-sm font-extrabold" aria-live="polite">
            {isToday ? `오늘 · ${dateLabel}` : dateLabel}
          </span>
          <input
            type="date"
            value={value}
            onChange={(event) => {
              if (event.target.value) onChange(event.target.value);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="클리닉 날짜 선택"
          />
        </label>

        <button
          type="button"
          onClick={() => onChange(addDaysYMD(value, 1))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-seenit-muted transition-colors hover:bg-seenit-control active:scale-95"
          aria-label="다음 날짜"
          title="다음 날짜"
        >
          <ChevronRight size={19} />
        </button>
      </div>

      <div className="relative mx-auto flex min-h-5 w-full max-w-xl items-center justify-center px-10">
        <p className="truncate text-[11px] font-semibold text-seenit-muted">
          일정 {scheduleCount}개 · 활동 기록 {recordCount}건
        </p>
        {!isToday && (
          <button
            type="button"
            onClick={() => onChange(todayValue)}
            className="absolute right-0 shrink-0 text-[11px] font-bold text-seenit-brand active:opacity-60"
          >
            오늘로
          </button>
        )}
      </div>
    </section>
  );
}

const SUPPORT_TAG_LABELS = {
  homework:       '숙제 미완료',
  wrong_answer:   '오답 풀이 필요',
  vocabulary:     '단어 재시험',
  reading:        '본문 암기',
  grammar:        '문법 보충',
  concept:        '개념 재설명',
  test_retry:     '테스트 재응시',
  absence_makeup: '결석 보강',
  other:          '기타',
};

export default function ClinicPage() {
  const {
    role, clinicRecords = [], academyStudents, classGroups, academyProfile,
    academyLessonRecords = [], classSessions = [],
    deleteClinicRecord, showToast,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerClinicRecords = useWorkspaceStore((s) => s.loadServerClinicRecords);
  const loadServerClinicEvents = useWorkspaceStore((s) => s.loadServerClinicEvents);
  const clinicEvents = useWorkspaceStore((s) => s.serverClinicEvents) ?? [];
  const loadServerClassGroups = useWorkspaceStore((s) => s.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const loadClassScheduleRules = useWorkspaceStore((s) => s.loadClassScheduleRules);
  const loadClassSessionExceptions = useWorkspaceStore(
    (s) => s.loadClassSessionExceptions,
  );
  const ensureClassSessionsForRangeLocal = useWorkspaceStore(
    (s) => s.ensureClassSessionsForRangeLocal,
  );
  const materializePlannedClassSession = useWorkspaceStore(
    (s) => s.materializePlannedClassSession,
  );
  const classScheduleRules = useWorkspaceStore((s) => s.classScheduleRules) ?? [];
  const classSessionExceptions = useWorkspaceStore((s) => s.classSessionExceptions) ?? [];
  const authUserId = useAuthStore((s) => s.user?.id);
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((sp) => sp.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );

  const [subjectFilter, setSubjectFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState(() => today());
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [editRecord, setEditRecord] = useState(null);
  const [quickTarget, setQuickTarget] = useState(null);
  const [expandedExpectedIds, setExpandedExpectedIds] = useState(() => new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const todayStr = today();
  const isSelectedToday = selectedDate === todayStr;

  useEffect(() => {
    if (!currentAcademyId) return;
    void loadServerClinicEvents();
  }, [currentAcademyId, loadServerClinicEvents]);

  useEffect(() => {
    if (!currentAcademyId || !selectedDate) return;
    void (async () => {
      try {
        // 로그인 직후 또는 다른 기기에서 반 시간을 바꾼 직후에도 전역 초기화와
        // 실시간 이벤트 순서에 의존하지 않고 오늘 일정의 최신 원본을 먼저 받는다.
        await Promise.all([
          loadServerClassGroups(),
          loadServerClassSessions(),
          loadClassScheduleRules(),
          loadClassSessionExceptions({ fromDate: selectedDate, toDate: selectedDate }),
        ]);
        await ensureClassSessionsForRangeLocal({
          fromDate: selectedDate,
          toDate: selectedDate,
        });
      } catch (error) {
        console.warn('[clinic] 선택 날짜 수업 회차 준비 실패', error);
      }
    })();
  }, [
    currentAcademyId,
    ensureClassSessionsForRangeLocal,
    loadClassScheduleRules,
    loadClassSessionExceptions,
    loadServerClassGroups,
    loadServerClassSessions,
    selectedDate,
  ]);

  // 보조강사: 강사가 수업에서 남긴 보완 항목 목록
  const supportItems = useMemo(() => {
    if (role !== 'assistant') return [];
    return academyLessonRecords
      .filter((lr) => lr.studentId !== '_common_' && (lr.supportTags?.length > 0 || lr.supportMemo?.trim()))
      .map((lr) => {
        const session = classSessions.find((s) => s.id === lr.sessionId);
        const group = session ? classGroups.find((g) => g.id === session.classGroupId) : null;
        const student = academyStudents.find((s) => s.id === lr.studentId);
        return { ...lr, session, group, student };
      })
      .sort((a, b) => (b.session?.date || '').localeCompare(a.session?.date || ''));
  }, [role, academyLessonRecords, classSessions, classGroups, academyStudents]);
  const selectedSupportItems = useMemo(
    () => supportItems.filter((item) => item.session?.date === selectedDate),
    [supportItems, selectedDate],
  );

  const [showClinicFromSupport, setShowClinicFromSupport] = useState(null);

  const filtered = useMemo(() => {
    let list = clinicRecords.filter((record) => record.date === selectedDate);
    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter((record) => {
        const student = academyStudents.find((item) => item.id === record.studentId);
        const group = classGroups.find((item) => (
          item.id === record.classGroupId || item.serverId === record.classGroupId
        ));
        const searchText = [
          student?.name,
          student?.school,
          group?.name,
          record.subject,
          record.activityName,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchText.includes(query);
      });
    }
    if (subjectFilter !== 'all') {
      if (subjectFilter === 'other') {
        list = list.filter((r) => !['국어', '수학', '영어'].includes(r.subject));
      } else {
        list = list.filter((r) => r.subject === subjectFilter);
      }
    }
    return list;
  }, [clinicRecords, academyStudents, classGroups, search, subjectFilter, selectedDate]);

  const selectedDateRecordCount = useMemo(
    () => clinicRecords.filter((record) => record.date === selectedDate).length,
    [clinicRecords, selectedDate],
  );
  // 수업·등하원과 같은 계산기를 사용한다. RPC가 실제 회차를 반영하기 전에도
  // 규칙상 오늘 수업은 보이고, 실제 행이 도착하면 자연키 기준으로 하나만 남는다.
  const selectedScheduleSessions = useMemo(() => {
    const planned = plannedToClassSessionShape(
      buildPlannedClassSessions({
        rules: classScheduleRules,
        exceptions: classSessionExceptions,
        fromDate: selectedDate,
        toDate: selectedDate,
      }),
      classGroups,
    );
    return mergePlannedAndActualClassSessions(planned, classSessions)
      .filter((session) => (
        session.date === selectedDate
        && !['canceled', 'cancelled'].includes(session.status)
      ));
  }, [
    classGroups,
    classScheduleRules,
    classSessionExceptions,
    classSessions,
    selectedDate,
  ]);

  const selectedExpectedGroups = useMemo(() => selectedScheduleSessions
    .slice()
    .sort((a, b) => (
      (a.startTime || '').localeCompare(b.startTime || '')
      || String(a.id).localeCompare(String(b.id))
    ))
    .map((session) => {
      const group = classGroups.find((item) => (
        item.id === session.classGroupId || item.serverId === session.classGroupId
      ));
      const studentIds = Array.isArray(session.studentIds) && session.studentIds.length > 0
        ? session.studentIds
        : group?.studentIds || [];
      const students = [...new Set(studentIds)]
        .map((studentId) => academyStudents.find((student) => student.id === studentId))
        .filter(Boolean)
        .map((student) => ({
          ...student,
          clinicRecord: clinicRecords.find((record) => (
            record.date === selectedDate
            && record.studentId === student.id
            && (
              record.classSessionId === session.id
              || (
                !record.classSessionId
                && (record.classGroupId === group?.id || record.classGroupId === group?.serverId)
              )
              || (
                session.isPlanned
                && (record.classGroupId === group?.id || record.classGroupId === group?.serverId)
              )
            )
          )) || null,
        }));
      return { session, group, students };
    })
    .filter((item) => item.students.length > 0), [
    selectedScheduleSessions,
    classGroups,
    academyStudents,
    clinicRecords,
    selectedDate,
  ]);
  const selectedClinicEventGroups = useMemo(() => clinicEvents
    .filter((event) => event.event_date === selectedDate && event.status !== 'cancelled')
    .slice()
    .sort((left, right) => (
      String(left.start_time || '99:99').localeCompare(String(right.start_time || '99:99'))
      || String(left.name || '').localeCompare(String(right.name || ''), 'ko')
    ))
    .map((event) => {
      const linkedGroup = classGroups.find((group) => (
        group.id === event.class_group_id || group.serverId === event.class_group_id
      )) || null;
      const participantRows = Array.isArray(event.clinic_event_students)
        ? event.clinic_event_students.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        : [];
      const recordedStudentIds = clinicRecords
        .filter((record) => record.clinicEventId === event.id)
        .map((record) => record.studentId);
      const participantIds = [...new Set([
        ...participantRows.map((participant) => participant.student_id),
        ...recordedStudentIds,
      ])];
      const students = participantIds
        .map((studentId) => academyStudents.find((student) => student.id === studentId))
        .filter(Boolean)
        .map((student) => ({
          ...student,
          clinicSubject: participantRows.find((row) => row.student_id === student.id)?.subject_override || '',
          clinicRecord: clinicRecords.find((record) => (
            record.clinicEventId === event.id && record.studentId === student.id
          )) || null,
        }));
      return {
        event,
        session: {
          id: event.id,
          serverId: event.id,
          date: event.event_date,
          startTime: event.start_time?.slice(0, 5) || '',
          endTime: event.end_time?.slice(0, 5) || '',
          isClinicEvent: true,
        },
        group: linkedGroup || {
          id: '',
          serverId: '',
          name: event.name,
          subject: event.subject || '',
          room: event.room || '',
          isClinicEvent: true,
        },
        students,
      };
    }), [clinicEvents, selectedDate, classGroups, clinicRecords, academyStudents]);
  const unlinkedSelectedExpectedGroups = useMemo(() => {
    const linkedGroupIds = new Set(selectedClinicEventGroups
      .map(({ event }) => event.class_group_id)
      .filter(Boolean));
    return selectedExpectedGroups.filter(({ group }) => (
      !group || (!linkedGroupIds.has(group.id) && !linkedGroupIds.has(group.serverId))
    ));
  }, [selectedClinicEventGroups, selectedExpectedGroups]);
  const temporaryClinicSubject = useMemo(() => {
    const subjects = Array.isArray(academyProfile?.academySubjects)
      ? academyProfile.academySubjects
      : [];
    if (subjects.length !== 1) return '';
    return ACADEMY_SUBJECT_OPTIONS.find((option) => option.id === subjects[0])?.label || '';
  }, [academyProfile?.academySubjects]);
  const temporaryClinicStudents = useMemo(() => {
    if (classGroups.length > 0 || selectedExpectedGroups.length > 0) return [];
    return academyStudents
      .filter((student) => (student.status || 'active') !== 'inactive')
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'))
      .map((student) => ({
        ...student,
        clinicRecord: clinicRecords.find((record) => (
          record.date === selectedDate && record.studentId === student.id
        )) || null,
      }));
  }, [classGroups.length, selectedExpectedGroups.length, academyStudents, clinicRecords, selectedDate]);
  const temporaryClinicSession = useMemo(() => ({
    id: `temporary-clinic-${selectedDate}`,
    date: selectedDate,
    isTemporary: true,
  }), [selectedDate]);
  const temporaryClinicGroup = useMemo(() => ({
    id: '',
    name: '전체 학생',
    subject: temporaryClinicSubject,
    isTemporary: true,
  }), [temporaryClinicSubject]);

  const hasRecordQuery = !!search.trim() || subjectFilter !== 'all';
  const selectedScheduleCount = selectedClinicEventGroups.length
    + unlinkedSelectedExpectedGroups.length;
  const toggleExpectedGroup = (sessionId) => {
    setExpandedExpectedIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const openExpectedStudentRecord = async ({ student, session, group }) => {
    if (student.clinicRecord) {
      setEditRecord(student.clinicRecord);
      return;
    }
    try {
      const actualSession = session?.isPlanned
        ? await materializePlannedClassSession(session)
        : session;
      if (!actualSession?.id) {
        throw new Error('선택한 날짜의 수업 회차를 준비하지 못했어요.');
      }
      setQuickTarget({
        studentId: student.id,
        date: selectedDate,
        subject: group?.subject || '',
        classGroupId: group?.id || '',
        classSessionId: actualSession.id,
      });
    } catch (error) {
      console.error('[clinic] 예정 회차 상세 기록 열기 실패', error);
      showToast(error?.message || '클리닉 기록을 열지 못했어요.', 'error');
    }
  };

  const openClinicEventStudentRecord = ({ student, event, group }) => {
    if (student.clinicRecord) {
      setEditRecord(student.clinicRecord);
      return;
    }
    setQuickTarget({
      studentId: student.id,
      date: event.event_date,
      subject: student.clinicSubject || event.subject || group?.subject || '',
      classGroupId: group?.isClinicEvent ? '' : (group?.id || ''),
      classSessionId: '',
      clinicEventId: event.id,
    });
  };

  // Phase 31 — 권한 게이팅. 클리닉 작성 권한이 있어야 + 버튼 노출.
  const canEditClinic = currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canEditClinicRecords',
  );
  const canManageStudents = currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canManageStudents',
  );
  const canEditRecord = () => canEditClinic;
  // 서버 RLS와 동일하게 학생 관리 권한이 있어야 삭제할 수 있다.
  const canDeleteRecord = () => role === 'owner' || canManageStudents;

  const buildSupportRelayTarget = (item) => ({
    studentId: item.studentId,
    classGroupId: item.group?.id || '',
    classSessionId: item.sessionId || '',
    date: item.session?.date || selectedDate,
    subject: item.group?.subject || '',
    sourceSupportTags: item.supportTags || [],
    sourceSupportMemo: item.supportMemo || '',
    sourceLessonRecordId: item.id || null,
  });

  const handleDelete = async (id) => {
    const target = clinicRecords.find((r) => r.id === id);
    if (!canDeleteRecord(target)) {
      showToast('삭제 권한이 없어요.', 'error');
      setDeleteConfirmId(null);
      return;
    }
    const serverId = target?.serverId || null;
    try {
      if (serverId && isAuthenticated && currentAcademyId) {
        await deleteServerClinicRecord(serverId);
        await loadServerClinicRecords();
      }
      deleteClinicRecord(id);
      setDeleteConfirmId(null);
      setExpandedId(null);
    } catch (err) {
      console.error('[supabase] deleteClinicRecord failed', err);
      showToast(err?.message || '클리닉 기록을 삭제하지 못했어요.', 'error');
    }
  };

  return (
    <div>
      <Header
        title="클리닉"
        right={
          canEditClinic ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowEventForm(true)}
              aria-label="클리닉 추가"
              className="h-9 w-9 md:w-auto md:px-4 flex items-center justify-center gap-1.5 rounded-xl bg-[#0064FF] text-white text-sm font-bold shadow-sm active:bg-[#0050CC]"
            >
              <Plus size={14} />
              <span className="hidden md:inline">클리닉 추가</span>
            </motion.button>
          ) : null
        }
      />

      <div className="pt-14 md:pt-0 pb-6">
        <DateStepper
          value={selectedDate}
          todayValue={todayStr}
          onChange={(nextDate) => {
            setSelectedDate(nextDate);
            setExpandedExpectedIds(new Set());
            setExpandedId(null);
          }}
          recordCount={selectedDateRecordCount}
          scheduleCount={selectedScheduleCount}
        />

        {selectedClinicEventGroups.length > 0 && (
          <section className="px-4 mt-5 mb-5">
            <div className="mb-2">
              <p className="text-sm font-bold text-gray-900">
                {isSelectedToday
                  ? '오늘 클리닉'
                  : `${Number(selectedDate.slice(5, 7))}월 ${Number(selectedDate.slice(8, 10))}일 클리닉`}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400">일정별로 펼치고 학생마다 한 행에서 기록하세요.</p>
            </div>
            <div className="flex flex-col gap-2">
              {selectedClinicEventGroups.map(({ event, session, group, students }) => {
                const expansionKey = `event-${event.id}`;
                const expanded = expandedExpectedIds.has(expansionKey);
                return (
                  <div key={event.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                    <div className="flex items-center gap-2 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleExpectedGroup(expansionKey)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors active:bg-gray-50"
                        aria-expanded={expanded}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                          <Clock3 size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-gray-900">{event.name}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-gray-400">
                            {[session.startTime, event.subject].filter(Boolean).join(' · ') || '시간·과목 자유'}
                            {event.room && <><MapPin size={10} />{event.room}</>}
                          </span>
                        </span>
                        <span className="text-[11px] font-semibold text-gray-400">
                          {students.filter((student) => student.clinicRecord).length}/{students.length}
                        </span>
                        <ChevronDown
                          size={16}
                          className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {canEditClinic && (
                        <button
                          type="button"
                          onClick={() => setEditEvent(event)}
                          aria-label={`${event.name} 수정`}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                    <div
                      className="grid transition-[grid-template-rows] duration-200 ease-out"
                      style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
                    >
                      <div className="overflow-hidden">
                        {canEditClinic ? (
                          <ClinicInlineWorksheet
                            session={session}
                            group={group}
                            clinicEvent={event}
                            students={students}
                            academyProfile={academyProfile}
                            onOpenRecord={(student) => openClinicEventStudentRecord({ student, event, group })}
                          />
                        ) : (
                          <div className="divide-y divide-gray-50 border-t border-gray-50">
                            {students.map((student) => (
                              <div key={student.id} className="flex items-center gap-3 px-4 py-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-50 text-xs font-bold text-gray-500">
                                  {student.name?.slice(0, 1) || '학'}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{student.name}</span>
                                {student.clinicRecord && <CheckCircle2 size={15} className="text-emerald-500" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {unlinkedSelectedExpectedGroups.length > 0 && (
          <section className={`px-4 mb-5 ${selectedClinicEventGroups.length === 0 ? 'mt-5' : ''}`}>
            <div className="mb-2 flex items-end justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">수업에서 바로 기록</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {academyProfile?.clinicRequired === false
                    ? '필요한 학생을 눌러 기록하세요.'
                    : '반 순서대로 학생을 확인하세요.'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {unlinkedSelectedExpectedGroups.map(({ session, group, students }) => (
                <div key={session.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleExpectedGroup(session.id)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors active:bg-gray-50"
                    aria-expanded={expandedExpectedIds.has(session.id)}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Clock3 size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-900">
                        {group?.name || session.activityName || '수업'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {[session.startTime, group?.subject, session.room || group?.room].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      <span className="text-[11px] font-semibold text-gray-400">
                        {students.filter((student) => student.clinicRecord).length}/{students.length}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`text-gray-400 transition-transform duration-200 ${
                          expandedExpectedIds.has(session.id) ? 'rotate-180' : ''
                        }`}
                      />
                    </span>
                  </button>
                  <div
                    className="grid transition-[grid-template-rows] duration-200 ease-out"
                    style={{
                      gridTemplateRows: expandedExpectedIds.has(session.id) ? '1fr' : '0fr',
                    }}
                  >
                    <div className="overflow-hidden">
                      <div className="divide-y divide-gray-50 border-t border-gray-50">
                        {canEditClinic ? (
                          <ClinicInlineWorksheet
                            session={session}
                            group={group}
                            students={students}
                            academyProfile={academyProfile}
                            onOpenRecord={(student) => void openExpectedStudentRecord({
                              student,
                              session,
                              group,
                            })}
                          />
                        ) : (
                          students.map((student) => (
                            <button
                              key={student.id}
                              type="button"
                              disabled
                              className="flex w-full items-center gap-3 px-4 py-3 text-left"
                            >
                              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-50 text-xs font-bold text-gray-500">
                                {student.name?.slice(0, 1) || '학'}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-gray-900">{student.name}</span>
                                {student.grade && (
                                  <span className="mt-0.5 block text-[11px] text-gray-400">{student.grade}</span>
                                )}
                              </span>
                              {student.clinicRecord && (
                                <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                                  <CheckCircle2 size={14} />
                                  완료
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {temporaryClinicStudents.length > 0 && (
          <section className="px-4 mt-5 mb-5">
            <div className="mb-2">
              <p className="text-sm font-bold text-gray-900">학생 목록</p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                반을 만들기 전에는 전체 재원 학생을 임시로 보여드려요.
              </p>
            </div>
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <button
                type="button"
                onClick={() => toggleExpectedGroup(temporaryClinicSession.id)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors active:bg-gray-50"
                aria-expanded={expandedExpectedIds.has(temporaryClinicSession.id)}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Clock3 size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">전체 학생</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {temporaryClinicSubject || '과목 미지정'} · {temporaryClinicStudents.length}명
                  </p>
                </div>
                <span className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-[11px] font-semibold text-gray-400">
                    {temporaryClinicStudents.filter((student) => student.clinicRecord).length}/{temporaryClinicStudents.length}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 transition-transform duration-200 ${
                      expandedExpectedIds.has(temporaryClinicSession.id) ? 'rotate-180' : ''
                    }`}
                  />
                </span>
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{
                  gridTemplateRows: expandedExpectedIds.has(temporaryClinicSession.id) ? '1fr' : '0fr',
                }}
              >
                <div className="overflow-hidden">
                  {canEditClinic ? (
                    <ClinicInlineWorksheet
                      session={temporaryClinicSession}
                      group={temporaryClinicGroup}
                      students={temporaryClinicStudents}
                      academyProfile={academyProfile}
                      onOpenRecord={(student) => {
                        if (student.clinicRecord) {
                          setEditRecord(student.clinicRecord);
                          return;
                        }
                        setQuickTarget({
                          studentId: student.id,
                          date: selectedDate,
                          subject: temporaryClinicSubject,
                          classGroupId: '',
                          classSessionId: '',
                        });
                      }}
                    />
                  ) : (
                    <div className="divide-y divide-gray-50 border-t border-gray-50">
                      {temporaryClinicStudents.map((student) => (
                        <div key={student.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-50 text-xs font-bold text-gray-500">
                            {student.name?.slice(0, 1) || '학'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-gray-900">{student.name}</span>
                            {student.grade && (
                              <span className="mt-0.5 block text-[11px] text-gray-400">{student.grade}</span>
                            )}
                          </span>
                          {student.clinicRecord && (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                              <CheckCircle2 size={14} />
                              완료
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 보조강사: 수업에서 남긴 보완 항목 */}
        {role === 'assistant' && selectedSupportItems.length > 0 && (
          <div className="px-4 mt-5 mb-5">
            <p className="text-sm font-bold text-gray-700 mb-2">수업에서 남긴 보완 항목</p>
            <div className="flex flex-col gap-2">
              {selectedSupportItems.map((item, index) => (
                <div key={item.id} className="bg-orange-50 rounded-2xl px-4 py-3.5 border border-orange-100">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-gray-900">{item.student?.name || '학생'}</span>
                        {item.group && (
                          <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full font-medium">
                            {item.group.name}
                          </span>
                        )}
                      </div>
                      {item.session && (
                        <p className="text-[10px] text-gray-400">{formatDateShort(item.session.date)}</p>
                      )}
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setShowClinicFromSupport({
                        targets: selectedSupportItems.map(buildSupportRelayTarget),
                        initialRelayIndex: index,
                      })}
                      className="flex-shrink-0 text-xs font-semibold text-white bg-orange-500 px-3 py-1.5 rounded-xl"
                    >
                      활동 기록
                    </motion.button>
                  </div>
                  {item.supportTags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {item.supportTags.map((tag) => (
                        <span key={tag} className="text-xs bg-white text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                          {SUPPORT_TAG_LABELS[tag] || tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.supportMemo?.trim() && (
                    <p className="text-xs text-gray-600 bg-white rounded-xl px-2.5 py-1.5">{item.supportMemo}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <section className="px-4 mt-5 mb-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-seenit-ink">활동 기록</p>
            <span className="text-xs font-semibold text-seenit-subtle">{selectedDateRecordCount}건</span>
          </div>
          <ListSearchFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            placeholder="학생·반·과목 검색"
            filterCount={subjectFilter === 'all' ? 0 : 1}
            filtersOpen={filtersOpen}
            onToggleFilters={() => setFiltersOpen((open) => !open)}
            onResetFilters={() => {
              setSubjectFilter('all');
            }}
            resultText={`${filtered.length}건`}
          >
            <ListFilterChips
              value={subjectFilter}
              onChange={setSubjectFilter}
              ariaLabel="클리닉 과목 필터"
              options={CLINIC_SUBJECT_FILTERS.map(({ id, label }) => ({ value: id, label }))}
            />
          </ListSearchFilterBar>
        </section>

        {/* 클리닉 목록 */}
        {filtered.length === 0 ? (
          hasRecordQuery ? (
            <EmptyState
              icon="🔍"
              title="조건에 맞는 기록이 없어요"
              description="검색어나 필터를 다시 확인해주세요."
            />
          ) : selectedClinicEventGroups.length === 0
          && unlinkedSelectedExpectedGroups.length === 0
          && temporaryClinicStudents.length === 0
          && selectedSupportItems.length === 0
            ? (
              <EmptyState
                icon="📋"
                title={isSelectedToday ? '오늘 클리닉이 없어요' : '이 날짜에는 클리닉이 없어요'}
                description="+ 버튼을 눌러 학생을 배정하고 기록해보세요."
              />
            )
            : (
              <div className="px-4 py-5 text-center">
                <p className="text-sm font-semibold text-seenit-muted">아직 저장된 활동 기록이 없어요.</p>
              </div>
            )
        ) : (
          <div className="px-4 flex flex-col gap-2">
            {filtered.map((record) => (
              <ClinicRecordCard
                key={record.id}
                record={record}
                academyStudents={academyStudents}
                classGroups={classGroups}
                expanded={expandedId === record.id}
                onToggle={() => setExpandedId(expandedId === record.id ? null : record.id)}
                onEdit={() => { setEditRecord(record); setExpandedId(null); }}
                onDeleteRequest={() => setDeleteConfirmId(record.id)}
                canEditRecord={canEditRecord(record)}
                canDeleteRecord={canDeleteRecord(record)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 클리닉 추가/수정 폼 */}
      {(showForm || editRecord || quickTarget) && (
        <ClinicRecordFormModal
          editRecord={editRecord}
          presetStudentId={quickTarget?.studentId}
          presetDate={quickTarget?.date}
          presetSubject={quickTarget?.subject}
          presetClassGroupId={quickTarget?.classGroupId}
          presetClassSessionId={quickTarget?.classSessionId}
          presetClinicEventId={quickTarget?.clinicEventId}
          onClose={() => { setShowForm(false); setEditRecord(null); setQuickTarget(null); }}
        />
      )}

      {(showEventForm || editEvent) && (
        <ClinicEventFormModal
          event={editEvent}
          initialDate={selectedDate}
          onClose={() => { setShowEventForm(false); setEditEvent(null); }}
        />
      )}

      {/* 보완 항목에서 클리닉 기록 작성 */}
      {showClinicFromSupport && (
        <ClinicRecordFormModal
          relayTargets={showClinicFromSupport.targets}
          initialRelayIndex={showClinicFromSupport.initialRelayIndex}
          onClose={() => setShowClinicFromSupport(null)}
        />
      )}

      {/* 삭제 확인 — createPortal로 transform 조상 탈출 */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
        {deleteConfirmId && (
          <>
            <motion.div
              key="dim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setDeleteConfirmId(null)}
            />
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-4 pt-5 pb-10"
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <p className="text-base font-bold text-gray-900 mb-1">클리닉 기록을 삭제할까요?</p>
              <p className="text-sm text-gray-500 mb-6">삭제한 기록은 되돌릴 수 없어요.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm"
                >
                  취소
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="flex-1 py-3.5 rounded-xl bg-red-500 text-white font-bold text-sm"
                >
                  삭제
                </button>
              </div>
            </motion.div>
          </>
        )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

function ClinicRecordCard({
  record,
  academyStudents,
  classGroups,
  expanded,
  onToggle,
  onEdit,
  onDeleteRequest,
  canEditRecord,
  canDeleteRecord,
}) {
  const student = academyStudents.find((s) => s.id === record.studentId);
  const group = classGroups.find((g) => g.id === record.classGroupId);
  const itemCount = record.items?.length || 0;
  const firstItem = record.items?.[0];
  const extraCount = itemCount - 1;
  const isLinkedRecord = !!(
    record.classSessionId ||
    record.sourceLessonRecordId ||
    record.sourceSupportMemo ||
    record.sourceSupportTags?.length
  );
  const activityLabel = getActivityLabel(
    CLINIC_ACTIVITY_TYPES,
    record.activityType || 'clinic',
    record.activityName,
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button className="w-full px-4 py-3.5 text-left" onClick={onToggle}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-bold text-gray-900">{student?.name || '학생'}</span>
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-600">
                {activityLabel}
              </span>
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{record.subject || '기타'}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                isLinkedRecord
                  ? 'bg-orange-50 text-orange-600'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {isLinkedRecord ? '수업 연계' : '직접 추가'}
              </span>
            </div>
            {firstItem && (
              <p className="text-xs text-gray-500">
                {firstItem.title}
                {extraCount > 0 && <span className="text-gray-400"> 외 {extraCount}개</span>}
              </p>
            )}
            {group && <p className="text-[10px] text-gray-400 mt-0.5">{group.name}</p>}
          </div>
          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </div>
        </div>
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div style={{ overflow: 'hidden', opacity: expanded ? 1 : 0, transition: 'opacity 0.18s ease' }}>
            <div className="px-4 pb-4 border-t border-gray-50">
              {/* 항목별 기록 */}
              {record.items?.map((item, idx) => (
                <div key={item.id || idx} className="mt-3 bg-gray-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-bold text-gray-700 mb-1">{item.title}</p>
                  {item.materialTags?.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {item.materialTags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-500 border border-gray-100">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.description && <p className="text-xs text-gray-600 mb-1">{item.description}</p>}
                  {item.result && (
                    <p className="text-xs text-blue-600 font-medium">결과: {item.result}</p>
                  )}
                  {item.memo && (
                    <p className="text-xs text-gray-400 mt-0.5">메모: {item.memo}</p>
                  )}
                </div>
              ))}

              {/* 전체 메모 */}
              {record.overallMemo && (
                <div className="mt-3 bg-blue-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-semibold text-blue-700 mb-1">전체 메모</p>
                  <p className="text-xs text-blue-600">{record.overallMemo}</p>
                </div>
              )}

              {(record.sourceSupportMemo || record.sourceSupportTags?.length > 0) && (
                <div className="mt-3 bg-orange-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-semibold text-orange-700 mb-1">강사 요청</p>
                  {record.sourceSupportTags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {record.sourceSupportTags.map((tag) => (
                        <span key={tag} className="text-[11px] bg-white text-orange-600 border border-orange-100 px-2 py-0.5 rounded-full font-medium">
                          {SUPPORT_TAG_LABELS[tag] || tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {record.sourceSupportMemo && (
                    <p className="text-xs text-orange-700">{record.sourceSupportMemo}</p>
                  )}
                </div>
              )}

              {/* 수정/삭제 버튼 */}
              {(canEditRecord || canDeleteRecord) && (
                <div className="flex gap-2 mt-3">
                  {canEditRecord && (
                    <button
                      onClick={onEdit}
                      className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl"
                    >
                      <Pencil size={12} />
                      수정
                    </button>
                  )}
                  {canDeleteRecord && (
                    <button
                      onClick={onDeleteRequest}
                      className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-500 text-xs font-bold rounded-xl"
                    >
                      <Trash2 size={12} />
                      삭제
                    </button>
                  )}
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}
