import { useState, useEffect, useMemo, useRef } from 'react';
import { Check, Pencil } from 'lucide-react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyStudent,
  updateStudent,
  assignStudentToClassGroupsGuarded,
} from '../../../services/supabase/domainApi';
import { formatKoreanCurrency, formatPhoneNumber } from '../../../utils/format';
import { getDaysInMonth, getTodayYMD } from '../../../utils/date';
import { getSchoolTagStyle } from '../../../utils/schoolTags';
import { STUDENT_STATUS_OPTIONS } from '../../../utils/studentStatus';
import { readAttendanceSettings } from '../attendance/attendanceHelpers';
import {
  ACADEMY_SUBJECT_OPTIONS,
  DEFAULT_ACADEMY_SETTINGS,
} from '../../../constants/academySettings';
import {
  calculateSuggestedStudentTuition,
  getAcademicYearForMonth,
  isSubjectTuitionMode,
  projectStudentGrade,
} from '../../../utils/studentBilling';
import { createClientUuid } from '../../../utils/uuid';

const SCHOOL_TYPES = [
  { id: 'elementary', label: '초등' },
  { id: 'middle',     label: '중학교' },
  { id: 'high',       label: '고등학교' },
  { id: 'university', label: '대학생' },
  { id: 'adult',      label: '성인' },
  { id: 'other',      label: '기타' },
];

const GRADE_OPTIONS = {
  elementary: ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년'],
  middle:     ['1학년', '2학년', '3학년'],
  high:       ['1학년', '2학년', '3학년'],
  university: ['1학년', '2학년', '3학년', '4학년'],
  adult:      [],
  other:      [],
};

// 학부모 호칭 옵션 — parentTitle 값 + label
const PARENT_TITLE_OPTIONS = [
  { value: 'mother',   label: '어머님' },
  { value: 'father',   label: '아버님' },
  { value: 'guardian', label: '보호자님' },
  { value: 'custom',   label: '직접 입력' },
];

const PARENT_TITLE_LABEL = {
  mother:   '어머님',
  father:   '아버님',
  guardian: '보호자님',
  parent:   '학부모님',
};

// 기존 parentName(자유 입력)에서 호칭만 역추출 — 마이그레이션용
function inferParentTitle(parentName, studentName) {
  if (!parentName) return '';
  if (parentName.includes('아버님') || parentName.includes('아버지')) return 'father';
  if (parentName.includes('보호자')) return 'guardian';
  if (parentName.includes('학부모')) return 'parent';
  if (parentName.includes('어머님') || parentName.includes('어머니')) return 'mother';
  return '';
}

export function buildParentDisplayName(studentName, parentTitle, parentTitleCustom = '') {
  const title = parentTitle === 'custom'
    ? String(parentTitleCustom || '').trim()
    : PARENT_TITLE_LABEL[parentTitle];
  if (!title) return '';
  const trimmed = (studentName || '').trim();
  return trimmed ? `${trimmed} ${title}` : title;
}

function currentAcademicYear() {
  return getAcademicYearForMonth(getTodayYMD().slice(0, 7));
}

// 빈 문자열을 null 로 정리. Supabase nullable 컬럼과 호환.
function emptyToNull(v) {
  if (v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
}

function lastFourDigits(...values) {
  for (const value of values) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(-4);
  }
  return '';
}

function normalizePin(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function normalizePinOrEmpty(value) {
  const pin = normalizePin(value);
  return pin.length === 4 ? pin : '';
}

function normalizeGradeForSchoolType(value, schoolType) {
  const options = GRADE_OPTIONS[schoolType] || [];
  if (!options.length || !value) return value || '';
  if (options.includes(value)) return value;
  const gradeNumber = String(value).match(/[1-6]/)?.[0];
  const normalized = gradeNumber ? `${gradeNumber}학년` : '';
  return options.includes(normalized) ? normalized : '';
}

// camelCase 학생 폼 → Supabase students 테이블 snake_case payload.
// id / academy_id / user_id / mode 는 createAcademyStudent 가 자동 주입.
// class_group_ids 는 폼이 관리하지 않으므로 입력에 명시적으로 있을 때만 포함
// (update 시 빈 배열로 서버의 기존 매핑을 덮어쓰지 않도록).
function mapAcademyStudentFormToServerPayload(form) {
  const payload = {
    name: form.name?.trim() ?? '',
    school_type: emptyToNull(form.schoolType),
    school_name: emptyToNull(form.school),
    grade: emptyToNull(form.grade),
    grade_reference_year: form.gradeReferenceYear || null,
    phone: emptyToNull(form.phone),
    parent_phone: emptyToNull(form.parentPhone),
    parent_title: emptyToNull(form.parentTitle),
    parent_title_custom: form.parentTitle === 'custom'
      ? emptyToNull(String(form.parentTitleCustom || '').trim())
      : null,
    parent_name: emptyToNull(form.parentName),
    checkin_pin: emptyToNull(normalizePinOrEmpty(form.checkinPin)),
    enrollment_date: emptyToNull(form.enrollmentDate),
    base_tuition: Math.max(0, Number(form.baseTuition) || 0),
    tuition_subjects: Array.isArray(form.tuitionSubjects) ? form.tuitionSubjects : [],
    tuition_source: form.tuitionSource === 'custom' ? 'custom' : 'academy_rate',
    tuition_effective_from: emptyToNull(form.tuitionEffectiveFrom || form.enrollmentDate),
    tuition_effective_to: emptyToNull(form.tuitionEffectiveTo),
    status: form.status || 'active',
    memo: emptyToNull(form.memo),
  };
  if (Array.isArray(form.classGroupIds)) {
    payload.class_group_ids = form.classGroupIds;
  }
  return payload;
}

export default function AcademyStudentFormModal({ editStudent, onClose }) {
  const {
    addAcademyStudent, updateAcademyStudent, setAcademyStudentServerId,
    assignAcademyStudentToClassGroups,
    classGroups, academyStudents, academyProfile,
    showToast,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const loadServerStudents = useWorkspaceStore((s) => s.loadServerStudents);
  const loadServerClassGroups = useWorkspaceStore((s) => s.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const isEdit = !!editStudent;
  const currentAcademy = memberships.find((membership) => membership.academy_id === currentAcademyId)?.academy || null;
  const showCheckinPin = readAttendanceSettings(currentAcademy).studentCheckMethod === 'qr';
  const configuredSubjectsValue = currentAcademy?.academy_subjects
    || academyProfile?.academySubjects
    || DEFAULT_ACADEMY_SETTINGS.academySubjects;
  const configuredSubjectIds = (Array.isArray(configuredSubjectsValue) ? configuredSubjectsValue : [])
    .filter((subjectId) => ACADEMY_SUBJECT_OPTIONS.some((option) => option.id === subjectId));
  const editStudentAliases = new Set(
    [editStudent?.id, editStudent?.serverId].filter(Boolean),
  );
  const inferredTuitionSubjects = [...new Set(
    classGroups
      .filter((group) => (
        group.feePolicy !== 'additional'
        && (group.studentIds || []).some((studentId) => editStudentAliases.has(studentId))
      ))
      .map((group) => ACADEMY_SUBJECT_OPTIONS.find(
        (option) => option.id === group.subject || option.label === group.subject,
      )?.id)
      .filter(Boolean),
  )];
  const initialTuitionSubjects = editStudent?.tuitionSubjects?.length
    ? editStudent.tuitionSubjects
    : inferredTuitionSubjects.length > 0
      ? inferredTuitionSubjects
      : (configuredSubjectIds.length === 1 ? configuredSubjectIds : []);

  const [form, setForm] = useState({
    name: editStudent?.name || '',
    schoolType: editStudent?.schoolType || '',
    school: editStudent?.school || editStudent?.schoolName || '',
    grade: normalizeGradeForSchoolType(editStudent?.grade, editStudent?.schoolType),
    gradeReferenceYear: editStudent?.gradeReferenceYear || currentAcademicYear(),
    phone: editStudent?.phone || '',
    parentTitle: editStudent?.parentTitle === 'parent'
      ? 'guardian'
      : (editStudent?.parentTitle || inferParentTitle(editStudent?.parentName, editStudent?.name)),
    parentTitleCustom: editStudent?.parentTitleCustom || '',
    parentPhone: editStudent?.parentPhone || '',
    checkinPin: editStudent?.checkinPin || '',
    enrollmentDate: editStudent?.enrollmentDate || (isEdit ? '' : getTodayYMD()),
    baseTuition: editStudent?.baseTuition ? String(editStudent.baseTuition) : '',
    tuitionSubjects: initialTuitionSubjects,
    tuitionSource: editStudent?.tuitionSource || 'academy_rate',
    tuitionEffectiveFrom: editStudent?.tuitionEffectiveFrom
      || editStudent?.enrollmentDate
      || (isEdit ? '' : getTodayYMD()),
    tuitionEffectiveTo: editStudent?.tuitionEffectiveTo || '',
    status: editStudent?.status || 'active',
    memo: editStudent?.memo || '',
  });

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [phase, setPhase] = useState('form');
  const [submitting, setSubmitting] = useState(false);
  const [createdStudent, setCreatedStudent] = useState(null);
  const [selectedClassGroupIds, setSelectedClassGroupIds] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [isEditingSchool, setIsEditingSchool] = useState(
    () => !(editStudent?.school || editStudent?.schoolName),
  );
  const schoolInputRef = useRef(null);
  const createStudentRequestIdRef = useRef(createClientUuid());
  const schoolNames = useMemo(
    () => [...new Set(
      academyStudents
        .map((student) => String(student.school || student.schoolName || '').trim())
        .filter(Boolean),
    )],
    [academyStudents],
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const tuitionRates = currentAcademy?.tuition_rates
    || academyProfile?.tuitionRates
    || DEFAULT_ACADEMY_SETTINGS.tuitionRates;
  const tuitionPolicy = currentAcademy?.tuition_policy
    || academyProfile?.tuitionPolicy
    || DEFAULT_ACADEMY_SETTINGS.tuitionPolicy;
  const suggestedBaseTuition = useMemo(() => calculateSuggestedStudentTuition({
    tuitionRates,
    tuitionPolicy,
    schoolType: form.schoolType,
    grade: form.grade,
    gradeReferenceYear: form.gradeReferenceYear,
    subjectIds: form.tuitionSubjects,
  }), [
    tuitionRates,
    tuitionPolicy,
    form.schoolType,
    form.grade,
    form.gradeReferenceYear,
    form.tuitionSubjects,
  ]);
  const automaticTuitionIssue = useMemo(() => {
    if (form.tuitionSource !== 'academy_rate') return '';
    if (!form.schoolType) return '학교 구분을 선택하면 가격표를 적용할 수 있어요.';
    if (['elementary', 'middle', 'high'].includes(form.schoolType) && !form.grade) {
      return '학년을 선택하면 정확한 가격을 계산할 수 있어요.';
    }
    if (isSubjectTuitionMode(tuitionRates) && form.tuitionSubjects.length === 0) {
      return '수강 과목을 한 개 이상 선택해주세요.';
    }
    if (suggestedBaseTuition <= 0) return '해당 조건의 가격표가 비어 있어요. 학원 설정을 확인해주세요.';
    return '';
  }, [form.tuitionSource, form.schoolType, form.grade, form.tuitionSubjects, tuitionRates, suggestedBaseTuition]);

  useEffect(() => {
    if (form.tuitionSource !== 'academy_rate') return;
    const next = suggestedBaseTuition > 0 ? String(suggestedBaseTuition) : '';
    setForm((current) => current.baseTuition === next ? current : { ...current, baseTuition: next });
  }, [form.tuitionSource, suggestedBaseTuition]);

  const toggleTuitionSubject = (subjectId) => {
    setForm((current) => ({
      ...current,
      tuitionSubjects: current.tuitionSubjects.includes(subjectId)
        ? current.tuitionSubjects.filter((id) => id !== subjectId)
        : [...current.tuitionSubjects, subjectId],
    }));
  };

  const handleSchoolTypeChange = (type) => {
    if (form.schoolType !== type) setIsEditingSchool(true);
    setForm((f) => ({
      ...f,
      schoolType: type,
      grade: f.schoolType === type ? f.grade : '',
      gradeReferenceYear: f.schoolType === type ? f.gradeReferenceYear : currentAcademicYear(),
      school: f.schoolType === type ? f.school : '',
    }));
  };

  const gradeOptions = GRADE_OPTIONS[form.schoolType] || [];
  const showGradeButtons = form.schoolType && form.schoolType !== 'adult' && form.schoolType !== 'other' && gradeOptions.length > 0;
  const showSchoolName = form.schoolType && form.schoolType !== 'adult';
  const academicYear = currentAcademicYear();
  const nextAcademicYear = academicYear + 1;
  const nextMarchMonth = `${nextAcademicYear}-03`;
  const nextGrade = projectStudentGrade({
    schoolType: form.schoolType,
    grade: form.grade,
    gradeReferenceYear: form.gradeReferenceYear,
    targetMonth: nextMarchMonth,
  });
  const nextSuggestedTuition = calculateSuggestedStudentTuition({
    tuitionRates,
    tuitionPolicy,
    schoolType: form.schoolType,
    grade: form.grade,
    gradeReferenceYear: form.gradeReferenceYear,
    targetMonth: nextMarchMonth,
    subjectIds: form.tuitionSubjects,
  });
  const academicYearEnd = `${nextAcademicYear}-02-${String(
    getDaysInMonth(nextAcademicYear, 2),
  ).padStart(2, '0')}`;

  const filteredSuggestions = form.school.trim()
    ? schoolNames.filter((s) => s.includes(form.school) && s !== form.school)
    : schoolNames.filter(Boolean).slice(0, 5);

  const commitSchoolName = () => {
    const schoolName = form.school.trim();
    set('school', schoolName);
    setShowSuggestions(false);
    if (schoolName) setIsEditingSchool(false);
  };

  const editSchoolName = () => {
    setIsEditingSchool(true);
    requestAnimationFrame(() => {
      schoolInputRef.current?.focus();
      schoolInputRef.current?.select();
    });
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!form.name.trim()) return alert('이름을 입력해주세요.');
    if (form.parentTitle === 'custom' && !form.parentTitleCustom.trim()) {
      return alert('직접 사용할 학부모 호칭을 입력해주세요.');
    }
    if (form.tuitionSource === 'custom' && form.baseTuition === '') {
      return alert('학생별 학원비를 입력해주세요. 0원도 직접 입력할 수 있어요.');
    }
    if (
      form.tuitionEffectiveFrom
      && form.tuitionEffectiveTo
      && form.tuitionEffectiveTo < form.tuitionEffectiveFrom
    ) {
      return alert('수강료 적용 종료일은 시작일보다 뒤여야 해요.');
    }
    const trimmedName = form.name.trim();
    const parentDisplayName = buildParentDisplayName(
      trimmedName,
      form.parentTitle,
      form.parentTitleCustom,
    );
    const resolvedCheckinPin = normalizePinOrEmpty(form.checkinPin)
      || lastFourDigits(form.phone, form.parentPhone);
    const data = {
      ...form,
      name: trimmedName,
      checkinPin: resolvedCheckinPin,
      // 기존 호환: parentName 필드를 자동 생성된 표시명으로 저장
      parentName: parentDisplayName,
      parentDisplayName,
      tuitionEffectiveFrom: form.tuitionEffectiveFrom || form.enrollmentDate,
    };
    setSubmitting(true);
    try {
      if (isEdit) {
        // ── 수정 ──────────────────────────────────────────────
        let serverStudent = null;
        if (isAuthenticated && currentAcademyId) {
          if (editStudent.serverId) {
            serverStudent = await updateStudent(
              editStudent.serverId,
              mapAcademyStudentFormToServerPayload(data),
              { expectedUpdatedAt: editStudent.updatedAt || undefined },
            );
          } else {
            // 과거 로컬 전용 학생도 수정 순간 서버 레코드로 승격한다.
            serverStudent = await createAcademyStudent({
              academyId: currentAcademyId,
              id: createStudentRequestIdRef.current,
              ...mapAcademyStudentFormToServerPayload(data),
            });
          }
        }

        // 서버가 확정된 뒤에만 로컬 캐시를 바꾼다.
        updateAcademyStudent(editStudent.id, {
          ...data,
          serverId: serverStudent?.id || editStudent.serverId || null,
        });
        if (serverStudent?.id && !editStudent.serverId) {
          setAcademyStudentServerId(editStudent.id, serverStudent.id);
        }
        if (serverStudent) await loadServerStudents();
        onClose();
        return;
      }

      // ── 추가 ────────────────────────────────────────────────
      let serverStudent = null;
      if (isAuthenticated && currentAcademyId) {
        serverStudent = await createAcademyStudent({
          academyId: currentAcademyId,
          id: createStudentRequestIdRef.current,
          ...mapAcademyStudentFormToServerPayload(data),
        });
      }

      // 서버 저장 성공 뒤에 로컬 캐시를 생성한다.
      const localStudent = addAcademyStudent({
        ...data,
        serverId: serverStudent?.id || null,
      });
      if (serverStudent) await loadServerStudents();
      setCreatedStudent({
        ...localStudent,
        ...data,
        id: serverStudent?.id || localStudent.id,
        serverId: serverStudent?.id || null,
        updatedAt: serverStudent?.updated_at || localStudent.updatedAt,
      });
      setPhase('assignment');
    } catch (err) {
      console.error('[student] save failed', err);
      if (err?.code === 'DATA_CONFLICT_STUDENT') {
        await loadServerStudents?.();
      }
      showToast(
        err?.message || (isEdit
          ? '학생 정보를 수정하지 못했어요.'
          : '학생을 추가하지 못했어요. 연결을 확인하고 다시 시도해주세요.'),
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const availableClassGroups = classGroups.filter((group) => group.status !== 'inactive');

  const toggleClassGroup = (groupId) => {
    setSelectedClassGroupIds((current) => (
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    ));
  };

  const handleAssignToClassGroups = async () => {
    if (assigning || !createdStudent || selectedClassGroupIds.length === 0) return;
    const selectedGroups = classGroups.filter((group) => selectedClassGroupIds.includes(group.id));
    const effectiveFromDate = createdStudent.enrollmentDate || getTodayYMD();
    const assignedSubjectIds = selectedGroups
      .filter((group) => group.feePolicy !== 'additional')
      .map((group) => ACADEMY_SUBJECT_OPTIONS.find(
        (option) => option.id === group.subject || option.label === group.subject,
      )?.id)
      .filter(Boolean);
    const nextTuitionSubjects = [...new Set([
      ...(createdStudent.tuitionSubjects || []),
      ...assignedSubjectIds,
    ])];
    const nextBaseTuition = createdStudent.tuitionSource === 'custom'
      ? Number(createdStudent.baseTuition) || 0
      : calculateSuggestedStudentTuition({
        tuitionRates,
        tuitionPolicy,
        schoolType: createdStudent.schoolType,
        grade: createdStudent.grade,
        gradeReferenceYear: createdStudent.gradeReferenceYear,
        subjectIds: nextTuitionSubjects,
      });

    const localStudent = academyStudents.find((student) => (
      student.id === createdStudent.id
      || (createdStudent.serverId && student.serverId === createdStudent.serverId)
    ));

    if (!isAuthenticated || !currentAcademyId || !createdStudent.serverId) {
      assignAcademyStudentToClassGroups({
        studentId: createdStudent.id,
        classGroupIds: selectedClassGroupIds,
        fromDate: effectiveFromDate,
      });
      updateAcademyStudent(localStudent?.id || createdStudent.id, {
        tuitionSubjects: nextTuitionSubjects,
        baseTuition: nextBaseTuition,
      });
      onClose();
      return;
    }

    setAssigning(true);
    try {
      const serverGroupIds = selectedGroups.map((group) => group.serverId).filter(Boolean);
      if (serverGroupIds.length !== selectedGroups.length) {
        throw new Error('일부 반의 서버 정보를 확인하지 못했어요. 수업 목록을 새로고침해주세요.');
      }
      await assignStudentToClassGroupsGuarded({
        academyId: currentAcademyId,
        studentId: createdStudent.serverId,
        classGroupIds: serverGroupIds,
        effectiveFrom: effectiveFromDate,
        tuitionSubjects: nextTuitionSubjects,
        baseTuition: nextBaseTuition,
        expectedUpdatedAt: createdStudent.updatedAt,
      });
      await Promise.all([
        loadServerStudents?.(),
        loadServerClassGroups?.(),
        loadServerClassSessions?.(),
      ]);
      showToast(`${selectedClassGroupIds.length}개 수업에 학생을 배정했어요.`);
      onClose();
    } catch (err) {
      console.error('[supabase] assign student to class groups failed', err);
      if (String(err?.code || '').startsWith('DATA_CONFLICT_')) {
        await Promise.allSettled([
          loadServerStudents?.(),
          loadServerClassGroups?.(),
          loadServerClassSessions?.(),
        ]);
      }
      showToast(
        err?.message
          ? `수업을 배정하지 못했어요: ${err.message}`
          : '수업을 배정하지 못했어요. 다시 시도해주세요.',
        'error',
      );
    } finally {
      setAssigning(false);
    }
  };

  if (phase === 'assignment') {
    return (
      <Modal
        isOpen
        onClose={onClose}
        title="수업 배정"
        footer={
          availableClassGroups.length > 0 ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={assigning}
                className="h-12 flex-1 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 disabled:opacity-50"
              >
                나중에
              </button>
              <button
                type="button"
                onClick={handleAssignToClassGroups}
                disabled={assigning || selectedClassGroupIds.length === 0}
                className="h-12 flex-[1.5] rounded-xl bg-blue-600 text-sm font-bold text-white disabled:bg-gray-200 disabled:text-gray-400"
              >
                {assigning ? '배정 중…' : selectedClassGroupIds.length > 0
                  ? `${selectedClassGroupIds.length}개 수업에 배정`
                  : '수업 선택'}
              </button>
            </div>
          ) : (
            <button onClick={onClose} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl">
              학생 목록으로
            </button>
          )
        }
      >
        <div className="pb-2">
          <div className="mb-5 flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white">
              <Check size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{createdStudent?.name} 학생이 등록됐어요</p>
              <p className="mt-0.5 text-xs text-gray-500">바로 참여할 수업을 선택해주세요.</p>
            </div>
          </div>

          {availableClassGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center">
              <p className="text-sm font-bold text-gray-700">아직 만들어진 수업이 없어요</p>
              <p className="mt-1 text-xs leading-5 text-gray-400">수업을 만든 뒤 학생 상세 화면에서 배정할 수 있어요.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {availableClassGroups.map((group) => {
                const selected = selectedClassGroupIds.includes(group.id);
                const schedule = [
                  (group.weekdays || []).join('·'),
                  group.startTime && group.endTime ? `${group.startTime}–${group.endTime}` : '',
                ].filter(Boolean).join(' · ');
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggleClassGroup(group.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                      selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-transparent'
                    }`}>
                      <Check size={13} strokeWidth={3} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-gray-900">{group.name}</span>
                      {schedule && <span className="mt-0.5 block text-xs text-gray-400">{schedule}</span>}
                    </span>
                    {group.subject && <span className="text-xs font-semibold text-gray-400">{group.subject}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? '학생 수정' : '학생 등록'}
      footer={
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-60"
        >
          {submitting ? '저장 중…' : isEdit ? '수정 완료' : '학생 등록'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="이름 *">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="홍길동" className="input" />
        </Field>

        <Field label="학교급">
          <div className="flex gap-2 flex-wrap">
            {SCHOOL_TYPES.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => handleSchoolTypeChange(id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  form.schoolType === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </Field>

        {showSchoolName && (
          <Field label="학교명">
            {form.school && !isEditingSchool ? (
              <div className="flex min-h-12 items-center rounded-2xl border border-gray-200 bg-white px-3">
                <button
                  type="button"
                  onClick={editSchoolName}
                  className="inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold"
                  style={getSchoolTagStyle(form.school)}
                  aria-label={`${form.school} 학교명 수정`}
                >
                  <span className="truncate">{form.school}</span>
                  <Pencil size={12} className="flex-shrink-0 opacity-60" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  ref={schoolInputRef}
                  value={form.school}
                  onChange={(e) => { set('school', e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitSchoolName();
                    }
                  }}
                  onBlur={() => setTimeout(commitSchoolName, 150)}
                  placeholder="학교명을 입력하세요"
                  className="input"
                />
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                    {filteredSuggestions.map((schoolName) => (
                      <button
                        key={schoolName}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          set('school', schoolName);
                          setShowSuggestions(false);
                          setIsEditingSchool(false);
                        }}
                        className="flex w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      >
                        <span
                          className="rounded-lg border px-2.5 py-1 text-xs font-semibold"
                          style={getSchoolTagStyle(schoolName)}
                        >
                          {schoolName}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {schoolNames.length > 0 && (
              <div className="mt-2">
                <p className="mb-1.5 text-[11px] font-medium text-gray-400">최근 입력한 학교</p>
                <div className="flex flex-wrap gap-1.5">
                {schoolNames.filter((s) => s !== form.school).slice(0, 6).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      set('school', s);
                      setIsEditingSchool(false);
                      setShowSuggestions(false);
                    }}
                    className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-transform active:scale-95"
                    style={getSchoolTagStyle(s)}
                  >
                    {s}
                  </button>
                ))}
                </div>
              </div>
            )}
          </Field>
        )}

        {showGradeButtons && (
          <Field label="학년">
            <div className="flex gap-2 flex-wrap">
              {gradeOptions.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm((current) => ({
                    ...current,
                    grade: g,
                    gradeReferenceYear: currentAcademicYear(),
                  }))}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    form.grade === g ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {g}
                </button>
              ))}
            </div>
          </Field>
        )}

        <div className="rounded-2xl border border-[#E5E8EB] bg-[#F8FAFC] p-4">
          <div className="mb-3">
            <p className="text-sm font-bold text-[#191F28]">기본 수강료</p>
            <p className="mt-1 text-xs text-[#8B95A1]">학원 가격표를 기준으로 자동 계산해요.</p>
          </div>

          {configuredSubjectIds.length > 0 && (
            <Field label="수강 과목">
              <div className="mb-3 flex flex-wrap gap-2">
                {configuredSubjectIds.map((subjectId) => {
                  const option = ACADEMY_SUBJECT_OPTIONS.find((item) => item.id === subjectId);
                  const selected = form.tuitionSubjects.includes(subjectId);
                  return (
                    <button
                      key={subjectId}
                      type="button"
                      onClick={() => toggleTuitionSubject(subjectId)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      {selected ? '✓ ' : ''}{option?.label || subjectId}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          <Field label="월 기본 금액">
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((current) => ({
                  ...current,
                  tuitionSource: 'academy_rate',
                  baseTuition: suggestedBaseTuition > 0 ? String(suggestedBaseTuition) : '',
                  tuitionEffectiveTo: '',
                }))}
                className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${
                  form.tuitionSource === 'academy_rate'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                가격표 자동
              </button>
              <button
                type="button"
                onClick={() => set('tuitionSource', 'custom')}
                className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${
                  form.tuitionSource === 'custom'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                직접 입력
              </button>
            </div>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                value={form.baseTuition}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  baseTuition: event.target.value.replace(/\D/g, ''),
                  tuitionSource: 'custom',
                }))}
                placeholder="0"
                className="input min-w-0 flex-1"
                readOnly={form.tuitionSource === 'academy_rate'}
              />
              {form.tuitionSource === 'custom' && (
                <button
                  type="button"
                  onClick={() => setForm((current) => ({
                    ...current,
                    tuitionSource: 'academy_rate',
                    baseTuition: suggestedBaseTuition > 0 ? String(suggestedBaseTuition) : '',
                  }))}
                  className="flex-shrink-0 rounded-xl bg-white px-3 text-xs font-bold text-blue-600 ring-1 ring-gray-200"
                >
                  가격표 적용
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs font-semibold text-[#4E5968]">
              {formatKoreanCurrency(Number(form.baseTuition) || 0)}
              {form.tuitionSource === 'academy_rate' ? ' · 가격표 자동 적용' : ' · 학생별 조정'}
            </p>
            {automaticTuitionIssue && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                <p className="text-xs font-semibold leading-5 text-red-600">
                  {automaticTuitionIssue}
                </p>
              </div>
            )}
          </Field>

          {form.tuitionSource === 'academy_rate' ? (
            <div className="mt-3 rounded-xl bg-white px-3 py-2.5">
              <p className="text-xs font-bold text-[#4E5968]">
                매년 3월 다음 학년 가격표로 자동 변경
              </p>
              {form.grade && nextGrade.advancedBy > 0 && (
                <p className="mt-1 text-[11px] text-[#8B95A1]">
                  {nextAcademicYear}년 3월부터 {nextGrade.grade}
                  {nextSuggestedTuition > 0
                    ? ` · ${formatKoreanCurrency(nextSuggestedTuition)}`
                    : ''}
                  {nextGrade.needsReview ? ' · 학교 정보 확인 필요' : ''}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => set('tuitionEffectiveTo', '')}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${
                    !form.tuitionEffectiveTo
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-500'
                  }`}
                >
                  계속 적용
                </button>
                <button
                  type="button"
                  onClick={() => set('tuitionEffectiveTo', academicYearEnd)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${
                    form.tuitionEffectiveTo === academicYearEnd
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-500'
                  }`}
                >
                  이번 학년도까지
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="적용 시작">
                  <input
                    type="date"
                    value={form.tuitionEffectiveFrom}
                    onChange={(event) => set('tuitionEffectiveFrom', event.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="적용 종료">
                  <input
                    type="date"
                    value={form.tuitionEffectiveTo}
                    onChange={(event) => set('tuitionEffectiveTo', event.target.value)}
                    className="input"
                  />
                </Field>
              </div>
              <p className="mt-2 text-[11px] text-[#8B95A1]">
                종료 후에는 학원 가격표로 자동 전환돼요.
              </p>
            </div>
          )}
          <p className="mt-3 text-[11px] font-medium text-blue-600">
            추가 비용이 있는 수업에 배정되면 기본 수강료에 자동으로 더해져요.
          </p>
        </div>

        <Field label="학생 연락처">
          <input inputMode="tel" value={form.phone} onChange={(e) => set('phone', formatPhoneNumber(e.target.value))} placeholder="010-0000-0000" className="input" />
        </Field>

        <Field label="학부모 연락처">
          <input inputMode="tel" value={form.parentPhone} onChange={(e) => set('parentPhone', formatPhoneNumber(e.target.value))} placeholder="010-0000-0000" className="input" />
        </Field>

        <Field label={form.schoolType === 'adult' ? '보호자 호칭 (선택)' : '학부모 호칭 *'}>
          <div className="flex gap-2 flex-wrap">
            {PARENT_TITLE_OPTIONS.map(({ value, label }) => (
              <button key={value} type="button" onClick={() => set('parentTitle', value)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  form.parentTitle === value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {form.parentTitle === 'custom' && (
            <input
              value={form.parentTitleCustom}
              onChange={(event) => set('parentTitleCustom', event.target.value.slice(0, 20))}
              placeholder="예: 할머님"
              maxLength={20}
              className="input mt-2"
            />
          )}
        </Field>

        {showCheckinPin && (
          <Field label="등하원 PIN">
            <input
              inputMode="numeric"
              value={form.checkinPin}
              onChange={(e) => set('checkinPin', normalizePin(e.target.value))}
              placeholder={lastFourDigits(form.phone, form.parentPhone) || '0000'}
              maxLength={4}
              className="input tracking-[0.25em] font-bold"
            />
            <p className="text-xs text-gray-500 mt-1.5">
              비워두면 학생 연락처, 없으면 학부모 연락처 끝 4자리로 자동 설정돼요.
            </p>
          </Field>
        )}

        <Field label="등원일">
          <input type="date" value={form.enrollmentDate} onChange={(e) => set('enrollmentDate', e.target.value)} className="input" />
        </Field>

        {isEdit && (
          <Field label="재원 상태">
            <div className="grid grid-cols-2 gap-2">
              {STUDENT_STATUS_OPTIONS.map(({ value, label, selectedClassName }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('status', value)}
                  className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-colors ${
                    form.status === value
                      ? selectedClassName
                      : 'border-gray-200 bg-white text-gray-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="메모">
          <textarea value={form.memo} onChange={(e) => set('memo', e.target.value)} rows={2} placeholder="특이사항 등" className="input resize-none" />
        </Field>
      </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
