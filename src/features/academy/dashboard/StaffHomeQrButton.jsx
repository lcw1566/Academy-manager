import { useMemo, useState } from 'react';
import { QrCode } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { today as todayDate } from '../../../utils/date';
import QrScanSheet from '../attendance/QrScanSheet';

export default function StaffHomeQrButton({ staff }) {
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const staffAttendanceLogs = useWorkspaceStore((s) => s.staffAttendanceLogs) ?? [];
  const [open, setOpen] = useState(false);
  const todayStr = todayDate();

  const status = useMemo(() => {
    if (!staff?.id && !staff?.serverUserId) return 'hidden';
    const log = staff?.serverUserId
      ? staffAttendanceLogs.find(
          (l) => l.staff_user_id === staff.serverUserId && l.work_date === todayStr,
        )
      : null;
    const shift = academyStaffShifts
      .filter((sh) => sh.staffId === staff.id && sh.date === todayStr && sh.status !== 'canceled')
      .sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''))[0] || null;
    const hasStart = !!(log?.actual_start_time || shift?.actualStartTime);
    const hasEnd = !!(log?.actual_end_time || shift?.actualEndTime);
    if (hasEnd) return 'done';
    if (hasStart) return 'out';
    return 'in';
  }, [academyStaffShifts, staff?.id, staff?.serverUserId, staffAttendanceLogs, todayStr]);

  if (status === 'hidden') return null;

  const label = status === 'done' ? '퇴근 완료' : status === 'out' ? '퇴근하기' : '출근하기';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={status === 'done'}
        className="h-9 px-3 rounded-xl bg-[#191F28] text-white text-xs font-bold flex items-center gap-1.5 active:bg-black disabled:opacity-45"
      >
        <QrCode size={13} />
        {label}
      </button>
      {open && (
        <QrScanSheet
          mode="staff_self"
          autoStartCamera
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
