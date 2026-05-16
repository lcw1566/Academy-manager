import { useState, useMemo } from 'react';
import { ChevronLeft, Plus, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import { formatDateShort } from '../../../utils/date';
import { attendanceStatusMap } from '../../../utils/format';
import ClinicFormModal from '../clinic/ClinicFormModal';

const ATT_OPTIONS = ['present', 'late', 'absent', 'makeup'];

export default function ClassSessionPage() {
  const {
    role,
    selectedClassSessionId, selectedClassGroupId,
    classSessions, classGroups, academyStudents,
    academyAttendanceRecords, academyLessonRecords,
    updateAcademyAttendance, saveAcademyLessonRecord,
    goBackFromClassSession,
  } = useAcademyStore();

  const [showClinicForm, setShowClinicForm] = useState(false);
  const [clinicStudentId, setClinicStudentId] = useState(null);
  const [activeStudentId, setActiveStudentId] = useState(null);

  const session = classSessions.find((s) => s.id === selectedClassSessionId);
  const group = classGroups.find((g) => g.id === session?.classGroupId);

  const students = useMemo(
    () => academyStudents.filter((s) => (session?.studentIds || []).includes(s.id)),
    [academyStudents, session?.studentIds]
  );

  const getAttendance = (studentId) =>
    academyAttendanceRecords.find((a) => a.sessionId === selectedClassSessionId && a.studentId === studentId);

  const getLessonRecord = (studentId) =>
    academyLessonRecords.find((lr) => lr.sessionId === selectedClassSessionId && lr.studentId === studentId);

  const canEdit = role === 'owner' || role === 'teacher';

  if (!session || !group) return null;

  return (
    <div>
      <div className="fixed top-0 left-0 right-0 z-20 bg-white/95 border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 h-14">
          <button onClick={goBackFromClassSession} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex-1">
            <p className="font-bold text-gray-900">{group.name}</p>
            <p className="text-xs text-gray-400">{formatDateShort(session.date)} · {session.startTime}–{session.endTime}</p>
          </div>
        </div>
      </div>

      <div className="pt-14 pb-24">
        {/* 세션 요약 */}
        <div className="px-4 pt-4 mb-5">
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
            <div className="text-center flex-1">
              <p className="text-2xl font-bold text-gray-900">{students.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">수강생</p>
            </div>
            <div className="w-px h-10 bg-gray-100" />
            <div className="text-center flex-1">
              <p className="text-2xl font-bold text-green-600">
                {academyAttendanceRecords.filter((a) => a.sessionId === selectedClassSessionId && a.status === 'present').length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">출석</p>
            </div>
            <div className="w-px h-10 bg-gray-100" />
            <div className="text-center flex-1">
              <p className="text-2xl font-bold text-blue-600">
                {academyLessonRecords.filter((lr) => lr.sessionId === selectedClassSessionId && lr.content?.trim()).length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">기록 완료</p>
            </div>
          </div>
        </div>

        {/* 학생별 출결 + 기록 */}
        <div className="px-4 flex flex-col gap-3">
          {students.map((student) => {
            const att = getAttendance(student.id);
            const lr = getLessonRecord(student.id);
            const isExpanded = activeStudentId === student.id;

            return (
              <div key={student.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* 학생 헤더 */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                  onClick={() => setActiveStudentId(isExpanded ? null : student.id)}
                >
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-blue-600">{student.name[0]}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{student.name}</p>
                    {student.grade && <p className="text-xs text-gray-400">{student.grade}</p>}
                  </div>
                  {att && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${attendanceStatusMap[att.status]?.bg} ${attendanceStatusMap[att.status]?.color}`}>
                      {attendanceStatusMap[att.status]?.label}
                    </span>
                  )}
                  {!att && <span className="text-xs text-gray-300 font-medium">미체크</span>}
                  {lr?.content && <Check size={14} className="text-green-500 ml-1" />}
                </button>

                {/* 확장 영역 */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-50">
                    {/* 출결 */}
                    {canEdit && (
                      <div className="mt-3 mb-3">
                        <p className="text-xs font-semibold text-gray-500 mb-2">출결</p>
                        <div className="flex gap-2">
                          {ATT_OPTIONS.map((status) => {
                            const meta = attendanceStatusMap[status];
                            const isActive = att?.status === status;
                            return (
                              <motion.button
                                key={status}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => updateAcademyAttendance(selectedClassSessionId, student.id, status)}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                                  isActive
                                    ? `${meta.activeBg} ${meta.activeText} border-transparent`
                                    : 'border-gray-200 bg-white text-gray-500'
                                }`}
                              >
                                {meta.label}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 수업 기록 */}
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-500 mb-2">수업 기록</p>
                      {canEdit ? (
                        <textarea
                          defaultValue={lr?.content || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (lr?.content || '')) {
                              saveAcademyLessonRecord({
                                sessionId: selectedClassSessionId,
                                studentId: student.id,
                                content: e.target.value,
                                date: session.date,
                              });
                            }
                          }}
                          rows={3}
                          placeholder="오늘 수업 내용을 기록해주세요..."
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 resize-none"
                        />
                      ) : (
                        lr?.content ? (
                          <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5">{lr.content}</p>
                        ) : (
                          <p className="text-sm text-gray-400">기록 없음</p>
                        )
                      )}
                    </div>

                    {/* 클리닉 요청 버튼 */}
                    {(role === 'owner' || role === 'teacher') && (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { setClinicStudentId(student.id); setShowClinicForm(true); }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-orange-200 text-orange-500 text-xs font-semibold"
                      >
                        <Plus size={14} />
                        클리닉 요청
                      </motion.button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showClinicForm && (
        <ClinicFormModal
          classGroupId={session.classGroupId}
          classSessionId={selectedClassSessionId}
          presetStudentId={clinicStudentId}
          onClose={() => { setShowClinicForm(false); setClinicStudentId(null); }}
        />
      )}
    </div>
  );
}
