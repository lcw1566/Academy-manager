import { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import Modal from '../../components/Modal';
import useAcademyStore from '../../store/useAcademyStore';
import { formatPhoneNumber } from '../../utils/format';

const SUBJECTS = ['수학', '영어', '국어', '과학', '물리', '화학', '사회', '역사', '기타'];

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
  university: ['1학년', '2학년', '3학년', '4학년', '5학년 이상'],
  adult:      [],
  other:      [],
};

const SCHOOL_TYPE_COLORS = {
  elementary: 'bg-green-50 text-green-700 border-green-200',
  middle:     'bg-blue-50 text-blue-700 border-blue-200',
  high:       'bg-purple-50 text-purple-700 border-purple-200',
};

function generateDepositorName({ schoolType, schoolName, grade, name }) {
  if (!name?.trim()) return '';
  const gradePart = schoolType === 'adult' ? '성인' : grade ? grade : '';
  return [schoolName, gradePart, name, '과외비'].filter(Boolean).join(' ');
}

export default function StudentFormModal({ onClose, initial = null, onAddClass }) {
  const { addStudent, updateStudent, schoolNames, addSchoolName } = useAcademyStore();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name || '');
  const [schoolType, setSchoolType] = useState(initial?.schoolType || '');
  const [schoolName, setSchoolName] = useState(initial?.schoolName || initial?.school || '');
  const [grade, setGrade] = useState(initial?.grade || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [parentPhone, setParentPhone] = useState(initial?.parentPhone || '');
  const [subjects, setSubjects] = useState(initial?.subjects || []);
  const [memo, setMemo] = useState(initial?.memo || '');
  const [depositorName, setDepositorName] = useState(initial?.depositorName || '');
  const [depositorEdited, setDepositorEdited] = useState(!!initial?.depositorName);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [phase, setPhase] = useState('form');
  const [addedStudentName, setAddedStudentName] = useState('');
  const schoolInputRef = useRef(null);

  useEffect(() => {
    if (depositorEdited) return;
    const auto = generateDepositorName({ schoolType, schoolName, grade, name });
    setDepositorName(auto);
  }, [schoolType, schoolName, grade, name, depositorEdited]);

  const gradeOptions = GRADE_OPTIONS[schoolType] || [];
  const showGradeButtons = schoolType && schoolType !== 'adult' && schoolType !== 'other' && gradeOptions.length > 0;
  const showGradeInput = schoolType === 'other';
  const showSchoolName = schoolType && schoolType !== 'adult';

  const handleSchoolTypeChange = (type) => {
    setSchoolType(type);
    setGrade('');
  };

  // Suggestions: includes schoolNames from store + unique names from students
  const filteredSuggestions = schoolName.trim()
    ? schoolNames.filter((s) => s.includes(schoolName) && s !== schoolName)
    : schoolNames.filter(Boolean).slice(0, 5);

  const toggleSubject = (sub) =>
    setSubjects((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );

  const handleSelectSuggestion = (suggestion) => {
    setSchoolName(suggestion);
    setShowSuggestions(false);
  };

  const buildFormData = () => ({
    name: name.trim(),
    schoolType,
    schoolName: schoolType !== 'adult' ? schoolName.trim() : '',
    grade,
    phone,
    parentPhone,
    subjects,
    depositorName,
    memo,
  });

  const handleSubmit = () => {
    if (!name.trim()) return alert('학생 이름을 입력해주세요.');
    const data = buildFormData();
    if (schoolName.trim()) addSchoolName(schoolName.trim());

    if (isEdit) {
      updateStudent(initial.id, data);
      onClose();
    } else {
      addStudent(data);
      setAddedStudentName(name.trim());
      setPhase('success');
    }
  };

  const resetDepositor = () => {
    setDepositorEdited(false);
    const auto = generateDepositorName({ schoolType, schoolName, grade, name });
    setDepositorName(auto);
  };

  if (phase === 'success') {
    return (
      <Modal
        isOpen
        onClose={onClose}
        title="학생 등록 완료"
        footer={
          <div className="flex flex-col gap-2">
            {onAddClass && (
              <button
                onClick={() => { onClose(); onAddClass(); }}
                className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl text-base"
              >
                정기 과외 등록하기
              </button>
            )}
            <button
              onClick={onClose}
              className={`w-full font-semibold py-3 rounded-xl ${onAddClass ? 'bg-gray-100 text-gray-700' : 'bg-blue-600 text-white font-bold py-3.5'}`}
            >
              학생 목록으로
            </button>
          </div>
        }
      >
        <div className="py-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-green-600" />
          </div>
          <p className="font-bold text-gray-900 text-lg">{addedStudentName} 학생이 등록됐어요!</p>
          <p className="text-sm text-gray-500 mt-2">다음 단계를 선택해주세요.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? '학생 수정' : '학생 추가'}
      footer={
        <button
          onClick={handleSubmit}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl text-base"
        >
          {isEdit ? '수정 완료' : '학생 추가'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 이름 */}
        <Field label="이름 *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="학생 이름"
            className="input"
          />
        </Field>

        {/* 학교급 */}
        <Field label="학교급">
          <div className="flex gap-2 flex-wrap">
            {SCHOOL_TYPES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleSchoolTypeChange(id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  schoolType === id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        {/* 학교명 + 자동완성 */}
        {showSchoolName && (
          <Field label="학교명">
            <div className="relative">
              <input
                ref={schoolInputRef}
                value={schoolName}
                onChange={(e) => { setSchoolName(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="예: 공릉중"
                className="input"
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                  {filteredSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={() => handleSelectSuggestion(s)}
                      className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 추천 학교 pill tags */}
            {schoolNames.length > 0 && (
              <div className="mt-2">
                <p className="text-[11px] text-gray-400 mb-1.5">최근 등록한 학교</p>
                <div className="flex flex-wrap gap-1.5">
                  {schoolNames
                    .filter((s) => s !== schoolName)
                    .slice(0, 6)
                    .map((s) => {
                      // Try to find matching student's schoolType for color
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSchoolName(s)}
                          className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-gray-200"
                        >
                          {s}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </Field>
        )}

        {/* 학년 - 버튼 */}
        {showGradeButtons && (
          <Field label="학년">
            <div className="flex gap-2 flex-wrap">
              {gradeOptions.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    grade === g
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* 학년 - 텍스트 입력 (기타) */}
        {showGradeInput && (
          <Field label="학년 / 상태">
            <input
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="예: 재수생, N수생, 검정고시"
              className="input"
            />
          </Field>
        )}

        {/* 연락처 */}
        <Field label="학생 연락처">
          <input
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
            placeholder="010-0000-0000"
            className="input"
          />
        </Field>

        <Field label="학부모 연락처">
          <input
            inputMode="tel"
            value={parentPhone}
            onChange={(e) => setParentPhone(formatPhoneNumber(e.target.value))}
            placeholder="010-0000-0000"
            className="input"
          />
        </Field>

        {/* 과목 */}
        <Field label="수강 과목">
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => toggleSubject(sub)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  subjects.includes(sub)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>
        </Field>

        {/* 입금자명 */}
        <Field label={`입금자명${!depositorEdited ? ' (자동 생성)' : ''}`}>
          <input
            value={depositorName}
            onChange={(e) => { setDepositorName(e.target.value); setDepositorEdited(true); }}
            placeholder="학생 정보 입력 시 자동 생성됩니다"
            className="input"
          />
          {depositorEdited && (
            <button
              type="button"
              onClick={resetDepositor}
              className="text-xs text-blue-500 mt-1"
            >
              자동 생성값으로 초기화
            </button>
          )}
        </Field>

        {/* 메모 */}
        <Field label="메모">
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="특이사항, 학습 목표 등"
            rows={3}
            className="input"
          />
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
