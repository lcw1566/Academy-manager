import { useState, useMemo } from 'react';
import { Users, Check, Copy } from 'lucide-react';
import Modal from '../../components/Modal';
import useAcademyStore from '../../store/useAcademyStore';
import { today } from '../../utils/date';
import { DAY_OPTIONS, formatDays, generateClassDates } from '../../utils/recurringClass';
import {
  calculateDurationHours,
  calculateMonthSessionCount,
  calculateFullMonthSessionCount,
  calculateMonthlyProratedFee,
  calculateHourlyFee,
} from '../../utils/billing';
import { formatCurrency } from '../../utils/format';

const MODE_RECURRING = 'recurring';
const MODE_SINGLE = 'single';
const SINGLE_TYPES = ['단발 수업', '보강', '상담'];

export default function ClassFormModal({ onClose, preselectedStudentIds = [], initialMode = MODE_RECURRING, initialSingleType }) {
  const { students, addRepeatGroup, addClass } = useAcademyStore();
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
    memo: '',
  });

  // Billing state (separate from rForm for clarity)
  const [billingMode, setBillingMode] = useState('same'); // 'same' | 'perStudent'
  const [defaultBillingForm, setDefaultBillingForm] = useState({
    billingType: 'monthly',
    monthlyFee: '',
    hourlyRate: '',
    paymentDay: '',
  });
  // Per-student billing: { [studentId]: { billingType, monthlyFee, hourlyRate, paymentDay } }
  const [studentBillings, setStudentBillings] = useState({});

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

    const resolvedBillingMode = selectedStudentIds.length <= 1 ? 'same' : billingMode;

    // Build defaultBilling
    const defaultBilling = {
      billingType: defaultBillingForm.billingType || 'monthly',
      monthlyFee: Number(defaultBillingForm.monthlyFee) || 0,
      hourlyRate: Number(defaultBillingForm.hourlyRate) || 0,
      paymentDay: Number(defaultBillingForm.paymentDay) || 10,
    };

    // Build studentBillings (normalize each entry)
    const normalizedStudentBillings = {};
    if (resolvedBillingMode === 'perStudent') {
      for (const sid of selectedStudentIds) {
        const sb = studentBillings[sid] || {};
        normalizedStudentBillings[sid] = {
          billingType: sb.billingType || 'monthly',
          monthlyFee: Number(sb.monthlyFee) || 0,
          hourlyRate: Number(sb.hourlyRate) || 0,
          paymentDay: Number(sb.paymentDay) || defaultBilling.paymentDay,
        };
      }
    }

    addRepeatGroup({
      ...rForm,
      studentIds: selectedStudentIds,
      studentName: students.find((s) => s.id === selectedStudentIds[0])?.name || '',
      billingMode: resolvedBillingMode,
      defaultBilling,
      studentBillings: normalizedStudentBillings,
      // Legacy top-level for compat
      billingType: defaultBilling.billingType,
      monthlyFee: defaultBilling.monthlyFee,
      hourlyRate: defaultBilling.hourlyRate,
      paymentDay: defaultBilling.paymentDay,
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
          billingMode={billingMode}
          setBillingMode={setBillingMode}
          defaultBillingForm={defaultBillingForm}
          setDefaultBillingForm={setDefaultBillingForm}
          studentBillings={studentBillings}
          setStudentBillings={setStudentBillings}
        />
      ) : (
        <SingleForm form={sForm} setField={setS} students={students} />
      )}
    </Modal>
  );
}

// ── Recurring form ─────────────────────────────────────────────────────────────

function RecurringForm({
  form, setField, toggleDay, students, selectedStudentIds, toggleStudent, previewCount,
  billingMode, setBillingMode, defaultBillingForm, setDefaultBillingForm,
  studentBillings, setStudentBillings,
}) {
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

  const isMultiStudent = selectedStudentIds.length >= 2;

  // Duration for billing preview
  const durationHours = useMemo(
    () => calculateDurationHours(form.startTime, form.endTime),
    [form.startTime, form.endTime]
  );

  const startMonth = form.startDate?.slice(0, 7) || '';

  const actualSessions = useMemo(() => {
    if (!startMonth || form.daysOfWeek.length === 0) return 0;
    return calculateMonthSessionCount({
      yearMonth: startMonth,
      daysOfWeek: form.daysOfWeek,
      startDate: form.startDate,
      endDate: form.endDate || null,
      repeatType: form.repeatType,
    });
  }, [startMonth, form.daysOfWeek, form.startDate, form.endDate, form.repeatType]);

  const fullMonthSessions = useMemo(() => {
    if (!startMonth || form.daysOfWeek.length === 0) return 0;
    return calculateFullMonthSessionCount({
      yearMonth: startMonth,
      daysOfWeek: form.daysOfWeek,
      endDate: form.endDate || null,
      repeatType: form.repeatType,
    });
  }, [startMonth, form.daysOfWeek, form.endDate, form.repeatType]);

  const monthStart = startMonth ? `${startMonth}-01` : '';
  const isStartMidMonth = form.startDate > monthStart;
  const isProrated = isStartMidMonth && actualSessions < fullMonthSessions && fullMonthSessions > 0;

  // Handler for per-student billing changes
  const setStudentBilling = (studentId, key, val) => {
    setStudentBillings((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [key]: val },
    }));
  };

  const getStudentBilling = (studentId) => ({
    billingType: 'monthly',
    monthlyFee: '',
    hourlyRate: '',
    paymentDay: '',
    ...studentBillings[studentId],
  });

  // Copy first student's billing to all others
  const copyFirstToAll = () => {
    if (selectedStudentIds.length < 2) return;
    const first = getStudentBilling(selectedStudentIds[0]);
    const updated = {};
    for (const sid of selectedStudentIds) {
      updated[sid] = { ...first };
    }
    setStudentBillings(updated);
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
            <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-2 bg-white">
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
          <input type="time" value={form.startTime} onChange={(e) => setField('startTime', e.target.value)} className="input w-full" />
        </Field>
        <Field label="종료 시간">
          <input type="time" value={form.endTime} onChange={(e) => setField('endTime', e.target.value)} className="input w-full" />
        </Field>
      </div>
      {durationHours > 0 && (
        <p className="text-xs text-gray-400 -mt-2">수업 시간: {durationHours}시간</p>
      )}

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작일 *">
          <input type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} className="input w-full" />
        </Field>
        <Field label="종료일 (선택)">
          <input type="date" value={form.endDate} onChange={(e) => setField('endDate', e.target.value)} className="input w-full" />
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

      {/* Payment section */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wide">과외비 설정</p>

        {/* Multi-student billing mode toggle */}
        {isMultiStudent && (
          <div className="flex gap-0 bg-gray-100 rounded-xl p-1 mb-4">
            <button
              type="button"
              onClick={() => setBillingMode('same')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                billingMode === 'same' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              전체 동일하게 적용
            </button>
            <button
              type="button"
              onClick={() => setBillingMode('perStudent')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                billingMode === 'perStudent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              학생별로 다르게
            </button>
          </div>
        )}

        {/* Single or "same" mode — single billing form */}
        {(!isMultiStudent || billingMode === 'same') && (
          <SingleBillingForm
            billing={defaultBillingForm}
            onChange={(key, val) => setDefaultBillingForm((f) => ({ ...f, [key]: val }))}
            startMonth={startMonth}
            actualSessions={actualSessions}
            fullMonthSessions={fullMonthSessions}
            isProrated={isProrated}
            durationHours={durationHours}
          />
        )}

        {/* Per-student billing */}
        {isMultiStudent && billingMode === 'perStudent' && (
          <div className="flex flex-col gap-3">
            {selectedStudentIds.length > 1 && (
              <button
                type="button"
                onClick={copyFirstToAll}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-blue-200 text-blue-600 text-xs font-semibold bg-blue-50"
              >
                <Copy size={12} />
                첫 번째 학생 설정을 모두에게 적용
              </button>
            )}
            {selectedStudentIds.map((sid, idx) => {
              const student = students.find((s) => s.id === sid);
              const sb = getStudentBilling(sid);
              return (
                <div key={sid} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-bold flex-shrink-0">
                      {student?.name?.[0] || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{student?.name}</p>
                      {[student?.schoolName || student?.school, student?.grade].filter(Boolean).join(' ') && (
                        <p className="text-xs text-gray-400">
                          {[student?.schoolName || student?.school, student?.grade].filter(Boolean).join(' ')}
                        </p>
                      )}
                    </div>
                    {idx === 0 && (
                      <span className="ml-auto text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                        기준
                      </span>
                    )}
                  </div>
                  <SingleBillingForm
                    billing={sb}
                    onChange={(key, val) => setStudentBilling(sid, key, val)}
                    startMonth={startMonth}
                    actualSessions={actualSessions}
                    fullMonthSessions={fullMonthSessions}
                    isProrated={isProrated}
                    durationHours={durationHours}
                    compact
                  />
                </div>
              );
            })}
          </div>
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

// ── Single billing form (reused for same/per-student) ─────────────────────────

function SingleBillingForm({
  billing, onChange, startMonth, actualSessions, fullMonthSessions, isProrated, durationHours, compact = false,
}) {
  const hasPaymentInput = billing.billingType === 'hourly' ? !!billing.hourlyRate : !!billing.monthlyFee;

  const estimatedFirstMonth = useMemo(() => {
    if (billing.billingType === 'hourly') {
      const rate = Number(billing.hourlyRate) || 0;
      if (!rate) return 0;
      return calculateHourlyFee({ hourlyRate: rate, durationHours, sessionCount: actualSessions });
    }
    const fee = Number(billing.monthlyFee) || 0;
    if (!fee) return 0;
    return isProrated
      ? calculateMonthlyProratedFee({ monthlyFee: fee, fullMonthSessionCount: fullMonthSessions, actualSessionCount: actualSessions })
      : fee;
  }, [billing.billingType, billing.monthlyFee, billing.hourlyRate, durationHours, actualSessions, fullMonthSessions, isProrated]);

  return (
    <div className="flex flex-col gap-3">
      {/* Billing type toggle */}
      <div className={`flex gap-0 bg-gray-100 rounded-xl p-1 ${compact ? '' : 'mb-1'}`}>
        <button
          type="button"
          onClick={() => onChange('billingType', 'monthly')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
            billing.billingType !== 'hourly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          월 수업료
        </button>
        <button
          type="button"
          onClick={() => onChange('billingType', 'hourly')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
            billing.billingType === 'hourly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          시급 계산
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {billing.billingType === 'monthly' ? (
          <Field label="월 수업료 (원)">
            <input
              type="number"
              value={billing.monthlyFee}
              onChange={(e) => onChange('monthlyFee', e.target.value)}
              placeholder="400000"
              className="input"
            />
          </Field>
        ) : (
          <Field label="시급 (원)">
            <input
              type="number"
              value={billing.hourlyRate}
              onChange={(e) => onChange('hourlyRate', e.target.value)}
              placeholder="30000"
              className="input"
            />
          </Field>
        )}
        <Field label="결제일 (매월)">
          <input
            type="number"
            value={billing.paymentDay}
            onChange={(e) => onChange('paymentDay', e.target.value)}
            placeholder="10"
            min="1" max="31"
            className="input"
          />
        </Field>
      </div>

      {/* Billing preview card */}
      {hasPaymentInput && actualSessions > 0 && estimatedFirstMonth > 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-0.5">
            {startMonth.replace('-', '년 ')}월 예상 과외비
          </p>
          <p className="text-lg font-bold text-gray-900">
            {formatCurrency(estimatedFirstMonth)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {billing.billingType === 'hourly' ? (
              `${Number(billing.hourlyRate).toLocaleString('ko-KR')}원 × ${durationHours}시간 × ${actualSessions}회`
            ) : isProrated ? (
              `월 중간 시작 · ${actualSessions}/${fullMonthSessions}회 기준`
            ) : (
              `${actualSessions}회 수업 기준`
            )}
          </p>
          {isProrated && (
            <p className="text-xs text-blue-500 mt-0.5">
              월 중간에 시작해서 첫 달 금액이 자동 조정됐어요
            </p>
          )}
        </div>
      )}
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
          <input type="time" value={form.startTime} onChange={(e) => setField('startTime', e.target.value)} className="input w-full" />
        </Field>
        <Field label="종료 시간">
          <input type="time" value={form.endTime} onChange={(e) => setField('endTime', e.target.value)} className="input w-full" />
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
