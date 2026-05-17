import { useMemo, useState } from 'react';
import { ChevronLeft, Plus, Users, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import { today, formatDateShort } from '../../../utils/date';
import { attendanceStatusMap } from '../../../utils/format';
import ClinicRecordFormModal from '../clinic/ClinicRecordFormModal';

const SESSION_STATUS = {
  scheduled:   { label: '예정',  color: 'bg-blue-50 text-blue-600' },
  completed:   { label: '완료',  color: 'bg-green-50 text-green-600' },
  canceled:    { label: '취소',  color: 'bg-gray-100 text-gray-400' },
  rescheduled: { label: '변경',  color: 'bg-yellow-50 text-yellow-600' },
};

export default function ClassGroupDetailPage() {
  const {
    role, selectedClassGroupId, classGroups, classSessions,
    academyStudents, academyTeachers, academyAttendanceRecords,
    clinicRecords = [], navigateToClassSession, goBackFromClassGroup, setActiveTab,
  } = useAcademyStore();

  const [showClinicForm, setShowClinicForm] = useState(false);
  const todayStr = today();

  const group = classGroups.find((g) => g.id === selectedClassGroupId);
  if (!group) return null;

  const sessions = useMemo(
    () => classSessions.filter((s) => s.classGroupId === selectedClassGroupId)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [classSessions, selectedClassGroupId]
  );

  const upcomingSessions = sessions.filter((s) => s.date >= todayStr);
  const pastSessions = sessions.filter((s) => s.date < todayStr);

  const students = useMemo(
    () => academyStudents.filter((s) => (group.studentIds || []).includes(s.id)),
    [academyStudents, group.studentIds]
  );

  const teacher = academyTeachers.find((t) => t.id === group.teacherId);

  const groupClinicRecords = useMemo(
    () => clinicRecords.filter((r) => r.classGroupId === selectedClassGroupId),
    [clinicRecords, selectedClassGroupId]
  );

  return (
    <div>
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-20 bg-white/95 border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 h-14">
          <button onClick={goBackFromClassGroup} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 truncate">{group.name}</p>
            <p className="text-xs text-gray-400">{group.subject} · {group.level}</p>
          </div>
          {groupClinicRecords.length > 0 && (
            <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full">
              클리닉 {groupClinicRecords.length}건
            </span>
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
              {teacher && <InfoRow label="담당강사" value={teacher.name} />}
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

        {/* 클리닉 기록 현황 */}
        {groupClinicRecords.length > 0 && (
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-gray-700">최근 클리닉 기록</p>
              <button onClick={() => setActiveTab('clinic')} className="text-xs text-blue-600 font-semibold">
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

        {/* 다가오는 수업 */}
        <div className="px-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-700">다가오는 수업</p>
            <span className="text-xs text-gray-400">{upcomingSessions.length}회</span>
          </div>
          {upcomingSessions.length === 0 ? (
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className="text-sm text-gray-400">예정된 수업이 없어요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {upcomingSessions.slice(0, 5).map((session) => (
                <SessionCard key={session.id} session={session} students={students}
                  attendanceRecords={academyAttendanceRecords}
                  onClick={() => navigateToClassSession(session.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 지난 수업 */}
        {pastSessions.length > 0 && (
          <div className="px-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-700">지난 수업</p>
              <span className="text-xs text-gray-400">{pastSessions.length}회</span>
            </div>
            <div className="flex flex-col gap-2">
              {[...pastSessions].reverse().slice(0, 6).map((session) => (
                <SessionCard key={session.id} session={session} students={students}
                  attendanceRecords={academyAttendanceRecords}
                  onClick={() => navigateToClassSession(session.id)}
                  isPast
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 클리닉 추가 플로팅 버튼 (원장/강사) */}
      {(role === 'teacher' || role === 'owner') && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowClinicForm(true)}
          className="fixed bottom-24 right-4 z-20 flex items-center gap-2 bg-blue-600 text-white font-bold px-4 py-3 rounded-2xl shadow-lg"
        >
          <Plus size={16} />
          클리닉 추가
        </motion.button>
      )}

      {showClinicForm && (
        <ClinicRecordFormModal
          presetClassGroupId={selectedClassGroupId}
          presetSubject={group.subject || ''}
          onClose={() => setShowClinicForm(false)}
        />
      )}
    </div>
  );
}

function SessionCard({ session, students, attendanceRecords, onClick, isPast }) {
  const attendedCount = attendanceRecords.filter((a) => a.sessionId === session.id && a.status === 'present').length;
  const statusInfo = SESSION_STATUS[session.status] || SESSION_STATUS.scheduled;

  return (
    <motion.button
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
