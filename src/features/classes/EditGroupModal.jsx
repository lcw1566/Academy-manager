import { useState, useMemo } from 'react';
import { Check, Users, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '../../components/Modal';
import useAcademyStore from '../../store/useAcademyStore';
import { getTodayYMD } from '../../utils/date';
import { DAY_OPTIONS, formatDays, generateClassDates } from '../../utils/recurringClass';
import { calculateDurationHours, resolveStudentBilling } from '../../utils/billing';

export default function EditGroupModal({ groupId, onClose }) {
  const { repeatGroups, students, updateRepeatGroup, updateRepeatGroupFuture } = useAcademyStore();
  const group = repeatGroups.find((g) => g.id === groupId);

  const [selectedStudentIds, setSelectedStudentIds] = useState(group?.studentIds || []);
  const [form, setForm] = useState({
    subject: group?.subject || '',
    location: group?.location || '',
    daysOfWeek: group?.daysOfWeek || [],
    startTime: group?.startTime || '16:00',
    endTime: group?.endTime || '18:00',
    startDate: group?.startDate || getTodayYMD(),
    endDate: group?.endDate || '',
    repeatType: group?.repeatType || '매주',
    memo: group?.memo || '',
  });

  // Billing state
  const existingDefaultBilling = group?.defaultBilling || {
    billingType: group?.billingType || 'monthly',
    monthlyFee: group?.monthlyFee || '',
    hourlyRate: group?.hourlyRate || '',
    paymentDay: group?.paymentDay || '',
  };
  const [billingMode, setBillingMode] = useState(group?.billingMode || 'same');
  const [defaultBillingForm, setDefaultBillingForm] = useState({
    billingType: existingDefaultBilling.billingType || 'monthly',
    monthlyFee: existingDefaultBilling.monthlyFee || '',
    hourlyRate: existingDefaultBilling.hourlyRate || '',
    paymentDay: existingDefaultBilling.paymentDay || '',
  });
  const [studentBillings, setStudentBillings] = useState(() => {
    const initial = {};
    for (const sid of group?.studentIds || []) {
      const b = resolveStudentBilling(group, sid);
      initial[sid] = {
        billingType: b.billingType || 'monthly',
        monthlyFee: b.monthlyFee || '',
        hourlyRate: b.hourlyRate || '',
        paymentDay: b.paymentDay || '',
      };
    }
    return initial;
  });

  const [showScopeSheet, setShowScopeSheet] = useState(false);

  if (!group) return null;

  const setF = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const toggleStudent = (id) =>
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  const toggleDay = (id) =>
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(id)
        ? f.daysOfWeek.filter((d) => d !== id)
        : [...f.daysOfWeek, id],
    }));

  const previewCount = useMemo(() => {
    if (form.daysOfWeek.length === 0 || !form.startDate) return 0;
    try {
      return generateClassDates({
        daysOfWeek: form.daysOfWeek,
        startDate: getTodayYMD(),
        endDate: form.endDate || null,
        repeatType: form.repeatType,
      }).length;
    } catch {
      return 0;
    }
  }, [form.daysOfWeek, form.startDate, form.endDate, form.repeatType]);

  const handleClickSave = () => {
    if (selectedStudentIds.length === 0) return alert('학생을 선택해주세요.');
    if (!form.subject.trim()) return alert('과목을 입력해주세요.');
    if (form.daysOfWeek.length === 0) return alert('수업 요일을 선택해주세요.');
    setShowScopeSheet(true);
  };

  const buildData = () => {
    const resolvedBillingMode = selectedStudentIds.length <= 1 ? 'same' : billingMode;
    const defaultBilling = {
      billingType: defaultBillingForm.billingType || 'monthly',
      monthlyFee: Number(defaultBillingForm.monthlyFee) || 0,
      hourlyRate: Number(defaultBillingForm.hourlyRate) || 0,
      paymentDay: Number(defaultBillingForm.paymentDay) || 10,
    };
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
    return {
      ...form,
      studentIds: selectedStudentIds,
      billingMode: resolvedBillingMode,
      defaultBilling,
      studentBillings: normalizedStudentBillings,
      billingType: defaultBilling.billingType,
      monthlyFee: defaultBilling.monthlyFee,
      hourlyRate: defaultBilling.hourlyRate,
      paymentDay: defaultBilling.paymentDay,
    };
  };

  const handleScopeBasic = () => {
    updateRepeatGroup(groupId, buildData());
    setShowScopeSheet(false);
    onClose();
  };

  const handleScopeFuture = () => {
    updateRepeatGroupFuture(groupId, buildData(), getTodayYMD());
    setShowScopeSheet(false);
    onClose();
  };

  const PRESET_SUBJECTS = ['수학', '영어', '국어', '과학', '물리'];
  const [showCustomSubject, setShowCustomSubject] = useState(
    !!form.subject && !PRESET_SUBJECTS.includes(form.subject)
  );

  const handleSubjectClick = (sub) => {
    if (sub === '기타') {
      setShowCustomSubject(true);
      setF('subject', '');
    } else {
      setShowCustomSubject(false);
      setF('subject', sub);
    }
  };

  const isMultiStudent = selectedStudentIds.length >= 2;
  const durationHours = calculateDurationHours(form.startTime, form.endTime);

  const setStudentBilling = (studentId, key, val) => {
    setStudentBillings((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [key]: val },
    }));
  };

  const getStudentBillingForm = (studentId) => ({
    billingType: 'monthly',
    monthlyFee: '',
    hourlyRate: '',
    paymentDay: '',
    ...studentBillings[studentId],
  });

  const copyFirstToAll = () => {
    if (selectedStudentIds.length < 2) return;
    const first = getStudentBillingForm(selectedStudentIds[0]);
    const updated = {};
    for (const sid of selectedStudentIds) {
      updated[sid] = { ...first };
    }
    setStudentBillings(updated);
  };

  return (
    <>
      <Modal
        isOpen
        onClose={showScopeSheet ? undefined : onClose}
        title="수업 수정"
        footer={
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleClickSave}
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl text-base"
          >
            수정 완료
          </motion.button>
        }
      >
        <p className="text-sm text-gray-400 mb-5">바꾸고 싶은 정보를 수정해주세요.</p>

        <div className="flex flex-col gap-5">
          {/* 학생 */}
          <Section label="학생">
            {students.length === 0 ? (
              <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                <Users size={15} className="text-yellow-600" />
                <p className="text-xs text-yellow-700">먼저 학생을 등록해주세요</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 max-h-44 overflow-y-auto rounded-xl border border-gray-200 p-2 bg-white">
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
          </Section>

          {/* 과목 */}
          <Section label="과목">
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
                onChange={(e) => setF('subject', e.target.value)}
                autoFocus
              />
            )}
          </Section>

          {/* 수업 요일 */}
          <Section label="수업 요일 (다중 선택)">
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
          </Section>

          {/* 시간 */}
          <div className="grid grid-cols-2 gap-3">
            <Section label="시작 시간">
              <input type="time" value={form.startTime} onChange={(e) => setF('startTime', e.target.value)} className="input" />
            </Section>
            <Section label="종료 시간">
              <input type="time" value={form.endTime} onChange={(e) => setF('endTime', e.target.value)} className="input" />
            </Section>
          </div>

          {/* 날짜 */}
          <div className="grid grid-cols-2 gap-3">
            <Section label="시작일">
              <input type="date" value={form.startDate} onChange={(e) => setF('startDate', e.target.value)} className="input" />
            </Section>
            <Section label="종료일 (선택)">
              <input type="date" value={form.endDate} onChange={(e) => setF('endDate', e.target.value)} className="input" />
            </Section>
          </div>

          {/* 반복 주기 */}
          <Section label="반복 주기">
            <div className="flex gap-2">
              {['매주', '격주', '매월'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setF('repeatType', r)}
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
          </Section>

          {/* 장소 */}
          <Section label="수업 장소">
            <input
              value={form.location}
              onChange={(e) => setF('location', e.target.value)}
              placeholder="예: 학생 자택, 카페"
              className="input"
            />
          </Section>

          {/* 수납 정보 */}
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

            {/* Same billing mode */}
            {(!isMultiStudent || billingMode === 'same') && (
              <>
                <div className="flex gap-0 bg-gray-100 rounded-xl p-1 mb-4">
                  <button
                    type="button"
                    onClick={() => setDefaultBillingForm((f) => ({ ...f, billingType: 'monthly' }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      defaultBillingForm.billingType !== 'hourly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    월 수업료
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultBillingForm((f) => ({ ...f, billingType: 'hourly' }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      defaultBillingForm.billingType === 'hourly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    시급 계산
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {defaultBillingForm.billingType === 'hourly' ? (
                    <Section label="시급 (원)">
                      <input
                        type="number"
                        value={defaultBillingForm.hourlyRate}
                        onChange={(e) => setDefaultBillingForm((f) => ({ ...f, hourlyRate: e.target.value }))}
                        placeholder="30000"
                        className="input"
                      />
                    </Section>
                  ) : (
                    <Section label="월 수업료 (원)">
                      <input
                        type="number"
                        value={defaultBillingForm.monthlyFee}
                        onChange={(e) => setDefaultBillingForm((f) => ({ ...f, monthlyFee: e.target.value }))}
                        placeholder="400000"
                        className="input"
                      />
                    </Section>
                  )}
                  <Section label="결제일 (매월)">
                    <input
                      type="number"
                      value={defaultBillingForm.paymentDay}
                      onChange={(e) => setDefaultBillingForm((f) => ({ ...f, paymentDay: e.target.value }))}
                      placeholder="10"
                      min="1" max="31"
                      className="input"
                    />
                  </Section>
                </div>
                {defaultBillingForm.billingType === 'hourly' && (
                  <p className="text-xs text-gray-400 mt-2">
                    수업 시간 {durationHours}시간 기준으로 월별 자동 계산돼요
                  </p>
                )}
              </>
            )}

            {/* Per-student billing mode */}
            {isMultiStudent && billingMode === 'perStudent' && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-gray-400">
                  이미 수납 완료된 금액은 변경하지 않아요.
                </p>
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
                  const sb = getStudentBillingForm(sid);
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
                      {/* Per-student billing toggle */}
                      <div className="flex gap-0 bg-gray-100 rounded-xl p-1 mb-3">
                        <button
                          type="button"
                          onClick={() => setStudentBilling(sid, 'billingType', 'monthly')}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            sb.billingType !== 'hourly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                          }`}
                        >
                          월 수업료
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudentBilling(sid, 'billingType', 'hourly')}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            sb.billingType === 'hourly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                          }`}
                        >
                          시급 계산
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {sb.billingType === 'hourly' ? (
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">시급 (원)</label>
                            <input
                              type="number"
                              value={sb.hourlyRate}
                              onChange={(e) => setStudentBilling(sid, 'hourlyRate', e.target.value)}
                              placeholder="30000"
                              className="input"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">월 수업료 (원)</label>
                            <input
                              type="number"
                              value={sb.monthlyFee}
                              onChange={(e) => setStudentBilling(sid, 'monthlyFee', e.target.value)}
                              placeholder="400000"
                              className="input"
                            />
                          </div>
                        )}
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">결제일</label>
                          <input
                            type="number"
                            value={sb.paymentDay}
                            onChange={(e) => setStudentBilling(sid, 'paymentDay', e.target.value)}
                            placeholder="10"
                            min="1" max="31"
                            className="input"
                          />
                        </div>
                      </div>
                      {(sb.billingType === 'monthly' ? sb.monthlyFee : sb.hourlyRate) && (
                        <p className="text-xs text-blue-600 mt-2 font-medium">
                          {sb.billingType === 'monthly'
                            ? `월 ${Number(sb.monthlyFee || 0).toLocaleString('ko-KR')}원`
                            : `시급 ${Number(sb.hourlyRate || 0).toLocaleString('ko-KR')}원 · ${durationHours}시간`
                          }
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 메모 */}
          <Section label="메모">
            <textarea
              value={form.memo}
              onChange={(e) => setF('memo', e.target.value)}
              placeholder="특이사항이나 메모"
              rows={2}
              className="input"
            />
          </Section>
        </div>
      </Modal>

      {/* 수정 범위 선택 bottom sheet */}
      <AnimatePresence>
        {showScopeSheet && (
          <>
            <motion.div
              key="scope-dim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[60]"
              onClick={() => setShowScopeSheet(false)}
            />
            <motion.div
              key="scope-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl px-4 pt-5 pb-10"
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <p className="text-base font-bold text-gray-900 mb-1">수정 범위 선택</p>
              <p className="text-sm text-gray-400 mb-5">어디까지 적용할까요?</p>

              <div className="flex flex-col gap-3">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleScopeBasic}
                  className="text-left bg-gray-50 rounded-2xl p-4"
                >
                  <p className="font-semibold text-gray-900 mb-0.5">기본 정보만 수정</p>
                  <p className="text-xs text-gray-500">과목, 장소, 시간 정보만 바꿔요. 기존 수업 일정은 유지됩니다.</p>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleScopeFuture}
                  className="text-left bg-blue-50 rounded-2xl p-4 border border-blue-100"
                >
                  <p className="font-semibold text-blue-800 mb-0.5">앞으로의 일정과 과외비 다시 계산</p>
                  <p className="text-xs text-blue-600">
                    오늘부터 미래 수업 일정과 과외비를 새로 만들어요.
                    {previewCount > 0 && ` 약 ${previewCount}개 수업이 생성됩니다.`}
                  </p>
                  <p className="text-xs text-blue-400 mt-1">
                    이미 수납 완료된 금액은 변경하지 않아요.
                  </p>
                </motion.button>
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowScopeSheet(false)}
                className="w-full mt-4 py-3 rounded-2xl bg-gray-100 text-sm font-semibold text-gray-600"
              >
                취소
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
