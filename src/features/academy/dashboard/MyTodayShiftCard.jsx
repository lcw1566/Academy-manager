// MyTodayShiftCard — Phase 31
//
// 강사/보조강사 홈에 노출되는 "오늘 근무" 카드.
// - 오늘 shift 가 있으면: 예정/실제 시간 + 출근/퇴근 버튼
// - 없으면: 카드 자체를 렌더하지 않음 (null 리턴)
//
// 출근/퇴근:
//   - 출근 → actual_start_time 을 현재 HH:mm 으로 set
//   - 퇴근 → actual_end_time 을 현재 HH:mm 으로 set + status='completed'
//   - 로컬 store update + (serverId 있으면) supabase update
//
// 본인 식별: staff prop (TeacherDashboard 의 myTeacher, AssistantDashboard 의 myAssistant)
import { useMemo, useState } from 'react';
import { Clock, LogIn, LogOut, ChevronRight } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { updateAcademyStaffShift as updateServerStaffShift } from '../../../services/supabase/domainApi';
import { today as todayDate } from '../../../utils/date';

function nowHHmm() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function MyTodayShiftCard({ staff, staffRole }) {
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const updateAcademyStaffShift = useAcademyStore((s) => s.updateAcademyStaffShift);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const showToast = useAcademyStore((s) => s.showToast);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerStaffShifts = useWorkspaceStore((s) => s.loadServerStaffShifts);
  const [busy, setBusy] = useState(false);

  const todayStr = todayDate();

  // 오늘의 본인 shift. staff.id 가 local 이고 serverUserId 매핑으로 본인.
  const myTodayShift = useMemo(() => {
    if (!staff?.id) return null;
    const candidates = academyStaffShifts.filter(
      (sh) => sh.staffId === staff.id && sh.date === todayStr && sh.status !== 'canceled',
    );
    // 시작 시간이 가장 빠른 것 우선
    return candidates.sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''))[0] || null;
  }, [academyStaffShifts, staff?.id, todayStr]);

  if (!myTodayShift) return null;

  const clockedIn = !!myTodayShift.actualStartTime;
  const clockedOut = !!myTodayShift.actualEndTime;

  const handleClockIn = async () => {
    if (busy) return;
    setBusy(true);
    const patch = { actualStartTime: nowHHmm() };
    updateAcademyStaffShift(myTodayShift.id, patch);
    showToast('출근 시간을 기록했어요.');
    if (myTodayShift.serverId && isAuthenticated && currentAcademyId) {
      try {
        await updateServerStaffShift(myTodayShift.serverId, {
          actual_start_time: patch.actualStartTime,
        });
        loadServerStaffShifts();
      } catch (err) {
        console.warn('[supabase] clock-in failed', err);
      }
    }
    setBusy(false);
  };

  const handleClockOut = async () => {
    if (busy) return;
    setBusy(true);
    const patch = { actualEndTime: nowHHmm(), status: 'completed' };
    updateAcademyStaffShift(myTodayShift.id, patch);
    showToast('퇴근 시간을 기록했어요.');
    if (myTodayShift.serverId && isAuthenticated && currentAcademyId) {
      try {
        await updateServerStaffShift(myTodayShift.serverId, {
          actual_end_time: patch.actualEndTime,
          status: 'completed',
        });
        loadServerStaffShifts();
      } catch (err) {
        console.warn('[supabase] clock-out failed', err);
      }
    }
    setBusy(false);
  };

  const toneByRole = staffRole === 'assistant'
    ? { bg: 'bg-purple-50', text: 'text-purple-700', iconBg: 'bg-purple-100', iconColor: 'text-purple-600' }
    : { bg: 'bg-blue-50',   text: 'text-blue-700',   iconBg: 'bg-blue-100',   iconColor: 'text-blue-600' };

  return (
    <div className="mx-4 mb-4">
      <div className={`rounded-2xl px-4 py-3.5 shadow-sm ${toneByRole.bg}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${toneByRole.iconBg}`}>
            <Clock size={16} className={toneByRole.iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${toneByRole.text}`}>오늘 근무</p>
            <p className="text-xs text-gray-600 mt-0.5">
              예정 {myTodayShift.scheduledStartTime || '-'} ~ {myTodayShift.scheduledEndTime || '-'}
              {myTodayShift.breakMinutes ? ` · 휴게 ${myTodayShift.breakMinutes}분` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('work')}
            className="text-[11px] font-semibold text-gray-500 flex items-center gap-0.5 active:opacity-60"
          >
            전체 보기 <ChevronRight size={12} />
          </button>
        </div>

        {(clockedIn || clockedOut) && (
          <p className="text-[11px] text-gray-600 mb-2">
            {clockedIn && `출근 ${myTodayShift.actualStartTime}`}
            {clockedIn && clockedOut && ' · '}
            {clockedOut && `퇴근 ${myTodayShift.actualEndTime}`}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={clockedIn || busy}
            onClick={handleClockIn}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white text-blue-700 text-xs font-bold border border-blue-200 active:bg-blue-100 disabled:opacity-50"
          >
            <LogIn size={12} />
            {clockedIn ? '출근 완료' : '출근'}
          </button>
          <button
            type="button"
            disabled={!clockedIn || clockedOut || busy}
            onClick={handleClockOut}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white text-emerald-700 text-xs font-bold border border-emerald-200 active:bg-emerald-100 disabled:opacity-50"
          >
            <LogOut size={12} />
            {clockedOut ? '퇴근 완료' : '퇴근'}
          </button>
        </div>
      </div>
    </div>
  );
}
