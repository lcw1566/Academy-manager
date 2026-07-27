import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  ACADEMY_SUBJECT_OPTIONS,
  TUITION_RATE_GROUPS,
} from '../../../constants/academySettings';
import { formatKoreanCurrency } from '../../../utils/format';

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 9);
}

function updateAmount(table, key, rawValue) {
  const digits = digitsOnly(rawValue);
  const nextTable = { ...(table || {}) };
  if (digits) nextTable[key] = Number(digits);
  else delete nextTable[key];
  return nextTable;
}

function hasSubjectRates(rates) {
  const subjectRates = rates?.subject_rates;
  if (!subjectRates || typeof subjectRates !== 'object') return false;
  return Object.values(subjectRates).some((policyTables) =>
    policyTables
    && typeof policyTables === 'object'
    && Object.values(policyTables).some((table) =>
      table && Object.values(table).some((amount) => Number(amount) > 0)
    )
  );
}

const SCHOOL_LEVEL_OPTIONS = TUITION_RATE_GROUPS.school_level[0].options;
const GRADE_OPTIONS = TUITION_RATE_GROUPS.grade.flatMap((group) =>
  group.options.map((option) => ({
    ...option,
    label: option.id,
    schoolLevel: group.label,
  }))
);

export default function TuitionRateFields({
  rates = {},
  onChange,
  subjects = [],
}) {
  const subjectOptions = useMemo(
    () => (Array.isArray(subjects) ? subjects : [])
      .map((subjectId) => ACADEMY_SUBJECT_OPTIONS.find((option) => option.id === subjectId))
      .filter(Boolean),
    [subjects],
  );
  const subjectMode = rates?.subject_mode === true
    || (rates?.subject_mode === undefined && hasSubjectRates(rates));
  const [activeTarget, setActiveTarget] = useState('common');
  const [addingGrade, setAddingGrade] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [gradeAmount, setGradeAmount] = useState('');

  useEffect(() => {
    if (
      activeTarget !== 'common'
      && !subjectOptions.some((subject) => subject.id === activeTarget)
    ) {
      setActiveTarget('common');
    }
  }, [activeTarget, subjectOptions]);

  const isCommon = activeTarget === 'common';
  const activeSubject = subjectOptions.find((subject) => subject.id === activeTarget);
  const commonSchoolTable = rates?.school_level || {};
  const subjectSchoolTables = rates?.subject_rates?.school_level || {};
  const commonGradeTable = rates?.grade || {};
  const subjectGradeTables = rates?.subject_rates?.grade || {};
  const currentSchoolTable = isCommon
    ? commonSchoolTable
    : subjectSchoolTables[activeTarget] || {};
  const currentGradeTable = isCommon
    ? commonGradeTable
    : subjectGradeTables[activeTarget] || {};
  const configuredGrades = GRADE_OPTIONS.filter(
    (grade) => Number(currentGradeTable[grade.id]) > 0,
  );
  const availableGrades = GRADE_OPTIONS.filter(
    (grade) => !configuredGrades.some((configured) => configured.id === grade.id),
  );

  const setSubjectMode = (enabled) => {
    onChange?.({ ...(rates || {}), subject_mode: enabled });
    setActiveTarget('common');
    closeGradeForm();
  };

  const setSchoolAmount = (key, rawValue) => {
    const nextTable = updateAmount(currentSchoolTable, key, rawValue);
    if (isCommon) {
      onChange?.({ ...(rates || {}), school_level: nextTable });
      return;
    }
    onChange?.({
      ...(rates || {}),
      subject_rates: {
        ...(rates?.subject_rates || {}),
        school_level: {
          ...subjectSchoolTables,
          [activeTarget]: nextTable,
        },
      },
    });
  };

  const writeGradeTable = (nextTable) => {
    if (isCommon) {
      onChange?.({ ...(rates || {}), grade: nextTable });
      return;
    }
    onChange?.({
      ...(rates || {}),
      subject_rates: {
        ...(rates?.subject_rates || {}),
        grade: {
          ...subjectGradeTables,
          [activeTarget]: nextTable,
        },
      },
    });
  };

  const addGradeOverride = () => {
    if (!selectedGrade || Number(gradeAmount) <= 0) return;
    writeGradeTable({
      ...currentGradeTable,
      [selectedGrade]: Number(digitsOnly(gradeAmount)),
    });
    closeGradeForm();
  };

  function closeGradeForm() {
    setAddingGrade(false);
    setSelectedGrade('');
    setGradeAmount('');
  }

  const selectTarget = (target) => {
    setActiveTarget(target);
    closeGradeForm();
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        role="switch"
        aria-checked={subjectMode}
        onClick={() => setSubjectMode(!subjectMode)}
        disabled={subjectOptions.length === 0}
        className="flex w-full items-center justify-between rounded-2xl bg-gray-50 px-4 py-3.5 text-left disabled:opacity-50"
      >
        <span>
          <span className="block text-sm font-bold text-gray-900">과목마다 수강료가 달라요</span>
          <span className="mt-0.5 block text-[11px] text-gray-500">
            {subjectOptions.length > 0 ? '과목별 금액이 같다면 끄면 돼요.' : '운영 과목을 먼저 선택해주세요.'}
          </span>
        </span>
        <span
          className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
            subjectMode ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              subjectMode ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </span>
      </button>

      {subjectMode && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          <TargetChip
            label="공통"
            selected={isCommon}
            configured
            onClick={() => selectTarget('common')}
          />
          {subjectOptions.map((subject) => (
            <TargetChip
              key={subject.id}
              label={subject.label}
              selected={activeTarget === subject.id}
              configured={
                Object.values(subjectSchoolTables[subject.id] || {}).some((amount) => Number(amount) > 0)
                || Object.values(subjectGradeTables[subject.id] || {}).some((amount) => Number(amount) > 0)
              }
              onClick={() => selectTarget(subject.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-4">
        <p className="text-sm font-bold text-gray-900">
          {isCommon ? '학교급별 기본 수강료' : `${activeSubject?.label || ''} 수강료`}
        </p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          {isCommon
            ? '초등·중등·고등 금액을 입력해주세요.'
            : '비워두면 공통 금액이 적용돼요.'}
        </p>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {SCHOOL_LEVEL_OPTIONS.map((option) => (
          <AmountField
            key={option.id}
            label={option.label}
            value={currentSchoolTable[option.id]}
            fallbackValue={isCommon ? null : commonSchoolTable[option.id]}
            onChange={(value) => setSchoolAmount(option.id, value)}
          />
        ))}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-bold text-gray-900">학년별 예외</span>
            <span className="mt-0.5 block text-[11px] text-gray-500">다른 금액을 받는 학년만 추가해요.</span>
          </span>
          {!addingGrade && availableGrades.length > 0 && (
            <button
              type="button"
              onClick={() => setAddingGrade(true)}
              className="flex flex-shrink-0 items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600"
            >
              <Plus size={13} />
              추가
            </button>
          )}
        </div>

        {configuredGrades.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {configuredGrades.map((grade) => (
              <div
                key={grade.id}
                className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"
              >
                <span className="w-9 flex-shrink-0 text-xs font-bold text-blue-700">{grade.label}</span>
                <MoneyInput
                  value={currentGradeTable[grade.id]}
                  onValueChange={(value) => {
                    writeGradeTable(updateAmount(currentGradeTable, grade.id, value));
                  }}
                  inputMode="numeric"
                  aria-label={`${grade.label} 예외 수강료`}
                  className="min-w-0 flex-1 bg-transparent text-right text-sm font-bold text-gray-900 outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const nextTable = { ...currentGradeTable };
                    delete nextTable[grade.id];
                    writeGradeTable(nextTable);
                  }}
                  aria-label={`${grade.label} 예외 삭제`}
                  className="rounded-full p-1 text-gray-300 active:bg-gray-100"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {addingGrade && (
          <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <div className="grid grid-cols-6 gap-1.5">
              {availableGrades.map((grade) => (
                <button
                  key={grade.id}
                  type="button"
                  onClick={() => setSelectedGrade(grade.id)}
                  className={`rounded-lg py-2 text-[11px] font-bold ${
                    selectedGrade === grade.id
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 bg-white text-gray-700'
                  }`}
                >
                  {grade.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center rounded-xl border border-gray-300 bg-white px-3 py-2.5 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                <MoneyInput
                  value={gradeAmount}
                  onValueChange={(value) => setGradeAmount(digitsOnly(value))}
                  inputMode="numeric"
                  placeholder="금액"
                  aria-label="학년별 예외 수강료"
                  className="min-w-0 flex-1 bg-transparent text-right text-sm font-bold outline-none"
                />
              </label>
              <button
                type="button"
                onClick={closeGradeForm}
                className="rounded-xl px-2.5 py-2.5 text-xs font-bold text-gray-500"
              >
                취소
              </button>
              <button
                type="button"
                onClick={addGradeOverride}
                disabled={!selectedGrade || Number(gradeAmount) <= 0}
                className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white disabled:bg-blue-300"
              >
                적용
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
        나중에 학생별로 조정할 수 있어요.
      </p>
    </div>
  );
}

function TargetChip({ label, selected, configured, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${
        selected
          ? 'bg-blue-600 text-white'
          : 'border border-gray-200 bg-white text-gray-600'
      }`}
    >
      {label}
      {label !== '공통' && (
        <span className="flex h-[11px] w-[11px] flex-shrink-0 items-center justify-center">
          <Check
            size={11}
            className={configured ? '' : 'invisible'}
          />
        </span>
      )}
    </button>
  );
}

function AmountField({ label, value, fallbackValue, onChange }) {
  return (
    <label className="rounded-xl border border-gray-300 bg-white px-2.5 py-2.5 shadow-sm transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
      <span className="block text-[11px] font-bold text-gray-700">{label}</span>
      <span className="mt-1 flex items-center">
        <MoneyInput
          value={value}
          onValueChange={onChange}
          inputMode="numeric"
          placeholder={Number(fallbackValue) > 0 ? formatKoreanCurrency(fallbackValue) : '0'}
          aria-label={`${label} 월 수강료`}
          className="min-w-0 flex-1 bg-transparent text-right text-sm font-extrabold text-gray-950 outline-none placeholder:font-semibold placeholder:text-gray-500"
        />
      </span>
    </label>
  );
}

function MoneyInput({
  value,
  onValueChange,
  placeholder,
  className,
  ...inputProps
}) {
  const amount = Number(String(value || '').replace(/\D/g, ''));
  const displayValue = amount > 0 ? formatKoreanCurrency(amount) : '';

  return (
    <input
      {...inputProps}
      value={displayValue}
      onChange={(event) => onValueChange?.(event.target.value)}
      onFocus={(event) => {
        const input = event.currentTarget;
        requestAnimationFrame(() => input.select());
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Backspace' && event.key !== 'Delete') return;
        event.preventDefault();
        const input = event.currentTarget;
        const allSelected = input.selectionStart === 0
          && input.selectionEnd === input.value.length;
        const nextValue = allSelected ? '' : String(amount).slice(0, -1);
        onValueChange?.(nextValue);
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}
