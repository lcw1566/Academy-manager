// MyPayrollCard — Phase 32
//
// Teacher / Assistant 홈에 노출되는 "내 급여 (이번 달)" 요약 카드.
// canViewPayroll 권한 있을 때만 노출. payroll row 가 없으면 안내 카드 노출.
import { useMemo } from 'react';
import { Clock3 } from 'lucide-react';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import useAuthStore from '../../../store/useAuthStore';
import { currentUserCan } from '../../../utils/staffPermissions';

export default function MyPayrollCard({ role, myStaffProfile, onOpen }) {
  const authUserId = useAuthStore((s) => s.user?.id);
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const staffProfile = useMemo(
    () => academyStaffProfiles.find((sp) => sp.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );
  const canView = currentUserCan({ role, staffProfile }, 'canViewPayroll');

  if (!canView) return null;
  if (!myStaffProfile) return null;

  return (
    <div className="mx-4 mb-5">
      <p className="text-sm font-bold text-gray-700 mb-2">급여</p>
      <button
        type="button"
        onClick={onOpen}
        className="w-full bg-white rounded-2xl px-4 py-3.5 border border-gray-100 shadow-sm flex items-center gap-3 active:bg-gray-50 text-left"
      >
        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Clock3 size={16} className="text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-700">파일럿 이후 제공 예정</p>
          <p className="text-xs text-gray-400 mt-0.5">급여 계산과 명세 기능을 준비하고 있어요.</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500">
          준비 중
        </span>
      </button>
    </div>
  );
}
