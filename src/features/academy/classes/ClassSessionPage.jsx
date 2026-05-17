import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, Plus, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import { formatDateShort } from '../../../utils/date';
import { attendanceStatusMap } from '../../../utils/format';
import ClinicRecordFormModal from '../clinic/ClinicRecordFormModal';

// ─── 평가 옵션 ──────────────────────────────────────────────────────────────
const ATTITUDE_OPTIONS = [
  { value: '좋음',  color: 'border-green-400 bg-green-50 text-green-700' },
  { value: '보통',  color: 'border-blue-300 bg-blue-50 text-blue-700' },
  { value: '아쉬움', color: 'border-orange-300 bg-orange-50 text-orange-700' },
];
const FOCUS_OPTIONS = [
  { value: '높음', color: 'border-green-400 bg-green-50 text-green-700' },
  { value: '보통', color: 'border-blue-300 bg-blue-50 text-blue-700' },
  { value: '낮음', color: 'border-orange-300 bg-orange-50 text-orange-700' },
];
const UNDERSTANDING_OPTIONS = [
  { value: '충분',      color: 'border-green-400 bg-green-50 text-green-700' },
  { value: '보통',      color: 'border-blue-300 bg-blue-50 text-blue-700' },
  { value: '보완 필요', color: 'border-red-300 bg-red-50 text-red-700' },
];
const HOMEWORK_OPTIONS = [
  { value: '완료',      color: 'border-green-400 bg-green-50 text-green-700' },
  { value: '일부 완료', color: 'border-yellow-400 bg-yellow-50 text-yellow-700' },
  { value: '미완료',    color: 'border-red-300 bg-red-50 text-red-700' },
];
const ATT_OPTIONS = ['present', 'late', 'absent', 'makeup'];

// ─── 빠른 클리닉 항목 ──────────────────────────────────────────────────────
const QUICK_CLINIC_TYPES = [
  { type: 'homework',       label: '숙제 미완료' },
  { type: 'wrong_answer',   label: '오답 풀이' },
  { type: 'vocabulary',     label: '단어 재시험' },
  { type: 'grammar',        label: '문법 보충' },
  { type: 'test_retry',     label: '재시험' },
  { type: 'absence_makeup', label: '결석 보강' },
];

// ─── 공통 수업 기록 초기값 ─────────────────────────────────────────────────
function buildCommonRecord(lr) {
  return {
    commonProgress:    lr?.commonProgress    ?? '',
    commonContent:     lr?.commonContent     ?? '',
    commonHomework:    lr?.commonHomework     ?? '',
    nextLessonPlan:    lr?.nextLessonPlan     ?? '',
    teacherMemo:       lr?.teacherMemo        ?? '',
  };
}

// ─── 학생별 기록 초기값 ───────────────────────────────────────────────────
function buildStudentRecord(lr) {
  return {
    attitude:       lr?.attitude       ?? null,
    focus:          lr?.focus           ?? null,
    understanding:  lr?.understanding  ?? null,
    homeworkStatus: lr?.homeworkStatus  ?? null,
    memo:           lr?.memo            ?? '',
  };
}

function recordsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ─── 평가 버튼 행 ─────────────────────────────────────────────────────────
function EvalRow({ label, options, value, onChange }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 mb-1.5">{label}</p>
      <div className="flex gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? null : opt.value)}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold border-2 transition-colors ${
              value === opt.value ? opt.color : 'border-gray-200 bg-white text-gray-400'
            }`}
          >
            {opt.value}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 학생 카드 ────────────────────────────────────────────────────────────
function StudentCard({ student, sessionId, canEdit, attendance, initialRecord, onRecordChange, onAddClinic, onQuickClinic, existingClinicTypes }) {
  const { updateAcademyAttendance } = useAcademyStore();
  const [expanded, setExpanded] = useState(false);
  const [rec, setRec] = useState(() => buildStudentRecord(initialRecord));
  const savedRef = useRef(buildStudentRecord(initialRecord));

  // 부모에게 dirty 여부 전달
  useEffect(() => {
    onRecordChange(student.id, rec, !recordsEqual(rec, savedRef.current));
  }, [rec]); // eslint-disable-line

  // 저장 후 savedRef 업데이트
  const markSaved = useCallback((newRec) => {
    savedRef.current = { ...newRec };
  }, []);

  const setField = (k, v) => setRec((r) => ({ ...r, [k]: v }));
  const clinicCount = existingClinicTypes.size;
  const hasEval = rec.attitude || rec.focus || rec.understanding || rec.homeworkStatus;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-blue-600">{(student.name || '?')[0]}</span>
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900">{student.name}</p>
          {student.grade && <p className="text-xs text-gray-400">{student.grade}</p>}
        </div>
        <div className="flex items-center gap-2">
          {clinicCount > 0 && (
            <span className="text-xs bg-orange-50 text-orange-500 font-semibold px-2 py-0.5 rounded-full">
              클리닉 {clinicCount}
            </span>
          )}
          {attendance ? (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${attendanceStatusMap[attendance.status]?.bg} ${attendanceStatusMap[attendance.status]?.color}`}>
              {attendanceStatusMap[attendance.status]?.label}
            </span>
          ) : (
            <span className="text-xs text-gray-300 font-medium">미체크</span>
          )}
          {hasEval && <Check size={13} className="text-green-500 flex-shrink-0" />}
          {expanded ? <ChevronUp size={15} className="text-gray-300" /> : <ChevronDown size={15} className="text-gray-300" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-50 flex flex-col gap-4 pt-3">
              {/* 출결 */}
              {canEdit && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">출결</p>
                  <div className="flex gap-2">
                    {ATT_OPTIONS.map((status) => {
                      const meta = attendanceStatusMap[status];
                      const isActive = attendance?.status === status;
                      return (
                        <motion.button
                          key={status}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => updateAcademyAttendance(sessionId, student.id, status)}
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

              {/* 평가 항목 */}
              {canEdit && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-semibold text-gray-500">평가</p>
                  <EvalRow label="태도" options={ATTITUDE_OPTIONS} value={rec.attitude} onChange={(v) => setField('attitude', v)} />
                  <EvalRow label="집중도" options={FOCUS_OPTIONS} value={rec.focus} onChange={(v) => setField('focus', v)} />
                  <EvalRow label="이해도" options={UNDERSTANDING_OPTIONS} value={rec.understanding} onChange={(v) => setField('understanding', v)} />
                  <EvalRow label="숙제 수행" options={HOMEWORK_OPTIONS} value={rec.homeworkStatus} onChange={(v) => setField('homeworkStatus', v)} />
                </div>
              )}

              {/* 메모 */}
              {canEdit && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">학생 메모</p>
                  <textarea
                    value={rec.memo}
                    onChange={(e) => setField('memo', e.target.value)}
                    rows={2}
                    placeholder="개인 특이사항이나 피드백을 기록해요..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 resize-none"
                  />
                </div>
              )}

              {/* 학습 보완 항목 */}
              {canEdit && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">학습 보완 항목</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_CLINIC_TYPES.map(({ type, label }) => {
                      const checked = existingClinicTypes.has(type);
                      return (
                        <motion.button
                          key={type}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onQuickClinic(student.id, type, label)}
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

              {/* 클리닉 추가 */}
              {canEdit && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onAddClinic(student.id)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-orange-200 text-orange-500 text-xs font-semibold"
                >
                  <Plus size={13} />
                  클리닉 상세 추가
                </motion.button>
              )}

              {/* 읽기 전용 평가 표시 */}
              {!canEdit && hasEval && (
                <div className="flex flex-wrap gap-2">
                  {rec.attitude && <Chip label={`태도: ${rec.attitude}`} />}
                  {rec.focus && <Chip label={`집중도: ${rec.focus}`} />}
                  {rec.understanding && <Chip label={`이해도: ${rec.understanding}`} />}
                  {rec.homeworkStatus && <Chip label={`숙제: ${rec.homeworkStatus}`} />}
                </div>
              )}
              {!canEdit && rec.memo && (
                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2">{rec.memo}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Chip({ label }) {
  return (
    <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">{label}</span>
  );
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────────────
export default function ClassSessionPage() {
  const {
    role,
    selectedClassSessionId,
    classSessions, classGroups, academyStudents, academyTeachers,
    clinicTasks, academyAttendanceRecords, academyLessonRecords,
    updateAcademyAttendance, addClinicTask, batchSaveSessionRecords,
    goBackFromClassSession,
  } = useAcademyStore();

  // session/group 탐색 (null이어도 useMemo가 먼저 실행됨)
  const session = useMemo(
    () => classSessions.find((s) => s.id === selectedClassSessionId) ?? null,
    [classSessions, selectedClassSessionId]
  );
  const group = useMemo(
    () => (session ? classGroups.find((g) => g.id === session.classGroupId) : null) ?? null,
    [classGroups, session]
  );
  const teacher = useMemo(
    () => (group ? academyTeachers.find((t) => t.id === group.teacherId) : null) ?? null,
    [academyTeachers, group]
  );
  const students = useMemo(
    () => session ? academyStudents.filter((s) => (session.studentIds || []).includes(s.id)) : [],
    [academyStudents, session]
  );

  // 공통 기록: 저장된 값 로드
  const savedCommonLr = useMemo(
    () => session ? academyLessonRecords.find((lr) => lr.sessionId === session.id && lr.studentId === '_common_') : null,
    [academyLessonRecords, session]
  );

  const [commonRec, setCommonRec] = useState(() => buildCommonRecord(savedCommonLr));
  const [savedCommon, setSavedCommon] = useState(() => buildCommonRecord(savedCommonLr));

  // session이 바뀌면 공통 기록 초기화
  useEffect(() => {
    const init = buildCommonRecord(savedCommonLr);
    setCommonRec(init);
    setSavedCommon(init);
  }, [selectedClassSessionId]); // eslint-disable-line

  // 학생별 기록 dirty state 관리
  const [studentDirtyMap, setStudentDirtyMap] = useState({});
  const studentRecDraftRef = useRef({});

  const handleRecordChange = useCallback((studentId, rec, isDirty) => {
    studentRecDraftRef.current[studentId] = rec;
    setStudentDirtyMap((m) => ({ ...m, [studentId]: isDirty }));
  }, []);

  const [showClinicForm, setShowClinicForm] = useState(false);
  const [clinicStudentId, setClinicStudentId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const canEdit = role === 'owner' || role === 'teacher';
  const isCommonDirty = useMemo(() => !recordsEqual(commonRec, savedCommon), [commonRec, savedCommon]);
  const isAnyStudentDirty = Object.values(studentDirtyMap).some(Boolean);
  const isDirty = isCommonDirty || isAnyStudentDirty;

  // 클리닉 helper
  const getExistingClinicTypes = useCallback(
    (studentId) =>
      new Set(
        clinicTasks
          .filter((t) => t.classSessionId === selectedClassSessionId && t.studentId === studentId)
          .map((t) => t.type)
      ),
    [clinicTasks, selectedClassSessionId]
  );

  const handleQuickClinic = useCallback(
    (studentId, type, label) => {
      if (!session) return;
      const already = clinicTasks.find(
        (t) => t.classSessionId === selectedClassSessionId && t.studentId === studentId && t.type === type
      );
      if (already) return;
      addClinicTask({
        studentId, classGroupId: session.classGroupId, classSessionId: selectedClassSessionId,
        createdByRole: role, type, title: label, description: '',
        dueDate: session.date, priority: 'normal', assignedToId: '',
      });
    },
    [clinicTasks, selectedClassSessionId, session, role, addClinicTask]
  );

  const handleSave = useCallback(async () => {
    if (!session || isSaving) return;
    setIsSaving(true);
    batchSaveSessionRecords({
      sessionId: session.id,
      date: session.date,
      commonRecord: commonRec,
      studentRecords: studentRecDraftRef.current,
    });
    setSavedCommon({ ...commonRec });
    setStudentDirtyMap({});
    setIsSaving(false);
  }, [session, isSaving, commonRec, batchSaveSessionRecords]);

  const setCommonField = (k, v) => setCommonRec((r) => ({ ...r, [k]: v }));

  const presentCount = academyAttendanceRecords.filter(
    (a) => a.sessionId === selectedClassSessionId && a.status === 'present'
  ).length;

  // Guard: session/group이 없으면 null (early return은 훅 이후)
  if (!session || !group) return null;

  return (
    <div>
      {/* 헤더 */}
      <div className="fixed top-0 left-0 right-0 z-20 bg-white/95 border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 h-14">
          <button
            type="button"
            onClick={goBackFromClassSession}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 truncate">{group.name}</p>
            <p className="text-xs text-gray-400">{formatDateShort(session.date)} · {session.startTime}–{session.endTime}</p>
          </div>
          {isDirty && (
            <span className="text-xs text-orange-500 font-semibold bg-orange-50 px-2 py-1 rounded-full">미저장</span>
          )}
        </div>
      </div>

      <div className="pt-14 pb-28">
        {/* 수업 정보 카드 */}
        <div className="px-4 pt-4 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <SummaryCell label="수강생" value={students.length} />
              <SummaryCell label="출석" value={presentCount} color="text-green-600" />
              <SummaryCell
                label="클리닉"
                value={clinicTasks.filter((t) => t.classSessionId === selectedClassSessionId).length}
                color="text-orange-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 pt-3 border-t border-gray-50">
              {session.room && <InfoChip label="강의실" value={session.room} />}
              {teacher && <InfoChip label="강사" value={teacher.name} />}
              <InfoChip label="시간" value={`${session.startTime}–${session.endTime}`} />
              <InfoChip label="상태" value={session.status === 'completed' ? '완료' : session.status === 'canceled' ? '취소' : '예정'} />
            </div>
          </div>
        </div>

        {/* ── 공통 수업 기록 ─────────────────────────────── */}
        {canEdit && (
          <div className="px-4 mb-4">
            <div className="bg-blue-50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm font-bold text-blue-900">공통 수업 기록</p>
                <p className="text-xs text-blue-500">오늘 반 전체가 함께한 내용이에요</p>
              </div>
              <div className="flex flex-col gap-3">
                <CommonField label="오늘 진도" placeholder="예: Lesson 3 본문 대화문"
                  value={commonRec.commonProgress} onChange={(v) => setCommonField('commonProgress', v)} single />
                <CommonField label="수업 내용" placeholder="오늘 수업에서 다룬 내용을 기록해요"
                  value={commonRec.commonContent} onChange={(v) => setCommonField('commonContent', v)} />
                <CommonField label="공통 숙제" placeholder="예: 본문 2회 읽기, 단어 20개 암기"
                  value={commonRec.commonHomework} onChange={(v) => setCommonField('commonHomework', v)} single />
                <CommonField label="다음 수업 계획" placeholder="예: Lesson 3 문법 정리"
                  value={commonRec.nextLessonPlan} onChange={(v) => setCommonField('nextLessonPlan', v)} single />
                <CommonField label="강사 메모" placeholder="내부 메모 (학부모에게 공개 안 됨)"
                  value={commonRec.teacherMemo} onChange={(v) => setCommonField('teacherMemo', v)} />
              </div>
            </div>
          </div>
        )}

        {/* ── 학생별 기록 ───────────────────────────────── */}
        <div className="px-4 mb-4">
          <p className="text-sm font-bold text-gray-700 mb-3">학생별 기록</p>
          <div className="flex flex-col gap-3">
            {students.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
                <p className="text-sm text-gray-400">배정된 학생이 없어요</p>
              </div>
            ) : (
              students.map((student) => {
                const att = academyAttendanceRecords.find(
                  (a) => a.sessionId === selectedClassSessionId && a.studentId === student.id
                );
                const existingLr = academyLessonRecords.find(
                  (lr) => lr.sessionId === selectedClassSessionId && lr.studentId === student.id
                );
                const existingClinicTypes = getExistingClinicTypes(student.id);
                return (
                  <StudentCard
                    key={student.id}
                    student={student}
                    sessionId={selectedClassSessionId}
                    canEdit={canEdit}
                    attendance={att}
                    initialRecord={existingLr}
                    onRecordChange={handleRecordChange}
                    onAddClinic={(sid) => { setClinicStudentId(sid); setShowClinicForm(true); }}
                    onQuickClinic={handleQuickClinic}
                    existingClinicTypes={existingClinicTypes}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── 저장 버튼 (fixed) ──────────────────────────── */}
      {canEdit && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/95 border-t border-gray-100 px-4 py-3 pb-safe max-w-md mx-auto">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            disabled={isSaving}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-colors ${
              isDirty
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                : 'bg-green-50 text-green-600'
            }`}
          >
            {isSaving ? '저장 중...' : isDirty ? '수업 기록 저장' : '✓ 저장됨'}
          </motion.button>
        </div>
      )}

      {showClinicForm && (
        <ClinicRecordFormModal
          presetClassGroupId={session.classGroupId}
          presetClassSessionId={selectedClassSessionId}
          presetStudentId={clinicStudentId}
          presetDate={session.date}
          presetSubject={group.subject || ''}
          onClose={() => { setShowClinicForm(false); setClinicStudentId(null); }}
        />
      )}
    </div>
  );
}

// ─── 공통 기록 입력 필드 ─────────────────────────────────────────────────
function CommonField({ label, placeholder, value, onChange, single }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-blue-700 mb-1">{label}</p>
      {single ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white"
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white resize-none"
        />
      )}
    </div>
  );
}

function SummaryCell({ label, value, color = 'text-gray-900' }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function InfoChip({ label, value }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-400">{label}:</span>
      <span className="font-medium text-gray-700">{value}</span>
    </div>
  );
}
