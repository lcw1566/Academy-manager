import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, PencilLine, Save } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyClinicRecord,
  updateClinicRecord as updateServerClinicRecord,
} from '../../../services/supabase/domainApi';
import { DEFAULT_ACADEMY_SETTINGS } from '../../../constants/academySettings';
import { getClinicOptions, subjectToKey } from '../../../constants/clinicOptions';
import { normalizeClinicDefaultItems } from './ClinicDefaultItemsEditor';

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
    items,
  };
}

export default function ClinicInlineWorksheet({
  session,
  group,
  students,
  academyProfile,
  onOpenRecord,
}) {
  const clinicRecords = useAcademyStore((state) => state.clinicRecords) ?? [];
  const addClinicRecord = useAcademyStore((state) => state.addClinicRecord);
  const updateClinicRecord = useAcademyStore((state) => state.updateClinicRecord);
  const setClinicRecordServerId = useAcademyStore((state) => state.setClinicRecordServerId);
  const showToast = useAcademyStore((state) => state.showToast);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authUserId = useAuthStore((state) => state.user?.id);
  const currentAcademyId = useWorkspaceStore((state) => state.currentAcademyId);
  const loadServerClinicRecords = useWorkspaceStore((state) => state.loadServerClinicRecords);
  const subject = group?.subject || '';
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
    const previousRecord = findPreviousRecord(clinicRecords, student.id, subject, date);
    return [student.id, buildStudentDraft({
      student,
      currentRecord,
      previousRecord,
      academyProfile,
      subject,
    })];
  }));

  const [drafts, setDrafts] = useState(buildDrafts);
  const [dirtyStudentIds, setDirtyStudentIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const studentKey = students.map((student) => student.id).join('|');

  useEffect(() => {
    setDrafts(buildDrafts());
    setDirtyStudentIds(new Set());
    // 회차나 명단이 바뀔 때만 초기화한다. 서버 목록 갱신으로 초안이 지워지면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, studentKey, subject]);

  const updateItem = (studentId, itemId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [studentId]: {
        ...current[studentId],
        items: current[studentId].items.map((item) => (
          item.id === itemId ? { ...item, [field]: value } : item
        )),
      },
    }));
    setDirtyStudentIds((current) => {
      const next = new Set(current);
      next.add(studentId);
      return next;
    });
  };

  const saveAll = async () => {
    if (saving || dirtyStudentIds.size === 0) return;
    const targetStudents = students.filter((student) => dirtyStudentIds.has(student.id));
    setSaving(true);
    let serverFailed = false;

    try {
      for (const student of targetStudents) {
        const draft = drafts[student.id];
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
          subject,
          activityType: existing?.activityType || academyProfile?.clinicDefaultActivityType || 'clinic',
          activityName: existing?.activityName || '',
          classGroupId: group?.id || '',
          classSessionId: session?.id || '',
          sourceLessonRecordId: existing?.sourceLessonRecordId || null,
          sourceSupportTags: existing?.sourceSupportTags || [],
          sourceSupportMemo: existing?.sourceSupportMemo || '',
          items,
          overallMemo: existing?.overallMemo || '',
          createdByRole: existing?.createdByRole || useAcademyStore.getState().role || '',
          createdById: existing?.createdById || authUserId || '',
        };

        let localRecord = existing;
        if (existing) {
          updateClinicRecord(existing.id, payload, { silent: true });
        } else {
          localRecord = addClinicRecord(payload, { silent: true });
        }

        if (!isAuthenticated || !currentAcademyId || !student.serverId) continue;
        const serverPayload = {
          student_id: student.serverId,
          class_group_id: group?.serverId || null,
          class_session_id: session?.serverId || null,
          date,
          subject: subject || null,
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
        try {
          if (existing?.serverId) {
            await updateServerClinicRecord(existing.serverId, serverPayload);
          } else {
            const created = await createAcademyClinicRecord({
              academyId: currentAcademyId,
              ...serverPayload,
            });
            if (created?.id && localRecord?.id) {
              setClinicRecordServerId(localRecord.id, created.id);
            }
          }
        } catch (error) {
          serverFailed = true;
          console.error('[supabase] inline clinic record sync failed', error);
        }
      }

      if (isAuthenticated && currentAcademyId) {
        try {
          await loadServerClinicRecords();
        } catch (error) {
          serverFailed = true;
          console.error('[supabase] clinic records refresh failed', error);
        }
      }
      setDirtyStudentIds(new Set());
      showToast(
        serverFailed
          ? '기록은 저장했지만 일부 서버 동기화에 실패했어요.'
          : `${targetStudents.length}명의 클리닉 기록을 저장했어요.`,
        serverFailed ? 'error' : 'success',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-gray-50 bg-[#F8FAFC] px-3 py-3 md:px-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold text-[#333D4B]">바로 기록</p>
          <p className="mt-0.5 text-[10px] font-medium text-[#8B95A1]">
            교재는 이어지고, 나머지는 이전 기록을 참고로만 보여줘요.
          </p>
        </div>
        <button
          type="button"
          onClick={saveAll}
          disabled={saving || dirtyStudentIds.size === 0}
          className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-xl bg-[#3182F6] px-3 text-xs font-bold text-white disabled:bg-[#D1D6DB]"
        >
          <Save size={13} />
          {saving ? '저장 중' : dirtyStudentIds.size > 0 ? `${dirtyStudentIds.size}명 저장` : '저장'}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {students.map((student) => {
          const draft = drafts[student.id];
          if (!draft) return null;
          const isDirty = dirtyStudentIds.has(student.id);
          return (
            <div key={student.id} className="rounded-2xl border border-[#E5E8EB] bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">
                    {student.name?.slice(0, 1) || '학'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold text-[#191F28]">{student.name}</span>
                    <span className={`mt-0.5 flex items-center gap-1 text-[10px] font-bold ${
                      isDirty
                        ? 'text-blue-600'
                        : student.clinicRecord
                          ? 'text-emerald-600'
                          : 'text-[#8B95A1]'
                    }`}>
                      {student.clinicRecord && !isDirty && <CheckCircle2 size={11} />}
                      {isDirty ? '저장 전' : student.clinicRecord ? '오늘 기록됨' : '작성 전'}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenRecord?.(student)}
                  className="flex h-8 items-center gap-1 rounded-xl bg-[#F2F4F6] px-2.5 text-[11px] font-bold text-[#6B7684]"
                >
                  <PencilLine size={12} />
                  상세
                </button>
              </div>

              <div className="grid gap-2 lg:grid-cols-2">
                {draft.items.map((item) => (
                  <div key={item.id} className="rounded-xl bg-[#F8FAFC] p-2.5">
                    <p className="mb-2 text-xs font-extrabold text-[#333D4B]">{item.title}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {configuredFields.has('materials') && (
                        <label className="min-w-0">
                          <span className="mb-1 block text-[10px] font-bold text-[#8B95A1]">교재</span>
                          <input
                            value={item.materialsText}
                            onChange={(event) => updateItem(student.id, item.id, 'materialsText', event.target.value)}
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
          );
        })}
      </div>
    </div>
  );
}
