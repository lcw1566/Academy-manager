import { useState, useMemo } from 'react';
import { Users, Check } from 'lucide-react';
import Modal from '../../components/Modal';
import useAcademyStore from '../../store/useAcademyStore';
import { today } from '../../utils/date';
import { DAY_OPTIONS, formatDays, generateClassDates } from '../../utils/recurringClass';

const MODE_RECURRING = 'recurring';
const MODE_SINGLE = 'single';
const SINGLE_TYPES = ['단발 수업', '보강', '상담'];

export default function ClassFormModal({ onClose, preselectedStudentIds = [], initialMode = MODE_RECURRING, initialSingleType }) {
  const { students, addRepeatGroup, addClass, showToast } = useAcademyStore();
  const [mode, setMode] = useState(initialMode);

  // ── Recurring form state ──────────────────────────
  const [selectedStudentIds, setSelectedStudentIds] = useState(preselectedStudentIds);
  const [rForm, setRForm] = useState({
    subject: '',
    location: '',
    daysOfWeek: [],
    startTime: '16:00',
    endTime: '18:00',
    startDate: today(),
    endDate: '',
    repeatType: '매주',
    monthlyFee: '',
    paymentDay: '',
    memo: '',
  });

  // ── Single class form state ───────────────────────
  const [sForm, setSForm] = useState({
    studentId: '',
    type: initialSingleType || '단발 수업',
    subject: '',
    date: today(),
    startTime: '16:00',
    endTime: '18:00',
    location: '',
    memo: '',
  });

  const setR = (key, val) => setRForm((f) => ({ ...f, [key]: val }));
  const setS = (key, val) => setSForm((f) => ({ ...f, [key]: val }));

  const toggleStudent = (id) =>
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  const toggleDay = (id) =>
    setRForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(id)
        ? f.daysOfWeek.filter((d) => d !== id)
        : [...f.daysOfWeek, id],
    }));

  const previewCount = useMemo(() => {
    if (mode !== MODE_RECURRING) return 0;
    if (rForm.daysOfWeek.length === 0 || !rForm.startDate) return 0;
    try {
      return generateClassDates({
        daysOfWeek: rForm.daysOfWeek,
        startDate: rForm.startDate,
        endDate: rForm.endDate || null,
        repeatType: rForm.repeatType,
      }).length;
    } catch {
      return 0;
    }
  }, [rForm.daysOfWeek, rForm.startDate, rForm.endDate, rForm.repeatType, mode]);

  const handleSubmitRecurring = () => {
    if (selectedStudentIds.length === 0) return alert('학생을 선택해주세요.');
    if (!rForm.subject.trim()) return alert('과목을 입력해주세요.');
    if (rForm.daysOfWeek.length === 0) return alert('수업 요일을 선택해주세요.');
    if (previewCount === 0) return alert('생성 가능한 수업이 없습니다. 날짜를 확인해주세요.');

    addRepeatGroup({
      ...rForm,
      studentIds: selectedStudentIds,
      studentName: students.find((s) => s.id === selectedStudentIds[0])?.name || '',
      monthlyFee: Number(rForm.monthlyFee) || 0,
      paymentDay: Number(rForm.paymentDay) || 10,
    });
    onClose();
  };

  const handleSubmitSingle = () => {
    if (!sForm.studentId) return alert('학생을 선택해주세요.');
    if (!sForm.date) return alert('날짜를 입력해주세요.');
    const student = students.find((s) => s.id === sForm.studentId);
    addClass({
      name: `${student?.name || ''} ${sForm.subject || sForm.type}`,
      type: sForm.type,
      subject: sForm.subject,
      date: sForm.date,
      startTime: sForm.startTime,
      endTime: sForm.endTime,
      location: sForm.location,
      teacherId: '',
      studentIds: [sForm.studentId],
      repeatType: '없음',
      memo: sForm.memo,
    });
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="수업 등록"
      footer={
        <button
          onClick={mode === MODE_RECURRING ? handleSubmitRecurring : handleSubmitSingle}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl text-base"
        >
          {mode === MODE_RECURRING
            ? previewCount > 0 ? `정기 과외 등록 (${previewCount}개 수업 생성)` : '정기 과외 등록'
            : '수업 추가'}
        </button>
      }
    >
      {/* Mode toggle */}
      <div className="flex gap-0 bg-gray-100 rounded-xl p-1 mb-5">
        <button
          onClick={() => setMode(MODE_RECURRING)}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            mode === MODE_RECURRING ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          정기 과외
        </button>
        <button
          onClick={() => setMode(MODE_SINGLE)}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            mode === MODE_SINGLE ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          단발 수업
        </button>
      </div>

      {mode === MODE_RECURRING ? (
        <RecurringForm
          form={rForm}
          setField={setR}
          toggleDay={toggleDay}
          students={students}
          selectedStudentIds={selectedStudentIds}
          toggleStudent={toggleStudent}
          previewCount={previewCount}
        />
      ) : (
        <SingleForm form={sForm} setField={setS} students={students} />
      )}
    </Modal>
  );
}

// ── Recurring form ─────────────────────────────────────────────────────────────

function RecurringForm({ form, setField, toggleDay, students, selectedStudentIds, toggleStudent, previewCount }) {
  const PRESET_SUBJECTS = ['수학', '영어', '국어', '과학', '물리'];
  const [showCustomSubject, setShowCustomSubject] = useState(
    !!form.subject && !PRESET_SUBJECTS.includes(form.subject)
  );

  const handleSubjectClick = (sub) => {
    if (sub === '기타') {
      setShowCustomSubject(true);
      setField('subject', '');
    } else {
      setShowCustomSubject(false);
      setField('subject', sub);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Student multi-select */}
      <Field label="학생 * (복수 선택 가능)">
        {students.length === 0 ? (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
            <Users size={15} className="text-yellow-600" />
            <p className="text-xs text-yellow-700">먼저 학생을 등록해주세요</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto rounded-xl border border-gray-200 p-2 bg-white">
              {students.map((s) => {
                const selected = selectedStudentIds.includes(s.id);
                const schoolLabel = [s.schoolName || s.school, s.grade].filter(Boolean).join(' ');
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStudent(s.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                      selected ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                      selected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white'
                    }`}>
                      {selected && <Check size={11} className="text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                      {schoolLabel && <p className="text-xs text-gray-500">{schoolLabel}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedStudentIds.length > 0 && (
              <p className="text-xs text-blue-600 mt-1.5 font-medium">
                {selectedStudentIds.length}명 선택됨
                {selectedStudentIds.length >= 2 && ' · 그룹과외로 등록됩니다'}
              </p>
            )}
          </>
        )}
      </Field>

      {/* Subject */}
      <Field label="과목 *">
        <div className="flex gap-2 flex-wrap">
          {[...PRESET_SUBJECTS, '기타'].map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => handleSubjectClick(sub)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                (sub === '기타' ? showCustomSubject : form.subject === sub)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
        {showCustomSubject && (
          <input
            className="input mt-2"
            placeholder="과목명 직접 입력"
            value={form.subject}
            onChange={(e) => setField('subject', e.target.value)}
            autoFocus
          />
        )}
      </Field>

      {/* Days of week */}
      <Field label="수업 요일 * (다중 선택)">
        <div className="flex gap-2">
          {DAY_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleDay(id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                form.daysOfWeek.includes(id)
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {form.daysOfWeek.length > 0 && (
          <p className="text-xs text-blue-600 mt-1.5 font-medium">
            선택: {formatDays(form.daysOfWeek)}요일
          </p>
        )}
      </Field>

      {/* Time */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작 시간">
          <input type="time" value={form.startTime} onChange={(e) => setField('startTime', e.target.value)} className="input" />
        </Field>
        <Field label="종료 시간">
          <input type="time" value={form.endTime} onChange={(e) => setField('endTime', e.target.value)} className="input" />
        </Field>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작일 *">
          <input type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} className="input" />
        </Field>
        <Field label="종료일 (선택)">
          <input type="date" value={form.endDate} onChange={(e) => setField('endDate', e.target.value)} className="input" />
        </Field>
      </div>
      {!form.endDate && (
        <p className="text-xs text-gray-400 -mt-2">종료일 미입력 시 3개월치 수업이 생성됩니다</p>
      )}

      {/* Repeat type */}
      <Field label="반복 주기">
        <div className="flex gap-2">
          {['매주', '격주', '매월'].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setField('repeatType', r)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                form.repeatType === r
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </Field>

      {/* Location */}
      <Field label="수업 장소">
        <input
          value={form.location}
          onChange={(e) => setField('location', e.target.value)}
          placeholder="예: 학생 자택, 카페"
          className="input"
        />
      </Field>

      {/* Preview */}
      {previewCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-sm font-bold text-blue-800">
            {previewCount}개 수업이 생성됩니다
          </p>
          <p className="text-xs text-blue-500 mt-0.5">
            {form.startDate} ~ {form.endDate || '3개월 후'} · {form.repeatType}
          </p>
        </div>
      )}

      {/* Payment info */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wide">수납 정보</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="월 수업료 (원)">
            <input
              type="number"
              value={form.monthlyFee}
              onChange={(e) => setField('monthlyFee', e.target.value)}
              placeholder="300000"
              className="input"
            />
          </Field>
          <Field label="결제일 (매월)">
            <input
              type="number"
              value={form.paymentDay}
              onChange={(e) => setField('paymentDay', e.target.value)}
              placeholder="10"
              min="1" max="31"
              className="input"
            />
          </Field>
        </div>
        {form.monthlyFee && (
          <p className="text-xs text-blue-600 mt-2">선택된 학생별로 이번 달 수납 예정 항목이 자동 생성됩니다</p>
        )}
      </div>

      {/* Memo */}
      <Field label="메모">
        <textarea
          value={form.memo}
          onChange={(e) => setField('memo', e.target.value)}
          placeholder="특이사항이나 메모"
          rows={2}
          className="input"
        />
      </Field>
    </div>
  );
}

// ── Single class form ──────────────────────────────────────────────────────────

function SingleForm({ form, setField, students }) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="학생 *">
        {students.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
            <p className="text-xs text-yellow-700">먼저 학생을 등록해주세요</p>
          </div>
        ) : (
          <select value={form.studentId} onChange={(e) => setField('studentId', e.target.value)} className="input">
            <option value="">학생 선택</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </Field>

      <Field label="수업 유형">
        <div className="flex gap-2">
          {SINGLE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setField('type', t)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                form.type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      <Field label="과목">
        <input
          value={form.subject}
          onChange={(e) => setField('subject', e.target.value)}
          placeholder="수학, 영어 등"
          className="input"
        />
      </Field>

      <Field label="날짜">
        <input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} className="input" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="시작 시간">
          <input type="time" value={form.startTime} onChange={(e) => setField('startTime', e.target.value)} className="input" />
        </Field>
        <Field label="종료 시간">
          <input type="time" value={form.endTime} onChange={(e) => setField('endTime', e.target.value)} className="input" />
        </Field>
      </div>

      <Field label="장소">
        <input
          value={form.location}
          onChange={(e) => setField('location', e.target.value)}
          placeholder="학생 자택, 카페 등"
          className="input"
        />
      </Field>

      <Field label="메모">
        <textarea value={form.memo} onChange={(e) => setField('memo', e.target.value)} rows={2} className="input" />
      </Field>
    </div>
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
