import { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import { formatPhoneNumber } from '../../../utils/format';
import { getTodayYMD } from '../../../utils/date';

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
  if (!parentName) return 'mother';
  if (parentName.includes('아버님') || parentName.includes('아버지')) return 'father';
  if (parentName.includes('보호자')) return 'guardian';
  if (parentName.includes('학부모')) return 'parent';
  return 'mother';
}

export function buildParentDisplayName(studentName, parentTitle) {
  const title = PARENT_TITLE_LABEL[parentTitle] || PARENT_TITLE_LABEL.mother;
  const trimmed = (studentName || '').trim();
  return trimmed ? `${trimmed} ${title}` : title;
}

export default function AcademyStudentFormModal({ editStudent, onClose }) {
  const { addAcademyStudent, updateAcademyStudent, schoolNames, addSchoolName } = useAcademyStore();
  const isEdit = !!editStudent;

  const [form, setForm] = useState({
    name: editStudent?.name || '',
    schoolType: editStudent?.schoolType || '',
    school: editStudent?.school || editStudent?.schoolName || '',
    grade: editStudent?.grade || '',
    phone: editStudent?.phone || '',
    parentTitle: editStudent?.parentTitle || inferParentTitle(editStudent?.parentName, editStudent?.name),
    parentPhone: editStudent?.parentPhone || '',
    enrollmentDate: editStudent?.enrollmentDate || (isEdit ? '' : getTodayYMD()),
    status: editStudent?.status || 'active',
    memo: editStudent?.memo || '',
  });

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [phase, setPhase] = useState('form');
  const schoolInputRef = useRef(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSchoolTypeChange = (type) => {
    setForm((f) => ({ ...f, schoolType: type, grade: '' }));
  };

  const gradeOptions = GRADE_OPTIONS[form.schoolType] || [];
  const showGradeButtons = form.schoolType && form.schoolType !== 'adult' && form.schoolType !== 'other' && gradeOptions.length > 0;
  const showGradeInput = form.schoolType === 'other';
  const showSchoolName = form.schoolType && form.schoolType !== 'adult';

  const filteredSuggestions = form.school.trim()
    ? schoolNames.filter((s) => s.includes(form.school) && s !== form.school)
    : schoolNames.filter(Boolean).slice(0, 5);

  const handleSubmit = () => {
    if (!form.name.trim()) return alert('이름을 입력해주세요.');
    const trimmedName = form.name.trim();
    const parentDisplayName = buildParentDisplayName(trimmedName, form.parentTitle);
    const data = {
      ...form,
      name: trimmedName,
      // 기존 호환: parentName 필드를 자동 생성된 표시명으로 저장
      parentName: parentDisplayName,
      parentDisplayName,
    };
    if (form.school.trim()) addSchoolName(form.school.trim());

    if (isEdit) {
      updateAcademyStudent(editStudent.id, data);
      onClose();
    } else {
      addAcademyStudent(data);
      setPhase('success');
    }
  };

  if (phase === 'success') {
    return (
      <Modal
        isOpen
        onClose={onClose}
        title="학생 등록 완료"
        footer={
          <button onClick={onClose} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl">
            학생 목록으로
          </button>
        }
      >
        <div className="py-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-green-600" />
          </div>
          <p className="font-bold text-gray-900 text-lg">{form.name} 학생이 등록됐어요!</p>
          <p className="text-sm text-gray-500 mt-2">학생 목록에서 확인할 수 있어요.</p>
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
        <button onClick={handleSubmit} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl">
          {isEdit ? '수정 완료' : '학생 등록'}
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
            <div className="relative">
              <input
                ref={schoolInputRef}
                value={form.school}
                onChange={(e) => { set('school', e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="예: 공릉중학교"
                className="input"
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                  {filteredSuggestions.map((s) => (
                    <button key={s} type="button" onMouseDown={() => { set('school', s); setShowSuggestions(false); }}
                      className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {schoolNames.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {schoolNames.filter((s) => s !== form.school).slice(0, 6).map((s) => (
                  <button key={s} type="button" onClick={() => set('school', s)}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-gray-200">
                    {s}
                  </button>
                ))}
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

        {showGradeInput && (
          <Field label="학년 / 상태">
            <input value={form.grade} onChange={(e) => set('grade', e.target.value)} placeholder="예: 재수생, N수생" className="input" />
          </Field>
        )}

        {!form.schoolType && (
          <Field label="학년">
            <input value={form.grade} onChange={(e) => set('grade', e.target.value)} placeholder="예: 중2, 고1" className="input" />
          </Field>
        )}

        <Field label="학생 연락처">
          <input inputMode="tel" value={form.phone} onChange={(e) => set('phone', formatPhoneNumber(e.target.value))} placeholder="010-0000-0000" className="input" />
        </Field>

        <Field label="학부모 호칭">
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
            {form.name.trim()
              ? <>표시 이름: <span className="font-semibold text-gray-800">{buildParentDisplayName(form.name, form.parentTitle)}</span></>
              : '학생 이름 입력 후 자동으로 표시돼요.'}
          </p>
        </Field>

        <Field label="학부모 연락처">
          <input inputMode="tel" value={form.parentPhone} onChange={(e) => set('parentPhone', formatPhoneNumber(e.target.value))} placeholder="010-0000-0000" className="input" />
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
