import { useState, useMemo } from 'react';
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import { formatDateShort, getDDayLabel } from '../../../utils/date';
import { attendanceStatusMap } from '../../../utils/format';
import AcademyStudentFormModal from './AcademyStudentFormModal';
import ClinicFormModal from '../clinic/ClinicFormModal';

const CLINIC_TYPE_LABELS = {
  homework: '숙제', wrong_answer: '오답', vocabulary: '단어', reading: '본문',
  grammar: '문법', concept: '개념', test_retry: '재시험', absence_makeup: '보강', other: '기타',
};

const TABS_BY_ROLE = {
  owner:     ['요약', '수업', '클리닉', '수납'],
  teacher:   ['요약', '클리닉'],
  assistant: ['요약', '클리닉'],
};

export default function AcademyStudentDetailPage() {
  const {
    role, selectedAcademyStudentId, academyStudents, classGroups, classSessions,
    academyAttendanceRecords, academyLessonRecords, clinicTasks, academyPayments,
    deleteAcademyStudent, navigateToClassSession, goBackFromAcademyStudent,
  } = useAcademyStore();

  const [activeTab, setActiveTab] = useState('요약');
  const [showEdit, setShowEdit] = useState(false);
  const [showClinicForm, setShowClinicForm] = useState(false);

  const student = academyStudents.find((s) => s.id === selectedAcademyStudentId);
  if (!student) return null;

  const tabs = TABS_BY_ROLE[role] || TABS_BY_ROLE.owner;

  const studentGroups = useMemo(
    () => classGroups.filter((g) => g.studentIds?.includes(student.id)),
    [classGroups, student.id]
  );

  const studentClinics = useMemo(
    () => clinicTasks.filter((t) => t.studentId === student.id).sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '') || 0),
    [clinicTasks, student.id]
  );

  const pendingClinics = studentClinics.filter((t) => t.status !== 'completed');

  const studentSessions = useMemo(() => {
    const groupIds = new Set(studentGroups.map((g) => g.id));
    return classSessions
      .filter((s) => groupIds.has(s.classGroupId))
      .sort((a, b) => b.date?.localeCompare(a.date || '') || 0);
  }, [classSessions, studentGroups]);

  const handleDelete = () => {
    if (window.confirm(`${student.name} 학생을 삭제할까요?`)) {
      deleteAcademyStudent(student.id);
      goBackFromAcademyStudent();
    }
  };

  const renderSummary = () => (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-400 mb-3">기본 정보</p>
        <div className="flex flex-col gap-2">
          {student.grade && <InfoRow label="학년" value={student.grade} />}
          {student.school && <InfoRow label="학교" value={student.school} />}
          {student.phone && <InfoRow label="연락처" value={student.phone} />}
          {student.parentName && <InfoRow label="학부모" value={student.parentName} />}
          {student.parentPhone && <InfoRow label="학부모 연락처" value={student.parentPhone} />}
          {student.memo && <InfoRow label="메모" value={student.memo} />}
        </div>
      </div>

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

      {pendingClinics.length > 0 && (
        <div className="bg-orange-50 rounded-2xl p-4">
          <p className="text-xs font-semibold text-orange-600 mb-2">클리닉 대기 {pendingClinics.length}건</p>
          {pendingClinics.slice(0, 3).map((t) => (
            <p key={t.id} className="text-sm text-orange-700 py-1 border-b border-orange-100 last:border-0">
              {CLINIC_TYPE_LABELS[t.type] || '기타'} · {t.title}
            </p>
          ))}
        </div>
      )}
    </div>
  );

  const renderLessons = () => (
    <div className="flex flex-col gap-2">
      {studentSessions.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-400">수업 기록이 없어요</p>
        </div>
      ) : (
        studentSessions.map((session) => {
          const group = classGroups.find((g) => g.id === session.classGroupId);
          const attendance = academyAttendanceRecords.find(
            (r) => r.sessionId === session.id && r.studentId === student.id
          );
          const lessonRecord = academyLessonRecords.find(
            (r) => r.sessionId === session.id && r.studentId === student.id
          );
          const statusLabel = { present: '출석', late: '지각', absent: '결석', makeup: '보강' };
          const statusColor = { present: 'text-green-600 bg-green-50', late: 'text-orange-500 bg-orange-50', absent: 'text-red-500 bg-red-50', makeup: 'text-blue-500 bg-blue-50' };
          return (
            <button
              key={session.id}
              onClick={() => navigateToClassSession(session.id)}
              className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-bold text-gray-900">{session.date}</p>
                {attendance?.status ? (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor[attendance.status] || 'text-gray-400 bg-gray-50'}`}>
                    {statusLabel[attendance.status] || attendance.status}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">미기록</span>
                )}
              </div>
              <p className="text-xs text-gray-400">{group?.name} · {session.startTime}</p>
              {lessonRecord?.content && (
                <p className="text-xs text-gray-500 mt-2 line-clamp-2">{lessonRecord.content}</p>
              )}
            </button>
          );
        })
      )}
    </div>
  );

  const renderClinic = () => (
    <div className="flex flex-col gap-3">
      {studentClinics.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-400">클리닉 기록이 없어요</p>
        </div>
      ) : (
        studentClinics.map((task) => {
          const statusColors = { pending: 'bg-orange-50 text-orange-600', in_progress: 'bg-blue-50 text-blue-600', completed: 'bg-green-50 text-green-600', hold: 'bg-gray-100 text-gray-500' };
          const statusLabels = { pending: '대기', in_progress: '진행 중', completed: '완료', hold: '보류' };
          return (
            <div key={task.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[task.status] || ''}`}>
                  {statusLabels[task.status] || task.status}
                </span>
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                  {CLINIC_TYPE_LABELS[task.type] || '기타'}
                </span>
              </div>
              <p className="font-semibold text-gray-900 text-sm">{task.title}</p>
              {task.description && <p className="text-xs text-gray-500 mt-1">{task.description}</p>}
              {task.resultMemo && (
                <div className="mt-2 bg-green-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-green-600">결과: {task.resultMemo}</p>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">
                {task.dueDate && `마감 ${formatDateShort(task.dueDate)}`}
                {task.completedAt && ` · 완료 ${formatDateShort(task.completedAt.slice(0, 10))}`}
              </p>
            </div>
          );
        })
      )}
    </div>
  );

  const renderPayments = () => (
    <div className="flex flex-col gap-2">
      {role !== 'owner' ? (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-400">수납 정보는 원장만 확인할 수 있어요.</p>
        </div>
      ) : academyPayments.filter((p) => p.studentId === student.id).length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-400">수납 기록이 없어요</p>
        </div>
      ) : (
        academyPayments.filter((p) => p.studentId === student.id).map((p) => (
          <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{p.month}</p>
              <p className="text-xs text-gray-400">수강료</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-gray-900">{p.amount?.toLocaleString()}원</p>
              <span className={`text-xs font-medium ${p.status === 'paid' ? 'text-green-600' : 'text-red-500'}`}>
                {p.status === 'paid' ? '완료' : '미납'}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div>
      <div className="fixed top-0 left-0 right-0 z-20 bg-white/95 border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 h-14">
          <button onClick={goBackFromAcademyStudent} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <p className="flex-1 font-bold text-gray-900 truncate">{student.name}</p>
          {role === 'owner' && (
            <div className="flex items-center gap-1">
              <button onClick={() => setShowEdit(true)} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
                <Pencil size={16} className="text-gray-500" />
              </button>
              <button onClick={handleDelete} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
                <Trash2 size={16} className="text-red-400" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="pt-14 pb-6">
        {/* 프로필 */}
        <div className="px-4 pt-4 mb-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600 flex-shrink-0">
            {student.name[0]}
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{student.name}</p>
            {student.grade && <p className="text-sm text-gray-500">{student.grade} {student.school && `· ${student.school}`}</p>}
          </div>
        </div>

        {/* 탭 */}
        <div className="px-4 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {tabs.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
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
          {activeTab === '수업' && renderLessons()}
          {activeTab === '클리닉' && renderClinic()}
          {activeTab === '수납' && renderPayments()}
        </div>

        {/* 클리닉 요청 버튼 */}
        {(role === 'owner' || role === 'teacher') && (
          <div className="px-4 mt-4">
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowClinicForm(true)}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-blue-200 text-blue-600 text-sm font-semibold">
              + 클리닉 요청
            </motion.button>
          </div>
        )}
      </div>

      {showEdit && <AcademyStudentFormModal editStudent={student} onClose={() => setShowEdit(false)} />}
      {showClinicForm && (
        <ClinicFormModal presetStudentId={student.id} onClose={() => setShowClinicForm(false)} />
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  );
}
