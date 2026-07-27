import { TUITION_RATE_GROUPS } from '../../../constants/academySettings';

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 9);
}

function displayAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? amount.toLocaleString('ko-KR')
    : '';
}

export default function TuitionRateFields({
  policy,
  rates = {},
  onChange,
  compact = false,
}) {
  if (!policy) return null;

  if (policy === 'class') {
    return (
      <div className="mt-4">
        <div className="rounded-2xl bg-gray-50 px-4 py-3">
          <p className="text-sm font-bold text-gray-800">반을 만들 때 금액을 입력해요</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            반마다 수강료가 다르므로 반 생성 화면에서 직접 설정합니다.
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

  const setAmount = (key, rawValue) => {
    const digits = digitsOnly(rawValue);
    const nextTable = { ...currentTable };
    if (digits) nextTable[key] = Number(digits);
    else delete nextTable[key];
    onChange?.({ ...(rates || {}), [policy]: nextTable });
  };

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">월 수강료 가격표</p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            운영하는 구간만 입력해도 괜찮아요.
          </p>
        </div>
        <span className="flex-shrink-0 text-[11px] text-gray-400">원</span>
      </div>

      <div className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-4'}>
        {groups.map((group) => (
          <div key={group.id}>
            {group.label && (
              <p className="mb-1.5 text-xs font-bold text-gray-600">{group.label}</p>
            )}
            <div className={`grid gap-2 ${
              policy === 'school_level' ? 'grid-cols-3' : 'grid-cols-3'
            }`}>
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
                      value={displayAmount(currentTable[option.id])}
                      onChange={(event) => setAmount(option.id, event.target.value)}
                      inputMode="numeric"
                      placeholder="0"
                      aria-label={`${option.label} 월 수강료`}
                      className="min-w-0 flex-1 bg-transparent text-right text-sm font-bold text-gray-900 outline-none"
                    />
                    <span className="text-[10px] text-gray-400">원</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <StudentOverrideHint />
    </div>
  );
}

function StudentOverrideHint() {
  return (
    <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-700">
      나중에 반을 만들거나 수정할 때 학생별로 수강료를 조정할 수 있어요.
    </p>
  );
}
