import { useState, useMemo } from 'react';
import { ChevronLeft, Plus, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import { formatDateShort, today } from '../../../utils/date';
import { attendanceStatusMap } from '../../../utils/format';
import ClinicFormModal from '../clinic/ClinicFormModal';

const ATT_OPTIONS = ['present', 'late', 'absent', 'makeup'];

const QUICK_CLINIC_TYPES = [
  { type: 'homework',       label: '숙제 미완료' },
  { type: 'wrong_answer',   label: '오답 풀이' },
  { type: 'vocabulary',     label: '단어 재시험' },
  { type: 'grammar',        label: '문법 보충' },
  { type: 'test_retry',     label: '재시험' },
  { type: 'absence_makeup', label: '결석 보강' },
];

export default function ClassSessionPage() {
  const {
    role,
    selectedClassSessionId,
    classSessions, classGroups, academyStudents, clinicTasks,
    academyAttendanceRecords, academyLessonRecords,
    updateAcademyAttendance, saveAcademyLessonRecord,
    addClinicTask,
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

  const getExistingClinicTypes = (studentId) =>
    new Set(
      clinicTasks
        .filter((t) => t.classSessionId === selectedClassSessionId && t.studentId === studentId)
        .map((t) => t.type)
    );

  const canEdit = role === 'owner' || role === 'teacher';

  const handleQuickClinic = (studentId, type, label) => {
    const existing = clinicTasks.find(
      (t) => t.classSessionId === selectedClassSessionId && t.studentId === studentId && t.type === type
    );
    if (existing) return;
    addClinicTask({
      studentId,
      classGroupId: session.classGroupId,
      classSessionId: selectedClassSessionId,
      createdByRole: role,
      type,
      title: label,
      description: '',
      dueDate: today(),
      priority: 'normal',
      assignedToId: '',
    });
  };

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
              <p className="text-2xl font-bold text-orange-500">
                {clinicTasks.filter((t) => t.classSessionId === selectedClassSessionId).length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">클리닉</p>
            </div>
          </div>
        </div>

        {/* 학생별 출결 + 기록 */}
        <div className="px-4 flex flex-col gap-3">
          {students.map((student) => {
            const att = getAttendance(student.id);
            const lr = getLessonRecord(student.id);
            const isExpanded = activeStudentId === student.id;
            const existingClinicTypes = getExistingClinicTypes(student.id);
            const clinicCount = existingClinicTypes.size;

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
                  <div className="flex items-center gap-2">
                    {clinicCount > 0 && (
                      <span className="text-xs bg-orange-50 text-orange-500 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertCircle size={10} />
                        {clinicCount}
                      </span>
                    )}
                    {att ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${attendanceStatusMap[att.status]?.bg} ${attendanceStatusMap[att.status]?.color}`}>
                        {attendanceStatusMap[att.status]?.label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 font-medium">미체크</span>
                    )}
                    {lr?.content && <Check size={14} className="text-green-500" />}
                  </div>
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

                    {/* 학습 보완 항목 (빠른 클리닉 체크) */}
                    {canEdit && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-gray-500 mb-2">학습 보완 항목</p>
                        <div className="flex flex-wrap gap-2">
                          {QUICK_CLINIC_TYPES.map(({ type, label }) => {
                            const checked = existingClinicTypes.has(type);
                            return (
                              <motion.button
                                key={type}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleQuickClinic(student.id, type, label)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-colors ${
                                  checked
                                    ? 'border-orange-400 bg-orange-50 text-orange-600'
                                    : 'border-gray-200 bg-white text-gray-500'
                                }`}
                              >
                                {checked && '✓ '}{label}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 상세 클리닉 추가 버튼 */}
                    {canEdit && (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { setClinicStudentId(student.id); setShowClinicForm(true); }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-orange-200 text-orange-500 text-xs font-semibold"
                      >
                        <Plus size={14} />
                        클리닉 상세 추가
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
