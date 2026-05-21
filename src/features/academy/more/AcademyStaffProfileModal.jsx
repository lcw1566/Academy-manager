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

const WAGE_TYPES = [
  { id: 'hourly',  label: '시급' },
  { id: 'monthly', label: '월급' },
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
  const [memo, setMemo] = useState(existing?.memo || '');
  const [saving, setSaving] = useState(false);

  // Refresh form if userId/staffProfiles change while open
  useEffect(() => {
    setRole(existing?.role || defaultRole);
    setSubjects(Array.isArray(existing?.subjects) ? existing.subjects : []);
    setWageType(existing?.wage_type || 'hourly');
    setHourlyWage(existing?.hourly_wage ? String(existing.hourly_wage) : '');
    setMonthlySalary(existing?.monthly_salary ? String(existing.monthly_salary) : '');
    setMemo(existing?.memo || '');
  }, [existing, defaultRole]);

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
            <input
              type="number"
              value={hourlyWage}
              onChange={(e) => setHourlyWage(e.target.value)}
              placeholder="시급 (원)"
              className="input mt-2"
            />
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
      </div>
    </Modal>
  );
}
