import { useState, useMemo } from 'react';
import { ChevronLeft, Pencil, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import { formatDateShort, getKoreanWeekdayFromYMD } from '../../../utils/date';
import { attendanceStatusMap } from '../../../utils/format';
import AcademyStudentFormModal from './AcademyStudentFormModal';
import ClinicRecordFormModal from '../clinic/ClinicRecordFormModal';


// 역할별 탭 정의
const TABS_BY_ROLE = {
  owner:     ['요약', '수업 기록', '정산'],
  teacher:   ['요약', '수업 기록'],
  assistant: ['요약', '클리닉'],
};

// ── helper: 학생 날짜별 수업 기록 생성 ─────────────────────────────
function getStudentDailyLessonRecords({ studentId, classSessions, classGroups, academyLessonRecords, academyAttendanceRecords, clinicTasks, clinicRecords = [], academyTeachers }) {
  const records = classSessions
    .filter((s) => (s.studentIds || []).includes(studentId))
    .map((session) => {
      const group = classGroups.find((g) => g.id === session.classGroupId) || {};
      const attendance = academyAttendanceRecords.find((a) => a.sessionId === session.id && a.studentId === studentId);
      const lessonRecord = academyLessonRecords.find((lr) => lr.sessionId === session.id && lr.studentId === studentId);
      const teacher = academyTeachers.find((t) => t.id === session.teacherId);

      // clinicRecords 연결: sessionId 일치 또는 같은 학생 + 같은 날짜
      const linkedClinicRecords = clinicRecords.filter((r) =>
        r.studentId === studentId &&
        (r.classSessionId === session.id || r.date === session.date)
      );

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
        clinics: linkedClinicRecords,
        clinicSummary: { total: linkedClinicRecords.length },
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
              <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                클리닉 {clinicSummary.total}건
              </span>
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

              {/* 클리닉 기록 */}
              {clinics.length > 0 && (
                <div className="mb-1">
                  <p className="text-xs font-semibold text-gray-400 mb-2">클리닉 기록 {clinics.length}건</p>
                  <div className="flex flex-col gap-2">
                    {clinics.map((record) => (
                      <div key={record.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{record.subject}</span>
                        {record.items?.map((item, i) => (
                          <div key={item.id || i} className="mt-1.5">
                            <p className="text-xs font-semibold text-gray-700">{item.title}</p>
                            {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                            {item.result && <p className="text-xs text-blue-600">결과: {item.result}</p>}
                          </div>
                        ))}
                        {record.overallMemo && (
                          <p className="text-xs text-gray-400 mt-1.5 border-t border-gray-200 pt-1.5">{record.overallMemo}</p>
                        )}
                      </div>
                    ))}
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
    academyAttendanceRecords, academyLessonRecords, clinicTasks, clinicRecords = [], academyPayments,
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

  // 날짜별 수업 기록 (수업 기록 탭용)
  const dailyRecords = useMemo(
    () => getStudentDailyLessonRecords({
      studentId: student.id, classSessions, classGroups,
      academyLessonRecords, academyAttendanceRecords,
      clinicTasks, clinicRecords, academyTeachers,
    }),
    [student.id, classSessions, classGroups, academyLessonRecords, academyAttendanceRecords, clinicTasks, clinicRecords, academyTeachers]
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
          <p className="text-xs font-semibold text-gray-400 mb-2">클리닉 기록</p>
          <p className="text-sm font-bold text-gray-900">
            총 {clinicRecords.filter((r) => r.studentId === student.id).length}건
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            이번 달 {clinicRecords.filter((r) => r.studentId === student.id && r.date?.slice(0, 7) === new Date().toISOString().slice(0, 7)).length}건
          </p>
        </div>
      </div>
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

      {/* 클리닉 추가 */}
      {(role === 'owner' || role === 'teacher' || role === 'assistant') && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowClinicForm(true)}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-blue-200 text-blue-600 text-sm font-semibold">
          + 클리닉 기록 추가
        </motion.button>
      )}
    </div>
  );

  const studentClinicRecords = useMemo(
    () => clinicRecords.filter((r) => r.studentId === student.id).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [clinicRecords, student.id]
  );

  const renderClinic = () => (
    <div className="flex flex-col gap-3">
      {studentClinicRecords.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-400">클리닉 기록이 없어요</p>
        </div>
      ) : (
        studentClinicRecords.map((record) => (
          <div key={record.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-bold text-gray-500">{record.date?.slice(5).replace('-', '/')}</p>
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{record.subject}</span>
            </div>
            {record.items?.map((item, i) => (
              <div key={item.id || i} className="mb-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                {item.result && <p className="text-xs text-blue-600 font-medium mt-0.5">결과: {item.result}</p>}
              </div>
            ))}
            {record.overallMemo && (
              <p className="text-xs text-gray-500 mt-1 bg-blue-50 rounded-lg px-3 py-2">{record.overallMemo}</p>
            )}
          </div>
        ))
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
        <ClinicRecordFormModal presetStudentId={student.id} onClose={() => setShowClinicForm(false)} />
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
