import { useState, useMemo } from 'react';
import { ChevronLeft, Pencil, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import { formatDateShort, getKoreanWeekdayFromYMD } from '../../../utils/date';
import { attendanceStatusMap } from '../../../utils/format';
import AcademyStudentFormModal from './AcademyStudentFormModal';
import ClinicFormModal from '../clinic/ClinicFormModal';

const CLINIC_TYPE_LABELS = {
  homework: '숙제', wrong_answer: '오답', vocabulary: '단어', reading: '본문',
  grammar: '문법', concept: '개념', test_retry: '재시험', absence_makeup: '보강', other: '기타',
};

const CLINIC_STATUS = {
  pending:     { label: '대기',    color: 'bg-orange-50 text-orange-600' },
  in_progress: { label: '진행 중', color: 'bg-blue-50 text-blue-600' },
  completed:   { label: '완료',    color: 'bg-green-50 text-green-600' },
  hold:        { label: '보류',    color: 'bg-gray-100 text-gray-500' },
};

// 역할별 탭 정의
const TABS_BY_ROLE = {
  owner:     ['요약', '수업 기록', '정산'],
  teacher:   ['요약', '수업 기록'],
  assistant: ['요약', '클리닉'],
};

// ── helper: 학생 날짜별 수업 기록 생성 ─────────────────────────────
function getStudentDailyLessonRecords({ studentId, classSessions, classGroups, academyLessonRecords, academyAttendanceRecords, clinicTasks, academyTeachers }) {
  const records = classSessions
    .filter((s) => (s.studentIds || []).includes(studentId))
    .map((session) => {
      const group = classGroups.find((g) => g.id === session.classGroupId) || {};
      const attendance = academyAttendanceRecords.find((a) => a.sessionId === session.id && a.studentId === studentId);
      const lessonRecord = academyLessonRecords.find((lr) => lr.sessionId === session.id && lr.studentId === studentId);
      const teacher = academyTeachers.find((t) => t.id === session.teacherId);

      // 클리닉 연결: 1) classSessionId 일치 2) 같은 학생 + 같은 날짜
      const linkedClinics = clinicTasks.filter((c) =>
        c.studentId === studentId &&
        (c.classSessionId === session.id || (!c.classSessionId && c.dueDate === session.date))
      );
      const clinicSummary = {
        total: linkedClinics.length,
        pending: linkedClinics.filter((c) => c.status === 'pending').length,
        inProgress: linkedClinics.filter((c) => c.status === 'in_progress').length,
        completed: linkedClinics.filter((c) => c.status === 'completed').length,
      };

      return {
        id: session.id,
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        classGroupId: session.classGroupId,
        classGroupName: group.name || '',
        subject: group.subject || '',
        teacherName: teacher?.name || '',
        room: session.room || group.room || '',
        attendanceStatus: attendance?.status || null,
        lessonRecord,
        clinics: linkedClinics,
        clinicSummary,
      };
    })
    .sort((a, b) => {
      const d = b.date?.localeCompare(a.date || '') || 0;
      if (d !== 0) return d;
      return b.startTime?.localeCompare(a.startTime || '') || 0;
    });

  return records;
}

// ── 수업 기록 카드 ─────────────────────────────────────────────────
function LessonRecordCard({ record, assistants }) {
  const [expanded, setExpanded] = useState(false);
  const { date, startTime, endTime, classGroupName, subject, teacherName, attendanceStatus, lessonRecord, clinics, clinicSummary } = record;

  const weekday = date ? getKoreanWeekdayFromYMD(date) : '';
  const attMeta = attendanceStatus ? attendanceStatusMap[attendanceStatus] : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* 카드 헤더 */}
      <button className="w-full px-4 py-4 text-left" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-bold text-gray-900">
                {date ? `${date.slice(5).replace('-', '/')} ${weekday}요일` : '날짜 없음'}
              </p>
              {attMeta && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${attMeta.bg} ${attMeta.color}`}>
                  {attMeta.label}
                </span>
              )}
              {!attendanceStatus && <span className="text-xs text-gray-300">미기록</span>}
            </div>
            <p className="text-xs text-gray-500">{classGroupName} {subject && `· ${subject}`} · {startTime}–{endTime}</p>
            {lessonRecord?.content && (
              <p className="text-xs text-gray-400 mt-1.5 line-clamp-1">{lessonRecord.content}</p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            {clinicSummary.total > 0 && (
              <div className="flex items-center gap-1">
                {clinicSummary.inProgress > 0 && (
                  <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">진행 {clinicSummary.inProgress}</span>
                )}
                {clinicSummary.pending > 0 && (
                  <span className="text-[10px] font-semibold bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded-full">대기 {clinicSummary.pending}</span>
                )}
                {clinicSummary.completed > 0 && clinicSummary.total === clinicSummary.completed && (
                  <span className="text-[10px] font-semibold bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full">완료 {clinicSummary.completed}</span>
                )}
              </div>
            )}
            {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </div>
        </div>
      </button>

      {/* 펼침 상세 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-50">
              {/* 수업 정보 */}
              <div className="mt-3 mb-3">
                <p className="text-xs font-semibold text-gray-400 mb-2">수업 정보</p>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex flex-col gap-1">
                  {teacherName && <InfoRow label="담당 강사" value={teacherName} />}
                  {record.room && <InfoRow label="강의실" value={record.room} />}
                </div>
              </div>

              {/* 수업 내용 */}
              {lessonRecord?.content && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-400 mb-2">수업 내용</p>
                  <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{lessonRecord.content}</p>
                  </div>
                </div>
              )}

              {/* 클리닉 */}
              {clinics.length > 0 && (
                <div className="mb-1">
                  <p className="text-xs font-semibold text-gray-400 mb-2">클리닉 {clinics.length}건</p>
                  <div className="flex flex-col gap-2">
                    {clinics.map((c) => {
                      const st = CLINIC_STATUS[c.status] || CLINIC_STATUS.pending;
                      const assistant = assistants?.find((a) => a.id === c.assignedToId);
                      return (
                        <div key={c.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                            <span className="text-[10px] text-gray-400">{CLINIC_TYPE_LABELS[c.type] || '기타'}</span>
                          </div>
                          <p className="text-sm font-semibold text-gray-800">{c.title}</p>
                          {c.description && <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>}
                          {assistant && <p className="text-xs text-gray-400 mt-0.5">담당: {assistant.name}</p>}
                          {c.resultMemo && (
                            <p className="text-xs text-green-600 mt-1 bg-green-50 rounded-lg px-2 py-1">결과: {c.resultMemo}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {clinics.length === 0 && !lessonRecord?.content && (
                <p className="text-xs text-gray-300 py-2">수업 기록이 없어요</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
    academyAttendanceRecords, academyLessonRecords, clinicTasks, academyPayments,
    academyTeachers, academyAssistants,
    deleteAcademyStudent, goBackFromAcademyStudent,
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

  const pendingClinics = useMemo(() => studentClinics.filter((t) => t.status !== 'completed'), [studentClinics]);

  // 날짜별 수업 기록 (수업 기록 탭용)
  const dailyRecords = useMemo(
    () => getStudentDailyLessonRecords({
      studentId: student.id, classSessions, classGroups,
      academyLessonRecords, academyAttendanceRecords,
      clinicTasks, academyTeachers,
    }),
    [student.id, classSessions, classGroups, academyLessonRecords, academyAttendanceRecords, clinicTasks, academyTeachers]
  );

  // 수업과 연결되지 않은 클리닉 (classSessionId 없고 날짜도 매핑 안 된 것)
  const linkedClinicIds = useMemo(() => {
    const ids = new Set();
    dailyRecords.forEach((r) => r.clinics.forEach((c) => ids.add(c.id)));
    return ids;
  }, [dailyRecords]);

  const standaloneClinicas = useMemo(
    () => studentClinics.filter((c) => !linkedClinicIds.has(c.id)),
    [studentClinics, linkedClinicIds]
  );

  // 최근 수업 (요약용)
  const latestRecord = dailyRecords[0];

  const handleDelete = () => {
    if (window.confirm(`${student.name} 학생을 삭제할까요?`)) {
      deleteAcademyStudent(student.id);
      goBackFromAcademyStudent();
    }
  };

  // ── 렌더 함수들 ───────────────────────────────────────────────────

  const renderSummary = () => (
    <div className="flex flex-col gap-4">
      {/* 기본 정보 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-400 mb-3">기본 정보</p>
        <div className="flex flex-col gap-2">
          {student.grade && <InfoRowFull label="학년" value={student.grade} />}
          {student.school && <InfoRowFull label="학교" value={student.school} />}
          {student.phone && <InfoRowFull label="연락처" value={student.phone} />}
          {student.parentName && <InfoRowFull label="학부모" value={student.parentName} />}
          {student.parentPhone && <InfoRowFull label="학부모 연락처" value={student.parentPhone} />}
          {student.memo && <InfoRowFull label="메모" value={student.memo} />}
        </div>
      </div>

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
      <div className="grid grid-cols-2 gap-3">
        {latestRecord && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 mb-2">최근 수업</p>
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
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 mb-2">클리닉 현황</p>
          <p className="text-sm font-bold text-gray-900">
            {pendingClinics.length > 0 ? `대기 ${pendingClinics.length}건` : '대기 없음'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            완료 {studentClinics.filter((c) => c.status === 'completed').length}건
          </p>
        </div>
      </div>

      {/* 대기 클리닉 미리보기 */}
      {pendingClinics.length > 0 && (
        <div className="bg-orange-50 rounded-2xl p-4">
          <p className="text-xs font-semibold text-orange-600 mb-2">진행 중인 클리닉</p>
          {pendingClinics.slice(0, 3).map((t) => (
            <p key={t.id} className="text-sm text-orange-700 py-1 border-b border-orange-100 last:border-0">
              {CLINIC_TYPE_LABELS[t.type] || '기타'} · {t.title}
            </p>
          ))}
        </div>
      )}
    </div>
  );

  const renderLessonHistory = () => (
    <div className="flex flex-col gap-3">
      {dailyRecords.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-400">수업 기록이 없어요</p>
        </div>
      ) : (
        dailyRecords.map((record) => (
          <LessonRecordCard key={record.id} record={record} assistants={academyAssistants} />
        ))
      )}

      {/* 수업 외 별도 클리닉 */}
      {standaloneClinicas.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-gray-400 mb-2 px-1">별도 클리닉</p>
          {standaloneClinicas.map((c) => {
            const st = CLINIC_STATUS[c.status] || CLINIC_STATUS.pending;
            const assistant = academyAssistants.find((a) => a.id === c.assignedToId);
            return (
              <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm mb-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{CLINIC_TYPE_LABELS[c.type] || '기타'}</span>
                </div>
                <p className="text-sm font-semibold text-gray-900">{c.title}</p>
                {assistant && <p className="text-xs text-gray-400 mt-0.5">담당: {assistant.name}</p>}
                {c.resultMemo && <p className="text-xs text-green-600 mt-1">결과: {c.resultMemo}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  {c.dueDate && `마감 ${formatDateShort(c.dueDate)}`}
                  {c.completedAt && ` · 완료 ${formatDateShort(c.completedAt.slice(0, 10))}`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* 클리닉 추가 */}
      {(role === 'owner' || role === 'teacher') && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowClinicForm(true)}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-blue-200 text-blue-600 text-sm font-semibold">
          + 클리닉 추가
        </motion.button>
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
          const st = CLINIC_STATUS[task.status] || CLINIC_STATUS.pending;
          const assistant = academyAssistants.find((a) => a.id === task.assignedToId);
          return (
            <div key={task.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                  {CLINIC_TYPE_LABELS[task.type] || '기타'}
                </span>
              </div>
              <p className="font-semibold text-gray-900 text-sm">{task.title}</p>
              {task.description && <p className="text-xs text-gray-500 mt-1">{task.description}</p>}
              {assistant && <p className="text-xs text-gray-400 mt-0.5">담당: {assistant.name}</p>}
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

  const renderSettlement = () => {
    const studentPayments = academyPayments.filter((p) => p.studentId === student.id)
      .sort((a, b) => b.month?.localeCompare(a.month || '') || 0);
    return (
      <div className="flex flex-col gap-2">
        {studentPayments.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-sm text-gray-400">수납 기록이 없어요</p>
          </div>
        ) : (
          studentPayments.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{p.month}</p>
                <p className="text-xs text-gray-400">수강료 · {classGroups.find((g) => g.id === p.classGroupId)?.name || ''}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-900">{p.amount?.toLocaleString()}원</p>
                <span className={`text-xs font-medium ${p.status === 'paid' ? 'text-green-600' : 'text-red-500'}`}>
                  {p.status === 'paid' ? '수납 완료' : '미납'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

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
          {activeTab === '수업 기록' && renderLessonHistory()}
          {activeTab === '클리닉' && renderClinic()}
          {activeTab === '정산' && renderSettlement()}
        </div>
      </div>

      {showEdit && <AcademyStudentFormModal editStudent={student} onClose={() => setShowEdit(false)} />}
      {showClinicForm && (
        <ClinicFormModal presetStudentId={student.id} onClose={() => setShowClinicForm(false)} />
      )}
    </div>
  );
}

function InfoRowFull({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  );
}
