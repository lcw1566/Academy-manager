import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  normalizeJobTitlePermissions,
} from '../../../utils/staffPermissions';

const SENSITIVE_KEYS = new Set([
  'canManageStaffPermissions',
  // 현재 잠긴 기능과 전 직원 공통 기능은 직책마다 다르게 설정하지 않는다.
  'canViewPayroll',
  'canViewPayments',
  'canManagePayments',
  'canManageDrive',
]);
const CONFIGURABLE_PERMISSION_KEYS = PERMISSION_KEYS.filter(
  (key) => !SENSITIVE_KEYS.has(key),
);
const ACADEMY_WIDE_MANAGEMENT_KEYS = new Set([
  'canManageClasses',
  'canManageStudents',
  'canManagePayments',
  'canManageStaff',
]);

export default function JobTitlePermissionEditor({ value, onChange }) {
  const policies = useMemo(() => normalizeJobTitlePermissions(value), [value]);
  const [expandedTitle, setExpandedTitle] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const updatePolicy = (title, patch) => {
    const next = {
      ...policies,
      [title]: {
        ...policies[title],
        ...patch,
      },
    };
    onChange?.(next);
  };

  const togglePermission = (title, key) => {
    const policy = policies[title];
    const permissions = {
      ...policy.permissions,
      [key]: !policy.permissions[key],
    };
    updatePolicy(title, {
      permissions,
      role: [...ACADEMY_WIDE_MANAGEMENT_KEYS].some(
        (permissionKey) => permissions[permissionKey],
      ) ? 'manager' : 'teacher',
    });
  };

  const addTitle = () => {
    const title = newTitle.trim().slice(0, 40);
    if (!title || policies[title]) return;
    onChange?.({
      ...policies,
      [title]: {
        role: 'teacher',
        permissions: { ...policies['선생님']?.permissions },
      },
    });
    setNewTitle('');
    setExpandedTitle(title);
  };

  const removeTitle = (title) => {
    if (['선생님', '운영 매니저'].includes(title)) return;
    const next = { ...policies };
    delete next[title];
    onChange?.(next);
    if (expandedTitle === title) setExpandedTitle('');
  };

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-[#E5E8EB] bg-white">
        {Object.entries(policies).map(([title, policy], index) => {
          const expanded = expandedTitle === title;
          const enabledCount = CONFIGURABLE_PERMISSION_KEYS.filter(
            (key) => policy.permissions[key],
          ).length;
          return (
            <div key={title} className={index > 0 ? 'border-t border-[#F2F4F6]' : ''}>
              <button
                type="button"
                onClick={() => setExpandedTitle(expanded ? '' : title)}
                className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left active:bg-gray-50"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-600">
                  {title.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-[#191F28]">{title}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-[#8B95A1]">
                    권한 {enabledCount}개
                  </span>
                </span>
                {expanded ? <ChevronUp size={16} className="text-[#8B95A1]" /> : <ChevronDown size={16} className="text-[#8B95A1]" />}
              </button>

              {expanded && (
                <div className="border-t border-[#F2F4F6] bg-[#F8FAFC] px-3.5 py-4">
                  <div className="space-y-1.5">
                    {CONFIGURABLE_PERMISSION_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => togglePermission(title, key)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 text-left"
                      >
                        <span className="text-xs font-bold text-[#333D4B]">{PERMISSION_LABELS[key]}</span>
                        <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border ${
                          policy.permissions[key]
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-[#D1D6DB] bg-white text-transparent'
                        }`}>
                          <Check size={13} strokeWidth={3} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-[#8B95A1]">
                    학생·반·직원 관리 권한을 켜면 학원 전체 범위로 자동 적용돼요.
                  </p>
                  {!['선생님', '운영 매니저'].includes(title) && (
                    <button
                      type="button"
                      onClick={() => removeTitle(title)}
                      className="mt-3 flex items-center gap-1.5 text-xs font-bold text-red-500"
                    >
                      <Trash2 size={13} />
                      직책 삭제
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value.slice(0, 40))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addTitle();
            }
          }}
          placeholder="새 직책"
          className="input min-w-0 flex-1"
          maxLength={40}
        />
        <button
          type="button"
          onClick={addTitle}
          disabled={!newTitle.trim() || Boolean(policies[newTitle.trim()])}
          className="flex h-12 items-center gap-1 rounded-xl bg-[#F2F4F6] px-4 text-xs font-bold text-[#333D4B] disabled:opacity-40"
        >
          <Plus size={14} />
          추가
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-[#8B95A1]">
        직원은 직책의 기본 권한을 받고, 직원 탭에서 개인별로 조정할 수 있어요.
      </p>
    </div>
  );
}
