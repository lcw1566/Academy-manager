// MyTodayShiftCard — Phase 31
//
// 강사/보조강사 홈에 노출되는 "오늘 근무" 카드.
// - 오늘 shift 가 있으면: 예정/실제 시간 + 수동 출근/퇴근 보조 버튼
// - 없으면: 카드 자체를 렌더하지 않음 (null 리턴)
//
// 출근/퇴근:
//   - 출근 → actual_start_time 을 현재 HH:mm 으로 set
//   - 퇴근 → actual_end_time 을 현재 HH:mm 으로 set + status='completed'
//   - 로컬 store update + (serverId 있으면) supabase update
//
// 본인 식별: staff prop (TeacherDashboard 의 myTeacher, AssistantDashboard 의 myAssistant)
import { useMemo, useState } from 'react';
import { Clock, LogIn, LogOut } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { updateAcademyStaffShift as updateServerStaffShift } from '../../../services/supabase/domainApi';
import { getKoreaHHMM, today as todayDate } from '../../../utils/date';
// Phase 44.6 / Phase B — 룰 기반 예정 근무 머지.
import {
  buildPlannedStaffSchedule,
  mergePlannedAndActualStaffShifts,
  plannedToStaffShiftShape,
} from '../../../utils/schedule';
import { readAttendanceSettings } from '../attendance/attendanceHelpers';

function nowHHmm() {
  return getKoreaHHMM();
}

function formatClock(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function formatShiftTimeRange(start, end) {
  const s = formatClock(start);
  const e = formatClock(end);
  if (!s && !e) return '';
  return `${s || '-'} - ${e || '-'}`;
}

export default function MyTodayShiftCard({ staff, staffRole }) {
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const updateAcademyStaffShift = useAcademyStore((s) => s.updateAcademyStaffShift);
  const showToast = useAcademyStore((s) => s.showToast);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const loadServerStaffShifts = useWorkspaceStore((s) => s.loadServerStaffShifts);
  // Phase 44.6 / Phase B — 룰/예외 데이터.
  const staffWorkRules = useWorkspaceStore((s) => s.staffWorkRules) ?? [];
  const staffWorkExceptions = useWorkspaceStore((s) => s.staffWorkExceptions) ?? [];
  // Phase 44.7 / Phase C — 실제 출근 로그.
  const staffAttendanceLogs = useWorkspaceStore((s) => s.staffAttendanceLogs) ?? [];
  const createStaffAttendanceLogLocal = useWorkspaceStore((s) => s.createStaffAttendanceLogLocal);
  const updateStaffAttendanceLogLocal = useWorkspaceStore((s) => s.updateStaffAttendanceLogLocal);
  const [busy, setBusy] = useState(false);

  const todayStr = todayDate();
  const attendanceSettings = useMemo(() => {
    const academy = memberships.find((m) => m.academy_id === currentAcademyId)?.academy || null;
    return readAttendanceSettings(academy);
  }, [memberships, currentAcademyId]);

  // Phase 44.6 / Phase B — 본인 오늘 shift: 룰 기반 planned + 기존 shift 머지에서 1건.
  const myTodayShift = useMemo(() => {
    if (!staff?.id) return null;
    const plannedRaw = buildPlannedStaffSchedule({
      rules: staffWorkRules,
      exceptions: staffWorkExceptions,
      fromDate: todayStr,
      toDate: todayStr,
      staffUserId: staff.serverUserId || undefined,
    });
    const plannedShaped = plannedToStaffShiftShape(plannedRaw, { academyTeachers, academyAssistants });
    const actualToday = academyStaffShifts.filter(
      (sh) => sh.staffId === staff.id && sh.date === todayStr && sh.status !== 'canceled',
    );
    const merged = mergePlannedAndActualStaffShifts(plannedShaped, actualToday);
    // 시작 시간이 가장 빠른 것 우선
    return merged.sort(
      (a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''),
    )[0] || null;
  }, [academyStaffShifts, staff?.id, staff?.serverUserId, staffWorkRules, staffWorkExceptions, academyTeachers, academyAssistants, todayStr]);

  // Phase 44.7 / Phase C — 오늘 본인 attendance log 1건. log 가 SoT 가 된다.
  // legacy academy_staff_shifts.actual_* 는 호환을 위해 동시에 업데이트.
  // hook 순서 유지를 위해 myTodayShift early-return 보다 위에서 호출.
  const myTodayLog = useMemo(() => {
    if (!staff?.serverUserId) return null;
    return (staffAttendanceLogs || []).find(
      (l) => l.staff_user_id === staff.serverUserId && l.work_date === todayStr,
    ) || null;
  }, [staffAttendanceLogs, staff?.serverUserId, todayStr]);

  if (!myTodayShift) return null;

  // clock 상태: log 우선, 없으면 legacy shift.
  const clockedIn = !!(myTodayLog?.actual_start_time || myTodayShift.actualStartTime);
  const clockedOut = !!(myTodayLog?.actual_end_time || myTodayShift.actualEndTime);
  // serverUserId 없는 staff (계정 미연동) → 로그 INSERT 불가. legacy shift 만 사용.
  // staff_attendance_logs 가 SQL 014 미적용일 수도 있으므로 best-effort.
  const canUseLogs = !!staff?.serverUserId;
  // log 가 있으면 isPlanned 여도 출퇴근 가능. log 와 legacy 둘 다 없는 경우만 비활성.
  const isCheckinDisabled = myTodayShift.isPlanned && !canUseLogs;
  const canUseManualClock =
    attendanceSettings.staffCheckMethod === 'manual'
    && attendanceSettings.staffManualOverrideEnabled;

  // 공용 helper — 오늘 로그 upsert.
  const upsertTodayLog = async (fields, { source = 'manual' } = {}) => {
    if (!canUseLogs) return null;
    try {
      const confirmedFields = {
        ...fields,
        status: 'approved',
        approved_at: new Date().toISOString(),
      };
      if (myTodayLog?.id) {
        return await updateStaffAttendanceLogLocal(myTodayLog.id, confirmedFields);
      }
      return await createStaffAttendanceLogLocal({
        staff_user_id: staff.serverUserId,
        staff_role: staffRole || staff._role || 'teacher',
        work_date: todayStr,
        scheduled_start_time: myTodayShift.scheduledStartTime || null,
        scheduled_end_time: myTodayShift.scheduledEndTime || null,
        break_minutes: myTodayShift.breakMinutes ?? 0,
        source,
        ...confirmedFields,
      });
    } catch (err) {
      console.warn('[supabase] upsert attendance log failed', err);
      return null;
    }
  };

  const handleClockIn = async () => {
    if (busy) return;
    setBusy(true);
    const time = nowHHmm();
    // 1) staff_attendance_logs upsert — Phase C 의 새 source of truth.
    await upsertTodayLog({ actual_start_time: time }, { source: 'manual' });
    // 2) legacy academy_staff_shifts update (있을 때만). 호환을 위해 유지.
    if (myTodayShift && !myTodayShift.isPlanned) {
      const patch = { actualStartTime: time };
      updateAcademyStaffShift(myTodayShift.id, patch);
      if (myTodayShift.serverId && isAuthenticated && currentAcademyId) {
        try {
          await updateServerStaffShift(myTodayShift.serverId, {
            actual_start_time: patch.actualStartTime,
          });
          loadServerStaffShifts();
        } catch (err) {
          console.warn('[supabase] legacy clock-in failed', err);
        }
      }
    }
    showToast('출근 시간이 바로 저장됐어요.');
    setBusy(false);
  };

  const handleClockOut = async () => {
    if (busy) return;
    setBusy(true);
    const time = nowHHmm();
    await upsertTodayLog({ actual_end_time: time }, { source: 'manual' });
    if (myTodayShift && !myTodayShift.isPlanned) {
      const patch = { actualEndTime: time, status: 'completed' };
      updateAcademyStaffShift(myTodayShift.id, patch);
      if (myTodayShift.serverId && isAuthenticated && currentAcademyId) {
        try {
          await updateServerStaffShift(myTodayShift.serverId, {
            actual_end_time: patch.actualEndTime,
            status: 'completed',
          });
          loadServerStaffShifts();
        } catch (err) {
          console.warn('[supabase] legacy clock-out failed', err);
        }
      }
    }
    showToast('퇴근 시간이 바로 저장됐어요.');
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
              예정 {formatShiftTimeRange(myTodayShift.scheduledStartTime, myTodayShift.scheduledEndTime)}
              {myTodayShift.breakMinutes ? ` · 휴게 ${myTodayShift.breakMinutes}분` : ''}
            </p>
          </div>
          {/* Phase 44 — teacher/assistant 는 스태프 탭이 없으므로 "전체 보기" 제거. */}
        </div>

        {(clockedIn || clockedOut) && (
          <p className="text-[11px] text-gray-600 mb-2">
            {clockedIn && `출근 ${formatClock(myTodayLog?.actual_start_time || myTodayShift.actualStartTime)}`}
            {clockedIn && clockedOut && ' · '}
            {clockedOut && `퇴근 ${formatClock(myTodayLog?.actual_end_time || myTodayShift.actualEndTime)}`}
          </p>
        )}

        {canUseManualClock ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={clockedIn || busy || isCheckinDisabled}
              onClick={handleClockIn}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white text-blue-700 text-xs font-bold border border-blue-200 active:bg-blue-100 disabled:opacity-50"
            >
              <LogIn size={12} />
              {clockedIn ? '출근 완료' : '출근'}
            </button>
            <button
              type="button"
              disabled={!clockedIn || clockedOut || busy || isCheckinDisabled}
              onClick={handleClockOut}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white text-emerald-700 text-xs font-bold border border-emerald-200 active:bg-emerald-100 disabled:opacity-50"
            >
              <LogOut size={12} />
              {clockedOut ? '퇴근 완료' : '퇴근'}
            </button>
          </div>
        ) : (
          <p className="rounded-xl bg-white/70 px-3 py-2 text-center text-[11px] font-semibold text-gray-600">
            홈 상단의 QR 출퇴근 버튼을 이용해주세요.
          </p>
        )}
      </div>
    </div>
  );
}
