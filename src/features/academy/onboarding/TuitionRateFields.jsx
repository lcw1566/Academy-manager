import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  ACADEMY_SUBJECT_OPTIONS,
  TUITION_RATE_GROUPS,
} from '../../../constants/academySettings';

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 9);
}

function displayAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? amount.toLocaleString('ko-KR')
    : '';
}

function hasAmounts(table) {
  return table && Object.values(table).some((value) => Number(value) > 0);
}

export default function TuitionRateFields({
  policy,
  rates = {},
  onChange,
  compact = false,
  subjects = [],
}) {
  const subjectOptions = useMemo(
    () => (Array.isArray(subjects) ? subjects : [])
      .map((subjectId) => ACADEMY_SUBJECT_OPTIONS.find((option) => option.id === subjectId))
      .filter(Boolean),
    [subjects],
  );
  const subjectTables = rates?.subject_rates?.[policy] || {};
  const configuredSubjectIds = subjectOptions
    .filter((subject) => hasAmounts(subjectTables[subject.id]))
    .map((subject) => subject.id);
  const [showSubjectRates, setShowSubjectRates] = useState(configuredSubjectIds.length > 0);
  const [activeSubjectId, setActiveSubjectId] = useState(
    configuredSubjectIds[0] || subjectOptions[0]?.id || '',
  );

  useEffect(() => {
    if (!subjectOptions.some((subject) => subject.id === activeSubjectId)) {
      setActiveSubjectId(configuredSubjectIds[0] || subjectOptions[0]?.id || '');
    }
  }, [activeSubjectId, configuredSubjectIds, subjectOptions]);

  if (!policy) return null;

  if (policy === 'class') {
    return (
      <div className="mt-4">
        <div className="rounded-2xl bg-gray-50 px-4 py-3">
          <p className="text-sm font-bold text-gray-800">반마다 금액을 설정해요</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            반을 만들 때 과목에 맞는 수강료를 직접 입력합니다.
          </p>
        </div>
        <StudentOverrideHint />
      </div>
    );
  }

  const groups = TUITION_RATE_GROUPS[policy] || [];
  const currentTable = rates?.[policy] && typeof rates[policy] === 'object'
    ? rates[policy]
    : {};
  const activeSubject = subjectOptions.find((subject) => subject.id === activeSubjectId);
  const activeSubjectTable = activeSubject ? subjectTables[activeSubject.id] || {} : {};

  const setBaseAmount = (key, rawValue) => {
    const nextTable = updateAmount(currentTable, key, rawValue);
    onChange?.({ ...(rates || {}), [policy]: nextTable });
  };

  const setSubjectAmount = (key, rawValue) => {
    if (!activeSubject) return;
    const nextSubjectTable = updateAmount(activeSubjectTable, key, rawValue);
    onChange?.({
      ...(rates || {}),
      subject_rates: {
        ...(rates?.subject_rates || {}),
        [policy]: {
          ...subjectTables,
          [activeSubject.id]: nextSubjectTable,
        },
      },
    });
  };

  return (
    <div className="mt-4">
      <div className="mb-2">
        <p className="text-sm font-bold text-gray-900">기본 월 수강료</p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          {policy === 'school_level' ? '학교급별 금액이 모든 과목에 적용돼요.' : '학년별 금액이 모든 과목에 적용돼요.'}
        </p>
      </div>

      <TuitionRateGrid
        groups={groups}
        table={currentTable}
        onAmountChange={setBaseAmount}
        compact={compact}
      />

      <button
        type="button"
        onClick={() => setShowSubjectRates((open) => !open)}
        className={`mt-3 flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left ${
          showSubjectRates ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'
        }`}
      >
        <span>
          <span className="block text-sm font-bold text-gray-900">과목별로 다르게 받기</span>
          <span className="mt-0.5 block text-[11px] text-gray-500">필요한 과목만 기본 금액을 바꿔요.</span>
        </span>
        <span className="flex items-center gap-1.5">
          {configuredSubjectIds.length > 0 && (
            <span className="text-[11px] font-bold text-blue-600">{configuredSubjectIds.length}개</span>
          )}
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${showSubjectRates ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {showSubjectRates && (
        <div className="mt-3 rounded-2xl bg-gray-50 p-3">
          {subjectOptions.length === 0 ? (
            <p className="py-2 text-center text-xs text-gray-500">운영 과목을 먼저 선택해주세요.</p>
          ) : (
            <>
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
                {subjectOptions.map((subject) => {
                  const selected = subject.id === activeSubjectId;
                  const configured = hasAmounts(subjectTables[subject.id]);
                  return (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => setActiveSubjectId(subject.id)}
                      className={`flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                        selected
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      {subject.label}
                      {configured && <Check size={11} />}
                    </button>
                  );
                })}
              </div>
              <p className="mb-2 text-xs font-bold text-gray-700">{activeSubject?.label} 수강료</p>
              <TuitionRateGrid
                groups={groups}
                table={activeSubjectTable}
                fallbackTable={currentTable}
                onAmountChange={setSubjectAmount}
                compact
              />
              <p className="mt-2 text-[11px] text-gray-500">비워두면 기본 금액이 적용돼요.</p>
            </>
          )}
        </div>
      )}

      <StudentOverrideHint />
    </div>
  );
}

function updateAmount(table, key, rawValue) {
  const digits = digitsOnly(rawValue);
  const nextTable = { ...(table || {}) };
  if (digits) nextTable[key] = Number(digits);
  else delete nextTable[key];
  return nextTable;
}

function TuitionRateGrid({
  groups,
  table,
  fallbackTable = {},
  onAmountChange,
  compact,
}) {
  return (
    <div className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-4'}>
      {groups.map((group) => (
        <div key={group.id}>
          {group.label && (
            <p className="mb-1.5 text-xs font-bold text-gray-600">{group.label}</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {group.options.map((option) => (
              <label
                key={option.id}
                className="rounded-xl border border-gray-200 bg-white px-2.5 py-2"
              >
                <span className="block text-[11px] font-semibold text-gray-500">
                  {option.label}
                </span>
                <span className="mt-1 flex items-center gap-1">
                  <input
                    value={displayAmount(table?.[option.id])}
                    onChange={(event) => onAmountChange(option.id, event.target.value)}
                    inputMode="numeric"
                    placeholder={displayAmount(fallbackTable?.[option.id]) || '0'}
                    aria-label={`${option.label} 월 수강료`}
                    className="min-w-0 flex-1 bg-transparent text-right text-sm font-bold text-gray-900 outline-none placeholder:text-gray-300"
                  />
                  <span className="text-[10px] text-gray-400">원</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StudentOverrideHint() {
  return (
    <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
      나중에 학생별로 조정할 수 있어요.
    </p>
  );
}
