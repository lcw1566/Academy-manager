import { useState, useEffect, useRef } from 'react';
import { Check, Pencil } from 'lucide-react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyStudent,
  updateStudent,
  updateClassGroup as updateServerClassGroup,
  updateClassSession as updateServerClassSession,
} from '../../../services/supabase/domainApi';
import { formatPhoneNumber } from '../../../utils/format';
import { getTodayYMD } from '../../../utils/date';
import { getSchoolTagClassName } from '../../../utils/schoolTags';

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

const STATUS_OPTIONS = [
  { value: 'active',    label: '재원' },
  { value: 'paused',   label: '휴원' },
  { value: 'inactive', label: '퇴원' },
];

// 학부모 호칭 옵션 — parentTitle 값 + label
const PARENT_TITLE_OPTIONS = [
  { value: 'mother',   label: '어머님' },
  { value: 'father',   label: '아버님' },
  { value: 'guardian', label: '보호자님' },
  { value: 'parent',   label: '학부모님' },
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

export function buildParentDisplayName(studentName, parentTitle) {
  const title = PARENT_TITLE_LABEL[parentTitle] || PARENT_TITLE_LABEL.guardian;
  const trimmed = (studentName || '').trim();
  return trimmed ? `${trimmed} ${title}` : title;
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
    phone: emptyToNull(form.phone),
    parent_phone: emptyToNull(form.parentPhone),
    parent_title: emptyToNull(form.parentTitle),
    parent_name: emptyToNull(form.parentName),
    checkin_pin: emptyToNull(normalizePinOrEmpty(form.checkinPin)),
    enrollment_date: emptyToNull(form.enrollmentDate),
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
    classGroups, classSessions, academyStudents,
    schoolNames, addSchoolName, showToast,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerStudents = useWorkspaceStore((s) => s.loadServerStudents);
  const loadServerClassGroups = useWorkspaceStore((s) => s.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const isEdit = !!editStudent;

  const [form, setForm] = useState({
    name: editStudent?.name || '',
    schoolType: editStudent?.schoolType || '',
    school: editStudent?.school || editStudent?.schoolName || '',
    grade: normalizeGradeForSchoolType(editStudent?.grade, editStudent?.schoolType),
    phone: editStudent?.phone || '',
    parentTitle: editStudent?.parentTitle || inferParentTitle(editStudent?.parentName, editStudent?.name),
    parentPhone: editStudent?.parentPhone || '',
    checkinPin: editStudent?.checkinPin || '',
    enrollmentDate: editStudent?.enrollmentDate || (isEdit ? '' : getTodayYMD()),
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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSchoolTypeChange = (type) => {
    if (form.schoolType !== type) setIsEditingSchool(true);
    setForm((f) => ({
      ...f,
      schoolType: type,
      grade: f.schoolType === type ? f.grade : '',
      school: f.schoolType === type ? f.school : '',
    }));
  };

  const gradeOptions = GRADE_OPTIONS[form.schoolType] || [];
  const showGradeButtons = form.schoolType && form.schoolType !== 'adult' && form.schoolType !== 'other' && gradeOptions.length > 0;
  const showSchoolName = form.schoolType && form.schoolType !== 'adult';

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
    if (form.schoolType !== 'adult' && !form.parentTitle) {
      return alert('상담 시 사용할 학부모 호칭을 선택해주세요.');
    }
    const trimmedName = form.name.trim();
    const parentDisplayName = form.parentTitle
      ? buildParentDisplayName(trimmedName, form.parentTitle)
      : '';
    const resolvedCheckinPin = normalizePinOrEmpty(form.checkinPin)
      || lastFourDigits(form.phone, form.parentPhone);
    const data = {
      ...form,
      name: trimmedName,
      checkinPin: resolvedCheckinPin,
      // 기존 호환: parentName 필드를 자동 생성된 표시명으로 저장
      parentName: parentDisplayName,
      parentDisplayName,
    };
    if (form.school.trim()) addSchoolName(form.school.trim());

    setSubmitting(true);
    try {
      if (isEdit) {
        // ── 수정 ──────────────────────────────────────────────
        // 1) localStorage 수정 (source of truth, 항상 성공)
        updateAcademyStudent(editStudent.id, data);

        // 2) Supabase write-through — serverId 가 있고 로그인 + 학원 선택 시에만 시도.
        //    serverId 없는 기존 로컬 학생은 조용히 skip.
        if (editStudent.serverId && isAuthenticated && currentAcademyId) {
          try {
            await updateStudent(editStudent.serverId, mapAcademyStudentFormToServerPayload(data));
            await loadServerStudents();
          } catch (err) {
            console.error('[supabase] updateStudent failed', err);
            showToast(
              err?.message
                ? `서버 동기화 실패: ${err.message}`
                : '학생 정보는 수정되었지만 서버 동기화는 실패했어요.',
              'error',
            );
          }
        }

        onClose();
        return;
      }

      // ── 추가 ────────────────────────────────────────────────
      // 1) localStorage 저장 (source of truth, 항상 성공). 반환된 localStudent.id 확보.
      const localStudent = addAcademyStudent(data);

      // 2) Supabase write-through — 로그인 + 학원 선택 시에만 시도
      let serverStudent = null;
      if (isAuthenticated && currentAcademyId) {
        try {
          serverStudent = await createAcademyStudent({
            academyId: currentAcademyId,
            ...mapAcademyStudentFormToServerPayload(data),
          });
          // 3) 반환된 server uuid 를 local 학생에 매핑 (이후 수정/삭제 라우팅용)
          if (serverStudent?.id && localStudent?.id) {
            setAcademyStudentServerId(localStudent.id, serverStudent.id);
          }
          await loadServerStudents();
          showToast('학생이 추가되고 서버에도 저장되었어요.');
        } catch (err) {
          console.error('[supabase] createAcademyStudent failed', err);
          showToast(
            err?.message
              ? `서버 저장 실패: ${err.message}`
              : '학생은 추가되었지만 서버 저장은 실패했어요.',
            'error',
          );
        }
      }

      setCreatedStudent({
        ...localStudent,
        ...data,
        id: serverStudent?.id || localStudent.id,
        serverId: serverStudent?.id || localStudent.serverId || null,
      });
      setPhase('assignment');
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

    assignAcademyStudentToClassGroups({
      studentId: createdStudent.id,
      classGroupIds: selectedClassGroupIds,
      fromDate: effectiveFromDate,
    });

    if (!isAuthenticated || !currentAcademyId || !createdStudent.serverId) {
      onClose();
      return;
    }

    setAssigning(true);
    try {
      const serverGroupIds = selectedGroups.map((group) => group.serverId).filter(Boolean);
      await updateStudent(createdStudent.serverId, { class_group_ids: serverGroupIds });

      const resolveServerStudentIds = (studentIds = []) => {
        const resolved = studentIds.map((studentId) => {
          const student = academyStudents.find(
            (item) => item.id === studentId || item.serverId === studentId,
          );
          if (student?.serverId) return student.serverId;
          return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId)
            ? studentId
            : null;
        }).filter(Boolean);
        return [...new Set([...resolved, createdStudent.serverId])];
      };

      const groupUpdates = selectedGroups
        .filter((group) => group.serverId)
        .map((group) => updateServerClassGroup(group.serverId, {
          student_ids: resolveServerStudentIds(group.studentIds),
        }));

      const sessionUpdates = classSessions
        .filter((session) => (
          selectedClassGroupIds.includes(session.classGroupId)
          && session.serverId
          && session.status !== 'canceled'
          && (!session.date || session.date >= effectiveFromDate)
        ))
        .map((session) => updateServerClassSession(session.serverId, {
          student_ids: resolveServerStudentIds(session.studentIds),
        }));

      await Promise.all([...groupUpdates, ...sessionUpdates]);
      await Promise.all([
        loadServerStudents?.(),
        loadServerClassGroups?.(),
        loadServerClassSessions?.(),
      ]);
      onClose();
    } catch (err) {
      console.error('[supabase] assign student to class groups failed', err);
      showToast(
        err?.message
          ? `수업은 배정됐지만 서버 동기화에 실패했어요: ${err.message}`
          : '수업은 배정됐지만 서버 동기화에 실패했어요.',
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
                  className={`inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${getSchoolTagClassName(form.school)}`}
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
                        <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${getSchoolTagClassName(schoolName)}`}>
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
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-transform active:scale-95 ${getSchoolTagClassName(s)}`}
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
                <button key={g} type="button" onClick={() => set('grade', g)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    form.grade === g ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {g}
                </button>
              ))}
            </div>
          </Field>
        )}

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
          <p className="text-xs text-gray-500 mt-2">
            {form.parentTitle
              ? <>상담 표시명: <span className="font-semibold text-gray-800">{buildParentDisplayName(form.name, form.parentTitle)}</span></>
              : '상담과 안내 메시지에서 사용할 호칭을 직접 선택해주세요.'}
          </p>
        </Field>

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

        <Field label="등원일">
          <input type="date" value={form.enrollmentDate} onChange={(e) => set('enrollmentDate', e.target.value)} className="input" />
        </Field>

        <Field label="재원 상태">
          <div className="flex gap-2">
            {STATUS_OPTIONS.map(({ value, label }) => (
              <button key={value} type="button" onClick={() => set('status', value)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                  form.status === value
                    ? value === 'active' ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : value === 'paused' ? 'border-yellow-400 bg-yellow-50 text-yellow-700'
                      : 'border-gray-400 bg-gray-100 text-gray-600'
                    : 'border-gray-200 bg-white text-gray-500'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </Field>

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
