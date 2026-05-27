// AcademyStaffProfileModal
//
// Owner-side editor for academy_staff_profiles. Edits ONLY academy-specific
// settings for an accepted staff member:
//   - role (teacher / assistant)
//   - subjects
//   - wage_type, hourly_wage / monthly_salary
//   - memo
//
// Basic identity (name/email/phone) is owned by the user via their profile
// and is shown read-only at the top for confirmation.
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import useAcademyStore from '../../../store/useAcademyStore';
import {
  PERMISSION_DEFAULTS,
  PERMISSION_LABELS,
  PERMISSION_KEYS,
  resolvePermissions,
} from '../../../utils/staffPermissions';

const WAGE_TYPES = [
  { id: 'hourly',  label: '시급' },
  { id: 'monthly', label: '월급' },
];

const HOURLY_MODES = [
  {
    id: 'shiftHours',
    label: '근무시간 기준',
    description: '출퇴근/근무표에 기록된 학원 체류 시간을 기준으로 계산해요.',
  },
  {
    id: 'lessonHours',
    label: '수업시간 기준',
    description: '완료된 수업 시간만 기준으로 계산해요.',
  },
];

const ROLE_TYPES = [
  { id: 'teacher',   label: '강사' },
  { id: 'assistant', label: '보조강사' },
];

const SUBJECTS = ['수학', '영어', '국어', '과학', '사회', '물리', '화학', '역사', '기타'];

export default function AcademyStaffProfileModal({ userId, defaultRole = 'teacher', onClose }) {
  const memberProfiles = useWorkspaceStore((s) => s.academyMemberProfiles);
  const staffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles);
  const saveAcademyStaffProfile = useWorkspaceStore((s) => s.saveAcademyStaffProfile);
  const showToast = useAcademyStore((s) => s.showToast);

  const profile = useMemo(
    () => memberProfiles.find((p) => p.user_id === userId) || null,
    [memberProfiles, userId],
  );
  const existing = useMemo(
    () => staffProfiles.find((p) => p.user_id === userId) || null,
    [staffProfiles, userId],
  );

  const [role, setRole] = useState(existing?.role || defaultRole);
  const [subjects, setSubjects] = useState(
    Array.isArray(existing?.subjects) ? existing.subjects : [],
  );
  const [wageType, setWageType] = useState(existing?.wage_type || 'hourly');
  const [hourlyWage, setHourlyWage] = useState(
    existing?.hourly_wage ? String(existing.hourly_wage) : '',
  );
  const [monthlySalary, setMonthlySalary] = useState(
    existing?.monthly_salary ? String(existing.monthly_salary) : '',
  );
  const [hourlyMode, setHourlyMode] = useState(
    existing?.scope?.hourlyMode === 'lessonHours' ? 'lessonHours' : 'shiftHours',
  );
  const [memo, setMemo] = useState(existing?.memo || '');
  const [saving, setSaving] = useState(false);
  // Phase 30 — 권한 토글. 빈 객체면 default 사용.
  const [permissions, setPermissions] = useState(
    existing?.permissions && typeof existing.permissions === 'object' && Object.keys(existing.permissions).length > 0
      ? { ...resolvePermissions(existing.role || defaultRole, existing.permissions) }
      : { ...PERMISSION_DEFAULTS[existing?.role || defaultRole] },
  );

  // Refresh form if userId/staffProfiles change while open
  useEffect(() => {
    const nextRole = existing?.role || defaultRole;
    setRole(nextRole);
    setSubjects(Array.isArray(existing?.subjects) ? existing.subjects : []);
    setWageType(existing?.wage_type || 'hourly');
    setHourlyWage(existing?.hourly_wage ? String(existing.hourly_wage) : '');
    setMonthlySalary(existing?.monthly_salary ? String(existing.monthly_salary) : '');
    setHourlyMode(existing?.scope?.hourlyMode === 'lessonHours' ? 'lessonHours' : 'shiftHours');
    setMemo(existing?.memo || '');
    setPermissions(
      existing?.permissions && typeof existing.permissions === 'object' && Object.keys(existing.permissions).length > 0
        ? { ...resolvePermissions(nextRole, existing.permissions) }
        : { ...PERMISSION_DEFAULTS[nextRole] },
    );
  }, [existing, defaultRole]);

  // 역할 변경 시 권한 default 도 따라가도록 — 단 owner 가 명시적으로 토글한 값은 유지.
  useEffect(() => {
    setPermissions((prev) => ({ ...PERMISSION_DEFAULTS[role], ...prev }));
  }, [role]);

  const toggleSubject = (s) =>
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await saveAcademyStaffProfile({
        userId,
        role,
        subjects,
        wageType,
        hourlyWage: Number(hourlyWage) || 0,
        monthlySalary: Number(monthlySalary) || 0,
        memo: memo || null,
        status: 'active',
        permissions, // Phase 30 — jsonb 으로 그대로 전달
        scope: {
          ...(existing?.scope && typeof existing.scope === 'object' ? existing.scope : {}),
          hourlyMode,
        },
      });
      showToast('학원 설정이 저장되었습니다.');
      onClose?.();
    } catch (err) {
      showToast(err?.message ?? '저장에 실패했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="학원 강사 설정"
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-60 flex items-center justify-center gap-1.5"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          저장
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Read-only profile snapshot from profiles table */}
        <div className="bg-gray-50 rounded-2xl px-4 py-3">
          <p className="text-xs font-bold text-gray-500 mb-2">멤버 정보 (본인이 직접 등록)</p>
          <div className="flex items-center justify-between text-sm py-1">
            <span className="text-gray-500 text-xs">이름</span>
            <span className="font-medium text-gray-800 truncate ml-2">
              {profile?.display_name || '-'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm py-1 border-t border-gray-100 mt-1 pt-2">
            <span className="text-gray-500 text-xs">이메일</span>
            <span className="font-medium text-gray-800 truncate ml-2">
              {profile?.email || '-'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm py-1 border-t border-gray-100 mt-1 pt-2">
            <span className="text-gray-500 text-xs">연락처</span>
            <span className="font-medium text-gray-800 truncate ml-2">
              {profile?.phone || '-'}
            </span>
          </div>
        </div>

        {/* Role (teacher / assistant) */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">역할</label>
          <div className="grid grid-cols-2 gap-2">
            {ROLE_TYPES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${
                  role === r.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            academy_members 의 역할이 다른 경우 다음 동기화에서 일치되도록 별도로 조정해야 해요.
          </p>
        </div>

        {/* Subjects */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">담당 과목</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSubject(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                  subjects.includes(s)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Wage */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">급여 방식</label>
          <div className="grid grid-cols-2 gap-2">
            {WAGE_TYPES.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWageType(w.id)}
                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${
                  wageType === w.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          {wageType === 'hourly' && (
            <div className="mt-2 flex flex-col gap-2">
              <input
                type="number"
                value={hourlyWage}
                onChange={(e) => setHourlyWage(e.target.value)}
                placeholder="시급 (원)"
                className="input"
              />
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">급여 계산 기준</label>
                <div className="flex flex-col gap-2">
                  {HOURLY_MODES.map((mode) => {
                    const active = hourlyMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setHourlyMode(mode.id)}
                        className={`w-full text-left rounded-2xl border px-4 py-3 transition-colors ${
                          active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <p className={`text-sm font-bold ${active ? 'text-blue-700' : 'text-gray-800'}`}>
                          {mode.label}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                          {mode.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {wageType === 'monthly' && (
            <input
              type="number"
              value={monthlySalary}
              onChange={(e) => setMonthlySalary(e.target.value)}
              placeholder="월급 (원)"
              className="input mt-2"
            />
          )}
        </div>

        {/* Memo */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            placeholder="학원 내부 메모"
            className="input resize-none"
          />
        </div>

        {/* Phase 30 — 권한 토글 */}
        <div className="border-t border-gray-100 pt-4">
          <label className="text-xs font-semibold text-gray-600 mb-2 block">권한</label>
          <div className="flex flex-col gap-1.5">
            {PERMISSION_KEYS.map((key) => (
              <label
                key={key}
                className="flex items-center justify-between py-1.5 cursor-pointer"
              >
                <span className="text-sm text-gray-700">{PERMISSION_LABELS[key]}</span>
                <input
                  type="checkbox"
                  checked={!!permissions[key]}
                  onChange={(e) =>
                    setPermissions((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  className="w-4 h-4 rounded accent-blue-600"
                />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
            기본값은 역할별로 다르게 설정돼 있어요.
            지금은 UI 노출/숨김 용도이며, 서버 검증은 다음 단계에서 강화됩니다.
          </p>
        </div>
      </div>
    </Modal>
  );
}
