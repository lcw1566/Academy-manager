// MyPayrollCard — Phase 32
//
// Teacher / Assistant 홈에 노출되는 "내 급여 (이번 달)" 요약 카드.
// canViewPayroll 권한 있을 때만 노출. payroll row 가 없으면 안내 카드 노출.
import { useMemo } from 'react';
import { Wallet, ChevronRight } from 'lucide-react';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import useAuthStore from '../../../store/useAuthStore';
import { currentUserCan } from '../../../utils/staffPermissions';

export default function MyPayrollCard({ role, myPayroll, myStaffProfile, onOpen }) {
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
      <p className="text-sm font-bold text-gray-700 mb-2">내 급여 (이번 달)</p>
      <button
        type="button"
        onClick={onOpen}
        className="w-full bg-white rounded-2xl px-4 py-3.5 border border-gray-100 shadow-sm flex items-center gap-3 active:bg-gray-50 text-left"
      >
        <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Wallet size={16} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          {myPayroll ? (
            <>
              <p className="text-sm font-bold text-gray-900">
                {(myPayroll.amount || 0).toLocaleString()}원
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {myPayroll.wageType === 'hourly'
                  ? `시급 ${(myPayroll.hourlyWage || 0).toLocaleString()}원 · ${Number(myPayroll.totalHours || 0).toFixed(1)}시간`
                  : `월급 ${(myPayroll.monthlySalary || 0).toLocaleString()}원`}
                {' · '}
                {myPayroll.status === 'paid' ? '지급 완료' : '지급 예정'}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-700">아직 명세가 없어요</p>
              <p className="text-xs text-gray-400 mt-0.5">원장이 이번 달 명세를 만들면 표시돼요.</p>
            </>
          )}
        </div>
        <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
      </button>
    </div>
  );
}
