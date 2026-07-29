import { useEffect, useState, useMemo } from 'react';
import { Pencil, Trash2, Plus, ChevronDown, ChevronUp, Check, X, Paperclip, PhoneCall, LogIn, LogOut, Clock3 } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  deleteStudent as deleteServerStudent,
  createAcademyPayment,
  updatePayment as updateServerPayment,
  deletePayment as deleteServerPayment,
} from '../../../services/supabase/domainApi';
import { getKoreaHHMM, getKoreanWeekdayFromYMD, today } from '../../../utils/date';
import { attendanceStatusMap, formatCurrency, toTelHref } from '../../../utils/format';
import { isEffectiveAttendance } from '../../../utils/attendanceRecords';
import EmptyState from '../../../components/EmptyState';
import Header from '../../../components/Header';
import AcademyStudentFormModal from './AcademyStudentFormModal';
import ClinicRecordFormModal from '../clinic/ClinicRecordFormModal';
import { currentUserCan } from '../../../utils/staffPermissions';
import { getSchoolTagClassName } from '../../../utils/schoolTags';
import { getStudentStatusMeta } from '../../../utils/studentStatus';
import { getAcademyYmd, readAttendanceSettings } from '../attendance/attendanceHelpers';
import {
  CLASS_ACTIVITY_TYPES,
  CLINIC_ACTIVITY_TYPES,
  getActivityLabel,
} from '../../../constants/learningActivitySettings';


// 역할별 탭 정의
const TABS_BY_ROLE = {
  owner:     ['요약', '등하원', '수업 기록', '클리닉 기록', '정산'],
  teacher:   ['요약', '등하원', '수업 기록', '클리닉 기록'],
  assistant: ['요약', '등하원', '수업 기록', '클리닉 기록'],
  manager:   ['요약', '등하원', '수업 기록', '클리닉 기록', '정산'],
};

function nowHHMM() {
  return getKoreaHHMM();
}

function formatAttendanceTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatAttendanceDate(value) {
  if (!value) return '';
  const currentYmd = getAcademyYmd() || today();
  if (value === currentYmd) return '오늘';
  const [year, month, day] = value.split('-');
  const showYear = year !== currentYmd.slice(0, 4);
  return `${showYear ? `${year}년 ` : ''}${Number(month)}월 ${Number(day)}일 · ${getKoreanWeekdayFromYMD(value)}요일`;
}

function isSessionFuture(session, todayYMD = today(), currentHHMM = nowHHMM()) {
  if (!session?.date) return false;
  if (session.date > todayYMD) return true;
  if (session.date < todayYMD) return false;
  return (session.startTime || '00:00') > currentHHMM;
}

// ── helper: 학생 날짜별 수업 기록 생성 ─────────────────────────────
function getStudentDailyLessonRecords({ studentId, classSessions, classGroups, academyLessonRecords, academyAttendanceRecords, clinicRecords = [], academyTeachers }) {
  const todayYMD = today();
  const currentHHMM = nowHHMM();
  const records = classSessions
    .filter((s) => (s.studentIds || []).includes(studentId))
    .map((session) => {
      const group = classGroups.find((g) => g.id === session.classGroupId) || {};
      const attendance = academyAttendanceRecords.find((a) => (
        a.sessionId === session.id
        && a.studentId === studentId
        && isEffectiveAttendance(a)
      ));
      const lessonRecord = academyLessonRecords.find((lr) => lr.sessionId === session.id && lr.studentId === studentId);
      const commonRecord = academyLessonRecords.find((lr) => lr.sessionId === session.id && lr.studentId === '_common_');
      const teacher = academyTeachers.find((t) => t.id === session.teacherId);

      // 수업 카드에는 회차에 직접 연결된 클리닉만 노출한다.
      // 날짜만 같은 기록은 독립 클리닉 탭에서 확인해 중복 매핑을 줄인다.
      const linkedClinicRecords = clinicRecords.filter((r) =>
        r.studentId === studentId &&
        r.classSessionId === session.id
      );

      return {
        id: session.id,
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        classGroupId: session.classGroupId,
        classGroupName: group.name || '',
        subject: group.subject || '',
        activityLabel: getActivityLabel(
          CLASS_ACTIVITY_TYPES,
          group.activityType || 'regular_class',
          group.activityName,
        ),
        teacherName: teacher?.name || '',
        room: session.room || group.room || '',
        attendanceStatus: attendance?.status || null,
        lessonRecord,
        commonRecord,
        clinics: linkedClinicRecords,
        clinicSummary: { total: linkedClinicRecords.length },
        isFuture: isSessionFuture(session, todayYMD, currentHHMM),
      };
    })
    .sort((a, b) => {
      const d = b.date?.localeCompare(a.date || '') || 0;
      if (d !== 0) return d;
      return b.startTime?.localeCompare(a.startTime || '') || 0;
    });

  return records;
}

const EVAL_LABEL_MAP = {
  attitude:       '태도',
  focus:          '집중도',
  understanding:  '이해도',
  homeworkStatus: '숙제',
};
const SUPPORT_TAG_MAP = {
  homework: '숙제 미완료', wrong_answer: '오답 풀이', vocabulary: '단어 재시험',
  reading: '본문 암기', grammar: '문법 보충', concept: '개념 재설명',
  test_retry: '테스트 재응시', absence_makeup: '결석 보강', other: '기타',
};

function StatusBadge({ type }) {
  const styles = {
    present:    'bg-blue-50 text-blue-700',
    late:       'bg-orange-50 text-orange-700',
    absent:     'bg-red-50 text-red-700',
    makeup:     'bg-red-50 text-red-700',
    unrecorded: 'bg-orange-50 text-orange-700',
    upcoming:   'bg-gray-50 text-gray-500 border border-dashed border-gray-300',
  };
  const labels = {
    present: '출석',
    late: '지각',
    absent: '결석',
    makeup: '보강필요',
    unrecorded: '미기록',
    upcoming: '수업 예정',
  };
  const safeType = styles[type] ? type : 'unrecorded';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles[safeType]}`}>
      {labels[safeType]}
    </span>
  );
}

function LinkedClinicMiniBadge({ count, onClick }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-50 text-blue-600 px-2 py-1 rounded-full"
    >
      <Paperclip size={11} />
      연결된 클리닉 {count}건
    </button>
  );
}

// ── 수업 기록 카드 ─────────────────────────────────────────────────
function SessionRecordCard({ record, onClinicClick }) {
  const [expanded, setExpanded] = useState(false);
  const {
    date, startTime, endTime, classGroupName, subject, activityLabel,
    teacherName, attendanceStatus, lessonRecord, commonRecord,
    clinics, clinicSummary, isFuture,
  } = record;

  const weekday = date ? getKoreanWeekdayFromYMD(date) : '';

  const hasEval = lessonRecord && (lessonRecord.attitude || lessonRecord.focus || lessonRecord.understanding || lessonRecord.homeworkStatus);
  const hasScore = lessonRecord && (
    lessonRecord.score !== ''
    || lessonRecord.scoreTotal !== ''
    || lessonRecord.scoreNote
  );
  const hasSupport = lessonRecord && ((lessonRecord.supportTags?.length > 0) || lessonRecord.supportMemo?.trim());
  const hasCommon = commonRecord && (commonRecord.commonContent || commonRecord.commonProgress || commonRecord.commonHomework);
  const hasAnyRecord = hasEval || hasScore || hasSupport || hasCommon || clinicSummary.total > 0;

  return (
    <div className={`rounded-2xl shadow-sm overflow-hidden ${
      isFuture ? 'bg-gray-50 border border-dashed border-gray-200 shadow-none' : 'bg-white'
    }`}>
      {/* 카드 헤더 */}
      <div
        role={isFuture ? undefined : 'button'}
        tabIndex={isFuture ? -1 : 0}
        className={`w-full px-4 py-4 text-left ${isFuture ? 'cursor-default' : 'cursor-pointer'}`}
        onClick={() => {
          if (!isFuture) setExpanded(!expanded);
        }}
        onKeyDown={(e) => {
          if (isFuture) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className={`text-base font-bold ${isFuture ? 'text-gray-500' : 'text-gray-900'}`}>
                {date ? `${date.slice(5).replace('-', '/')} ${weekday}요일` : '날짜 없음'}
              </p>
              <StatusBadge type={isFuture ? 'upcoming' : (attendanceStatus || 'unrecorded')} />
            </div>
            <p className="text-xs text-gray-500">
              {[classGroupName, subject, activityLabel].filter(Boolean).join(' · ')} · {startTime}–{endTime}
            </p>
            {!isFuture && commonRecord?.commonProgress && (
              <p className="text-xs text-gray-400 mt-1.5 line-clamp-1">진도: {commonRecord.commonProgress}</p>
            )}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {!isFuture && hasAnyRecord && (
                <span className="text-[11px] font-semibold bg-green-50 text-green-600 px-2 py-1 rounded-full">기록 있음</span>
              )}
              <LinkedClinicMiniBadge count={clinicSummary.total} onClick={onClinicClick} />
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            {!isFuture && (expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />)}
          </div>
        </div>
      </div>

      {/* 펼침 상세 */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded && !isFuture ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div style={{ overflow: 'hidden', opacity: expanded && !isFuture ? 1 : 0, transition: 'opacity 0.18s ease' }}>
            <div className="px-4 pb-4 border-t border-gray-50">
              {/* 수업 정보 */}
              <div className="mt-3 mb-3">
                <p className="text-xs font-semibold text-gray-400 mb-2">수업 정보</p>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex flex-col gap-1">
                  {teacherName && <InfoRow label="담당 선생님" value={teacherName} />}
                  {record.room && <InfoRow label="강의실" value={record.room} />}
                </div>
              </div>

              {/* 공통 수업 기록 */}
              {hasCommon && (
                <div className="mb-3 bg-blue-50 rounded-xl px-3 py-3">
                  <p className="text-xs font-semibold text-blue-700 mb-2">공통 수업 기록</p>
                  {commonRecord.commonProgress && <InfoRow label="진도" value={commonRecord.commonProgress} />}
                  {commonRecord.commonContent && (
                    <div className="mt-1.5">
                      <p className="text-xs text-blue-600 font-medium">수업 내용</p>
                      <p className="text-xs text-blue-800 mt-0.5 whitespace-pre-wrap">{commonRecord.commonContent}</p>
                    </div>
                  )}
                  {commonRecord.commonHomework && <InfoRow label="공통 숙제" value={commonRecord.commonHomework} />}
                </div>
              )}

              {/* 학생별 평가 */}
              {hasEval && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-400 mb-2">평가</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['attitude', 'focus', 'understanding', 'homeworkStatus'].map((key) =>
                      lessonRecord[key] ? (
                        <span key={key} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-medium">
                          {EVAL_LABEL_MAP[key]}: {lessonRecord[key]}
                        </span>
                      ) : null
                    )}
                  </div>
                </div>
              )}

              {hasScore && (
                <div className="mb-3">
                  <p className="mb-1 text-xs font-semibold text-gray-400">점수</p>
                  <p className="rounded-xl bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700">
                    {lessonRecord.score || '-'}{lessonRecord.scoreTotal ? ` / ${lessonRecord.scoreTotal}` : ''}
                    {lessonRecord.scoreNote ? ` · ${lessonRecord.scoreNote}` : ''}
                  </p>
                </div>
              )}

              {/* 학생 메모 */}
              {lessonRecord?.memo?.trim() && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-400 mb-1">학생 메모</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 whitespace-pre-wrap">{lessonRecord.memo}</p>
                </div>
              )}

              {/* 학습 보완 항목 */}
              {hasSupport && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-400 mb-2">보완 항목</p>
                  {lessonRecord.supportTags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {lessonRecord.supportTags.map((tag) => (
                        <span key={tag} className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                          {SUPPORT_TAG_MAP[tag] || tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {lessonRecord.supportMemo?.trim() && (
                    <p className="text-xs text-gray-600 bg-orange-50 rounded-xl px-3 py-2">{lessonRecord.supportMemo}</p>
                  )}
                </div>
              )}

              <LinkedClinicMiniBadge count={clinics.length} onClick={onClinicClick} />

              {!hasAnyRecord && (
                <p className="text-xs text-gray-300 py-2">수업 기록이 없어요</p>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-700">{value}</span>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────
export default function AcademyStudentDetailPage() {
  const {
    role, selectedAcademyStudentId, academyStudents, classGroups, classSessions,
    academyAttendanceRecords, academyLessonRecords, clinicTasks, clinicRecords = [], academyPayments,
    academyTeachers,
    deleteAcademyStudent, goBackFromAcademyStudent, showToast,
    updateAcademyPayment, addAcademyPayment, deleteAcademyPayment,
    setPaymentServerId,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUserId = useAuthStore((s) => s.user?.id);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const loadServerStudents = useWorkspaceStore((s) => s.loadServerStudents);
  const loadServerPayments = useWorkspaceStore((s) => s.loadServerPayments);
  const studentCheckEvents = useWorkspaceStore((s) => s.studentCheckEvents) ?? [];
  const isStudentCheckEventsLoading = useWorkspaceStore((s) => s.isStudentCheckEventsLoading);
  const loadStudentCheckEvents = useWorkspaceStore((s) => s.loadStudentCheckEvents);
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((sp) => sp.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );
  const currentAcademy = useMemo(
    () => memberships.find((membership) => membership.academy_id === currentAcademyId)?.academy || null,
    [memberships, currentAcademyId],
  );
  const attendanceSettings = useMemo(
    () => readAttendanceSettings(currentAcademy),
    [currentAcademy],
  );
  const studentAttendanceEnabled = attendanceSettings.studentCheckMethod !== 'disabled';
  const showCheckinPin = attendanceSettings.studentCheckMethod === 'qr';
  const canEditClinicRecords = currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canEditClinicRecords',
  );
  const canManageStudents = currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canManageStudents',
  );

  const [activeTab, setActiveTab] = useState('요약');
  const [showEdit, setShowEdit] = useState(false);
  const [showClinicForm, setShowClinicForm] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ classGroupId: '', amount: '', month: today().slice(0, 7) });

  // May be null during back-navigation exit animation — compute before all hooks
  const student = academyStudents.find((s) => s.id === selectedAcademyStudentId) ?? null;

  // ALL hooks must be called before early return (Rules of Hooks)
  const studentGroups = useMemo(
    () => !student ? [] : classGroups.filter((g) => g.studentIds?.includes(student.id)),
    [classGroups, student]
  );

  const dailyRecords = useMemo(
    () => !student ? [] : getStudentDailyLessonRecords({
      studentId: student.id, classSessions, classGroups,
      academyLessonRecords, academyAttendanceRecords,
      clinicRecords, academyTeachers,
    }),
    [student, classSessions, classGroups, academyLessonRecords, academyAttendanceRecords, clinicRecords, academyTeachers]
  );

  const studentClinicRecords = useMemo(
    () => !student ? [] : (clinicRecords || []).filter((r) => r.studentId === student.id).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [clinicRecords, student]
  );

  const pendingClinicCount = useMemo(
    () => !student ? 0 : (clinicTasks || []).filter((t) => t.studentId === student.id && t.status !== 'completed').length,
    [clinicTasks, student]
  );

  const thisMonthClinicCount = useMemo(
    () => !student ? 0 : studentClinicRecords.filter((r) => r.date?.slice(0, 7) === today().slice(0, 7)).length,
    [studentClinicRecords, student]
  );

  const attendanceDays = useMemo(() => {
    if (!student) return [];
    const todayYmd = getAcademyYmd() || today();
    const entriesByDate = new Map();
    const pushEntry = (date, entry) => {
      if (!date) return;
      const entries = entriesByDate.get(date) || [];
      entries.push(entry);
      entriesByDate.set(date, entries);
    };

    studentCheckEvents
      .filter((event) => event.student_id === student.serverId)
      .forEach((event) => {
        const date = getAcademyYmd(event.event_time);
        pushEntry(date, {
          id: `event-${event.id}`,
          type: event.event_type,
          time: formatAttendanceTime(event.event_time),
          sortTime: formatAttendanceTime(event.event_time),
          title: event.event_type === 'check_out' ? '하원' : '등원',
          detail: event.source === 'qr' ? 'QR 기록' : '선생님 기록',
        });
      });

    const sessionEntries = classSessions
      .filter((session) => (
        session.date
        && session.date <= todayYmd
        && session.status !== 'canceled'
        && (session.studentIds || []).includes(student.id)
      ))
      .map((session) => {
        const group = classGroups.find((item) => item.id === session.classGroupId);
        const attendance = academyAttendanceRecords.find((record) => (
          record.sessionId === session.id
          && record.studentId === student.id
          && isEffectiveAttendance(record)
        ));
        const sessionStateLabels = {
          present: '출석',
          late: '지각',
          absent: '결석',
          makeup: '보강',
          excused: '인정결석',
        };
        const statusLabel = attendance?.status
          ? sessionStateLabels[attendance.status] || '상태 기록'
          : '미확인';
        return {
          date: session.date,
          id: `session-${session.id}`,
          type: 'session',
          time: session.startTime || '',
          sortTime: session.startTime || '99:99',
          title: group?.name || '수업',
          detail: `${session.startTime || ''}${session.endTime ? `–${session.endTime}` : ''} · ${statusLabel}`,
        };
      });
    sessionEntries.forEach(({ date, ...entry }) => pushEntry(date, entry));

    return [...entriesByDate.entries()]
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([date, entries]) => ({
        date,
        entries: entries.sort((a, b) => a.sortTime.localeCompare(b.sortTime)),
      }));
  }, [
    student,
    studentCheckEvents,
    classSessions,
    classGroups,
    academyAttendanceRecords,
  ]);

  const tabs = useMemo(
    () => (TABS_BY_ROLE[role] || TABS_BY_ROLE.owner).filter((tab) => {
      if (tab === '등하원') return studentAttendanceEnabled;
      if (tab === '클리닉 기록') {
        return currentAcademy?.clinic_required !== false && canEditClinicRecords;
      }
      return true;
    }),
    [role, studentAttendanceEnabled, currentAcademy?.clinic_required, canEditClinicRecords],
  );

  useEffect(() => {
    if (!tabs.includes(activeTab)) {
      setActiveTab(tabs[0]);
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    if (
      !studentAttendanceEnabled
      || activeTab !== '등하원'
      || !currentAcademyId
      || !student?.serverId
    ) return;
    loadStudentCheckEvents({ studentId: student.serverId, limit: 1000 });
  }, [
    studentAttendanceEnabled,
    activeTab,
    currentAcademyId,
    student?.serverId,
    loadStudentCheckEvents,
  ]);

  if (!student) {
    return (
      <div className="min-h-[60vh] flex items-center">
        <EmptyState
          title="학생 정보를 찾을 수 없어요"
          description="삭제되었거나 더 이상 사용할 수 없는 학생입니다."
          action={(
            <button
              type="button"
              onClick={goBackFromAcademyStudent}
              className="px-5 py-3 bg-blue-600 text-white text-sm font-bold rounded-2xl"
            >
              학생 목록으로 돌아가기
            </button>
          )}
        />
      </div>
    );
  }
  const statusMeta = getStudentStatusMeta(student.status);

  // 최근 수업 (요약용): 미래 회차는 제외한다.
  const latestRecord = dailyRecords.find((r) => !r.isFuture) || null;
  const nextRecord = [...dailyRecords].reverse().find((r) => r.isFuture) || null;

  const handleDelete = async () => {
    if (!window.confirm(`${student.name} 학생을 삭제할까요?`)) return;

    const serverId = student.serverId;
    try {
      if (serverId && isAuthenticated && currentAcademyId) {
        await deleteServerStudent(serverId);
        await loadServerStudents();
      }
      deleteAcademyStudent(student.id);
      goBackFromAcademyStudent();
    } catch (err) {
      console.error('[supabase] deleteStudent failed', err);
      showToast(
        err?.message || '학생을 삭제하지 못했어요. 다시 시도해주세요.',
        'error',
      );
    }
  };

  // ── 렌더 함수들 ───────────────────────────────────────────────────

  const renderSummary = () => (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      <div className="md:col-span-2 flex flex-col gap-4">
      {/* 기본 정보 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-400 mb-3">기본 정보</p>
        <div className="flex flex-col gap-2">
          {student.grade && <InfoRowFull label="학년" value={student.grade} />}
          {student.school && <InfoRowFull label="학교" value={student.school} />}
          {student.phone && <InfoRowFull label="연락처" value={student.phone} phone={student.phone} />}
          {student.parentName && <InfoRowFull label="학부모" value={student.parentName} />}
          {student.parentPhone && <InfoRowFull label="학부모 연락처" value={student.parentPhone} phone={student.parentPhone} />}
          <InfoRowFull label="기본 수강료" value={formatCurrency(student.baseTuition || 0)} />
          {canManageStudents && showCheckinPin && student.checkinPin && (
            <InfoRowFull label="등하원 PIN" value={student.checkinPin} />
          )}
          {student.memo && <InfoRowFull label="메모" value={student.memo} />}
        </div>
      </div>
      </div>

      <div className="md:col-span-3 flex flex-col gap-4">
      {/* 수강 반 */}
      {studentGroups.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 mb-3">수강 중인 반</p>
          {studentGroups.map((group) => (
            <div key={group.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-semibold text-gray-800">{group.name}</p>
                <p className="text-xs text-gray-400">{group.weekdays?.join('·')}요일 {group.startTime}</p>
              </div>
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{group.subject}</span>
            </div>
          ))}
        </div>
      )}

      {/* 최근 수업 + 클리닉 요약 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {latestRecord && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 mb-2">최근 완료/진행 수업</p>
            <p className="text-sm font-bold text-gray-900">
              {latestRecord.date?.slice(5).replace('-', '/')}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{latestRecord.classGroupName}</p>
            {latestRecord.attendanceStatus && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1.5 inline-block ${attendanceStatusMap[latestRecord.attendanceStatus]?.bg} ${attendanceStatusMap[latestRecord.attendanceStatus]?.color}`}>
                {attendanceStatusMap[latestRecord.attendanceStatus]?.label}
              </span>
            )}
          </div>
        )}
        {!latestRecord && nextRecord && (
          <div className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-200">
            <p className="text-xs font-semibold text-gray-400 mb-2">다가오는 수업</p>
            <p className="text-sm font-bold text-gray-700">
              {nextRecord.date?.slice(5).replace('-', '/')}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{nextRecord.classGroupName}</p>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1.5 inline-block bg-gray-100 text-gray-500">
              수업 예정
            </span>
          </div>
        )}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 mb-2">클리닉 기록</p>
          <p className={`text-sm font-bold ${pendingClinicCount > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
            미완료 {pendingClinicCount}건
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            이번 달 완료 {thisMonthClinicCount}건
          </p>
        </div>
      </div>
      </div>
    </div>
  );

  const renderAttendance = () => {
    return (
      <div>
        {isStudentCheckEventsLoading && attendanceDays.length === 0 ? (
          <div className="rounded-2xl bg-white px-5 py-8 text-center text-sm text-gray-400 shadow-sm">
            불러오는 중...
          </div>
        ) : attendanceDays.length === 0 ? (
          <div className="rounded-2xl bg-white px-5 py-8 text-center shadow-sm">
            <Clock3 size={22} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-bold text-gray-700">등하원 기록이 없어요</p>
            <p className="mt-1 text-xs text-gray-400">수업과 등하원 기록이 생기면 날짜별로 보여요.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {attendanceDays.map((day, dayIndex) => (
              <section
                key={day.date}
                className={dayIndex > 0 ? 'border-t border-gray-100' : ''}
              >
                <div className="flex items-center justify-between bg-gray-50/70 px-4 py-3">
                  <p className="text-sm font-extrabold text-gray-900">{formatAttendanceDate(day.date)}</p>
                  <p className="text-[11px] font-medium text-gray-400">{day.date}</p>
                </div>
                <div className="px-4">
                  {day.entries.map((entry, entryIndex) => {
                    const Icon = entry.type === 'check_in'
                      ? LogIn
                      : entry.type === 'check_out'
                        ? LogOut
                        : Clock3;
                    const iconTone = entry.type === 'check_in'
                      ? 'bg-emerald-50 text-emerald-600'
                      : entry.type === 'check_out'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-gray-100 text-gray-500';
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-3 py-3.5 ${
                          entryIndex > 0 ? 'border-t border-gray-100' : ''
                        }`}
                      >
                        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
                          <Icon size={15} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold text-gray-900">{entry.title}</p>
                            <span className="flex-shrink-0 text-xs font-semibold text-gray-400">{entry.time}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-gray-500">{entry.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderLessonHistory = () => {
    const currentAndPastRecords = dailyRecords.filter((record) => !record.isFuture);
    const futureRecords = dailyRecords
      .filter((record) => record.isFuture)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));

    return (
      <div className="flex flex-col gap-4">
        {dailyRecords.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-sm text-gray-400">수업 기록이 없어요</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <p className="text-xs font-bold text-gray-400 px-1">완료/진행 수업</p>
              {currentAndPastRecords.length === 0 ? (
                <div className="bg-white rounded-2xl p-5 text-center shadow-sm">
                  <p className="text-sm text-gray-400">아직 완료된 수업이 없어요</p>
                </div>
              ) : (
                currentAndPastRecords.map((record) => (
                  <SessionRecordCard
                    key={record.id}
                    record={record}
                    onClinicClick={() => setActiveTab('클리닉 기록')}
                  />
                ))
              )}
            </div>

            {futureRecords.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-bold text-gray-400 px-1">예정된 수업</p>
                {futureRecords.map((record) => (
                  <SessionRecordCard
                    key={record.id}
                    record={record}
                    onClinicClick={() => setActiveTab('클리닉 기록')}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* 수업 기록 탭에서는 연결된 클리닉 배지만 노출하고, 직접 작성은 클리닉 탭에서 진행. */}
      </div>
    );
  };

  const renderClinic = () => (
    <div className="flex flex-col gap-3">
      {canEditClinicRecords && (
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => setShowClinicForm(true)}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-blue-200 text-blue-600 text-sm font-semibold">
          + 클리닉 기록 추가
        </motion.button>
      )}
      {studentClinicRecords.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-400">클리닉 기록이 없어요</p>
        </div>
      ) : (
        studentClinicRecords.map((record) => {
          const activityLabel = getActivityLabel(
            CLINIC_ACTIVITY_TYPES,
            record.activityType || 'clinic',
            record.activityName,
          );
          return (
            <div key={record.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-bold text-gray-500">{record.date?.slice(5).replace('-', '/')}</p>
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-600">{activityLabel}</span>
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{record.subject}</span>
              </div>
              {record.items?.map((item, i) => (
                <div key={item.id || i} className="mb-2 bg-gray-50 rounded-xl px-3 py-2.5">
                  <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                  {item.materialTags?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.materialTags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                  {item.result && <p className="text-xs text-blue-600 font-medium mt-0.5">결과: {item.result}</p>}
                </div>
              ))}
              {record.overallMemo && (
                <p className="text-xs text-gray-500 mt-1 bg-blue-50 rounded-lg px-3 py-2">{record.overallMemo}</p>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  const renderSettlement = () => {
    const studentPayments = academyPayments.filter((p) => p.studentId === student.id)
      .sort((a, b) => b.month?.localeCompare(a.month || '') || 0);
    const studentGroups = classGroups.filter((g) => (g.studentIds || []).includes(student.id));

    const canSyncServer = isAuthenticated && currentAcademyId;

    const handleAddPayment = async () => {
      if (!paymentForm.amount || !paymentForm.month) return;
      const group = paymentForm.classGroupId
        ? classGroups.find((g) => g.id === paymentForm.classGroupId)
        : null;
      const localPayment = addAcademyPayment({
        studentId: student.id,
        classGroupId: paymentForm.classGroupId || '',
        month: paymentForm.month,
        amount: Number(paymentForm.amount) || 0,
        status: 'unpaid',
        paymentKind: 'manual',
        billingSnapshot: {},
        createdAt: new Date().toISOString(),
      });
      setShowAddPayment(false);
      setPaymentForm({ classGroupId: '', amount: '', month: today().slice(0, 7) });

      if (canSyncServer && student.serverId && localPayment?.id) {
        try {
          const created = await createAcademyPayment({
            academyId: currentAcademyId,
            student_id: student.serverId,
            class_group_id: group?.serverId || null,
            month: paymentForm.month,
            amount: Number(paymentForm.amount) || 0,
            status: 'unpaid',
            payment_kind: 'manual',
            billing_snapshot: {},
          });
          if (created?.id) setPaymentServerId(localPayment.id, created.id);
          await loadServerPayments();
        } catch (err) {
          console.error('[supabase] createAcademyPayment failed', err);
          showToast(
            err?.message
              ? `수납 서버 저장 실패: ${err.message}`
              : '수납 기록은 저장되었지만 서버 동기화는 실패했어요.',
            'error',
          );
        }
      }
    };

    const handleTogglePaid = async (p) => {
      const nextStatus = p.status === 'paid' ? 'unpaid' : 'paid';
      const todayStr = today();
      const patch = nextStatus === 'paid'
        ? { status: 'paid', paidDate: p.paidDate || todayStr }
        : { status: 'unpaid', paidDate: null };
      // Phase 33 — optimistic. local first, server later. server 성공 후 full
      // loadServerPayments 는 호출하지 않는다 (local 이 이미 정답이고, 매 토글마다
      // 전체 reload 는 잡음만 늘림).
      updateAcademyPayment(p.id, patch);
      if (p.serverId && canSyncServer) {
        try {
          await updateServerPayment(p.serverId, {
            status: patch.status,
            paid_date: patch.paidDate || null,
          });
        } catch (err) {
          console.error('[supabase] updatePayment(status) failed', err);
          showToast(
            '변경사항은 저장되었지만 동기화에 실패했어요.',
            'error',
          );
        }
      }
    };

    const handleDeletePayment = async (p) => {
      const serverId = p.serverId || null;
      // Phase 33 — optimistic delete. 서버 성공 후 reload 안 함.
      deleteAcademyPayment(p.id);
      if (serverId && canSyncServer) {
        try {
          await deleteServerPayment(serverId);
        } catch (err) {
          console.error('[supabase] deletePayment failed', err);
          showToast(
            '수납 기록은 삭제되었지만 동기화에 실패했어요.',
            'error',
          );
        }
      }
    };

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-gray-700">수납 내역</p>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowAddPayment(!showAddPayment)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-sm">
            <Plus size={13} /> 수납 등록
          </motion.button>
        </div>

        {showAddPayment && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-800">수납 항목 추가</p>
              <button onClick={() => setShowAddPayment(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="flex flex-col gap-2">
              <input type="month" value={paymentForm.month}
                onChange={(e) => setPaymentForm((f) => ({ ...f, month: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              {studentGroups.length > 0 && (
                <select value={paymentForm.classGroupId}
                  onChange={(e) => {
                    const g = classGroups.find((g) => g.id === e.target.value);
                    const additionalAmount = g?.feePolicy === 'additional'
                      ? Number(g.additionalFeeAmount || g.monthlyFee || 0)
                      : 0;
                    setPaymentForm((f) => ({
                      ...f,
                      classGroupId: e.target.value,
                      amount: additionalAmount > 0 ? String(additionalAmount) : f.amount,
                    }));
                  }}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
                  <option value="">반 선택 (선택사항)</option>
                  {studentGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              <input type="number" value={paymentForm.amount} placeholder="금액 (원)"
                onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleAddPayment}
                disabled={!paymentForm.amount || !paymentForm.month}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl disabled:opacity-40">
                추가하기
              </motion.button>
            </div>
          </div>
        )}

        {studentPayments.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-sm text-gray-400">수납 기록이 없어요</p>
          </div>
        ) : (
          studentPayments.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{p.month}</p>
                <p className="text-xs text-gray-400">
                  {p.memo || classGroups.find((g) => g.id === p.classGroupId)?.name || '수강료'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="font-bold text-gray-900 text-sm">{p.amount?.toLocaleString()}원</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                    p.status === 'paid'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-600'
                  }`}>
                    {p.status === 'paid' ? '수납 완료' : '미납'}
                  </span>
                </div>
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={() => handleTogglePaid(p)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${p.status === 'paid' ? 'bg-green-500' : 'border-2 border-gray-200'}`}>
                  {p.status === 'paid' && <Check size={13} className="text-white" />}
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={() => handleDeletePayment(p)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-red-300 active:bg-red-50 flex-shrink-0">
                  <Trash2 size={13} />
                </motion.button>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div>
      <Header
        title={student.name}
        onBack={goBackFromAcademyStudent}
        right={canManageStudents ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              aria-label="학생 수정"
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 md:hover:bg-gray-100"
            >
              <Pencil size={17} />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              aria-label="학생 삭제"
              className="w-9 h-9 flex items-center justify-center rounded-full text-red-400 active:bg-red-50 md:hover:bg-red-50"
            >
              <Trash2 size={17} />
            </button>
          </div>
        ) : null}
      />

      <div className="pt-14 md:pt-0 pb-6">
        {/* 프로필 */}
        <div className="px-4 pt-4 mb-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600 flex-shrink-0">
            {(student.name || '?')[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-gray-900">{student.name}</p>
              {canManageStudents ? (
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  aria-label={`재원 상태 변경, 현재 ${statusMeta.label}`}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusMeta.badgeClassName}`}
                >
                  {statusMeta.label}
                </button>
              ) : (
                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusMeta.badgeClassName}`}>
                  {statusMeta.label}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              {student.grade && <span className="text-sm text-gray-500">{student.grade}</span>}
              {student.school && (
                <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getSchoolTagClassName(student.school)}`}>
                  {student.school}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 탭 */}
        <div className="px-4 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {tabs.map((tab) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  activeTab === tab ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border border-gray-200'
                }`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4">
          {activeTab === '요약' && renderSummary()}
          {activeTab === '등하원' && renderAttendance()}
          {activeTab === '수업 기록' && renderLessonHistory()}
          {activeTab === '클리닉 기록' && renderClinic()}
          {activeTab === '정산' && renderSettlement()}
        </div>
      </div>

      {showEdit && <AcademyStudentFormModal editStudent={student} onClose={() => setShowEdit(false)} />}
      {showClinicForm && (
        <ClinicRecordFormModal presetStudentId={student.id} onClose={() => setShowClinicForm(false)} />
      )}
    </div>
  );
}

function InfoRowFull({ label, value, phone }) {
  const href = toTelHref(phone);
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="flex items-center justify-end gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-800 truncate">{value}</span>
          {href && (
            <a
              href={href}
              className="inline-flex md:hidden items-center gap-1 h-8 px-2.5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold active:bg-blue-100 flex-shrink-0"
              aria-label={`${label} 전화하기`}
            >
              <PhoneCall size={13} />
              전화
            </a>
          )}
        </span>
      </div>
      {href && (
        <p className="mt-1 text-right text-[11px] font-medium text-blue-500 md:hidden">
          모바일에서는 전화 버튼으로 바로 연결할 수 있어요.
        </p>
      )}
    </div>
  );
}
