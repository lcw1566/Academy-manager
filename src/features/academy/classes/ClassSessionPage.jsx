import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronDown, ChevronUp, Check, UserCheck, X as XIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  updateClassSession as updateServerClassSession,
  upsertAcademyLessonRecord,
  upsertAcademyAttendanceRecordsBulk,
} from '../../../services/supabase/domainApi';
import EmptyState from '../../../components/EmptyState';
import Modal from '../../../components/Modal';
import { formatDateShort } from '../../../utils/date';
import { attendanceStatusMap, getTeacherDisplayName } from '../../../utils/format';
import { currentUserCan } from '../../../utils/staffPermissions';

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
    supportTags:    Array.isArray(lr?.supportTags) ? lr.supportTags : [],
    supportMemo:    lr?.supportMemo     ?? '',
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
function StudentCard({ student, sessionId, canEdit, canEditAttendance = canEdit, attendance, initialRecord, onRecordChange, saveCount }) {
  const { updateAcademyAttendance } = useAcademyStore();
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

  const supportCount = (rec.supportTags?.length || 0) + (rec.supportMemo?.trim() ? 1 : 0);
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
          {supportCount > 0 && (
            <span className="text-xs bg-orange-50 text-orange-500 font-semibold px-2 py-0.5 rounded-full">
              보완 {supportCount}
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

      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div style={{ overflow: 'hidden', opacity: expanded ? 1 : 0, transition: 'opacity 0.18s ease' }}>
            <div className="px-4 pb-4 border-t border-gray-50 flex flex-col gap-4 pt-3">
              {/* 출결 */}
              {canEditAttendance && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">출결</p>
                  <div className="flex gap-2">
                    {ATT_OPTIONS.map((status) => {
                      const meta = attendanceStatusMap[status];
                      const isActive = attendance?.status === status;
                      return (
                        <motion.button
                          key={status}
                          type="button"
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

              {/* 학생 메모 */}
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
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {SUPPORT_TAG_TYPES.map(({ type, label }) => {
                      const active = (rec.supportTags || []).includes(type);
                      return (
                        <motion.button
                          key={type}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggleSupportTag(type)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-colors ${
                            active
                              ? 'border-orange-400 bg-orange-50 text-orange-600'
                              : 'border-gray-200 bg-white text-gray-500'
                          }`}
                        >
                          {active && '✓ '}{label}
                        </motion.button>
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
        </div>
      </div>
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
    classSessions, classGroups, academyStudents, academyTeachers, academyProfile,
    academyAttendanceRecords, academyLessonRecords,
    updateAcademyAttendance, batchSaveSessionRecords, updateClassSession,
    ensureAttendanceRecordsForSession,
    goBackFromClassSession, showToast,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const loadServerLessonRecords = useWorkspaceStore((s) => s.loadServerLessonRecords);
  const loadServerAttendanceRecords = useWorkspaceStore((s) => s.loadServerAttendanceRecords);

  // session/group 탐색 (null이어도 useMemo가 먼저 실행됨)
  const session = useMemo(
    () => classSessions.find((s) => s.id === selectedClassSessionId) ?? null,
    [classSessions, selectedClassSessionId]
  );
  const group = useMemo(
    () => (session ? classGroups.find((g) => g.id === session.classGroupId) : null) ?? null,
    [classGroups, session]
  );
  const teacherName = useMemo(
    () => (group && group.teacherId)
      ? getTeacherDisplayName(group.teacherId, academyTeachers, academyProfile)
      : null,
    [academyTeachers, academyProfile, group]
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
  const [saveCount, setSaveCount] = useState(0);

  const handleRecordChange = useCallback((studentId, rec, isDirty) => {
    studentRecDraftRef.current[studentId] = rec;
    setStudentDirtyMap((m) => ({ ...m, [studentId]: isDirty }));
  }, []);

  const [isSaving, setIsSaving] = useState(false);
  const [substituteModalOpen, setSubstituteModalOpen] = useState(false);

  // Phase 31 — 본인 staffProfile 권한으로 게이팅. owner 는 항상 허용.
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((sp) => sp.user_id === useAuthStore.getState().user?.id) || null,
    [academyStaffProfiles],
  );
  const canEditLessonRecords =
    role === 'owner'
      ? true
      : role === 'teacher' && currentUserCan({ role, staffProfile: myStaffProfile }, 'canEditLessonRecords');
  const canEditAttendance =
    role === 'owner'
      ? true
      : role === 'teacher' && currentUserCan({ role, staffProfile: myStaffProfile }, 'canEditAttendance');
  // 기존 canEdit (lesson record 입력/저장) → 권한 기반.
  const canEdit = canEditLessonRecords;
  const isOwnerRole = role === 'owner';

  const substituteTeacher = useMemo(() => {
    if (!session?.substituteTeacherId) return null;
    return academyTeachers.find((t) => t.id === session.substituteTeacherId) || null;
  }, [session?.substituteTeacherId, academyTeachers]);
  const isCommonDirty = useMemo(() => !recordsEqual(commonRec, savedCommon), [commonRec, savedCommon]);
  const isAnyStudentDirty = Object.values(studentDirtyMap).some(Boolean);
  const isDirty = isCommonDirty || isAnyStudentDirty;

  // 이번 수업의 보완 항목 수
  const supportCount = useMemo(
    () => academyLessonRecords.filter(
      (lr) => lr.sessionId === selectedClassSessionId &&
        lr.studentId !== '_common_' &&
        ((lr.supportTags?.length > 0) || lr.supportMemo?.trim())
    ).length,
    [academyLessonRecords, selectedClassSessionId]
  );

  const handleSave = useCallback(async () => {
    if (!session || isSaving) return;
    setIsSaving(true);
    // 1) localStorage 저장 (source of truth, 항상 성공)
    batchSaveSessionRecords({
      sessionId: session.id,
      date: session.date,
      commonRecord: commonRec,
      studentRecords: studentRecDraftRef.current,
    });
    // 출결 buttons 를 누르지 않은 학생도 기본 present record 보장
    const sessionStudentIds = (session.studentIds || []).filter(Boolean);
    ensureAttendanceRecordsForSession({
      sessionId: session.id,
      studentIds: sessionStudentIds,
      date: session.date,
    });
    setSavedCommon({ ...commonRec });
    setStudentDirtyMap({});
    setSaveCount((c) => c + 1);

    // 2) Supabase write-through — session.serverId / group.serverId 모두 있고 로그인 + 학원 선택 시
    if (
      session.serverId &&
      group?.serverId &&
      isAuthenticated &&
      currentAcademyId
    ) {
      // 2-a) lesson_records upsert (unique class_session_id)
      try {
        // local studentId → server studentId 매핑된 student_records jsonb 생성
        const studentByLocalId = new Map(academyStudents.map((s) => [s.id, s]));
        const draftStudentRecs = studentRecDraftRef.current || {};
        const serverStudentRecords = {};
        for (const [localStudentId, rec] of Object.entries(draftStudentRecs)) {
          const stu = studentByLocalId.get(localStudentId);
          if (stu?.serverId) {
            serverStudentRecords[stu.serverId] = rec;
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
          student_records: serverStudentRecords,
        });
        await loadServerLessonRecords();
      } catch (err) {
        console.error('[supabase] upsertAcademyLessonRecord failed', err);
        showToast(
          err?.message
            ? `수업 기록 서버 저장 실패: ${err.message}`
            : '수업 기록은 저장됐지만 서버 동기화는 실패했어요.',
          'error',
        );
      }

      // 2-b) attendance_records bulk upsert (unique class_session_id + student_id)
      //   - sessionStudents 전체 기준으로 payload 생성
      //   - local record 있으면 그 값 사용, 없으면 default present
      //   - student.serverId 있는 학생만 서버 전송 대상
      try {
        const studentByLocalId = new Map(academyStudents.map((s) => [s.id, s]));
        const existingForSession = new Map(
          academyAttendanceRecords
            .filter((a) => a.sessionId === session.id)
            .map((a) => [a.studentId, a]),
        );
        const sessionStudents = sessionStudentIds
          .map((sid) => studentByLocalId.get(sid))
          .filter(Boolean);
        const studentsWithServerId = sessionStudents.filter((s) => s.serverId);
        const skippedStudents = sessionStudents.filter((s) => !s.serverId);

        const records = studentsWithServerId.map((stu) => {
          const local = existingForSession.get(stu.id);
          return {
            class_group_id: group.serverId,
            class_session_id: session.serverId,
            student_id: stu.serverId,
            date: local?.date || session.date,
            status: local?.status || 'present',
            memo: local?.memo || null,
          };
        });

        if (import.meta.env?.DEV) {
          console.debug('[attendance sync]', {
            sessionId: session.id,
            sessionServerId: session.serverId,
            sessionStudentsCount: sessionStudents.length,
            studentsWithServerIdCount: studentsWithServerId.length,
            existingLocalRecordsCount: existingForSession.size,
            payloadCount: records.length,
            skippedNoServerId: skippedStudents.map((s) => ({ id: s.id, name: s.name })),
          });
        }

        if (records.length > 0) {
          await upsertAcademyAttendanceRecordsBulk({
            academyId: currentAcademyId,
            records,
          });
          await loadServerAttendanceRecords();
        }
      } catch (err) {
        console.error('[supabase] upsertAcademyAttendanceRecordsBulk failed', err);
        showToast(
          err?.message
            ? `출결 서버 저장 실패: ${err.message}`
            : '출결은 저장됐지만 서버 동기화는 실패했어요.',
          'error',
        );
      }
    }

    setIsSaving(false);
  }, [
    session, group, isSaving, commonRec, academyStudents, academyAttendanceRecords,
    batchSaveSessionRecords, ensureAttendanceRecordsForSession,
    isAuthenticated, currentAcademyId,
    loadServerLessonRecords, loadServerAttendanceRecords, showToast,
  ]);

  const setCommonField = (k, v) => setCommonRec((r) => ({ ...r, [k]: v }));

  const presentCount = academyAttendanceRecords.filter(
    (a) => a.sessionId === selectedClassSessionId && a.status === 'present'
  ).length;

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
              <SummaryCell label="보완 항목" value={supportCount} color="text-orange-500" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 pt-3 border-t border-gray-50">
              {session.room && <InfoChip label="강의실" value={session.room} />}
              {teacherName && <InfoChip label="강사" value={teacherName} />}
              <InfoChip label="시간" value={`${session.startTime}–${session.endTime}`} />
              <InfoChip label="상태" value={session.status === 'completed' ? '완료' : session.status === 'canceled' ? '취소' : '예정'} />
            </div>

            {/* Phase 30 — 대체 강사 */}
            {(substituteTeacher || isOwnerRole) && (
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
                    {isOwnerRole && (
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
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Phase 30 — 대체 강사 지정 모달 */}
      {substituteModalOpen && (
        <SubstituteTeacherModal
          session={session}
          mainTeacherId={session.teacherId || group.teacherId}
          academyTeachers={academyTeachers}
          onClose={() => setSubstituteModalOpen(false)}
          onSave={async ({ substituteTeacherId, substituteReason }) => {
            updateClassSession(session.id, {
              substituteTeacherId: substituteTeacherId || null,
              substituteReason: substituteReason || null,
            });
            // Supabase write-through — 안전을 위해 best-effort.
            if (session.serverId && isAuthenticated && currentAcademyId) {
              try {
                const subStaff = substituteTeacherId
                  ? academyTeachers.find((t) => t.id === substituteTeacherId)
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

      {/* ── 저장 / 완료 버튼 (fixed) ──────────────────── */}
      {canEdit && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/95 border-t border-gray-100 px-4 py-3 pb-safe max-w-md mx-auto">
          <div className="flex gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              disabled={isSaving}
              className={`flex-1 py-3.5 rounded-2xl font-bold text-sm transition-colors ${
                isDirty
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isSaving ? '저장 중...' : isDirty ? '기록 저장' : '✓ 저장됨'}
            </motion.button>
            {session.status !== 'completed' ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={async () => {
                  if (isDirty) await handleSave();
                  updateClassSession(session.id, { status: 'completed' });
                  // Supabase write-through — serverId 가 있고 로그인 + 학원 선택 시
                  if (session.serverId && isAuthenticated && currentAcademyId) {
                    try {
                      await updateServerClassSession(session.serverId, { status: 'completed' });
                      await loadServerClassSessions();
                    } catch (err) {
                      console.error('[supabase] updateClassSession failed', err);
                      showToast(
                        err?.message
                          ? `서버 동기화 실패: ${err.message}`
                          : '수업 완료는 저장됐지만 서버 동기화는 실패했어요.',
                        'error',
                      );
                    }
                  }
                }}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-green-600 text-white shadow-lg shadow-green-200"
              >
                수업 완료
              </motion.button>
            ) : (
              <div className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-green-50 text-green-600 flex items-center justify-center">
                ✓ 수업 완료됨
              </div>
            )}
          </div>
        </div>
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

function InfoChip({ label, value }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-400">{label}:</span>
      <span className="font-medium text-gray-700">{value}</span>
    </div>
  );
}
