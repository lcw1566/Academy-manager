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
import { lazy, Suspense, useMemo, useState } from 'react';
import { Clock, LogIn, LogOut, QrCode } from 'lucide-react';
import { motion } from 'framer-motion';
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

const QrScanSheet = lazy(() => import('../attendance/QrScanSheet'));

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

export default function MyTodayShiftCard({ staff, staffRole, variant = 'card' }) {
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const updateAcademyStaffShift = useAcademyStore((s) => s.updateAcademyStaffShift);
  const showToast = useAcademyStore((s) => s.showToast);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUserId = useAuthStore((s) => s.user?.id);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const loadServerStaffShifts = useWorkspaceStore((s) => s.loadServerStaffShifts);
  // Phase 44.6 / Phase B — 룰/예외 데이터.
  const staffWorkRules = useWorkspaceStore((s) => s.staffWorkRules) ?? [];
  const staffWorkExceptions = useWorkspaceStore((s) => s.staffWorkExceptions) ?? [];
  // Phase 44.7 / Phase C — 실제 출근 로그.
  const staffAttendanceLogs = useWorkspaceStore((s) => s.staffAttendanceLogs) ?? [];
  const recordStaffAttendanceLocal = useWorkspaceStore((s) => s.recordStaffAttendanceLocal);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const todayStr = todayDate();
  const activeMembership = useMemo(
    () => memberships.find((membership) => (
      membership.academy_id === currentAcademyId
      && membership.status === 'active'
    )) || null,
    [currentAcademyId, memberships],
  );
  // 테스트 역할 전환 직후에는 서버 멤버십이 먼저 갱신되고 로컬 직원 목록이
  // 한 박자 늦게 들어올 수 있다. 이때도 로그인 사용자를 본인 직원으로 식별해
  // 출퇴근 액션이 사라지지 않도록 한다.
  const effectiveStaff = useMemo(() => {
    if (staff) return staff;
    if (!authUserId || !activeMembership) return null;
    return {
      id: `account:${authUserId}`,
      serverUserId: authUserId,
      academyMemberId: activeMembership.id,
      _role: staffRole || activeMembership.role || 'teacher',
    };
  }, [activeMembership, authUserId, staff, staffRole]);
  const attendanceSettings = useMemo(() => {
    const academy = memberships.find((m) => m.academy_id === currentAcademyId)?.academy || null;
    return readAttendanceSettings(academy);
  }, [memberships, currentAcademyId]);

  // Phase 44.6 / Phase B — 본인 오늘 shift: 룰 기반 planned + 기존 shift 머지에서 1건.
  const myTodayShift = useMemo(() => {
    if (!effectiveStaff?.serverUserId && !effectiveStaff?.id) return null;
    const plannedRaw = buildPlannedStaffSchedule({
      rules: staffWorkRules,
      exceptions: staffWorkExceptions,
      fromDate: todayStr,
      toDate: todayStr,
      staffUserId: effectiveStaff.serverUserId || undefined,
    });
    const plannedShaped = plannedToStaffShiftShape(plannedRaw, { academyTeachers, academyAssistants });
    const actualToday = academyStaffShifts.filter(
      (sh) => (
        sh.staffId === effectiveStaff.id
        || (effectiveStaff.serverUserId && sh.staffUserId === effectiveStaff.serverUserId)
      ) && sh.date === todayStr && sh.status !== 'canceled',
    );
    const merged = mergePlannedAndActualStaffShifts(plannedShaped, actualToday);
    // 시작 시간이 가장 빠른 것 우선
    return merged.sort(
      (a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''),
    )[0] || null;
  }, [academyStaffShifts, effectiveStaff?.id, effectiveStaff?.serverUserId, staffWorkRules, staffWorkExceptions, academyTeachers, academyAssistants, todayStr]);

  // Phase 44.7 / Phase C — 오늘 본인 attendance log 1건. log 가 SoT 가 된다.
  // legacy academy_staff_shifts.actual_* 는 호환을 위해 동시에 업데이트.
  // hook 순서 유지를 위해 myTodayShift early-return 보다 위에서 호출.
  const myTodayLog = useMemo(() => {
    if (!effectiveStaff?.serverUserId) return null;
    return (staffAttendanceLogs || []).find(
      (l) => l.staff_user_id === effectiveStaff.serverUserId && l.work_date === todayStr,
    ) || null;
  }, [effectiveStaff?.serverUserId, staffAttendanceLogs, todayStr]);

  if (!effectiveStaff || (variant === 'card' && !myTodayShift)) return null;

  // clock 상태: log 우선, 없으면 legacy shift.
  const clockedIn = !!(myTodayLog?.actual_start_time || myTodayShift?.actualStartTime);
  const clockedOut = !!(myTodayLog?.actual_end_time || myTodayShift?.actualEndTime);
  // serverUserId 없는 staff (계정 미연동) → 로그 INSERT 불가. legacy shift 만 사용.
  // staff_attendance_logs 가 SQL 014 미적용일 수도 있으므로 best-effort.
  const canUseLogs = !!effectiveStaff?.serverUserId;
  // log 가 있으면 isPlanned 여도 출퇴근 가능. log 와 legacy 둘 다 없는 경우만 비활성.
  const isCheckinDisabled = myTodayShift?.isPlanned && !canUseLogs;
  const canUseManualClock =
    attendanceSettings.staffCheckMethod === 'manual'
    && attendanceSettings.staffManualOverrideEnabled;

  const recordToday = (action, time, source = 'manual') => {
    if (!canUseLogs) throw new Error('직원 계정 연결을 확인해주세요.');
    return recordStaffAttendanceLocal({
      staffUserId: effectiveStaff.serverUserId,
      staffRole: staffRole || effectiveStaff._role || 'teacher',
      workDate: todayStr,
      action,
      time,
      scheduledStartTime: myTodayShift?.scheduledStartTime || null,
      scheduledEndTime: myTodayShift?.scheduledEndTime || null,
      breakMinutes: myTodayShift?.breakMinutes ?? 0,
      source,
    });
  };

  const handleClockIn = async () => {
    if (busy) return;
    setBusy(true);
    const time = nowHHmm();
    try {
      const saved = await recordToday('clock_in', time);
      if (!saved?.id) throw new Error('서버에서 출근 기록을 확인하지 못했어요.');
      if (saved._attendance_action === 'none') {
        showToast('이미 저장된 출근 기록을 확인했어요.');
        return;
      }
      // legacy academy_staff_shifts update (있을 때만). 호환을 위해 유지.
      if (myTodayShift && !myTodayShift.isPlanned) {
        const patch = { actualStartTime: saved.actual_start_time || time };
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
    } catch (err) {
      console.warn('[staff attendance] clock-in failed', err);
      showToast(err?.message || '출근 시간을 저장하지 못했어요.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleClockOut = async () => {
    if (busy) return;
    setBusy(true);
    const time = nowHHmm();
    try {
      const saved = await recordToday('clock_out', time);
      if (!saved?.id) throw new Error('서버에서 퇴근 기록을 확인하지 못했어요.');
      if (saved._attendance_action === 'none') {
        showToast('이미 저장된 퇴근 기록을 확인했어요.');
        return;
      }
      if (myTodayShift && !myTodayShift.isPlanned) {
        const patch = { actualEndTime: saved.actual_end_time || time, status: 'completed' };
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
    } catch (err) {
      console.warn('[staff attendance] clock-out failed', err);
      showToast(err?.message || '퇴근 시간을 저장하지 못했어요.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toneByRole = staffRole === 'assistant'
    ? { bg: 'bg-purple-50', text: 'text-purple-700', iconBg: 'bg-purple-100', iconColor: 'text-purple-600' }
    : { bg: 'bg-blue-50',   text: 'text-blue-700',   iconBg: 'bg-blue-100',   iconColor: 'text-blue-600' };

  if (variant === 'action') {
    const usesQr = attendanceSettings.staffCheckMethod === 'qr';
    const actionLabel = usesQr
      ? 'QR 출퇴근'
      : clockedOut ? '근무 완료' : clockedIn ? '퇴근' : '출근';
    const ActionIcon = usesQr ? QrCode : clockedIn ? LogOut : LogIn;
    const handleAction = () => {
      if (usesQr) setQrOpen(true);
      else if (clockedIn) void handleClockOut();
      else void handleClockIn();
    };
    return (
      <>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={handleAction}
          disabled={busy || clockedOut || isCheckinDisabled || (!usesQr && !canUseManualClock)}
          className={`pressable-surface h-9 shrink-0 rounded-xl px-3 text-sm font-bold shadow-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-50 ${
            clockedOut
              ? 'bg-seenit-success-soft text-seenit-success'
              : 'bg-seenit-brand text-seenit-on-brand'
          }`}
          aria-label={actionLabel}
        >
          <ActionIcon size={15} />
          <span>{busy ? '저장 중' : actionLabel}</span>
        </motion.button>
        {qrOpen && (
          <Suspense fallback={null}>
            <QrScanSheet
              mode="staff_self"
              staffRoleFallback={staffRole}
              autoStartCamera
              onClose={() => setQrOpen(false)}
            />
          </Suspense>
        )}
      </>
    );
  }

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
              예정 {formatShiftTimeRange(myTodayShift?.scheduledStartTime, myTodayShift?.scheduledEndTime)}
              {myTodayShift?.breakMinutes ? ` · 휴게 ${myTodayShift.breakMinutes}분` : ''}
            </p>
          </div>
          {/* Phase 44 — teacher/assistant 는 스태프 탭이 없으므로 "전체 보기" 제거. */}
        </div>

        {(clockedIn || clockedOut) && (
          <p className="text-[11px] text-gray-600 mb-2">
            {clockedIn && `출근 ${formatClock(myTodayLog?.actual_start_time || myTodayShift?.actualStartTime)}`}
            {clockedIn && clockedOut && ' · '}
            {clockedOut && `퇴근 ${formatClock(myTodayLog?.actual_end_time || myTodayShift?.actualEndTime)}`}
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
