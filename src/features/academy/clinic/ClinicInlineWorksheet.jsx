import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, PencilLine, Search, X } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyClinicRecord,
  updateClinicRecord as updateServerClinicRecord,
} from '../../../services/supabase/domainApi';
import { DEFAULT_ACADEMY_SETTINGS } from '../../../constants/academySettings';
import { getClinicOptions, subjectToKey } from '../../../constants/clinicOptions';
import { ACADEMY_SUBJECT_OPTIONS } from '../../../constants/academySettings';
import { normalizeClinicDefaultItems } from './ClinicDefaultItemsEditor';
import { createClientUuid } from '../../../utils/uuid';

function splitMaterials(value) {
  return Array.from(new Set(
    String(value || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  ));
}

function findPreviousRecord(records, studentId, subject, date) {
  return records
    .filter((record) => (
      record.studentId === studentId
      && record.subject === subject
      && record.date < date
    ))
    .slice()
    .sort((a, b) => (
      (b.date || '').localeCompare(a.date || '')
      || (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
    ))[0] || null;
}

function findMatchingItem(record, item) {
  return (record?.items || []).find((candidate) => (
    (item.categoryKey && candidate.categoryKey === item.categoryKey)
    || candidate.title === item.title
  )) || null;
}

function getConfiguredItems(student, academyProfile, subject) {
  const defaults = normalizeClinicDefaultItems(
    student.clinicDefaultItems
    || academyProfile?.clinicDefaultItems
    || DEFAULT_ACADEMY_SETTINGS.clinicDefaultItems,
  );
  const configured = defaults[subjectToKey(subject)] || [];
  const source = configured.length > 0 ? configured : getClinicOptions(subject);
  return source
    .filter((item) => item.key !== 'other' && item.categoryKey !== 'other')
    .map((item, index) => ({
      id: `inline_${student.id}_${item.categoryKey || item.key || index}`,
      categoryKey: item.categoryKey || item.key || `custom_${index}`,
      activityType: item.title,
      title: item.title,
      materialTags: [],
      description: '',
      result: '',
      memo: '',
    }));
}

function buildStudentDraft({
  student,
  currentRecord,
  previousRecord,
  academyProfile,
  subject,
}) {
  const sourceItems = currentRecord?.items?.length > 0
    ? currentRecord.items
    : getConfiguredItems(student, academyProfile, subject);
  const items = sourceItems.map((source, index) => {
    const previousItem = findMatchingItem(previousRecord, source);
    const currentMaterials = Array.isArray(source.materialTags)
      ? source.materialTags
      : Array.isArray(source.materials)
        ? source.materials
        : [];
    const carriedMaterials = currentMaterials.length > 0
      ? currentMaterials
      : (previousItem?.materialTags || previousItem?.materials || []);
    return {
      id: source.id || `inline_${student.id}_${source.categoryKey || index}`,
      categoryKey: source.categoryKey || source.key || `custom_${index}`,
      activityType: source.activityType || source.title,
      title: source.title || source.activityType || '활동',
      materialsText: carriedMaterials.join(', '),
      description: source.description || '',
      result: source.result || '',
      memo: source.memo || '',
      previousDescription: previousItem?.description || '',
      previousResult: previousItem?.result || '',
    };
  });
  return {
    recordId: currentRecord?.id || null,
    serverId: currentRecord?.serverId || null,
    expectedUpdatedAt: currentRecord?.updatedAt || null,
    requestId: currentRecord?.serverId || createClientUuid(),
    subject: currentRecord?.subject || student.clinicSubject || subject || '',
    items,
  };
}

export default function ClinicInlineWorksheet({
  session,
  group,
  clinicEvent = null,
  students,
  academyProfile,
  onOpenRecord,
}) {
  const clinicRecords = useAcademyStore((state) => state.clinicRecords) ?? [];
  const addClinicRecord = useAcademyStore((state) => state.addClinicRecord);
  const updateClinicRecord = useAcademyStore((state) => state.updateClinicRecord);
  const showToast = useAcademyStore((state) => state.showToast);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authUserId = useAuthStore((state) => state.user?.id);
  const currentAcademyId = useWorkspaceStore((state) => state.currentAcademyId);
  const loadServerClinicRecords = useWorkspaceStore((state) => state.loadServerClinicRecords);
  const materializePlannedClassSession = useWorkspaceStore(
    (state) => state.materializePlannedClassSession,
  );
  const subject = clinicEvent?.subject || group?.subject || '';
  const date = session?.date || '';
  const configuredFields = useMemo(
    () => new Set(
      Array.isArray(academyProfile?.clinicRecordFields)
        ? academyProfile.clinicRecordFields
        : DEFAULT_ACADEMY_SETTINGS.clinicRecordFields,
    ),
    [academyProfile?.clinicRecordFields],
  );

  const buildDrafts = () => Object.fromEntries(students.map((student) => {
    const currentRecord = student.clinicRecord || null;
    const studentSubject = currentRecord?.subject || student.clinicSubject || subject;
    const previousRecord = findPreviousRecord(clinicRecords, student.id, studentSubject, date);
    return [student.id, buildStudentDraft({
      student,
      currentRecord,
      previousRecord,
      academyProfile,
      subject: studentSubject,
    })];
  }));

  const [drafts, setDrafts] = useState(buildDrafts);
  const [dirtyStudentIds, setDirtyStudentIds] = useState(() => new Set());
  const [expandedStudentIds, setExpandedStudentIds] = useState(() => new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingStudentIds, setSavingStudentIds] = useState(() => new Set());
  const [saveErrorStudentIds, setSaveErrorStudentIds] = useState(() => new Set());
  const draftsRef = useRef(drafts);
  const dirtyStudentIdsRef = useRef(dirtyStudentIds);
  const saveErrorStudentIdsRef = useRef(saveErrorStudentIds);
  const editRevisionRef = useRef(new Map());
  const saveAllRef = useRef(null);
  const savingRef = useRef(false);
  const studentKey = students
    .map((student) => `${student.id}:${student.clinicSubject || ''}`)
    .join('|');
  const visibleStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => (
      String(student.name || '').toLowerCase().includes(query)
      || String(student.school || '').toLowerCase().includes(query)
      || String(student.grade || '').toLowerCase().includes(query)
    ));
  }, [students, studentSearch]);

  useEffect(() => {
    const nextDrafts = buildDrafts();
    const emptyDirtyIds = new Set();
    const emptyErrorIds = new Set();
    draftsRef.current = nextDrafts;
    dirtyStudentIdsRef.current = emptyDirtyIds;
    saveErrorStudentIdsRef.current = emptyErrorIds;
    setDrafts(nextDrafts);
    setDirtyStudentIds(emptyDirtyIds);
    setSavingStudentIds(new Set());
    setSaveErrorStudentIds(emptyErrorIds);
    editRevisionRef.current = new Map();
    setExpandedStudentIds(new Set());
    // 회차나 명단이 바뀔 때만 초기화한다. 서버 목록 갱신으로 초안이 지워지면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, studentKey, subject]);

  useEffect(() => { draftsRef.current = drafts; }, [drafts]);
  useEffect(() => { dirtyStudentIdsRef.current = dirtyStudentIds; }, [dirtyStudentIds]);
  useEffect(() => { saveErrorStudentIdsRef.current = saveErrorStudentIds; }, [saveErrorStudentIds]);

  const markStudentDirty = (studentId) => {
    editRevisionRef.current.set(
      studentId,
      (editRevisionRef.current.get(studentId) || 0) + 1,
    );
    setSaveErrorStudentIds((current) => {
      if (!current.has(studentId)) return current;
      const next = new Set(current);
      next.delete(studentId);
      saveErrorStudentIdsRef.current = next;
      return next;
    });
    setDirtyStudentIds((current) => {
      const next = new Set(current);
      next.add(studentId);
      dirtyStudentIdsRef.current = next;
      return next;
    });
  };

  const toggleStudent = (studentId) => {
    setExpandedStudentIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const updateItem = (studentId, itemId, field, value) => {
    setDrafts((current) => {
      const next = {
        ...current,
        [studentId]: {
          ...current[studentId],
          items: current[studentId].items.map((item) => (
            item.id === itemId ? { ...item, [field]: value } : item
          )),
        },
      };
      draftsRef.current = next;
      return next;
    });
    markStudentDirty(studentId);
  };

  const updateStudentSubject = (student, nextSubject) => {
    setDrafts((current) => {
      const draft = current[student.id];
      if (!draft) return current;
      const hasWrittenContent = draft.items.some((item) => (
        item.materialsText.trim() || item.description.trim() || item.result.trim() || item.memo?.trim()
      ));
      const nextItems = hasWrittenContent
        ? draft.items
        : buildStudentDraft({
          student: { ...student, clinicSubject: nextSubject },
          currentRecord: null,
          previousRecord: findPreviousRecord(clinicRecords, student.id, nextSubject, date),
          academyProfile,
          subject: nextSubject,
        }).items;
      const next = {
        ...current,
        [student.id]: { ...draft, subject: nextSubject, items: nextItems },
      };
      draftsRef.current = next;
      return next;
    });
    markStudentDirty(student.id);
  };

  const addStudentItem = (studentId, optionKey) => {
    if (!optionKey) return;
    setDrafts((current) => {
      const draft = current[studentId];
      const option = getClinicOptions(draft?.subject).find((item) => item.key === optionKey);
      if (!draft || !option || draft.items.some((item) => item.categoryKey === option.key)) return current;
      const next = {
        ...current,
        [studentId]: {
          ...draft,
          items: [...draft.items, {
            id: `inline_${studentId}_${option.key}_${Date.now()}`,
            categoryKey: option.key,
            activityType: option.title,
            title: option.title,
            materialsText: '',
            description: '',
            result: '',
            memo: '',
            previousDescription: '',
            previousResult: '',
          }],
        },
      };
      draftsRef.current = next;
      return next;
    });
    markStudentDirty(studentId);
  };

  const removeStudentItem = (studentId, itemId) => {
    setDrafts((current) => {
      const next = {
        ...current,
        [studentId]: {
          ...current[studentId],
          items: current[studentId].items.filter((item) => item.id !== itemId),
        },
      };
      draftsRef.current = next;
      return next;
    });
    markStudentDirty(studentId);
  };

  const saveAll = async (requestedStudentIds = null) => {
    if (savingRef.current) return;
    const dirtyIds = dirtyStudentIdsRef.current;
    const errorIds = saveErrorStudentIdsRef.current;
    const requestedIds = Array.isArray(requestedStudentIds)
      ? new Set(requestedStudentIds)
      : null;
    const targetStudents = students.filter((student) => (
      dirtyIds.has(student.id)
      && (!requestedIds || requestedIds.has(student.id))
      && !errorIds.has(student.id)
    ));
    if (targetStudents.length === 0) return;
    const targetStudentIds = new Set(targetStudents.map((student) => student.id));
    const revisionSnapshot = new Map(targetStudents.map((student) => [
      student.id,
      editRevisionRef.current.get(student.id) || 0,
    ]));
    const draftSnapshot = draftsRef.current;
    savingRef.current = true;
    setSaving(true);
    setSavingStudentIds(targetStudentIds);
    const failedStudentIds = new Set();
    const conflictedStudentIds = new Set();
    let savedCount = 0;

    try {
      const resolvedSession = session?.isPlanned
        ? await materializePlannedClassSession(session)
        : session;
      if (!session?.isTemporary && !clinicEvent && !resolvedSession?.id) {
        throw new Error('오늘 수업 회차를 준비하지 못했어요.');
      }

      for (const student of targetStudents) {
        try {
          const draft = draftSnapshot[student.id];
          const existing = student.clinicRecord || (
            draft.recordId ? clinicRecords.find((record) => record.id === draft.recordId) : null
          );
          const items = draft.items.map((item) => ({
            id: item.id,
            categoryKey: item.categoryKey,
            activityType: item.activityType || item.title,
            title: item.title,
            materialTags: splitMaterials(item.materialsText),
            description: item.description.trim(),
            result: item.result.trim(),
            memo: item.memo || '',
          }));
          const payload = {
            studentId: student.id,
            date,
            subject: draft.subject || subject,
            activityType: existing?.activityType || academyProfile?.clinicDefaultActivityType || 'clinic',
            activityName: existing?.activityName || '',
            classGroupId: group?.isClinicEvent ? '' : (group?.id || ''),
            classSessionId: session?.isTemporary || clinicEvent ? '' : (resolvedSession?.id || ''),
            clinicEventId: clinicEvent?.id || '',
            sourceLessonRecordId: existing?.sourceLessonRecordId || null,
            sourceSupportTags: existing?.sourceSupportTags || [],
            sourceSupportMemo: existing?.sourceSupportMemo || '',
            items,
            overallMemo: existing?.overallMemo || '',
            createdByRole: existing?.createdByRole || useAcademyStore.getState().role || '',
            createdById: existing?.createdById || authUserId || '',
          };

          let serverRecord = null;
          if (isAuthenticated && currentAcademyId) {
            if (!student.serverId) {
              throw new Error(`${student.name} 학생의 서버 정보를 확인하지 못했어요.`);
            }
            if (group?.id && !group?.isClinicEvent && !group.serverId) {
              throw new Error('반 서버 정보를 확인하지 못했어요.');
            }
            if (!session?.isTemporary && !clinicEvent && resolvedSession && !resolvedSession.serverId) {
              throw new Error('수업 회차를 준비하지 못했어요.');
            }
            const serverPayload = {
              student_id: student.serverId,
              class_group_id: group?.isClinicEvent ? null : (group?.serverId || null),
              class_session_id: clinicEvent ? null : (resolvedSession?.serverId || null),
              clinic_event_id: clinicEvent?.id || null,
              date,
              subject: draft.subject || subject || null,
              activity_type: payload.activityType,
              activity_name: payload.activityName || null,
              source_lesson_record_id: null,
              source_support_tags: payload.sourceSupportTags,
              source_support_memo: payload.sourceSupportMemo || null,
              items,
              overall_memo: payload.overallMemo || null,
              created_by_role: payload.createdByRole || null,
              created_by_id: payload.createdById || null,
            };
            if (existing?.serverId) {
              serverRecord = await updateServerClinicRecord(
                existing.serverId,
                serverPayload,
                { expectedUpdatedAt: draft.expectedUpdatedAt || existing.updatedAt || undefined },
              );
            } else {
              serverRecord = await createAcademyClinicRecord({
                academyId: currentAcademyId,
                id: draft.requestId,
                ...serverPayload,
              });
            }
          }

          let localRecord = existing;
          if (existing) {
            updateClinicRecord(existing.id, {
              ...payload,
              serverId: serverRecord?.id || existing.serverId || null,
            }, { silent: true });
          } else {
            localRecord = addClinicRecord({
              ...payload,
              serverId: serverRecord?.id || null,
            }, { silent: true });
          }
          setDrafts((current) => {
            const next = {
              ...current,
              [student.id]: {
                ...current[student.id],
                recordId: localRecord?.id || current[student.id]?.recordId || null,
                serverId: serverRecord?.id || existing?.serverId || current[student.id]?.serverId || null,
                expectedUpdatedAt: serverRecord?.updated_at
                  || existing?.updatedAt
                  || current[student.id]?.expectedUpdatedAt
                  || null,
              },
            };
            draftsRef.current = next;
            return next;
          });
          savedCount += 1;
        } catch (error) {
          if (error?.code === 'DATA_CONFLICT') conflictedStudentIds.add(student.id);
          else failedStudentIds.add(student.id);
          console.error('[supabase] inline clinic record sync failed', error);
        }
      }

      if (isAuthenticated && currentAcademyId) {
        try {
          await loadServerClinicRecords();
        } catch (error) {
          console.error('[supabase] clinic records refresh failed', error);
        }
      }
      if (conflictedStudentIds.size > 0) {
        const latestRecords = useAcademyStore.getState().clinicRecords || [];
        const latestDrafts = {};
        for (const student of targetStudents) {
          if (!conflictedStudentIds.has(student.id)) continue;
          const currentDraft = draftSnapshot[student.id];
          const unchangedSinceSave = (editRevisionRef.current.get(student.id) || 0)
            === revisionSnapshot.get(student.id);
          const latest = latestRecords.find((record) => (
            (currentDraft?.serverId && record.serverId === currentDraft.serverId)
            || (currentDraft?.recordId && record.id === currentDraft.recordId)
          ));
          if (!latest || latest.updatedAt === currentDraft?.expectedUpdatedAt) {
            failedStudentIds.add(student.id);
            continue;
          }
          if (!unchangedSinceSave) {
            // 저장 중 사용자가 계속 입력했다면 내용은 건드리지 않고 충돌 기준
            // 시각만 최신으로 올린 뒤 새 입력을 다시 자동 저장한다.
            setDrafts((current) => {
              const next = {
                ...current,
                [student.id]: {
                  ...current[student.id],
                  recordId: latest.id || current[student.id]?.recordId || null,
                  serverId: latest.serverId || current[student.id]?.serverId || null,
                  expectedUpdatedAt: latest.updatedAt || current[student.id]?.expectedUpdatedAt || null,
                },
              };
              draftsRef.current = next;
              return next;
            });
            continue;
          }
          latestDrafts[student.id] = buildStudentDraft({
            student,
            currentRecord: latest,
            previousRecord: findPreviousRecord(
              latestRecords,
              student.id,
              latest.subject || currentDraft?.subject || subject,
              date,
            ),
            academyProfile,
            subject: latest.subject || currentDraft?.subject || subject,
          });
        }
        if (Object.keys(latestDrafts).length > 0) {
          setDrafts((current) => {
            const next = { ...current, ...latestDrafts };
            draftsRef.current = next;
            return next;
          });
        }
      }
      setDirtyStudentIds((current) => {
        const next = new Set(current);
        for (const student of targetStudents) {
          const unchangedSinceSave = (editRevisionRef.current.get(student.id) || 0)
            === revisionSnapshot.get(student.id);
          if (!failedStudentIds.has(student.id) && unchangedSinceSave) {
            next.delete(student.id);
          } else {
            next.add(student.id);
          }
        }
        dirtyStudentIdsRef.current = next;
        return next;
      });
      setSaveErrorStudentIds((current) => {
        const next = new Set(current);
        for (const studentId of targetStudentIds) next.delete(studentId);
        for (const studentId of failedStudentIds) {
          const unchangedSinceSave = (editRevisionRef.current.get(studentId) || 0)
            === revisionSnapshot.get(studentId);
          if (unchangedSinceSave) next.add(studentId);
        }
        saveErrorStudentIdsRef.current = next;
        return next;
      });
      if (conflictedStudentIds.size > 0 && failedStudentIds.size === 0) {
        showToast(
          `${conflictedStudentIds.size}명은 다른 기기에서 먼저 수정되어 최신 기록으로 다시 불러왔어요.`,
          'error',
        );
      } else if (failedStudentIds.size > 0) {
        showToast(
          `${savedCount}명 저장, ${failedStudentIds.size}명은 자동 저장하지 못했어요. 해당 학생을 다시 입력해주세요.`,
          'error',
        );
      }
    } catch (error) {
      console.error('[clinic] inline clinic record save failed', error);
      setSaveErrorStudentIds((current) => {
        const next = new Set(current);
        for (const studentId of targetStudentIds) {
          const unchangedSinceSave = (editRevisionRef.current.get(studentId) || 0)
            === revisionSnapshot.get(studentId);
          if (unchangedSinceSave) next.add(studentId);
        }
        saveErrorStudentIdsRef.current = next;
        return next;
      });
      showToast(error?.message || '클리닉 기록을 저장하지 못했어요.', 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
      setSavingStudentIds(new Set());
    }
  };

  saveAllRef.current = saveAll;

  useEffect(() => {
    if (saving || dirtyStudentIds.size === 0) return undefined;
    const hasAutoSaveTarget = [...dirtyStudentIds].some(
      (studentId) => !saveErrorStudentIds.has(studentId),
    );
    if (!hasAutoSaveTarget) return undefined;
    const timer = window.setTimeout(() => {
      saveAllRef.current?.();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [dirtyStudentIds, saveErrorStudentIds, saving]);

  const flushStudent = (studentId) => {
    if (!dirtyStudentIdsRef.current.has(studentId)) return;
    saveAllRef.current?.([studentId]);
  };

  useEffect(() => {
    const flushPending = () => {
      if (document.visibilityState === 'hidden' && dirtyStudentIdsRef.current.size > 0) {
        saveAllRef.current?.();
      }
    };
    document.addEventListener('visibilitychange', flushPending);
    return () => document.removeEventListener('visibilitychange', flushPending);
  }, []);

  return (
    <div className="border-t border-gray-50 bg-[#F8FAFC] px-3 py-3 md:px-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold text-[#333D4B]">바로 기록</p>
          <p className="mt-0.5 text-[10px] font-medium text-[#8B95A1]">
            교재는 이어지고, 나머지는 이전 기록을 참고로만 보여줘요.
          </p>
        </div>
        {saveErrorStudentIds.size > 0 ? (
          <button
            type="button"
            onClick={() => setSaveErrorStudentIds(new Set())}
            className="flex h-8 flex-shrink-0 items-center rounded-xl bg-red-50 px-2.5 text-[11px] font-bold text-red-600"
          >
            저장 실패 · 재시도
          </button>
        ) : (
          <span className={`flex h-8 flex-shrink-0 items-center gap-1.5 px-1 text-[11px] font-bold ${
            saving || dirtyStudentIds.size > 0 ? 'text-blue-600' : 'text-emerald-600'
          }`}>
            {saving ? (
              <><Loader2 size={12} className="animate-spin" />자동 저장 중</>
            ) : dirtyStudentIds.size > 0 ? (
              '입력 내용 자동 저장 대기'
            ) : (
              <><CheckCircle2 size={12} />자동 저장</>
            )}
          </span>
        )}
      </div>

      <div className="mb-3 flex h-10 items-center gap-2 rounded-xl border border-[#E5E8EB] bg-white px-3">
        <Search size={14} className="flex-shrink-0 text-[#8B95A1]" />
        <input
          value={studentSearch}
          onChange={(event) => setStudentSearch(event.target.value)}
          placeholder="학생 이름 또는 학교 검색"
          className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[#333D4B] outline-none placeholder:text-[#B0B8C1]"
        />
        {studentSearch && (
          <span className="flex-shrink-0 text-[10px] font-bold text-[#8B95A1]">
            {visibleStudents.length}명
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {visibleStudents.map((student) => {
          const draft = drafts[student.id];
          if (!draft) return null;
          const isDirty = dirtyStudentIds.has(student.id);
          const isSavingStudent = savingStudentIds.has(student.id);
          const hasSaveError = saveErrorStudentIds.has(student.id);
          const hasSavedRecord = !!(draft.recordId || student.clinicRecord);
          const isExpanded = expandedStudentIds.has(student.id);
          return (
            <div key={student.id} className="overflow-hidden rounded-2xl border border-[#E5E8EB] bg-white">
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => toggleStudent(student.id)}
                  aria-expanded={isExpanded}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">
                    {student.name?.slice(0, 1) || '학'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold text-[#191F28]">{student.name}</span>
                    <span className={`mt-0.5 flex items-center gap-1 text-[10px] font-bold ${
                      hasSaveError
                        ? 'text-red-500'
                        : isSavingStudent || isDirty
                          ? 'text-blue-600'
                          : hasSavedRecord
                            ? 'text-emerald-600'
                            : 'text-[#8B95A1]'
                    }`}>
                      {isSavingStudent && <Loader2 size={11} className="animate-spin" />}
                      {hasSavedRecord && !isDirty && !isSavingStudent && <CheckCircle2 size={11} />}
                      {hasSaveError
                        ? '자동 저장 실패'
                        : isSavingStudent
                          ? '저장 중'
                          : isDirty
                            ? '자동 저장 대기'
                            : hasSavedRecord
                              ? '저장됨'
                              : '입력하면 자동 저장'}
                    </span>
                  </span>
                  <ChevronDown
                    size={16}
                    className={`ml-auto flex-shrink-0 text-[#8B95A1] transition-transform duration-200 ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenRecord?.(student)}
                  className="flex h-8 items-center gap-1 rounded-xl bg-[#F2F4F6] px-2.5 text-[11px] font-bold text-[#6B7684]"
                >
                  <PencilLine size={12} />
                  상세
                </button>
              </div>

              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-[#F2F4F6] px-3 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold text-[#8B95A1]">과목</span>
                      <select
                        value={draft.subject}
                        onChange={(event) => updateStudentSubject(student, event.target.value)}
                        onBlur={() => flushStudent(student.id)}
                        className="h-8 rounded-lg border border-[#E5E8EB] bg-white px-2 text-[11px] font-bold text-[#333D4B] outline-none focus:border-[#3182F6]"
                      >
                        <option value="">과목 없음</option>
                        {ACADEMY_SUBJECT_OPTIONS.map((option) => (
                          <option key={option.id} value={option.label}>{option.label}</option>
                        ))}
                      </select>
                      {draft.subject !== subject && (
                        <span className="text-[10px] font-bold text-violet-600">학생별 설정</span>
                      )}
                      <select
                        value=""
                        onChange={(event) => addStudentItem(student.id, event.target.value)}
                        className="ml-auto h-8 rounded-lg border border-dashed border-[#B0B8C1] bg-white px-2 text-[11px] font-bold text-[#4E5968] outline-none"
                      >
                        <option value="">+ 활동 추가</option>
                        {getClinicOptions(draft.subject)
                          .filter((option) => !draft.items.some((item) => item.categoryKey === option.key))
                          .map((option) => <option key={option.key} value={option.key}>{option.title}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-2 px-3 pb-3 pt-2 lg:grid-cols-2">
                    {draft.items.map((item) => (
                      <div key={item.id} className="rounded-xl bg-[#F8FAFC] p-2.5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-extrabold text-[#333D4B]">{item.title}</p>
                          <button type="button" onClick={() => removeStudentItem(student.id, item.id)} className="flex h-6 w-6 items-center justify-center rounded-lg text-[#B0B8C1] hover:bg-white hover:text-red-500" aria-label={`${item.title} 삭제`}>
                            <X size={12} />
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {configuredFields.has('materials') && (
                            <label className="min-w-0">
                              <span className="mb-1 block text-[10px] font-bold text-[#8B95A1]">교재</span>
                              <input
                                value={item.materialsText}
                                onChange={(event) => updateItem(student.id, item.id, 'materialsText', event.target.value)}
                                onBlur={() => flushStudent(student.id)}
                                placeholder="교재·자료"
                                className="h-9 w-full rounded-lg border border-[#E5E8EB] bg-white px-2.5 text-xs font-semibold text-[#333D4B] outline-none focus:border-[#3182F6]"
                              />
                            </label>
                          )}
                          {configuredFields.has('description') && (
                            <label className="min-w-0">
                              <span className="mb-1 block text-[10px] font-bold text-[#8B95A1]">내용</span>
                              <input
                                value={item.description}
                                onChange={(event) => updateItem(student.id, item.id, 'description', event.target.value)}
                                onBlur={() => flushStudent(student.id)}
                                placeholder={item.previousDescription || '오늘 진행한 내용'}
                                className="h-9 w-full rounded-lg border border-[#E5E8EB] bg-white px-2.5 text-xs font-semibold text-[#333D4B] outline-none placeholder:text-[#B0B8C1] focus:border-[#3182F6]"
                              />
                            </label>
                          )}
                          {configuredFields.has('result') && (
                            <label className="min-w-0">
                              <span className="mb-1 block text-[10px] font-bold text-[#8B95A1]">결과</span>
                              <input
                                value={item.result}
                                onChange={(event) => updateItem(student.id, item.id, 'result', event.target.value)}
                                onBlur={() => flushStudent(student.id)}
                                placeholder={item.previousResult || '예: 24/30'}
                                className="h-9 w-full rounded-lg border border-[#E5E8EB] bg-white px-2.5 text-xs font-semibold text-[#333D4B] outline-none placeholder:text-[#B0B8C1] focus:border-[#3182F6]"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {visibleStudents.length === 0 && (
          <div className="rounded-2xl bg-white px-4 py-8 text-center text-xs font-semibold text-[#8B95A1]">
            검색 결과가 없어요.
          </div>
        )}
      </div>
    </div>
  );
}
