import { useMemo, useState } from 'react';
import { Check, Search, Trash2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  ACADEMY_CALENDAR_CATEGORIES,
  getAcademyCalendarCategory,
} from '../../../constants/academyCalendar';
import { today } from '../../../utils/date';

const TARGET_OPTIONS = [
  { id: 'all', label: '학원 전체' },
  { id: 'school', label: '학교·학년' },
  { id: 'class', label: '반' },
  { id: 'student', label: '학생' },
];

function arrayOf(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function toggleItem(items, value) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function normalizedText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko');
}

function canonicalItems(values) {
  return [...new Set(arrayOf(values).map(String))].sort((left, right) => left.localeCompare(right));
}

function sameItems(left, right) {
  const a = canonicalItems(left);
  const b = canonicalItems(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function normalizedEvent(value) {
  return {
    category: value.category,
    title: normalizedText(value.title),
    startDate: value.startDate || value.start_date,
    endDate: value.endDate || value.end_date,
    allDay: value.allDay ?? value.all_day ?? true,
    startTime: String(value.startTime || value.start_time || '').slice(0, 5),
    endTime: String(value.endTime || value.end_time || '').slice(0, 5),
    targetType: value.targetType || value.target_type || 'all',
    schoolNames: value.schoolNames || value.school_names || [],
    grades: value.grades || [],
    classGroupIds: value.classGroupIds || value.class_group_ids || [],
    studentIds: value.studentIds || value.student_ids || [],
  };
}

function isExactDuplicate(leftValue, rightValue) {
  const left = normalizedEvent(leftValue);
  const right = normalizedEvent(rightValue);
  return left.category === right.category
    && left.title === right.title
    && left.startDate === right.startDate
    && left.endDate === right.endDate
    && left.allDay === right.allDay
    && (left.allDay || (left.startTime === right.startTime && left.endTime === right.endTime))
    && left.targetType === right.targetType
    && sameItems(left.schoolNames, right.schoolNames)
    && sameItems(left.grades, right.grades)
    && sameItems(left.classGroupIds, right.classGroupIds)
    && sameItems(left.studentIds, right.studentIds);
}

function audienceOf(value, students, groups) {
  const event = normalizedEvent(value);
  if (event.targetType === 'all') return { all: true, ids: new Set() };
  if (event.targetType === 'student') return { all: false, ids: new Set(event.studentIds) };
  if (event.targetType === 'class') {
    const groupIds = new Set(event.classGroupIds);
    return {
      all: false,
      ids: new Set(groups
        .filter((group) => groupIds.has(group.serverId || group.id))
        .flatMap((group) => group.studentIds || [])),
    };
  }
  const schoolNames = new Set(event.schoolNames);
  const grades = new Set(event.grades);
  return {
    all: false,
    ids: new Set(students
      .filter((student) => (
        (schoolNames.size === 0 || schoolNames.has(student.school))
        && (grades.size === 0 || grades.has(student.grade))
      ))
      .map((student) => student.serverId || student.id)),
  };
}

function targetsOverlap(leftValue, rightValue, students, groups) {
  const left = normalizedEvent(leftValue);
  const right = normalizedEvent(rightValue);
  if (left.targetType === 'all' || right.targetType === 'all') return true;
  const leftAudience = audienceOf(left, students, groups);
  const rightAudience = audienceOf(right, students, groups);
  if ([...leftAudience.ids].some((id) => rightAudience.ids.has(id))) return true;

  // 학생 정보가 아직 없는 초기 학원에서도 동일 선택값은 정확하게 겹침으로 본다.
  if (left.targetType !== right.targetType) return false;
  if (left.targetType === 'school') {
    const schoolCompatible = left.schoolNames.length === 0 || right.schoolNames.length === 0
      || left.schoolNames.some((name) => right.schoolNames.includes(name));
    const gradeCompatible = left.grades.length === 0 || right.grades.length === 0
      || left.grades.some((grade) => right.grades.includes(grade));
    return schoolCompatible && gradeCompatible;
  }
  if (left.targetType === 'class') return left.classGroupIds.some((id) => right.classGroupIds.includes(id));
  return left.studentIds.some((id) => right.studentIds.includes(id));
}

function timesOverlap(leftValue, rightValue) {
  const left = normalizedEvent(leftValue);
  const right = normalizedEvent(rightValue);
  if (left.allDay || right.allDay) return true;
  return left.startTime < right.endTime && right.startTime < left.endTime;
}

function targetLabel(type, form, students, groups) {
  if (type === 'school') {
    const values = [...form.schoolNames, ...form.grades];
    return values.length ? values.join(' · ') : '학교 또는 학년을 골라주세요';
  }
  if (type === 'class') {
    const names = groups.filter((group) => form.classGroupIds.includes(group.serverId || group.id)).map((group) => group.name);
    return names.length ? `${names.slice(0, 2).join(' · ')}${names.length > 2 ? ` 외 ${names.length - 2}개` : ''}` : '반을 골라주세요';
  }
  if (type === 'student') {
    const names = students.filter((student) => form.studentIds.includes(student.serverId || student.id)).map((student) => student.name);
    return names.length ? `${names.slice(0, 2).join(' · ')}${names.length > 2 ? ` 외 ${names.length - 2}명` : ''}` : '학생을 골라주세요';
  }
  return '모든 직원이 함께 확인해요';
}

export default function AcademyCalendarEventModal({
  event = null,
  initialDate,
  canEdit = true,
  canManageClasses = false,
  classSchedules = [],
  onClose,
}) {
  const students = useAcademyStore((state) => state.academyStudents) ?? [];
  const groups = useAcademyStore((state) => state.classGroups) ?? [];
  const showToast = useAcademyStore((state) => state.showToast);
  const saveEvent = useWorkspaceStore((state) => state.saveAcademyCalendarEventLocal);
  const deleteEvent = useWorkspaceStore((state) => state.deleteAcademyCalendarEventLocal);
  const existingEvents = useWorkspaceStore((state) => state.academyCalendarEvents) ?? [];

  const [form, setForm] = useState(() => ({
    category: event?.category || 'school_exam',
    title: event?.title || '',
    startDate: event?.start_date || initialDate || today(),
    endDate: event?.end_date || initialDate || today(),
    allDay: event?.all_day !== false,
    startTime: event?.start_time?.slice(0, 5) || '16:00',
    endTime: event?.end_time?.slice(0, 5) || '17:00',
    targetType: event?.target_type || 'all',
    schoolNames: arrayOf(event?.school_names),
    grades: arrayOf(event?.grades),
    classGroupIds: arrayOf(event?.class_group_ids),
    studentIds: arrayOf(event?.student_ids),
    memo: event?.memo || '',
    affectsClasses: event?.affects_classes === true,
    impactClassGroupIds: arrayOf(event?.impact_class_group_ids),
  }));
  const [studentSearch, setStudentSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const activeStudents = useMemo(() => students
    .filter((student) => (student.status || 'active') !== 'inactive')
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ko')),
  [students]);
  const schools = useMemo(() => [...new Set(activeStudents.map((student) => student.school?.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ko')), [activeStudents]);
  const grades = useMemo(() => [...new Set(activeStudents.map((student) => student.grade?.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ko', { numeric: true })), [activeStudents]);
  const visibleStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return activeStudents;
    return activeStudents.filter((student) => [student.name, student.school, student.grade]
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }, [activeStudents, studentSearch]);
  const activeGroups = useMemo(() => groups.filter((group) => group.status !== 'inactive'), [groups]);

  const affectedSchedules = useMemo(() => {
    if (!form.affectsClasses) return [];
    const selectedIds = new Set(form.impactClassGroupIds);
    return classSchedules.filter((schedule) => {
      if (!schedule.date || schedule.date < form.startDate || schedule.date > form.endDate) return false;
      if (['completed', 'canceled', 'cancelled'].includes(schedule.status)) return false;
      if (selectedIds.size === 0) return true;
      return selectedIds.has(schedule.classGroupId) || selectedIds.has(schedule.classGroupServerId);
    });
  }, [classSchedules, form.affectsClasses, form.endDate, form.impactClassGroupIds, form.startDate]);
  const eventConflicts = useMemo(() => existingEvents
    .filter((item) => item.id !== event?.id && item.category === form.category)
    .map((item) => {
      if (isExactDuplicate(form, item)) return { event: item, kind: 'exact' };
      const datesOverlap = item.start_date <= form.endDate && item.end_date >= form.startDate;
      if (datesOverlap
        && timesOverlap(form, item)
        && targetsOverlap(form, item, activeStudents, activeGroups)) {
        return { event: item, kind: 'overlap' };
      }
      return null;
    })
    .filter(Boolean), [activeGroups, activeStudents, event?.id, existingEvents, form]);
  const exactDuplicate = eventConflicts.find((conflict) => conflict.kind === 'exact') || null;
  const partialConflicts = eventConflicts.filter((conflict) => conflict.kind === 'overlap');

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const category = getAcademyCalendarCategory(form.category);
  const selectionSummary = targetLabel(form.targetType, form, activeStudents, activeGroups);

  const validate = () => {
    if (!form.title.trim()) return '일정 이름을 입력해주세요.';
    if (!form.startDate || !form.endDate || form.endDate < form.startDate) return '일정 날짜를 확인해주세요.';
    if (!form.allDay && (!form.startTime || !form.endTime || form.endTime <= form.startTime)) return '종료 시간은 시작 시간보다 늦어야 해요.';
    if (form.targetType === 'school' && form.schoolNames.length === 0 && form.grades.length === 0) return '학교 또는 학년을 골라주세요.';
    if (form.targetType === 'class' && form.classGroupIds.length === 0) return '반을 한 개 이상 골라주세요.';
    if (form.targetType === 'student' && form.studentIds.length === 0) return '학생을 한 명 이상 골라주세요.';
    if (!form.allDay && form.affectsClasses) return '시간 지정 일정은 수업 휴강과 연결할 수 없어요.';
    if (form.affectsClasses && !canManageClasses) return '수업을 휴강 처리할 권한이 없어요.';
    return null;
  };

  const persist = async () => {
    const message = validate();
    if (message) {
      showToast(message, 'error');
      return;
    }
    if (exactDuplicate) {
      showToast('이미 같은 일정이 있어요. 기존 일정을 확인해주세요.', 'error');
      return;
    }
    if (form.affectsClasses && confirmAction !== 'save') {
      setConfirmAction('save');
      return;
    }
    setSaving(true);
    try {
      await saveEvent({
        id: event?.id || null,
        event: {
          category: form.category,
          title: form.title.trim(),
          start_date: form.startDate,
          end_date: form.endDate,
          all_day: form.allDay,
          start_time: form.allDay ? null : form.startTime,
          end_time: form.allDay ? null : form.endTime,
          target_type: form.targetType,
          school_names: form.targetType === 'school' ? form.schoolNames : [],
          grades: form.targetType === 'school' ? form.grades : [],
          class_group_ids: form.targetType === 'class' ? form.classGroupIds : [],
          student_ids: form.targetType === 'student' ? form.studentIds : [],
          memo: form.memo.trim() || null,
          visibility: 'internal',
          // 현재 회차 예외는 반+날짜 단위다. 시간 일정까지 연결하면 같은 날의
          // 다른 수업도 함께 휴강될 수 있으므로 종일 일정만 안전하게 연결한다.
          affects_classes: form.allDay && form.affectsClasses,
          impact_class_group_ids: form.allDay && form.affectsClasses ? form.impactClassGroupIds : [],
          source: 'manual',
        },
      });
      showToast(event ? '일정을 수정했어요.' : '일정을 추가했어요.');
      onClose();
    } catch (error) {
      showToast(error?.message || '일정을 저장하지 못했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event?.id) return;
    if (confirmAction !== 'delete') {
      setConfirmAction('delete');
      return;
    }
    setSaving(true);
    try {
      await deleteEvent(event.id);
      showToast(event.affects_classes ? '일정을 삭제하고 연결된 휴강을 복구했어요.' : '일정을 삭제했어요.');
      onClose();
    } catch (error) {
      showToast(error?.message || '일정을 삭제하지 못했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={event ? '일정 보기' : '일정 추가'}
      size="wide"
      footer={canEdit ? (
        <div className="flex gap-2">
          {event?.id && (
            <button type="button" disabled={saving} onClick={remove} className={`h-12 rounded-2xl px-4 text-sm font-extrabold ${confirmAction === 'delete' ? 'bg-red-500 text-white' : 'bg-[#F2F4F6] text-red-500'}`}>
              <Trash2 size={16} className="inline -translate-y-px" /> {confirmAction === 'delete' ? '정말 삭제' : '삭제'}
            </button>
          )}
          <button type="button" disabled={saving} onClick={persist} className={`h-12 flex-1 rounded-2xl text-sm font-extrabold text-white ${confirmAction === 'save' ? 'bg-[#E5484D]' : 'bg-[#0064FF]'} disabled:opacity-50`}>
            {saving ? '저장 중…' : confirmAction === 'save' ? `${affectedSchedules.length}개 수업 휴강 확정` : event ? '저장' : '추가'}
          </button>
        </div>
      ) : null}
    >
      <div className="space-y-5">
        {!canEdit && (
          <div className="rounded-2xl bg-[#F2F4F6] px-4 py-3 text-sm font-semibold text-[#4E5968]">다른 직원이 만든 일정이에요. 내용만 확인할 수 있어요.</div>
        )}

        <section>
          <p className="mb-2 text-xs font-extrabold text-[#6B7684]">종류</p>
          <div className="grid grid-cols-3 gap-2">
            {ACADEMY_CALENDAR_CATEGORIES.map((item) => (
              <button key={item.id} type="button" disabled={!canEdit} onClick={() => setField('category', item.id)} className={`min-h-14 rounded-2xl border px-2 py-2 text-xs font-extrabold ${form.category === item.id ? 'border-[#3182F6] bg-[#EDF5FF] text-[#0064FF]' : 'border-[#E5E8EB] bg-white text-[#4E5968]'}`}>
                <span className="mr-1">{item.emoji}</span>{item.label}
              </button>
            ))}
          </div>
        </section>

        <label className="block">
          <span className="mb-2 block text-xs font-extrabold text-[#6B7684]">일정 이름</span>
          <input disabled={!canEdit} value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder={`예: ${category.label}`} className="h-12 w-full rounded-2xl border border-[#D1D6DB] px-4 text-base font-bold text-[#191F28] outline-none focus:border-[#3182F6] disabled:bg-[#F7F8FA]" />
        </label>

        {exactDuplicate && (
          <div className="rounded-2xl bg-red-50 px-4 py-3">
            <p className="text-xs font-extrabold text-red-700">이미 완전히 같은 일정이 있어요.</p>
            <p className="mt-1 truncate text-xs font-semibold text-red-600">{exactDuplicate.event.title} · 중복 저장할 수 없어요.</p>
          </div>
        )}
        {!exactDuplicate && partialConflicts.length > 0 && (
          <div className="rounded-2xl bg-amber-50 px-4 py-3">
            <p className="text-xs font-extrabold text-amber-800">같은 대상과 기간이 겹치는 {category.label} 일정이 {partialConflicts.length}개 있어요.</p>
            <p className="mt-1 truncate text-xs font-semibold text-amber-700">{partialConflicts.slice(0, 2).map((conflict) => conflict.event.title).join(' · ')}</p>
          </div>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-extrabold text-[#6B7684]">언제인가요?</p>
            <button type="button" disabled={!canEdit} onClick={() => {
              const nextAllDay = !form.allDay;
              setForm((current) => ({
                ...current,
                allDay: nextAllDay,
                affectsClasses: nextAllDay ? current.affectsClasses : false,
              }));
              setConfirmAction(null);
            }} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${form.allDay ? 'bg-[#E8F3FF] text-[#0064FF]' : 'bg-[#F2F4F6] text-[#6B7684]'}`}>{form.allDay ? '종일' : '시간 지정'}</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input disabled={!canEdit} type="date" value={form.startDate} onChange={(e) => { setField('startDate', e.target.value); if (e.target.value > form.endDate) setField('endDate', e.target.value); }} className="h-12 rounded-2xl border border-[#D1D6DB] px-3 text-sm font-bold outline-none focus:border-[#3182F6]" />
            <input disabled={!canEdit} type="date" value={form.endDate} min={form.startDate} onChange={(e) => setField('endDate', e.target.value)} className="h-12 rounded-2xl border border-[#D1D6DB] px-3 text-sm font-bold outline-none focus:border-[#3182F6]" />
          </div>
          {!form.allDay && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input disabled={!canEdit} type="time" value={form.startTime} onChange={(e) => setField('startTime', e.target.value)} className="h-12 rounded-2xl border border-[#D1D6DB] px-3 text-sm font-bold outline-none focus:border-[#3182F6]" />
              <input disabled={!canEdit} type="time" value={form.endTime} onChange={(e) => setField('endTime', e.target.value)} className="h-12 rounded-2xl border border-[#D1D6DB] px-3 text-sm font-bold outline-none focus:border-[#3182F6]" />
            </div>
          )}
        </section>

        <section>
          <p className="mb-2 text-xs font-extrabold text-[#6B7684]">누구에게 해당하나요?</p>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {TARGET_OPTIONS.map((option) => (
              <button key={option.id} type="button" disabled={!canEdit} onClick={() => setField('targetType', option.id)} className={`flex-shrink-0 rounded-full border px-4 py-2 text-xs font-extrabold ${form.targetType === option.id ? 'border-[#3182F6] bg-[#3182F6] text-white' : 'border-[#E5E8EB] bg-white text-[#4E5968]'}`}>{option.label}</button>
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold text-[#8B95A1]">{selectionSummary}</p>

          {form.targetType === 'school' && (
            <div className="mt-3 space-y-3 rounded-2xl bg-[#F7F8FA] p-3">
              <ChoiceChips label="학교" values={schools} selected={form.schoolNames} disabled={!canEdit} onToggle={(value) => setField('schoolNames', toggleItem(form.schoolNames, value))} empty="등록된 학교가 없어요" />
              <ChoiceChips label="학년" values={grades} selected={form.grades} disabled={!canEdit} onToggle={(value) => setField('grades', toggleItem(form.grades, value))} empty="등록된 학년이 없어요" />
            </div>
          )}
          {form.targetType === 'class' && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {activeGroups.map((group) => {
                const id = group.serverId || group.id;
                return <SelectCard key={id} selected={form.classGroupIds.includes(id)} disabled={!canEdit} onClick={() => setField('classGroupIds', toggleItem(form.classGroupIds, id))} title={group.name} subtitle={[group.subject, group.level].filter(Boolean).join(' · ')} />;
              })}
            </div>
          )}
          {form.targetType === 'student' && (
            <div className="mt-3 rounded-2xl bg-[#F7F8FA] p-3">
              <div className="flex h-11 items-center gap-2 rounded-xl bg-white px-3">
                <Search size={15} className="text-[#8B95A1]" />
                <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="이름·학교·학년 검색" className="min-w-0 flex-1 text-sm font-semibold outline-none" />
              </div>
              <div className="mt-2 max-h-56 divide-y divide-[#E5E8EB] overflow-y-auto">
                {visibleStudents.map((student) => {
                  const id = student.serverId || student.id;
                  const selected = form.studentIds.includes(id);
                  return (
                    <button key={id} type="button" disabled={!canEdit} onClick={() => setField('studentIds', toggleItem(form.studentIds, id))} className="flex w-full items-center gap-3 py-3 text-left">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${selected ? 'bg-[#3182F6] text-white' : 'border border-[#D1D6DB] text-transparent'}`}><Check size={14} /></span>
                      <span className="min-w-0"><strong className="block truncate text-sm text-[#333D4B]">{student.name}</strong><small className="text-[#8B95A1]">{[student.school, student.grade].filter(Boolean).join(' · ')}</small></span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {canManageClasses && form.allDay && (
          <section className={`rounded-3xl border p-4 ${form.affectsClasses ? 'border-red-200 bg-red-50' : 'border-[#E5E8EB] bg-white'}`}>
            <button type="button" disabled={!canEdit} onClick={() => { setField('affectsClasses', !form.affectsClasses); setConfirmAction(null); }} className="flex w-full items-center justify-between text-left">
              <span><strong className="block text-sm text-[#191F28]">이 기간에는 수업도 쉬어요</strong><small className="mt-1 block text-[#8B95A1]">해당 회차를 휴강으로 연결해요.</small></span>
              <span className={`h-7 w-12 rounded-full p-1 transition ${form.affectsClasses ? 'bg-red-500' : 'bg-[#D1D6DB]'}`}><span className={`block h-5 w-5 rounded-full bg-white transition ${form.affectsClasses ? 'translate-x-5' : ''}`} /></span>
            </button>
            {form.affectsClasses && (
              <div className="mt-4 border-t border-red-100 pt-4">
                <p className="text-xs font-extrabold text-[#6B7684]">적용할 반 <span className="font-semibold text-[#8B95A1]">· 선택하지 않으면 전체</span></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeGroups.map((group) => {
                    const id = group.serverId || group.id;
                    const selected = form.impactClassGroupIds.includes(id);
                    return <button key={id} type="button" disabled={!canEdit} onClick={() => { setField('impactClassGroupIds', toggleItem(form.impactClassGroupIds, id)); setConfirmAction(null); }} className={`rounded-full px-3 py-2 text-xs font-extrabold ${selected ? 'bg-red-500 text-white' : 'bg-white text-[#4E5968]'}`}>{group.name}</button>;
                  })}
                </div>
                <p className="mt-3 text-xs font-bold text-red-600">현재 화면 기준 {affectedSchedules.length}개 수업이 휴강돼요. 저장 직전 한 번 더 확인합니다.</p>
                {form.category === 'academy_break' && (
                  <p className="mt-2 text-[11px] font-semibold leading-5 text-[#8B95A1]">
                    수업에서 이어지는 클리닉은 함께 쉬어요. 별도로 만든 클리닉 일정과 직원 근무는 각각의 일정에서 관리해요.
                  </p>
                )}
              </div>
            )}
          </section>
        )}
        {canManageClasses && !form.allDay && (
          <div className="rounded-2xl bg-[#F2F4F6] px-4 py-3 text-xs font-semibold leading-5 text-[#6B7684]">
            시간 지정 일정은 일정표에만 표시돼요. 현재 회차 구조상 휴강은 종일 일정에서만 안전하게 연결할 수 있어요.
          </div>
        )}

        <label className="block">
          <span className="mb-2 block text-xs font-extrabold text-[#6B7684]">메모 <span className="font-semibold text-[#B0B8C1]">선택</span></span>
          <textarea disabled={!canEdit} value={form.memo} onChange={(e) => setField('memo', e.target.value)} rows={3} placeholder="직원끼리 확인할 내용을 적어주세요." className="w-full resize-none rounded-2xl border border-[#D1D6DB] p-4 text-sm font-semibold outline-none focus:border-[#3182F6] disabled:bg-[#F7F8FA]" />
        </label>
      </div>
    </Modal>
  );
}

function ChoiceChips({ label, values, selected, disabled, onToggle, empty }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-extrabold text-[#6B7684]">{label}</p>
      {values.length === 0 ? <p className="text-xs text-[#8B95A1]">{empty}</p> : (
        <div className="flex flex-wrap gap-2">{values.map((value) => <button key={value} type="button" disabled={disabled} onClick={() => onToggle(value)} className={`rounded-full px-3 py-2 text-xs font-extrabold ${selected.includes(value) ? 'bg-[#3182F6] text-white' : 'bg-white text-[#4E5968]'}`}>{value}</button>)}</div>
      )}
    </div>
  );
}

function SelectCard({ selected, disabled, onClick, title, subtitle }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left ${selected ? 'border-[#3182F6] bg-[#EDF5FF]' : 'border-[#E5E8EB] bg-white'}`}>
      <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${selected ? 'bg-[#3182F6] text-white' : 'border border-[#D1D6DB] text-transparent'}`}><Check size={14} /></span>
      <span className="min-w-0"><strong className="block truncate text-sm text-[#191F28]">{title}</strong>{subtitle && <small className="block truncate text-[#8B95A1]">{subtitle}</small>}</span>
    </button>
  );
}
