import { useMemo, useState } from 'react';
import { ChevronLeft, Pencil, Trash2, CalendarDays } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { deleteClassGroup as deleteServerClassGroup } from '../../../services/supabase/domainApi';
import EmptyState from '../../../components/EmptyState';
import Modal from '../../../components/Modal';
import { today, formatDateShort, compareYMD } from '../../../utils/date';
import { getTeacherDisplayName } from '../../../utils/format';
import ClassGroupFormModal from './ClassGroupFormModal';

const SESSION_STATUS = {
  scheduled:   { label: '예정',  color: 'bg-blue-50 text-blue-600' },
  completed:   { label: '완료',  color: 'bg-green-50 text-green-600' },
  canceled:    { label: '취소',  color: 'bg-gray-100 text-gray-400' },
  rescheduled: { label: '변경',  color: 'bg-yellow-50 text-yellow-600' },
};

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
    academyStudents, academyTeachers, academyProfile, academyAttendanceRecords,
    clinicRecords = [], navigateToClassSession, goBackFromClassGroup, setActiveTab,
    deleteClassGroup, showToast,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerClassGroups = useWorkspaceStore((s) => s.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);

  const [showEditForm, setShowEditForm] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const todayStr = today();

  const group = classGroups.find((g) => g.id === selectedClassGroupId) ?? null;

  const sessions = useMemo(
    () => group
      ? classSessions
          .filter((s) => s.classGroupId === selectedClassGroupId)
          .slice()
          .sort((a, b) => compareYMD(a.date || '', b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''))
      : [],
    [classSessions, selectedClassGroupId, group]
  );

  const students = useMemo(
    () => group ? academyStudents.filter((s) => (group.studentIds || []).includes(s.id)) : [],
    [academyStudents, group]
  );

  const groupClinicRecords = useMemo(
    () => (clinicRecords || []).filter((r) => r.classGroupId === selectedClassGroupId),
    [clinicRecords, selectedClassGroupId]
  );

  const preview = useMemo(
    () => getSessionPreviewGroups({ sessions, todayYMD: todayStr, limit: 3 }),
    [sessions, todayStr]
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

  const teacherName = group.teacherId
    ? getTeacherDisplayName(group.teacherId, academyTeachers, academyProfile)
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
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-20 bg-white/95 border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 h-14">
          <button type="button" onClick={goBackFromClassGroup} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 truncate">{group.name}</p>
            <p className="text-xs text-gray-400">{group.subject} · {group.level}</p>
          </div>
          {role === 'owner' && (
            <div className="flex items-center gap-1">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowEditForm(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100"
              >
                <Pencil size={16} className="text-gray-500" />
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={handleDeleteClassGroup}
                className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100"
              >
                <Trash2 size={16} className="text-red-400" />
              </motion.button>
            </div>
          )}
        </div>
      </div>

      <div className="pt-14 pb-6">
        {/* 반 정보 카드 */}
        <div className="px-4 pt-4 mb-5">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <InfoRow label="요일" value={`${group.weekdays?.join('·')}요일`} />
              <InfoRow label="시간" value={`${group.startTime}–${group.endTime}`} />
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

        {/* 오늘 수업 */}
        {preview.todaySessions.length > 0 && (
          <SessionSection
            title="오늘 수업"
            count={preview.todayTotal}
            sessions={preview.todaySessions}
            students={students}
            attendanceRecords={academyAttendanceRecords}
            onSessionClick={(id) => navigateToClassSession(id)}
            highlightToday
          />
        )}

        {/* 다음 수업 */}
        <SessionSection
          title="다음 수업"
          count={preview.nextTotal}
          sessions={preview.nextSessions}
          students={students}
          attendanceRecords={academyAttendanceRecords}
          onSessionClick={(id) => navigateToClassSession(id)}
          emptyText="예정된 수업이 없어요"
        />

        {/* 지난 수업 */}
        <SessionSection
          title="지난 수업"
          count={preview.pastTotal}
          sessions={preview.pastSessions}
          students={students}
          attendanceRecords={academyAttendanceRecords}
          onSessionClick={(id) => navigateToClassSession(id)}
          isPast
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
          onSessionClick={(id) => { setShowAllSessions(false); navigateToClassSession(id); }}
          onClose={() => setShowAllSessions(false)}
        />
      )}
    </div>
  );
}

function SessionSection({ title, count, sessions, students, attendanceRecords, onSessionClick, isPast, highlightToday, emptyText }) {
  return (
    <div className="px-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-gray-700">
          {title}
          {highlightToday && <span className="ml-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full align-middle">오늘</span>}
        </p>
        <span className="text-xs text-gray-400">{count}회</span>
      </div>
      {sessions.length === 0 ? (
        emptyText ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-sm text-gray-400">{emptyText}</p>
          </div>
        ) : null
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} students={students}
              attendanceRecords={attendanceRecords}
              onClick={() => onSessionClick(session.id)}
              isPast={isPast}
            />
          ))}
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
                  onClick={() => onSessionClick(session.id)}
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
