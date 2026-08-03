import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, MessageCircle, Plus, SlidersHorizontal, X } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyClinicRecord,
  updateStudent as updateServerStudent,
  updateClinicRecord as updateServerClinicRecord,
} from '../../../services/supabase/domainApi';
import { today } from '../../../utils/date';
import { getClinicOptions, subjectToKey } from '../../../constants/clinicOptions';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import {
  CLINIC_ACTIVITY_TYPES,
  getActivityLabel,
} from '../../../constants/learningActivitySettings';
import { DEFAULT_ACADEMY_SETTINGS } from '../../../constants/academySettings';
import ClinicDefaultItemsEditor, {
  normalizeClinicDefaultItems,
} from './ClinicDefaultItemsEditor';
import { createClientUuid } from '../../../utils/uuid';

const SUBJECTS = ['국어', '수학', '영어', '과학', '사회', '기타'];

const SUPPORT_TAG_LABELS = {
  homework: '숙제 미완료',
  wrong_answer: '오답 풀이 필요',
  vocabulary: '단어 재시험',
  reading: '본문 암기',
  grammar: '문법 보충',
  concept: '개념 재설명',
  test_retry: '테스트 재응시',
  absence_makeup: '결석 보강',
  other: '기타',
};

const SUPPORT_TAG_TO_OPTION_KEYS = {
  homework: ['weekly_assignment_check', 'assignment_check'],
  wrong_answer: ['wrong_answer_analysis', 'wrong_answer_note', 'reading_wrong_answer', 'wrong_answer_review'],
  vocabulary: ['vocabulary_test', 'vocabulary_concept_test'],
  reading: ['sentence_structure', 'reading_wrong_answer'],
  grammar: ['sentence_structure', 'concept_supplement'],
  concept: ['concept_supplement', 'weak_area_supplement'],
  test_retry: ['weekly_test', 'test'],
  absence_makeup: ['weak_area_supplement', 'qa_session'],
  other: ['other'],
};

function deriveSubjectFromClass({ classGroupId, classSessionId, classGroups = [], classSessions = [] }) {
  const session = classSessionId
    ? classSessions.find((s) => s.id === classSessionId)
    : null;
  const resolvedGroupId = classGroupId || session?.classGroupId || '';
  const group = resolvedGroupId
    ? classGroups.find((g) => g.id === resolvedGroupId)
    : null;
  return group?.subject || '';
}

function normalizeClinicItem(item = {}, index = 0) {
  const title = item.title || item.activityType || '활동';
  const rawResult = item.result || '';
  const composedDescription = [item.description, item.memo].filter(Boolean).join('\n');
  const materialTags = Array.isArray(item.materialTags)
    ? item.materialTags
    : Array.isArray(item.materials)
      ? item.materials
      : [];
  return {
    id: item.id || `item_${Date.now()}_${index}`,
    categoryKey: item.categoryKey || item.key || 'custom',
    activityType: item.activityType || title,
    title,
    materialTags,
    description: composedDescription,
    result: rawResult,
    memo: '',
  };
}

function normalizeClinicItems(items = []) {
  return (Array.isArray(items) ? items : []).map(normalizeClinicItem);
}

function splitMaterialDraft(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergePendingMaterialDrafts(items = [], drafts = {}) {
  return normalizeClinicItems(items).map((item) => {
    const pendingTags = splitMaterialDraft(drafts[item.id]);
    if (pendingTags.length === 0) return item;
    return {
      ...item,
      materialTags: Array.from(new Set([...(item.materialTags || []), ...pendingTags])),
    };
  });
}

function normalizeRelayTarget(target = {}) {
  return {
    studentId: target.studentId || '',
    classGroupId: target.classGroupId || '',
    classSessionId: target.classSessionId || '',
    clinicEventId: target.clinicEventId || '',
    date: target.date || today(),
    subject: target.subject || '',
    sourceSupportTags: Array.isArray(target.sourceSupportTags) ? target.sourceSupportTags : [],
    sourceSupportMemo: target.sourceSupportMemo || '',
    sourceLessonRecordId: target.sourceLessonRecordId || null,
  };
}

function getSuggestedOptionKeys(sourceSupportTags = [], options = []) {
  const availableKeys = new Set(options.map((option) => option.key));
  const suggested = new Set();
  sourceSupportTags.forEach((tag) => {
    (SUPPORT_TAG_TO_OPTION_KEYS[tag] || []).forEach((key) => {
      if (availableKeys.has(key)) suggested.add(key);
    });
  });
  return suggested;
}

function buildSuggestedItems(subject, sourceSupportTags = []) {
  if (!subject || !Array.isArray(sourceSupportTags) || sourceSupportTags.length === 0) return [];
  const options = getClinicOptions(subject);
  const suggestedKeys = getSuggestedOptionKeys(sourceSupportTags, options);
  return options
    .filter((option) => suggestedKeys.has(option.key))
    .map((option, index) => ({
      id: `item_suggested_${Date.now()}_${index}_${option.key}`,
      categoryKey: option.key,
      activityType: option.title,
      title: option.title,
      materialTags: [],
      description: '',
      result: '',
      memo: '',
    }));
}

function buildDefaultItems(defaultItems, subject) {
  const subjectKey = subjectToKey(subject);
  const configured = normalizeClinicDefaultItems(defaultItems)[subjectKey] || [];
  return normalizeClinicItems(configured.map((item) => ({
    ...item,
    description: '',
  })));
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export default function ClinicRecordFormModal({
  editRecord,
  onClose,
  presetStudentId,
  presetDate,
  presetSubject,
  presetClassGroupId,
  presetClassSessionId,
  presetClinicEventId,
  presetSourceSupportTags,
  presetSourceSupportMemo,
  presetSourceLessonRecordId,
  relayTargets = [],
  initialRelayIndex = 0,
}) {
  const {
    addClinicRecord, updateClinicRecord, setClinicRecordServerId, updateAcademyStudent,
    academyStudents, classGroups, classSessions, academyLessonRecords,
    academyTeachers, academyAssistants, academyManagers = [], role,
    academyProfile, showToast,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUserId = useAuthStore((s) => s.user?.id);
  const authUserEmail = useAuthStore((s) => s.user?.email);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const loadServerClinicRecords = useWorkspaceStore((s) => s.loadServerClinicRecords);

  const normalizedRelayTargets = useMemo(
    () => (Array.isArray(relayTargets) ? relayTargets.map(normalizeRelayTarget).filter((target) => target.studentId) : []),
    [relayTargets],
  );
  const safeInitialRelayIndex = Math.max(0, Math.min(initialRelayIndex || 0, Math.max(normalizedRelayTargets.length - 1, 0)));
  const [relayIndex, setRelayIndex] = useState(safeInitialRelayIndex);
  const activeRelayTarget = !editRecord && normalizedRelayTargets.length > 0
    ? normalizedRelayTargets[Math.min(relayIndex, normalizedRelayTargets.length - 1)]
    : null;

  const initialStudentId = editRecord?.studentId || activeRelayTarget?.studentId || presetStudentId || '';
  const initialStudent = academyStudents.find((student) => student.id === initialStudentId);
  const initialDate = editRecord?.date || activeRelayTarget?.date || presetDate || today();
  const initialClassGroupId = editRecord?.classGroupId || activeRelayTarget?.classGroupId || presetClassGroupId || '';
  const initialClassSessionId = editRecord?.classSessionId || activeRelayTarget?.classSessionId || presetClassSessionId || '';
  const initialClinicEventId = editRecord?.clinicEventId || activeRelayTarget?.clinicEventId || presetClinicEventId || '';
  const initialSubject =
    editRecord?.subject ||
    deriveSubjectFromClass({
      classGroupId: initialClassGroupId,
      classSessionId: initialClassSessionId,
      classGroups,
      classSessions,
    }) ||
    activeRelayTarget?.subject ||
    presetSubject ||
    '';
  const initialSourceSupportTags =
    activeRelayTarget?.sourceSupportTags
    ?? presetSourceSupportTags
    ?? editRecord?.sourceSupportTags
    ?? [];
  const initialSourceSupportMemo =
    activeRelayTarget?.sourceSupportMemo
    ?? presetSourceSupportMemo
    ?? editRecord?.sourceSupportMemo
    ?? '';
  const initialDefaultItems =
    initialStudent?.clinicDefaultItems
    || academyProfile?.clinicDefaultItems
    || DEFAULT_ACADEMY_SETTINGS.clinicDefaultItems;
  const initialSuggestedItems = buildSuggestedItems(initialSubject, initialSourceSupportTags);

  const [studentId, setStudentId] = useState(initialStudentId);
  const [date, setDate] = useState(initialDate);
  const [subject, setSubject] = useState(initialSubject);
  const [activityType, setActivityType] = useState(
    editRecord?.activityType
    || initialStudent?.clinicDefaultActivityType
    || academyProfile?.clinicDefaultActivityType
    || 'clinic',
  );
  const [activityName, setActivityName] = useState(editRecord?.activityName || '');
  const [classGroupId, setClassGroupId] = useState(initialClassGroupId);
  const [classSessionId, setClassSessionId] = useState(initialClassSessionId);
  const [selectedItems, setSelectedItems] = useState(
    normalizeClinicItems(
      editRecord?.items
      || (initialSuggestedItems.length > 0
        ? initialSuggestedItems
        : buildDefaultItems(initialDefaultItems, initialSubject)),
    ),
  );
  const [overallMemo, setOverallMemo] = useState(editRecord?.overallMemo || '');
  const [materialDrafts, setMaterialDrafts] = useState({});
  const [customItemDraft, setCustomItemDraft] = useState({ title: '', description: '' });
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showMetaEditor, setShowMetaEditor] = useState(!initialStudentId || !initialDate || !initialSubject);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateItems, setTemplateItems] = useState(
    normalizeClinicDefaultItems(initialDefaultItems),
  );
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const createRecordRequestIdRef = useRef(createClientUuid());

  useEffect(() => {
    if (!activeRelayTarget || editRecord) return;
    setStudentId(activeRelayTarget.studentId);
    setDate(activeRelayTarget.date || today());
    const derivedSubject = deriveSubjectFromClass({
      classGroupId: activeRelayTarget.classGroupId,
      classSessionId: activeRelayTarget.classSessionId,
      classGroups,
      classSessions,
    }) || activeRelayTarget.subject || '';
    setSubject(derivedSubject);
    setClassGroupId(activeRelayTarget.classGroupId || '');
    setClassSessionId(activeRelayTarget.classSessionId || '');
    const relayStudent = academyStudents.find((student) => student.id === activeRelayTarget.studentId);
    const relayDefaults =
      relayStudent?.clinicDefaultItems
      || academyProfile?.clinicDefaultItems
      || DEFAULT_ACADEMY_SETTINGS.clinicDefaultItems;
    const suggested = buildSuggestedItems(derivedSubject, activeRelayTarget.sourceSupportTags);
    setSelectedItems(normalizeClinicItems(
      suggested.length > 0 ? suggested : buildDefaultItems(relayDefaults, derivedSubject),
    ));
    setOverallMemo('');
    setMaterialDrafts({});
    setCustomItemDraft({ title: '', description: '' });
    setShowCustomInput(false);
    setShowMetaEditor(false);
  }, [
    activeRelayTarget,
    editRecord,
    classGroups,
    classSessions,
    academyStudents,
    academyProfile?.clinicDefaultItems,
  ]);

  const currentMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );
  const currentStaff = useMemo(() => {
    if (role === 'teacher') {
      return findLocalStaffForUser(academyTeachers, {
        userId: authUserId,
        memberId: currentMembership?.id,
        email: authUserEmail,
      });
    }
    if (role === 'assistant') {
      return findLocalStaffForUser(academyAssistants, {
        userId: authUserId,
        memberId: currentMembership?.id,
        email: authUserEmail,
      });
    }
    if (role === 'manager') {
      return findLocalStaffForUser(academyManagers, {
        userId: authUserId,
        memberId: currentMembership?.id,
        email: authUserEmail,
      });
    }
    return null;
  }, [role, academyTeachers, academyAssistants, academyManagers, authUserId, currentMembership?.id, authUserEmail]);

  const currentSourceSupportTags =
    activeRelayTarget?.sourceSupportTags
    ?? presetSourceSupportTags
    ?? editRecord?.sourceSupportTags
    ?? [];
  const currentSourceSupportMemo =
    activeRelayTarget?.sourceSupportMemo
    ?? presetSourceSupportMemo
    ?? editRecord?.sourceSupportMemo
    ?? '';
  const sourceLessonRecordId =
    activeRelayTarget?.sourceLessonRecordId
    ?? presetSourceLessonRecordId
    ?? editRecord?.sourceLessonRecordId
    ?? null;

  const selectedStudent = academyStudents.find((s) => s.id === studentId);
  const selectedSession = classSessions?.find((s) => s.id === classSessionId) || null;
  const selectedGroup = classGroups.find((g) => g.id === classGroupId)
    || classGroups.find((g) => g.id === selectedSession?.classGroupId)
    || null;
  const autoSubject = selectedGroup?.subject || '';
  const effectiveSubject = subject || autoSubject;
  const configuredCustomOptions = effectiveSubject
    ? (normalizeClinicDefaultItems(templateItems)[subjectToKey(effectiveSubject)] || [])
      .filter((item) => item.custom)
      .map((item) => ({
        key: item.categoryKey,
        title: item.title,
        description: item.description,
      }))
    : [];
  const clinicOptions = effectiveSubject
    ? [...getClinicOptions(effectiveSubject), ...configuredCustomOptions]
    : [];
  const suggestedOptionKeys = getSuggestedOptionKeys(currentSourceSupportTags, clinicOptions);
  const hasTeacherRequest = currentSourceSupportTags.length > 0 || !!currentSourceSupportMemo?.trim();
  const isRelayMode = !editRecord && normalizedRelayTargets.length > 1;
  const hasNextRelayTarget = isRelayMode && relayIndex < normalizedRelayTargets.length - 1;
  const nextRelayStudent = hasNextRelayTarget
    ? academyStudents.find((s) => s.id === normalizedRelayTargets[relayIndex + 1]?.studentId)
    : null;
  const configuredFields = new Set(['materials', 'description', 'result', 'overall_memo']);
  const detailGridClass =
    'md:grid-cols-[96px_minmax(160px,0.75fr)_minmax(260px,1.5fr)_minmax(170px,0.7fr)_32px]';

  useEffect(() => {
    if (selectedSession?.classGroupId && !classGroupId) {
      setClassGroupId(selectedSession.classGroupId);
    }
  }, [selectedSession?.classGroupId, classGroupId]);

  useEffect(() => {
    const nextItems = normalizeClinicDefaultItems(
      selectedStudent?.clinicDefaultItems
      || academyProfile?.clinicDefaultItems
      || DEFAULT_ACADEMY_SETTINGS.clinicDefaultItems,
    );
    setTemplateItems(nextItems);
    if (!editRecord && effectiveSubject && currentSourceSupportTags.length === 0) {
      setSelectedItems(buildDefaultItems(nextItems, effectiveSubject));
    }
  }, [
    selectedStudent?.id,
    selectedStudent?.clinicDefaultItems,
    academyProfile?.clinicDefaultItems,
    effectiveSubject,
    currentSourceSupportTags.length,
    editRecord,
  ]);

  useEffect(() => {
    if (!autoSubject || autoSubject === subject) return;
    setSubject(autoSubject);
    setSelectedItems((prev) =>
      prev.length > 0
        ? prev
        : normalizeClinicItems(
          buildSuggestedItems(autoSubject, currentSourceSupportTags).length > 0
            ? buildSuggestedItems(autoSubject, currentSourceSupportTags)
            : buildDefaultItems(templateItems, autoSubject),
        )
    );
  }, [autoSubject, subject, currentSourceSupportTags, templateItems]);

  const isItemSelected = (key) => selectedItems.some((i) => i.categoryKey === key);

  const togglePresetItem = (option) => {
    if (isItemSelected(option.key)) {
      setSelectedItems((prev) => prev.filter((i) => i.categoryKey !== option.key));
    } else {
      setSelectedItems((prev) => [
        ...prev,
        {
          id: `item_${Date.now()}_${option.key}`,
          categoryKey: option.key,
          activityType: option.title,
          title: option.title,
          materialTags: [],
          description: '',
          result: '',
          memo: '',
        },
      ]);
    }
  };

  const addCustomItem = () => {
    if (!customItemDraft.title.trim()) return;
    setSelectedItems((prev) => [
      ...prev,
      {
        id: `item_custom_${Date.now()}`,
        categoryKey: 'custom',
        activityType: customItemDraft.title.trim(),
        title: customItemDraft.title.trim(),
        materialTags: [],
        description: customItemDraft.description.trim(),
        result: '',
        memo: '',
      },
    ]);
    setCustomItemDraft({ title: '', description: '' });
    setShowCustomInput(false);
  };

  const updateItemField = (id, field, value) => {
    setSelectedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleClassGroupChange = (nextClassGroupId) => {
    setClassGroupId(nextClassGroupId);
    const nextSubject = deriveSubjectFromClass({
      classGroupId: nextClassGroupId,
      classSessionId,
      classGroups,
      classSessions,
    });
    if (nextSubject && nextSubject !== subject) {
      setSubject(nextSubject);
      setSelectedItems(normalizeClinicItems(buildSuggestedItems(nextSubject, currentSourceSupportTags)));
    }
  };

  const addMaterialTag = (itemId) => {
    const nextDraftTags = splitMaterialDraft(materialDrafts[itemId]);
    if (nextDraftTags.length === 0) return;
    setSelectedItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const nextTags = Array.from(new Set([...(item.materialTags || []), ...nextDraftTags]));
        return { ...item, materialTags: nextTags };
      })
    );
    setMaterialDrafts((prev) => ({ ...prev, [itemId]: '' }));
  };

  const removeMaterialTag = (itemId, tag) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, materialTags: (item.materialTags || []).filter((t) => t !== tag) }
          : item
      )
    );
  };

  const removeItem = (id) => {
    setSelectedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubjectChange = (nextSubject) => {
    setSubject(nextSubject);
    const suggested = buildSuggestedItems(nextSubject, currentSourceSupportTags);
    setSelectedItems(normalizeClinicItems(
      suggested.length > 0 ? suggested : buildDefaultItems(templateItems, nextSubject),
    ));
  };

  const handleSave = async (mode = 'close') => {
    if (isSaving) return;
    if (!studentId) return alert('학생을 선택해주세요.');
    if (!date) return alert('날짜를 선택해주세요.');
    if (activityType === 'other' && !activityName.trim()) {
      return alert('활동 유형 이름을 입력해주세요.');
    }
    const finalSubject = subject || autoSubject;
    if (!finalSubject) return alert('과목을 선택해주세요.');
    if (selectedItems.length === 0) return alert('진행한 활동을 최소 1개 선택해주세요.');

    setIsSaving(true);
    try {
      const fallbackCreatedById = role === 'teacher'
        ? (authUserId ? `teacher_${authUserId}` : academyTeachers[0]?.id || '')
        : role === 'assistant'
          ? (authUserId ? `assistant_${authUserId}` : academyAssistants[0]?.id || '')
          : role === 'manager'
            ? (authUserId ? `manager_${authUserId}` : academyManagers[0]?.id || '')
          : '';
      const writerRole = editRecord?.createdByRole || role;
      const writerId = editRecord?.createdById || currentStaff?.id || fallbackCreatedById;
      const normalizedItemsForSave = mergePendingMaterialDrafts(selectedItems, materialDrafts);

      const payload = {
        studentId,
        date,
        subject: finalSubject,
        activityType,
        activityName: activityType === 'other' ? activityName.trim() : '',
      classGroupId: classGroupId || '',
      classSessionId: classSessionId || '',
      clinicEventId: initialClinicEventId,
        sourceLessonRecordId,
        sourceSupportTags: currentSourceSupportTags,
        sourceSupportMemo: currentSourceSupportMemo,
        items: normalizedItemsForSave,
        overallMemo,
        createdByRole: writerRole,
        createdById: writerId,
      };

      const student = academyStudents.find((s) => s.id === studentId);
      const groupForServer = classGroupId
        ? classGroups.find((g) => g.id === classGroupId)
        : null;
      const sessionForServer = classSessionId
        ? classSessions?.find((cs) => cs.id === classSessionId)
        : null;
      const sourceLr = sourceLessonRecordId
        ? academyLessonRecords?.find((lr) => lr.id === sourceLessonRecordId)
        : null;

      const buildServerPayload = () => ({
        student_id: student?.serverId,
        class_group_id: groupForServer?.serverId || null,
        class_session_id: sessionForServer?.serverId || null,
        clinic_event_id: initialClinicEventId || null,
        date,
        subject: finalSubject || null,
        activity_type: activityType,
        activity_name: activityType === 'other' ? activityName.trim() : null,
        teacher_id: writerId && writerRole === 'teacher' ? writerId : null,
        assistant_id: writerId && writerRole === 'assistant' ? writerId : null,
        source_lesson_record_id: sourceLr?.serverId || (looksLikeUuid(sourceLessonRecordId) ? sourceLessonRecordId : null),
        source_support_tags: Array.isArray(currentSourceSupportTags) ? currentSourceSupportTags : [],
        source_support_memo: currentSourceSupportMemo || null,
        items: normalizedItemsForSave,
        overall_memo: overallMemo || null,
        created_by_role: writerRole || null,
        created_by_id: writerId || null,
      });

      let serverRecord = null;
      if (editRecord) {
        if (isAuthenticated && currentAcademyId) {
          if (!student?.serverId) {
            throw new Error('학생 서버 정보를 확인하지 못했어요. 학생 목록을 새로고침해주세요.');
          }
          if (groupForServer && !groupForServer.serverId) {
            throw new Error('반 서버 정보를 확인하지 못했어요. 수업 목록을 새로고침해주세요.');
          }
          if (sessionForServer && !sessionForServer.serverId) {
            throw new Error('수업 회차를 준비하지 못했어요. 일정을 새로고침해주세요.');
          }
          if (editRecord.serverId) {
            serverRecord = await updateServerClinicRecord(
              editRecord.serverId,
              buildServerPayload(),
            );
          } else {
            serverRecord = await createAcademyClinicRecord({
              academyId: currentAcademyId,
              id: createRecordRequestIdRef.current,
              ...buildServerPayload(),
            });
          }
        }
        updateClinicRecord(editRecord.id, {
          ...payload,
          serverId: serverRecord?.id || editRecord.serverId || null,
        });
        if (serverRecord?.id && !editRecord.serverId) {
          setClinicRecordServerId(editRecord.id, serverRecord.id);
        }
      } else {
        if (isAuthenticated && currentAcademyId) {
          if (!student?.serverId) {
            throw new Error('학생 서버 정보를 확인하지 못했어요. 학생 목록을 새로고침해주세요.');
          }
          if (groupForServer && !groupForServer.serverId) {
            throw new Error('반 서버 정보를 확인하지 못했어요. 수업 목록을 새로고침해주세요.');
          }
          if (sessionForServer && !sessionForServer.serverId) {
            throw new Error('수업 회차를 준비하지 못했어요. 일정을 새로고침해주세요.');
          }
          serverRecord = await createAcademyClinicRecord({
            academyId: currentAcademyId,
            id: createRecordRequestIdRef.current,
            ...buildServerPayload(),
          });
        }
        addClinicRecord({
          ...payload,
          serverId: serverRecord?.id || null,
        });
      }
      if (serverRecord) await loadServerClinicRecords();

      if (mode === 'next' && hasNextRelayTarget) {
        createRecordRequestIdRef.current = createClientUuid();
        setRelayIndex((idx) => Math.min(idx + 1, normalizedRelayTargets.length - 1));
      } else {
        onClose();
      }
    } catch (err) {
      console.error('[clinic] record save failed', err);
      showToast(
        err?.message || '클리닉 기록을 저장하지 못했어요. 다시 시도해주세요.',
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const saveStudentTemplate = async ({ useAcademyDefault = false } = {}) => {
    if (!selectedStudent || savingTemplate) return;
    const localPatch = {
      clinicDefaultItems: useAcademyDefault ? null : normalizeClinicDefaultItems(templateItems),
    };
    setSavingTemplate(true);
    try {
      if (isAuthenticated && currentAcademyId && !selectedStudent.serverId) {
        throw new Error('학생 서버 정보를 확인하지 못했어요. 학생 목록을 새로고침해주세요.');
      }
      if (selectedStudent.serverId && isAuthenticated && currentAcademyId) {
        await updateServerStudent(selectedStudent.serverId, {
          clinic_default_items: localPatch.clinicDefaultItems,
        });
      }
      updateAcademyStudent(selectedStudent.id, localPatch);
      if (useAcademyDefault) {
        const academyItems = normalizeClinicDefaultItems(
          academyProfile?.clinicDefaultItems
          || DEFAULT_ACADEMY_SETTINGS.clinicDefaultItems,
        );
        setTemplateItems(academyItems);
        if (!editRecord && effectiveSubject && currentSourceSupportTags.length === 0) {
          setSelectedItems(buildDefaultItems(academyItems, effectiveSubject));
        }
      }
      setShowTemplateEditor(false);
    } catch (error) {
      showToast(error?.message || '학생별 기본 구성을 저장하지 못했어요.', 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  if (typeof document === 'undefined') return null;
  const activityLabel = getActivityLabel(CLINIC_ACTIVITY_TYPES, activityType, activityName);
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
          <X size={20} className="text-gray-500" />
        </button>
        <p className="text-base font-bold text-gray-900">
          {editRecord
            ? `${activityLabel} 기록 수정`
            : isRelayMode
              ? `${activityLabel} 기록 (${relayIndex + 1} / ${normalizedRelayTargets.length})`
              : `${activityLabel} 기록 추가`}
        </p>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white/95 px-4 py-3 backdrop-blur border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-bold text-gray-900 truncate">
                {selectedStudent?.name || '학생 선택'}
                {selectedStudent?.grade ? <span className="text-sm text-gray-400"> · {selectedStudent.grade}</span> : null}
              </p>
              <button
                type="button"
                onClick={() => setShowMetaEditor((v) => !v)}
                className="mt-0.5 flex max-w-full items-center gap-1 text-left text-xs font-semibold text-gray-500"
              >
                <span className="truncate">
                  {[selectedGroup?.name, effectiveSubject, date].filter(Boolean).join(' · ') || '학생·반·날짜를 선택해주세요'}
                </span>
                <ChevronDown size={12} className={`flex-shrink-0 transition-transform ${showMetaEditor ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {hasTeacherRequest && (
                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-600">
                  수업 연계
                </span>
              )}
              {selectedStudent && (
                <button
                  type="button"
                  onClick={() => setShowTemplateEditor((current) => !current)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    showTemplateEditor ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'
                  }`}
                  aria-label="학생별 기록 구성"
                  title="학생별 기록 구성"
                >
                  <SlidersHorizontal size={15} />
                </button>
              )}
            </div>
          </div>
          {hasTeacherRequest && (
            <div className="mt-3 rounded-xl bg-orange-50 px-3 py-2">
              <div className="flex items-start gap-2">
                <MessageCircle size={13} className="mt-0.5 flex-shrink-0 text-orange-500" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-orange-700">강사 요청</p>
                  {currentSourceSupportTags.length > 0 && (
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-orange-600">
                      {currentSourceSupportTags.map((tag) => SUPPORT_TAG_LABELS[tag] || tag).join(' · ')}
                    </p>
                  )}
                  {currentSourceSupportMemo?.trim() && (
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-orange-700">{currentSourceSupportMemo}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-5 flex flex-col gap-5">
          {showTemplateEditor && selectedStudent && (
            <div className="rounded-2xl bg-[#F2F4F6] p-4">
              <div className="mb-3">
                <p className="text-sm font-bold text-[#191F28]">{selectedStudent.name} 기본 구성</p>
                <p className="mt-0.5 text-[11px] text-[#8B95A1]">이 학생의 다음 기록부터 기본으로 열려요.</p>
              </div>
              <ClinicDefaultItemsEditor
                subjects={academyProfile?.academySubjects}
                value={templateItems}
                onChange={setTemplateItems}
                compact
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={savingTemplate}
                  onClick={() => saveStudentTemplate()}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  학생 기본값 저장
                </button>
                <button
                  type="button"
                  disabled={savingTemplate}
                  onClick={() => saveStudentTemplate({ useAcademyDefault: true })}
                  className="rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-gray-600 disabled:opacity-50"
                >
                  학원 기본값
                </button>
              </div>
            </div>
          )}

          <FormSection label="활동 유형">
            <div className="flex flex-wrap gap-2">
              {CLINIC_ACTIVITY_TYPES.map((option) => {
                const selected = activityType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setActivityType(option.id);
                      if (option.id !== 'other') setActivityName('');
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                      selected
                        ? 'border-[#3182F6] bg-[#E8F3FF] text-[#1B64DA]'
                        : 'border-[#E5E8EB] bg-white text-[#4E5968]'
                    }`}
                  >
                    {selected && '✓ '}{option.label}
                  </button>
                );
              })}
            </div>
            {activityType === 'other' && (
              <input
                value={activityName}
                onChange={(event) => setActivityName(event.target.value)}
                placeholder="학원에서 사용하는 활동 이름"
                className="input mt-2"
              />
            )}
          </FormSection>

          {showMetaEditor && (
            <div className="rounded-2xl bg-gray-50 px-4 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormSection label="학생 *">
                  <div className="relative">
                    <select
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="input appearance-none pr-8"
                    >
                      <option value="">학생 선택</option>
                      {academyStudents.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} {s.grade ? `(${s.grade})` : ''}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </FormSection>
                <FormSection label="날짜 *">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="input"
                  />
                </FormSection>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {classGroups.length > 0 && (
                  <FormSection label="반 연결">
                    <div className="relative">
                      <select
                        value={classGroupId}
                        onChange={(e) => handleClassGroupChange(e.target.value)}
                        className="input appearance-none pr-8"
                      >
                        <option value="">반 선택 안 함</option>
                        {classGroups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </FormSection>
                )}
                <FormSection label="과목 *">
                  {autoSubject ? (
                    <div className="flex h-11 items-center justify-between rounded-xl bg-white px-3 text-sm font-bold text-blue-600">
                      <span>{autoSubject}</span>
                      <Check size={15} />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {SUBJECTS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleSubjectChange(s)}
                          className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                            subject === s
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-500'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </FormSection>
              </div>
            </div>
          )}

          {effectiveSubject && (
            <FormSection label="오늘 한 활동을 선택해주세요 *">
              <div className="flex flex-wrap gap-2">
                {clinicOptions.map((option) => {
                  const selected = isItemSelected(option.key);
                  const suggested = suggestedOptionKeys.has(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => togglePresetItem(option)}
                      className={`text-left px-3.5 py-2.5 rounded-2xl border-2 transition-colors ${
                        selected
                          ? 'border-blue-500 bg-blue-50'
                          : suggested
                            ? 'border-orange-300 bg-orange-50'
                            : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-bold ${selected ? 'text-blue-700' : 'text-gray-800'}`}>
                          {selected && '✓ '}{option.title}
                        </p>
                        {suggested && (
                          <span className="flex-shrink-0 text-xs text-orange-500 font-bold">추천</span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {!showCustomInput && (
                  <button
                    type="button"
                    onClick={() => setShowCustomInput(true)}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 text-sm font-semibold"
                  >
                    <Plus size={16} />
                    직접 추가
                  </button>
                )}
              </div>
              {showCustomInput && (
                <div className="mt-2 flex max-w-md items-center gap-2 rounded-2xl bg-blue-50 p-2">
                  <input
                    value={customItemDraft.title}
                    onChange={(event) => setCustomItemDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addCustomItem();
                      }
                    }}
                    placeholder="활동 이름"
                    className="h-10 min-w-0 flex-1 rounded-xl bg-white px-3 text-sm font-semibold outline-none ring-1 ring-blue-100"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={addCustomItem}
                    disabled={!customItemDraft.title.trim()}
                    className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white disabled:bg-blue-300"
                  >
                    추가
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomInput(false);
                      setCustomItemDraft({ title: '', description: '' });
                    }}
                    className="h-10 rounded-xl bg-white px-3 text-xs font-bold text-gray-500"
                  >
                    취소
                  </button>
                </div>
              )}
            </FormSection>
          )}

          {selectedItems.length > 0 && (
            <FormSection label="항목별 세부 기록">
              <div className="flex flex-col gap-2.5">
                {selectedItems.map((item) => (
                  <div
                    key={item.id}
                    className={`grid grid-cols-1 gap-3 rounded-2xl bg-[#F8FAFC] px-3 py-3 md:items-start md:px-4 md:py-3.5 ${detailGridClass}`}
                  >
                    <div className="flex items-center justify-between gap-2 md:block">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900">{item.title}</p>
                        <p className="mt-0.5 text-[11px] font-semibold text-gray-400">활동</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 active:bg-gray-100 md:hidden"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    {configuredFields.has('materials') && <div className="min-w-0">
                      <label className="mb-1 block text-[11px] font-bold text-gray-500">교재·자료</label>
                      <div className="rounded-xl bg-white px-3 py-2.5 transition-colors focus-within:bg-blue-50/60">
                          {(item.materialTags || []).length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {item.materialTags.map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => removeMaterialTag(item.id, tag)}
                                  className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600"
                                >
                                  {tag}
                                  <X size={10} />
                                </button>
                              ))}
                            </div>
                          )}
                          <input
                            value={materialDrafts[item.id] || ''}
                            onChange={(e) => setMaterialDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            onBlur={() => addMaterialTag(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addMaterialTag(item.id);
                              }
                            }}
                            placeholder="워드마스터 5과"
                            className="w-full bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300"
                          />
                      </div>
                    </div>}

                    {configuredFields.has('description') && <div className="min-w-0">
                      <label className="mb-1 block text-[11px] font-bold text-gray-500">내용</label>
                      <div className="rounded-xl bg-white px-3 py-2.5 transition-colors focus-within:bg-blue-50/60">
                        <input
                          value={item.description}
                          onChange={(e) => updateItemField(item.id, 'description', e.target.value)}
                          placeholder="5과 Day 3 풀이, 틀린 단어 재시험"
                          className="w-full bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300"
                        />
                      </div>
                    </div>}

                    {configuredFields.has('result') && <div className="min-w-0">
                      <label className="mb-1 block text-[11px] font-bold text-gray-500">결과</label>
                      <div className="rounded-xl bg-white px-3 py-2.5 transition-colors focus-within:bg-blue-50/60">
                        <input
                          value={item.result}
                          onChange={(e) => updateItemField(item.id, 'result', e.target.value)}
                          placeholder="24/30"
                          className="w-full bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300"
                        />
                      </div>
                    </div>}

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="hidden h-9 w-9 items-center justify-center self-end rounded-full text-gray-400 active:bg-gray-100 md:flex"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </FormSection>
          )}

          {configuredFields.has('overall_memo') && (
            <FormSection label="전체 메모">
              <textarea
                value={overallMemo}
                onChange={(event) => setOverallMemo(event.target.value)}
                placeholder="학생에게 남길 전체 메모"
                rows={3}
                className="input resize-none"
              />
            </FormSection>
          )}

          <div className="h-4" />
        </div>
      </div>

      <div className="px-4 py-4 border-t border-gray-100 bg-white">
        {hasNextRelayTarget ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSave('next')}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl text-base disabled:opacity-60"
            >
              저장하고 다음 학생{nextRelayStudent?.name ? ` (${nextRelayStudent.name})` : ''}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSave('close')}
              className="w-full bg-gray-100 text-gray-700 font-bold py-3.5 rounded-2xl text-sm disabled:opacity-60"
            >
              저장 후 닫기
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSave('close')}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl text-base disabled:opacity-60"
          >
            {editRecord ? '수정 저장' : `${activityLabel} 기록 저장`}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

function FormSection({ label, children }) {
  return (
    <div>
      <label className="text-xs font-bold text-gray-600 mb-2 block">{label}</label>
      {children}
    </div>
  );
}
