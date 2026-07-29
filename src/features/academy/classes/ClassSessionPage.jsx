import { memo, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Check, UserCheck, X as XIcon, QrCode, SlidersHorizontal } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  completeAcademyClassSession,
  updateClassSession as updateServerClassSession,
  upsertAcademyLessonRecord,
  upsertAcademyAttendanceRecordsBulk,
} from '../../../services/supabase/domainApi';
import EmptyState from '../../../components/EmptyState';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import { formatDateShort } from '../../../utils/date';
import { attendanceStatusMap, getTeacherDisplayName } from '../../../utils/format';
import { currentUserCan } from '../../../utils/staffPermissions';
import { getRoomTagClassName } from '../../../utils/roomTags';
import ShiftCoverageSheet from '../work/ShiftCoverageSheet';
import useEnsureShiftCoverage from '../work/useEnsureShiftCoverage';
import { getQrAttendanceHint, readAttendanceSettings } from '../attendance/attendanceHelpers';
import {
  CLASS_ACTIVITY_TYPES,
  getActivityLabel,
  getClassCompletionLabel,
  normalizeRecordSchema,
} from '../../../constants/learningActivitySettings';
import {
  ATTENDANCE_CONFIRMATION,
  isAutoInferredAttendance,
  isConfirmedAttendance,
} from '../../../utils/attendanceRecords';
// Phase 44.7 / Phase C — 회차 변경 sheet.
import SessionExceptionSheet from './SessionExceptionSheet';
import RecordTemplateModal from './RecordTemplateModal';

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
const ATT_OPTIONS = ['present', 'late', 'absent', 'excused'];
const SESSION_STATE_LABELS = {
  present: '출석',
  late: '지각',
  absent: '결석',
  makeup: '보강',
  excused: '인정결석',
};

// ─── 학습 보완 항목 태그 ────────────────────────────────────────────────────
const SUPPORT_TAG_TYPES = [
  { type: 'homework',       label: '숙제 미완료' },
  { type: 'wrong_answer',   label: '오답 풀이 필요' },
  { type: 'vocabulary',     label: '단어 재시험' },
  { type: 'reading',        label: '본문 암기' },
  { type: 'grammar',        label: '문법 보충' },
  { type: 'concept',        label: '개념 재설명' },
  { type: 'test_retry',     label: '테스트 재응시' },
  { type: 'absence_makeup', label: '결석 보강' },
  { type: 'other',          label: '기타' },
];

// ─── 공통 수업 기록 초기값 ─────────────────────────────────────────────────
function buildCommonRecord(lr) {
  return {
    commonProgress:    lr?.commonProgress    ?? '',
    commonContent:     lr?.commonContent     ?? '',
    commonHomework:    lr?.commonHomework     ?? '',
    nextLessonPlan:    lr?.nextLessonPlan     ?? '',
    teacherMemo:       lr?.teacherMemo        ?? '',
    customValues:      lr?.customValues && typeof lr.customValues === 'object' ? lr.customValues : {},
  };
}

// ─── 학생별 기록 초기값 ───────────────────────────────────────────────────
function buildStudentRecord(lr) {
  return {
    attitude:       lr?.attitude       ?? null,
    focus:          lr?.focus           ?? null,
    understanding:  lr?.understanding  ?? null,
    homeworkStatus: lr?.homeworkStatus  ?? null,
    score:          lr?.score           ?? '',
    scoreTotal:     lr?.scoreTotal      ?? '',
    scoreNote:      lr?.scoreNote       ?? '',
    memo:           lr?.memo            ?? '',
    supportTags:    Array.isArray(lr?.supportTags) ? lr.supportTags : [],
    supportMemo:    lr?.supportMemo     ?? '',
    customValues:   lr?.customValues && typeof lr.customValues === 'object' ? lr.customValues : {},
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
const StudentCard = memo(function StudentCard({
  student, sessionId, canEdit, canEditAttendance = canEdit,
  attendance, initialRecord, onRecordChange, saveCount,
  recordBlocks, recordSchema,
  attendanceHint,
  studentCheckMethod,
  onAttendanceChange,
}) {
  const updateAcademyAttendance = useAcademyStore((s) => s.updateAcademyAttendance);
  const confirmedBy = useAuthStore((s) => s.user?.id);
  const automaticStatus = attendanceHint?.statusHint || 'absent';
  const effectiveStatus = attendance?.status || automaticStatus;
  const handleAttendanceClick = useCallback((status) => {
    if (!attendance && automaticStatus === status) return;
    if (
      attendance?.status === status
      && attendance?.confirmationState === ATTENDANCE_CONFIRMATION.TEACHER_CONFIRMED
    ) return;
    updateAcademyAttendance(sessionId, student.id, status, {
      source: 'teacher_manual',
      confirmationState: ATTENDANCE_CONFIRMATION.TEACHER_CONFIRMED,
      confirmedBy,
      silent: true,
    });
    onAttendanceChange?.();
  }, [
    attendance?.status,
    attendance?.confirmationState,
    automaticStatus,
    sessionId,
    student.id,
    updateAcademyAttendance,
    confirmedBy,
    onAttendanceChange,
  ]);

  const sourceBadge = (() => {
    if (!attendance) return null;
    if (attendance.confirmationState === ATTENDANCE_CONFIRMATION.LEGACY_CONFIRMED) {
      return { label: '기존 확정', tone: 'bg-gray-100 text-gray-600' };
    }
    return { label: '선생님 수정', tone: 'bg-blue-50 text-blue-700' };
  })();
  const [expanded, setExpanded] = useState(false);
  const [rec, setRec] = useState(() => buildStudentRecord(initialRecord));
  const savedRef = useRef(buildStudentRecord(initialRecord));

  // 저장 완료 시 savedRef를 현재 rec으로 업데이트하여 dirty 해제
  useEffect(() => {
    savedRef.current = { ...rec };
  }, [saveCount]); // eslint-disable-line

  // 부모에게 dirty 여부 전달
  useEffect(() => {
    onRecordChange(student.id, rec, !recordsEqual(rec, savedRef.current));
  }, [rec]); // eslint-disable-line

  const setField = (k, v) => setRec((r) => ({ ...r, [k]: v }));

  const toggleSupportTag = (type) => {
    setRec((r) => {
      const tags = r.supportTags || [];
      return {
        ...r,
        supportTags: tags.includes(type) ? tags.filter((t) => t !== type) : [...tags, type],
      };
    });
  };

  const hasBlock = (blockId) => recordBlocks.has(blockId);
  const customBlocks = recordSchema.filter((block) => !block.system && block.scope === 'student');
  const supportCount = hasBlock('support')
    ? (rec.supportTags?.length || 0) + (rec.supportMemo?.trim() ? 1 : 0)
    : 0;
  const hasEval = hasBlock('student_evaluation')
    && (rec.attitude || rec.focus || rec.understanding || rec.homeworkStatus);
  const hasScore = hasBlock('score') && (rec.score !== '' || rec.scoreTotal !== '' || rec.scoreNote);

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
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {supportCount > 0 && (
            <span className="text-xs bg-orange-50 text-orange-500 font-semibold px-2 py-0.5 rounded-full">
              보완 {supportCount}
            </span>
          )}
          {attendanceHint?.checkInTime && studentCheckMethod !== 'disabled' && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ${
              studentCheckMethod === 'qr'
                ? 'bg-indigo-50 text-indigo-700'
                : 'bg-blue-50 text-blue-700'
            }`}>
              {studentCheckMethod === 'qr' ? <QrCode size={9} /> : <UserCheck size={9} />}
              {attendanceHint.checkInTime}
              {attendanceHint.checkOutTime ? ` ~ ${attendanceHint.checkOutTime}` : ''}
            </span>
          )}
          {sourceBadge && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sourceBadge.tone}`}>
              {sourceBadge.label}
            </span>
          )}
          {studentCheckMethod !== 'disabled' && effectiveStatus && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              attendanceStatusMap[effectiveStatus]?.bg
            } ${attendanceStatusMap[effectiveStatus]?.color}`}>
              {SESSION_STATE_LABELS[effectiveStatus] || attendanceStatusMap[effectiveStatus]?.label}
            </span>
          )}
          {hasEval && <Check size={13} className="text-green-500 flex-shrink-0" />}
          {hasScore && (
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-600">
              {rec.score || '-'}{rec.scoreTotal ? `/${rec.scoreTotal}` : '점'}
            </span>
          )}
          {expanded ? <ChevronUp size={15} className="text-gray-300" /> : <ChevronDown size={15} className="text-gray-300" />}
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
            <div className="px-4 pb-4 border-t border-gray-50 flex flex-col gap-4 pt-3">
              {/* 수업 출석 */}
              {canEditAttendance && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-500">출석 상태</p>
                    {!attendance && (
                      <span className="text-[10px] font-semibold text-blue-600">
                        등하원 기록 자동 반영
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {ATT_OPTIONS.map((status) => {
                      const meta = attendanceStatusMap[status];
                      const isActive = effectiveStatus === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => handleAttendanceClick(status)}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors active:scale-[0.98] ${
                            isActive
                              ? `${meta.activeBg} ${meta.activeText} border-transparent`
                              : 'border-gray-200 bg-white text-gray-500'
                          }`}
                        >
                          {SESSION_STATE_LABELS[status] || meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 평가 항목 */}
              {canEdit && hasBlock('student_evaluation') && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-semibold text-gray-500">평가</p>
                  <EvalRow label="태도" options={ATTITUDE_OPTIONS} value={rec.attitude} onChange={(v) => setField('attitude', v)} />
                  <EvalRow label="집중도" options={FOCUS_OPTIONS} value={rec.focus} onChange={(v) => setField('focus', v)} />
                  <EvalRow label="이해도" options={UNDERSTANDING_OPTIONS} value={rec.understanding} onChange={(v) => setField('understanding', v)} />
                  <EvalRow label="숙제 수행" options={HOMEWORK_OPTIONS} value={rec.homeworkStatus} onChange={(v) => setField('homeworkStatus', v)} />
                </div>
              )}

              {canEdit && hasBlock('score') && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-gray-500">점수</p>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={rec.score}
                      onChange={(event) => setField('score', event.target.value)}
                      placeholder="점수"
                      className="input text-center"
                    />
                    <span className="text-sm font-bold text-gray-300">/</span>
                    <input
                      type="number"
                      min="0"
                      value={rec.scoreTotal}
                      onChange={(event) => setField('scoreTotal', event.target.value)}
                      placeholder="총점"
                      className="input text-center"
                    />
                  </div>
                  <input
                    value={rec.scoreNote}
                    onChange={(event) => setField('scoreNote', event.target.value)}
                    placeholder="점수 메모 (선택)"
                    className="input mt-2"
                  />
                </div>
              )}

              {/* 학생 메모 */}
              {canEdit && hasBlock('student_memo') && (
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
              {canEdit && hasBlock('support') && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">학습 보완 항목</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {SUPPORT_TAG_TYPES.map(({ type, label }) => {
                      const active = (rec.supportTags || []).includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleSupportTag(type)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-colors active:scale-[0.98] ${
                            active
                              ? 'border-orange-400 bg-orange-50 text-orange-600'
                              : 'border-gray-200 bg-white text-gray-500'
                          }`}
                        >
                          {active && '✓ '}{label}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={rec.supportMemo}
                    onChange={(e) => setField('supportMemo', e.target.value)}
                    rows={2}
                    placeholder="보완 항목 관련 추가 메모..."
                    className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 resize-none bg-orange-50/40"
                  />
                </div>
              )}

              {canEdit && customBlocks.map((block) => (
                <DynamicRecordField
                  key={block.id}
                  block={block}
                  value={rec.customValues?.[block.id]}
                  onChange={(value) => setField('customValues', {
                    ...(rec.customValues || {}),
                    [block.id]: value,
                  })}
                />
              ))}

              {/* 읽기 전용 평가 표시 */}
              {!canEdit && hasEval && (
                <div className="flex flex-wrap gap-2">
                  {rec.attitude && <Chip label={`태도: ${rec.attitude}`} />}
                  {rec.focus && <Chip label={`집중도: ${rec.focus}`} />}
                  {rec.understanding && <Chip label={`이해도: ${rec.understanding}`} />}
                  {rec.homeworkStatus && <Chip label={`숙제: ${rec.homeworkStatus}`} />}
                </div>
              )}
              {!canEdit && hasScore && (
                <p className="rounded-xl bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700">
                  점수 {rec.score || '-'}{rec.scoreTotal ? ` / ${rec.scoreTotal}` : ''}
                  {rec.scoreNote ? ` · ${rec.scoreNote}` : ''}
                </p>
              )}
              {!canEdit && hasBlock('student_memo') && rec.memo && (
                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2">{rec.memo}</p>
              )}
            </div>
        </div>
      </div>
    </div>
  );
});

function Chip({ label }) {
  return (
    <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">{label}</span>
  );
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────────────
export default function ClassSessionPage() {
  const role = useAcademyStore((s) => s.role);
  const selectedClassSessionId = useAcademyStore((s) => s.selectedClassSessionId);
  const classSessions = useAcademyStore((s) => s.classSessions);
  const classGroups = useAcademyStore((s) => s.classGroups);
  const academyStudents = useAcademyStore((s) => s.academyStudents);
  const academyTeachers = useAcademyStore((s) => s.academyTeachers);
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const academyManagers = useAcademyStore((s) => s.academyManagers) ?? [];
  const academyProfile = useAcademyStore((s) => s.academyProfile);
  const academyAttendanceRecords = useAcademyStore((s) => s.academyAttendanceRecords);
  const academyLessonRecords = useAcademyStore((s) => s.academyLessonRecords);
  const batchSaveSessionRecords = useAcademyStore((s) => s.batchSaveSessionRecords);
  const updateClassSession = useAcademyStore((s) => s.updateClassSession);
  const goBackFromClassSession = useAcademyStore((s) => s.goBackFromClassSession);
  const showToast = useAcademyStore((s) => s.showToast);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const loadServerLessonRecords = useWorkspaceStore((s) => s.loadServerLessonRecords);
  const loadServerAttendanceRecords = useWorkspaceStore((s) => s.loadServerAttendanceRecords);
  const instructors = useMemo(
    () => [...academyTeachers, ...academyManagers, ...academyAssistants],
    [academyTeachers, academyManagers, academyAssistants],
  );
  // Phase 42 — 학생 체크인 이벤트 + 학원 설정 (출결 방식).
  const studentCheckEvents = useWorkspaceStore((s) => s.studentCheckEvents) ?? [];
  const loadStudentCheckEvents = useWorkspaceStore((s) => s.loadStudentCheckEvents);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademy = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId)?.academy || null,
    [memberships, currentAcademyId],
  );
  const attendanceSettings = useMemo(() => readAttendanceSettings(currentAcademy), [currentAcademy]);
  // session/group 탐색 (null이어도 useMemo가 먼저 실행됨)
  const session = useMemo(
    () => classSessions.find((s) => s.id === selectedClassSessionId) ?? null,
    [classSessions, selectedClassSessionId]
  );
  const group = useMemo(
    () => (session ? classGroups.find((g) => g.id === session.classGroupId) : null) ?? null,
    [classGroups, session]
  );
  const previousSession = useMemo(() => {
    if (!session) return null;
    return classSessions
      .filter((candidate) => (
        candidate.classGroupId === session.classGroupId
        && candidate.id !== session.id
        && `${candidate.date || ''} ${candidate.startTime || ''}`
          < `${session.date || ''} ${session.startTime || ''}`
      ))
      .sort((a, b) => (
        `${b.date || ''} ${b.startTime || ''}`
          .localeCompare(`${a.date || ''} ${a.startTime || ''}`)
      ))[0] || null;
  }, [classSessions, session]);
  const previousCommonRecord = useMemo(
    () => previousSession
      ? academyLessonRecords.find((record) => (
        record.sessionId === previousSession.id && record.studentId === '_common_'
      )) || null
      : null,
    [academyLessonRecords, previousSession],
  );
  const carriedHomework = previousCommonRecord?.commonHomework
    || (!previousSession ? group?.initialHomework : '')
    || '';
  const carriedNextPlan = previousCommonRecord?.nextLessonPlan
    || (!previousSession ? group?.initialNextPlan : '')
    || '';
  const recordSchema = useMemo(
    () => normalizeRecordSchema(
      session?.recordSchema || group?.recordSchema || group?.recordBlocks,
    ),
    [session?.recordSchema, group?.recordSchema, group?.recordBlocks],
  );
  const recordBlocks = useMemo(
    () => new Set(recordSchema.filter((block) => block.system).map((block) => block.id)),
    [recordSchema],
  );
  const activityLabel = getActivityLabel(
    CLASS_ACTIVITY_TYPES,
    session?.activityType || group?.activityType || 'regular_class',
    session?.activityName || group?.activityName,
  );
  const completionLabel = getClassCompletionLabel(
    session?.activityType || group?.activityType || 'regular_class',
  );
  const hasCommonRecordBlocks = recordSchema.some((block) => block.scope === 'common');
  // Phase 44 — session 의 teacherUserId 가 더 신뢰 가능. group 으로 fallback.
  const teacherName = useMemo(() => {
    if (!session && !group) return null;
    const tid = session?.teacherId || group?.teacherId || '';
    const tuid = session?.teacherUserId || group?.teacherUserId || '';
    if (!tid && !tuid) return null;
    return getTeacherDisplayName(tid, instructors, academyProfile, tuid);
  }, [instructors, academyProfile, group, session]);
  const sessionStudentIdSet = useMemo(
    () => new Set(session?.studentIds || []),
    [session?.studentIds],
  );
  const students = useMemo(
    () => session ? academyStudents.filter((s) => sessionStudentIdSet.has(s.id)) : [],
    [academyStudents, session, sessionStudentIdSet]
  );

  const sessionAttendanceRecords = useMemo(
    () => academyAttendanceRecords.filter(
      (record) => record.sessionId === selectedClassSessionId,
    ),
    [academyAttendanceRecords, selectedClassSessionId],
  );

  // 선생님이 수정한 값은 등하원 자동 상태보다 우선한다. 자동 반영 행은 아래
  // attendanceHint의 서버 fallback으로 사용한다.
  const attendanceByStudentId = useMemo(() => {
    const map = new Map();
    for (const record of sessionAttendanceRecords) {
      if (isConfirmedAttendance(record)) map.set(record.studentId, record);
    }
    return map;
  }, [sessionAttendanceRecords]);

  const legacyInferredAttendanceByStudentId = useMemo(() => {
    const map = new Map();
    for (const record of sessionAttendanceRecords) {
      if (isAutoInferredAttendance(record)) map.set(record.studentId, record);
    }
    return map;
  }, [sessionAttendanceRecords]);

  const lessonRecordByStudentId = useMemo(() => {
    const map = new Map();
    for (const record of academyLessonRecords) {
      if (record.sessionId === selectedClassSessionId) {
        map.set(record.studentId, record);
      }
    }
    return map;
  }, [academyLessonRecords, selectedClassSessionId]);

  // 등하원 이벤트 → 학생별 수업 출석 기본값. 등원하면 출석, 없으면 결석이다.
  const attendanceHintByStudentId = useMemo(() => {
    const map = new Map();
    if (!session || attendanceSettings.studentCheckMethod === 'disabled') return map;
    for (const stu of students) {
      const serverStudentId = stu.serverId;
      if (!serverStudentId) continue;
      const hint = getQrAttendanceHint(serverStudentId, session, studentCheckEvents);
      if (hint.checkInTime) {
        map.set(stu.id, hint);
        continue;
      }
      const legacyHint = legacyInferredAttendanceByStudentId.get(stu.id);
      if (legacyHint?.status) {
        map.set(stu.id, {
          statusHint: legacyHint.status === 'absent' ? 'absent' : 'present',
          checkInTime: null,
          checkOutTime: null,
          checkInISO: legacyHint.checkedAt || null,
          checkOutISO: null,
          source: 'legacy_auto_inferred',
        });
        continue;
      }
      map.set(stu.id, hint);
    }
    return map;
  }, [
    session,
    students,
    studentCheckEvents,
    attendanceSettings.studentCheckMethod,
    legacyInferredAttendanceByStudentId,
  ]);

  // 공통 기록: 저장된 값 로드
  const savedCommonLr = useMemo(
    () => lessonRecordByStudentId.get('_common_') || null,
    [lessonRecordByStudentId]
  );

  const [commonRec, setCommonRec] = useState(() => buildCommonRecord(savedCommonLr));
  const [savedCommon, setSavedCommon] = useState(() => buildCommonRecord(savedCommonLr));

  // session이 바뀌면 공통 기록 초기화
  useEffect(() => {
    const init = buildCommonRecord(savedCommonLr);
    setCommonRec(init);
    setSavedCommon(init);
  }, [selectedClassSessionId]); // eslint-disable-line

  // 학생별 기록 dirty state 관리. 입력 중에는 부모 리렌더를 최소화하고,
  // dirty 여부가 바뀔 때만 저장바 상태를 갱신한다.
  const studentDirtyRef = useRef({});
  const studentRecDraftRef = useRef({});
  const [dirtyRevision, setDirtyRevision] = useState(0);
  const [attendanceDirty, setAttendanceDirty] = useState(false);
  const [saveCount, setSaveCount] = useState(0);

  const handleRecordChange = useCallback((studentId, rec, isDirty) => {
    studentRecDraftRef.current[studentId] = rec;
    if (studentDirtyRef.current[studentId] === isDirty) return;
    studentDirtyRef.current = { ...studentDirtyRef.current, [studentId]: isDirty };
    setDirtyRevision((v) => v + 1);
  }, []);

  useEffect(() => {
    studentRecDraftRef.current = {};
    studentDirtyRef.current = {};
    setAttendanceDirty(false);
    setDirtyRevision((v) => v + 1);
  }, [selectedClassSessionId]);

  // Phase 42 — 세션을 열 때 학생 체크인 이벤트를 한 번 불러온다 (over-fetch 방지:
  // 한국 시간 기준 session.date 하루만). loadStudentCheckEvents 는 store 가
  // 데이터를 즉시 반영하므로 의존성에 session.date 만 두면 충분.
  useEffect(() => {
    if (
      !session?.date
      || !currentAcademyId
      || attendanceSettings.studentCheckMethod === 'disabled'
    ) return;
    loadStudentCheckEvents({ sinceDateYMD: session.date });
  }, [
    session?.date,
    currentAcademyId,
    loadStudentCheckEvents,
    attendanceSettings.studentCheckMethod,
  ]);

  const [isSaving, setIsSaving] = useState(false);
  const [substituteModalOpen, setSubstituteModalOpen] = useState(false);
  // Phase 44.7 / Phase C — 회차 변경 sheet.
  const [exceptionSheetOpen, setExceptionSheetOpen] = useState(false);
  const [recordTemplateOpen, setRecordTemplateOpen] = useState(false);
  const [recordTemplateSaving, setRecordTemplateSaving] = useState(false);

  // Phase 34 — 대체 강사 배정 시 근무 cover 여부 확인 + 자동 추가.
  const { check: ensureCoverage, sheetProps: coverageSheetProps } = useEnsureShiftCoverage();

  // Phase 31 — 본인 staffProfile 권한으로 게이팅. owner 는 항상 허용.
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const authUserId = useAuthStore((s) => s.user?.id);
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((sp) => sp.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );

  // Phase 44 — teacher 가 이 세션의 담당인지 (본인 반/세션/대체) 확인.
  // owner 가 PC 에서 만든 반의 teacher_id 가 다른 단말에서 다를 수 있으므로
  // server-stable teacher_user_id (auth.users.id) 매칭 우선.
  const myTeacherLocal = useMemo(
    () => academyTeachers.find((t) => t?.serverUserId && authUserId && t.serverUserId === authUserId) || null,
    [academyTeachers, authUserId],
  );
  const isMyAssignedSession = useMemo(() => {
    if (!session) return false;
    if (session.teacherUserId && authUserId && session.teacherUserId === authUserId) return true;
    if (myTeacherLocal && session.teacherId === myTeacherLocal.id) return true;
    if (session.substituteTeacherUserId && authUserId && session.substituteTeacherUserId === authUserId) return true;
    if (myTeacherLocal && session.substituteTeacherId === myTeacherLocal.id) return true;
    if (group?.teacherUserId && authUserId && group.teacherUserId === authUserId) return true;
    if (myTeacherLocal && group?.teacherId === myTeacherLocal.id) return true;
    return false;
  }, [session, group, authUserId, myTeacherLocal]);

  // 권한 + 본인 담당 세션이어야 teacher 가 편집 가능. owner 는 항상 허용.
  const canEditLessonRecords =
    role === 'owner'
      ? true
      : role === 'manager'
        ? currentUserCan({ role, staffProfile: myStaffProfile }, 'canEditLessonRecords')
      : role === 'teacher'
        && currentUserCan({ role, staffProfile: myStaffProfile }, 'canEditLessonRecords')
        && isMyAssignedSession;
  const canEditAttendance = attendanceSettings.studentCheckMethod !== 'disabled' && (
    role === 'owner'
      ? true
      : role === 'manager'
        ? currentUserCan({ role, staffProfile: myStaffProfile }, 'canEditAttendance')
      : role === 'teacher'
        && currentUserCan({ role, staffProfile: myStaffProfile }, 'canEditAttendance')
        && isMyAssignedSession
  );
  // 기존 canEdit (lesson record 입력/저장) → 권한 기반.
  const canEdit = canEditLessonRecords;
  const isOwnerRole = role === 'owner';
  const canManageSession = role === 'owner' || (
    role === 'manager'
    && currentUserCan({ role, staffProfile: myStaffProfile }, 'canManageClasses')
  );

  const substituteTeacher = useMemo(() => {
    if (!session?.substituteTeacherId) return null;
    return academyTeachers.find((t) => t.id === session.substituteTeacherId) || null;
  }, [session?.substituteTeacherId, academyTeachers]);
  const isCommonDirty = useMemo(() => !recordsEqual(commonRec, savedCommon), [commonRec, savedCommon]);
  const isAnyStudentDirty = useMemo(
    () => Object.values(studentDirtyRef.current).some(Boolean),
    [dirtyRevision],
  );
  const isDirty = isCommonDirty || isAnyStudentDirty || attendanceDirty;

  // 이번 수업의 보완 항목 수
  const supportCount = useMemo(() => {
    let count = 0;
    if (!recordBlocks.has('support')) return 0;
    for (const record of lessonRecordByStudentId.values()) {
      if (
        record.studentId !== '_common_' &&
        ((record.supportTags?.length > 0) || record.supportMemo?.trim())
      ) {
        count += 1;
      }
    }
    return count;
  }, [lessonRecordByStudentId, recordBlocks]);

  const handleSave = useCallback(async () => {
    if (!session || isSaving) return false;
    setIsSaving(true);
    const draftStudentRecords = { ...(studentRecDraftRef.current || {}) };
    const sessionStudentIds = (session.studentIds || []).filter(Boolean);

    try {
      // 로그인된 학원에서는 서버가 source of truth다. 수업 기록과 출석이 모두
      // 성공한 뒤에만 로컬 저장 상태를 갱신한다.
      if (isAuthenticated && currentAcademyId) {
        if (!session.serverId || !group?.serverId) {
          throw new Error('수업 서버 정보를 확인하지 못했어요. 일정을 새로고침해주세요.');
        }
        // local studentId → server studentId 매핑된 student_records jsonb 생성
        const studentByLocalId = new Map(academyStudents.map((s) => [s.id, s]));
        const unresolvedStudentIds = sessionStudentIds.filter(
          (studentId) => !studentByLocalId.has(studentId),
        );
        if (unresolvedStudentIds.length > 0) {
          throw new Error('일부 수강생 정보를 찾지 못했어요. 학생 목록을 새로고침해주세요.');
        }
        const sessionStudents = sessionStudentIds
          .map((studentId) => studentByLocalId.get(studentId))
          .filter(Boolean);
        const missingServerStudents = sessionStudents.filter((student) => !student.serverId);
        if (missingServerStudents.length > 0) {
          throw new Error(
            `${missingServerStudents.map((student) => student.name).join(', ')} 학생의 서버 정보를 확인하지 못했어요.`,
          );
        }

        if (canEdit) {
          const serverStudentRecords = {};
          for (const [localStudentId, rec] of Object.entries(draftStudentRecords)) {
            const student = studentByLocalId.get(localStudentId);
            if (student?.serverId) {
              serverStudentRecords[student.serverId] = rec;
            }
          }
          await upsertAcademyLessonRecord({
            academyId: currentAcademyId,
            class_group_id: group.serverId,
            class_session_id: session.serverId,
            date: session.date,
            teacher_id: session.teacherId || group.teacherId || null,
            common_progress: commonRec.commonProgress || null,
            common_lesson_content: commonRec.commonContent || null,
            common_homework: commonRec.commonHomework || null,
            next_lesson_plan: commonRec.nextLessonPlan || null,
            teacher_memo: commonRec.teacherMemo || null,
            common_custom_values: commonRec.customValues || {},
            student_records: serverStudentRecords,
          });
        }

        if (canEditAttendance && attendanceSettings.studentCheckMethod !== 'disabled') {
          const records = sessionStudents.map((student) => {
            const override = attendanceByStudentId.get(student.id);
            const automatic = attendanceHintByStudentId.get(student.id);
            const isTeacherOverride = Boolean(override);
            const automaticSource = automatic?.checkInISO
              ? (automatic.source === 'qr' ? 'qr' : 'teacher_manual')
              : null;
            const status = override?.status || automatic?.statusHint || 'absent';
            const source = isTeacherOverride
              ? (override.source === 'manual' ? 'teacher_manual' : (override.source || 'teacher_manual'))
              : automaticSource;

            return {
              class_group_id: group.serverId,
              class_session_id: session.serverId,
              student_id: student.serverId,
              date: session.date,
              status,
              memo: override?.memo || null,
              source,
              checked_at: override?.checkedAt || automatic?.checkInISO || null,
              confirmation_state: isTeacherOverride
                ? (override.confirmationState || ATTENDANCE_CONFIRMATION.TEACHER_CONFIRMED)
                : ATTENDANCE_CONFIRMATION.AUTO_INFERRED,
              confirmed_at: isTeacherOverride
                ? (override.confirmedAt || new Date().toISOString())
                : null,
              confirmed_by: isTeacherOverride
                ? (override.confirmedBy || authUserId || null)
                : null,
            };
          });

          if (records.length > 0) {
            await upsertAcademyAttendanceRecordsBulk({
              academyId: currentAcademyId,
              records,
            });
          }
        }

        await Promise.all([
          canEdit ? loadServerLessonRecords() : Promise.resolve(),
          canEditAttendance && attendanceSettings.studentCheckMethod !== 'disabled'
            ? loadServerAttendanceRecords()
            : Promise.resolve(),
        ]);
      }

      // 서버가 없는 로컬 개발 모드이거나 서버 저장이 성공한 뒤에만 로컬 상태를
      // 저장 완료로 바꾼다.
      if (canEdit) {
        batchSaveSessionRecords({
          sessionId: session.id,
          date: session.date,
          commonRecord: commonRec,
          studentRecords: draftStudentRecords,
        });
        setSavedCommon({ ...commonRec });
        studentDirtyRef.current = {};
        setDirtyRevision((value) => value + 1);
        setSaveCount((count) => count + 1);
      }
      setAttendanceDirty(false);
      return true;
    } catch (error) {
      console.error('[class-session] save failed', error);
      showToast(
        error?.message
          ? `저장하지 못했어요: ${error.message}`
          : '수업 기록을 저장하지 못했어요. 다시 시도해주세요.',
        'error',
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    session, group, isSaving, commonRec, academyStudents, attendanceByStudentId,
    attendanceHintByStudentId, attendanceSettings.studentCheckMethod,
    batchSaveSessionRecords, canEdit, canEditAttendance,
    isAuthenticated, currentAcademyId,
    loadServerLessonRecords, loadServerAttendanceRecords, showToast, authUserId,
  ]);

  const setCommonField = (k, v) => setCommonRec((r) => ({ ...r, [k]: v }));

  const checkedInCount = useMemo(() => {
    let count = 0;
    for (const student of students) {
      const status = attendanceByStudentId.get(student.id)?.status
        || attendanceHintByStudentId.get(student.id)?.statusHint
        || 'absent';
      if (status === 'present' || status === 'late') count += 1;
    }
    return count;
  }, [students, attendanceByStudentId, attendanceHintByStudentId]);

  if (!session || !group) {
    return (
      <div className="min-h-[60vh] flex items-center">
        <EmptyState
          title="수업 정보를 찾을 수 없어요"
          description="삭제되었거나 더 이상 사용할 수 없는 수업입니다."
          action={(
            <button
              type="button"
              onClick={goBackFromClassSession}
              className="px-5 py-3 bg-blue-600 text-white text-sm font-bold rounded-2xl"
            >
              이전 화면으로 돌아가기
            </button>
          )}
        />
      </div>
    );
  }

  return (
    <div>
      <Header
        title={group.name}
        onBack={goBackFromClassSession}
        right={isDirty ? (
          <span className="whitespace-nowrap text-xs text-orange-500 font-semibold bg-orange-50 px-2.5 py-1 rounded-full">
            미저장
          </span>
        ) : null}
      />

      <div className="pt-14 md:pt-0 pb-28">
        {/* 수업 정보 카드 */}
        <div className="px-4 pt-4 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <SummaryCell label="수강생" value={students.length} />
              <SummaryCell label="출석" value={checkedInCount} color="text-green-600" />
              <SummaryCell label="보완 항목" value={supportCount} color="text-orange-500" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 pt-3 border-t border-gray-50">
              <InfoChip label="유형" value={activityLabel} />
              {session.room && <InfoChip label="강의실" value={session.room} tag />}
              {teacherName && <InfoChip label="담당 선생님" value={teacherName} />}
              <InfoChip label="시간" value={`${session.startTime}–${session.endTime}`} />
              <InfoChip label="상태" value={session.status === 'completed' ? '완료' : session.status === 'canceled' ? '취소' : '예정'} />
            </div>

            {/* Phase 30 — 대체 강사 */}
            {(substituteTeacher || canManageSession) && (
              <div className="mt-3 pt-3 border-t border-gray-50">
                {substituteTeacher ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <UserCheck size={13} className="text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-amber-700">
                        대체 강사: {substituteTeacher.name}
                      </p>
                      {session.substituteReason && (
                        <p className="text-[11px] text-gray-500 truncate">{session.substituteReason}</p>
                      )}
                    </div>
                    {canManageSession && (
                      <button
                        type="button"
                        onClick={() => setSubstituteModalOpen(true)}
                        className="text-[11px] font-semibold text-blue-600 px-2 py-1 rounded-lg active:bg-blue-50"
                      >
                        변경
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSubstituteModalOpen(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold active:bg-amber-100"
                  >
                    <UserCheck size={12} />
                    대체 강사 지정
                  </button>
                )}
              </div>
            )}

            {/* Phase 44.7 / Phase C — 회차 변경 (휴강/시간변경/보강) */}
            {canManageSession && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExceptionSheetOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-50 text-gray-700 text-xs font-bold active:bg-gray-100"
                >
                  회차 변경
                </button>
                <button
                  type="button"
                  onClick={() => setRecordTemplateOpen(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-50 py-2 text-xs font-bold text-blue-700 active:bg-blue-100"
                >
                  <SlidersHorizontal size={12} />
                  기록 구성
                </button>
              </div>
            )}
          </div>
        </div>

        {(carriedHomework || carriedNextPlan) && (
          <div className="px-4 mb-4">
            <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3.5 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-gray-900">이번 수업 준비</p>
                <span className="text-[11px] font-semibold text-blue-500">
                  {previousSession ? '이전 수업에서 이어짐' : '반 생성 시 입력'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {carriedHomework && (
                  <div className="rounded-xl bg-blue-50 px-3 py-2.5">
                    <p className="text-[11px] font-bold text-blue-500">숙제</p>
                    <p className="mt-1 text-sm font-semibold text-gray-800">{carriedHomework}</p>
                  </div>
                )}
                {carriedNextPlan && (
                  <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="text-[11px] font-bold text-gray-500">수업 계획</p>
                    <p className="mt-1 text-sm font-semibold text-gray-800">{carriedNextPlan}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 공통 수업 기록 ─────────────────────────────── */}
        {canEdit && hasCommonRecordBlocks && (
          <div className="px-4 mb-4">
            <div className="bg-blue-50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm font-bold text-blue-900">{activityLabel} 기록</p>
                <p className="min-w-0 flex-1 text-xs text-blue-500">참여 학생에게 공통으로 적용돼요</p>
              </div>
              <div className="flex flex-col gap-3">
                {recordBlocks.has('progress') && (
                  <CommonField label="오늘 진도" placeholder="예: Lesson 3 본문 대화문"
                    value={commonRec.commonProgress} onChange={(v) => setCommonField('commonProgress', v)} single />
                )}
                {recordBlocks.has('content') && (
                  <CommonField label="활동 내용" placeholder="오늘 진행한 내용을 기록해요"
                    value={commonRec.commonContent} onChange={(v) => setCommonField('commonContent', v)} />
                )}
                {recordBlocks.has('homework') && (
                  <CommonField label="공통 숙제" placeholder="예: 본문 2회 읽기, 단어 20개 암기"
                    value={commonRec.commonHomework} onChange={(v) => setCommonField('commonHomework', v)} single />
                )}
                {recordBlocks.has('next_plan') && (
                  <CommonField label="다음 계획" placeholder="다음 회차에 진행할 내용"
                    value={commonRec.nextLessonPlan} onChange={(v) => setCommonField('nextLessonPlan', v)} single />
                )}
                {recordBlocks.has('teacher_memo') && (
                  <CommonField label="강사 메모" placeholder="내부 메모 (학부모에게 공개 안 됨)"
                    value={commonRec.teacherMemo} onChange={(v) => setCommonField('teacherMemo', v)} />
                )}
                {recordSchema
                  .filter((block) => !block.system && block.scope === 'common')
                  .map((block) => (
                    <DynamicRecordField
                      key={block.id}
                      block={block}
                      value={commonRec.customValues?.[block.id]}
                      onChange={(value) => setCommonField('customValues', {
                        ...(commonRec.customValues || {}),
                        [block.id]: value,
                      })}
                    />
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 학생별 출석·수업 기록 ───────────────────────── */}
        <div className="px-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-700">학생별 기록</p>
            {attendanceSettings.studentCheckMethod !== 'disabled' && attendanceHintByStudentId.size > 0 && (
              <span className="text-[11px] font-semibold text-indigo-700 flex items-center gap-1">
                <UserCheck size={11} /> 등원 {Array.from(attendanceHintByStudentId.values()).filter((hint) => hint.checkInTime).length}명
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {students.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
                <p className="text-sm text-gray-400">배정된 학생이 없어요</p>
              </div>
            ) : (
              students.map((student) => {
                const att = attendanceByStudentId.get(student.id);
                const existingLr = lessonRecordByStudentId.get(student.id);
                const attendanceHint = attendanceHintByStudentId.get(student.id) || null;
                return (
                  <StudentCard
                    key={student.id}
                    student={student}
                    sessionId={selectedClassSessionId}
                    canEdit={canEdit}
                    canEditAttendance={canEditAttendance}
                    attendance={att}
                    initialRecord={existingLr}
                    onRecordChange={handleRecordChange}
                    saveCount={saveCount}
                    recordBlocks={recordBlocks}
                    recordSchema={recordSchema}
                    attendanceHint={attendanceHint}
                    studentCheckMethod={attendanceSettings.studentCheckMethod}
                    onAttendanceChange={() => setAttendanceDirty(true)}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Phase 44.7 / Phase C — 회차 변경 (휴강/시간변경/보강) */}
      {exceptionSheetOpen && (
        <SessionExceptionSheet
          session={session}
          group={group}
          onClose={() => setExceptionSheetOpen(false)}
        />
      )}

      {/* Phase 30 — 대체 강사 지정 모달 */}
      {substituteModalOpen && (
        <SubstituteTeacherModal
          session={session}
          mainTeacherId={session.teacherId || group.teacherId}
          academyTeachers={instructors}
          onClose={() => setSubstituteModalOpen(false)}
          onSave={async ({ substituteTeacherId, substituteReason }) => {
            // Phase 34 — 대체 강사로 배정될 때 근무 cover 확인 (취소는 substituteTeacherId=null 이므로 스킵).
            if (substituteTeacherId) {
              const subStaff = instructors.find((t) => t.id === substituteTeacherId);
              if (subStaff && session.date && session.startTime && session.endTime) {
                const ok = await ensureCoverage({
                  staff: subStaff,
                  staffRole: 'teacher',
                  date: session.date,
                  startTime: session.startTime,
                  endTime: session.endTime,
                });
                if (!ok) {
                  // 사용자가 취소했다 — 배정 흐름 중단.
                  return;
                }
              }
            }
            updateClassSession(session.id, {
              substituteTeacherId: substituteTeacherId || null,
              substituteReason: substituteReason || null,
            });
            // Supabase write-through — 안전을 위해 best-effort.
            if (session.serverId && isAuthenticated && currentAcademyId) {
              try {
                const subStaff = substituteTeacherId
                  ? instructors.find((t) => t.id === substituteTeacherId)
                  : null;
                await updateServerClassSession(session.serverId, {
                  substitute_teacher_user_id: subStaff?.serverUserId || null,
                  substitute_reason: substituteReason || null,
                });
              } catch (err) {
                console.warn('[supabase] substitute teacher write failed', err);
              }
            }
            setSubstituteModalOpen(false);
            showToast(substituteTeacherId ? '대체 강사를 지정했어요.' : '대체 강사 지정을 해제했어요.');
          }}
        />
      )}

      {recordTemplateOpen && (
        <RecordTemplateModal
          title="이번 회차 기록 구성"
          description="이 수업에만 적용돼요. 반의 기본 구성과 다른 항목을 자유롭게 추가하거나 순서를 바꿀 수 있어요."
          initialSchema={recordSchema}
          saving={recordTemplateSaving}
          onClose={() => setRecordTemplateOpen(false)}
          onSave={async (nextSchema) => {
            setRecordTemplateSaving(true);
            try {
              updateClassSession(session.id, { recordSchema: nextSchema });
              if (session.serverId && isAuthenticated && currentAcademyId) {
                await updateServerClassSession(session.serverId, { record_schema: nextSchema });
                await loadServerClassSessions();
              }
              setRecordTemplateOpen(false);
            } catch (error) {
              showToast(error?.message || '기록 구성을 저장하지 못했어요.', 'error');
            } finally {
              setRecordTemplateSaving(false);
            }
          }}
        />
      )}

      {/* ── 저장 / 완료 버튼 (fixed) ──────────────────── */}
      {(canEdit || canEditAttendance) && (
        <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-md border-t border-gray-100 bg-white/95 px-4 py-3 pb-safe backdrop-blur-xl md:bottom-6 md:min-h-0 md:max-w-[560px] md:rounded-[24px] md:border md:border-[#E5E8EB] md:p-3 md:shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`flex-1 py-3.5 rounded-2xl font-bold text-sm transition-colors active:scale-[0.98] ${
                isDirty
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isSaving ? '저장 중...' : isDirty ? '기록 저장' : '✓ 저장됨'}
            </button>
            {canEdit && session.status !== 'completed' ? (
              <button
                type="button"
                onClick={async () => {
                  const saved = await handleSave();
                  if (!saved) return;

                  // 서버 완료가 성공한 뒤에만 로컬 상태를 바꾼다.
                  if (session.serverId && isAuthenticated && currentAcademyId) {
                    try {
                      await completeAcademyClassSession(session.serverId);
                      updateClassSession(session.id, { status: 'completed' });
                      await loadServerClassSessions();
                    } catch (err) {
                      console.error('[supabase] updateClassSession failed', err);
                      showToast(
                        err?.message
                          ? `수업을 완료하지 못했어요: ${err.message}`
                          : '수업을 완료하지 못했어요. 다시 시도해주세요.',
                        'error',
                      );
                    }
                  } else {
                    updateClassSession(session.id, { status: 'completed' });
                  }
                }}
                disabled={isSaving}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-green-600 text-white shadow-lg shadow-green-200 active:scale-[0.98] transition-transform"
              >
                {completionLabel}
              </button>
            ) : canEdit ? (
              <div className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-green-50 text-green-600 flex items-center justify-center">
                ✓ {completionLabel}됨
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Phase 34 — 근무 cover sheet */}
      <ShiftCoverageSheet {...coverageSheetProps} />
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

function DynamicRecordField({ block, value, onChange }) {
  const label = block.required ? `${block.label} *` : block.label;
  if (block.type === 'checkbox') {
    return (
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="flex w-full items-center justify-between rounded-xl border border-blue-200 bg-white px-3 py-3 text-left"
      >
        <span className="text-sm font-bold text-[#191F28]">{label}</span>
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${
          value ? 'bg-[#3182F6] text-white' : 'bg-[#F2F4F6] text-transparent'
        }`}>
          <Check size={14} />
        </span>
      </button>
    );
  }
  if (block.type === 'select') {
    return (
      <div>
        <p className="mb-1 text-[11px] font-semibold text-blue-700">{label}</p>
        <select
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          className="input border-blue-200 bg-white"
        >
          <option value="">선택</option>
          {(block.options || []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
    );
  }
  const isLong = block.type === 'long_text';
  const inputType = block.type === 'number' ? 'number' : 'text';
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-blue-700">{label}</p>
      {isLong ? (
        <textarea
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          placeholder={`${block.label} 입력`}
          className="w-full resize-none rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
        />
      ) : (
        <input
          type={inputType}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`${block.label} 입력`}
          className="input border-blue-200 bg-white"
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

// ─── Phase 30 대체 강사 모달 ─────────────────────────────────────────────
function SubstituteTeacherModal({ session, mainTeacherId, academyTeachers, onClose, onSave }) {
  const [selectedId, setSelectedId] = useState(session.substituteTeacherId || '');
  const [reason, setReason] = useState(session.substituteReason || '');
  const candidates = useMemo(
    () => academyTeachers.filter((t) => t.id !== mainTeacherId && t.status !== 'inactive'),
    [academyTeachers, mainTeacherId],
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="대체 강사 지정"
      footer={
        <div className="flex gap-2">
          {session.substituteTeacherId && (
            <button
              type="button"
              onClick={() => onSave({ substituteTeacherId: null, substituteReason: null })}
              className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold flex items-center justify-center gap-1.5"
            >
              <XIcon size={14} />
              해제
            </button>
          )}
          <button
            type="button"
            onClick={() => onSave({ substituteTeacherId: selectedId, substituteReason: reason })}
            disabled={!selectedId}
            className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60"
          >
            저장
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">대체 강사 선택</label>
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-400 py-3 text-center bg-gray-50 rounded-xl">
              지정 가능한 다른 강사가 없어요. 먼저 강사를 등록해주세요.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {candidates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border-2 text-left ${
                    selectedId === t.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 flex-shrink-0">
                    {(t.name || '?').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{t.name || '(이름 없음)'}</p>
                    {t.email && <p className="text-[11px] text-gray-400 truncate">{t.email}</p>}
                  </div>
                  {selectedId === t.id && <Check size={14} className="text-blue-600 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">사유 (선택)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 원 강사 휴가"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
    </Modal>
  );
}

function InfoChip({ label, value, tag = false }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-400">{label}:</span>
      <span className={tag
        ? `inline-flex max-w-full rounded-lg border px-1.5 py-0.5 text-[10px] font-bold ${getRoomTagClassName(value)}`
        : 'font-medium text-gray-700'
      }>
        {value}
      </span>
    </div>
  );
}
