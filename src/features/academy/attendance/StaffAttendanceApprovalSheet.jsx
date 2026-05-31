// StaffAttendanceApprovalSheet — Phase 44.7 / Phase C
//
// 원장이 직원의 실제 출근 로그(staff_attendance_logs)를 검토/승인하는 sheet.
//
// 대상: status='pending' 인 log 목록. owner 만 사용.
//
// 행동:
//   - "예정 시간으로 인정"  → actual_start/end 를 scheduled 시간으로 덮어쓰기 + status='approved'
//   - "실제 시간으로 인정"  → 그대로 유지 + status='approved'
//   - "직접 수정"            → bottom sheet 로 시간 직접 입력 후 status='approved'
//   - "반려"                 → status='rejected', memo 옵션
//
// SQL 014 상태값: pending | completed | approved | rejected.
//   adjusted_* 컬럼은 정의되지 않았으므로, "예정 시간으로 인정" 은 actual_* 를
//   scheduled_* 로 덮어쓰는 방식으로 구현한다 (보수적, 컬럼 추가 없이 동작).

import { useMemo, useState } from 'react';
import { CheckCircle2, X as XIcon, Loader2, Pencil } from 'lucide-react';
import Modal from '../../../components/Modal';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import useAcademyStore from '../../../store/useAcademyStore';

function formatTime(t) {
  if (!t) return '-';
  return String(t).slice(0, 5);
}

function staffNameFromUserId(userId, teachers = [], assistants = []) {
  const t = teachers.find((x) => x?.serverUserId === userId);
  if (t) return t.name || '강사';
  const a = assistants.find((x) => x?.serverUserId === userId);
  if (a) return a.name || '보조강사';
  return '직원';
}

export default function StaffAttendanceApprovalSheet({ onClose }) {
  const staffAttendanceLogs = useWorkspaceStore((s) => s.staffAttendanceLogs) ?? [];
  const updateStaffAttendanceLogLocal = useWorkspaceStore((s) => s.updateStaffAttendanceLogLocal);
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const showToast = useAcademyStore((s) => s.showToast);

  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const pendingLogs = useMemo(
    () => (staffAttendanceLogs || [])
      .filter((l) => l.status === 'pending')
      .sort((a, b) => (b.work_date || '').localeCompare(a.work_date || '')),
    [staffAttendanceLogs],
  );

  const approveAsScheduled = async (log) => {
    if (busyId) return;
    setBusyId(log.id);
    try {
      await updateStaffAttendanceLogLocal(log.id, {
        actual_start_time: log.scheduled_start_time || log.actual_start_time || null,
        actual_end_time: log.scheduled_end_time || log.actual_end_time || null,
        status: 'approved',
      });
      showToast('예정 시간으로 인정했어요.');
    } catch (err) {
      showToast(err?.message || '승인에 실패했어요.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const approveAsActual = async (log) => {
    if (busyId) return;
    setBusyId(log.id);
    try {
      await updateStaffAttendanceLogLocal(log.id, { status: 'approved' });
      showToast('실제 시간으로 인정했어요.');
    } catch (err) {
      showToast(err?.message || '승인에 실패했어요.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (log) => {
    if (busyId) return;
    setBusyId(log.id);
    try {
      await updateStaffAttendanceLogLocal(log.id, { status: 'rejected' });
      showToast('반려했어요.');
    } catch (err) {
      showToast(err?.message || '반려에 실패했어요.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title="근퇴 확인"
        footer={
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-[#F2F4F6] text-[#191F28] font-bold py-3.5 rounded-xl"
          >
            닫기
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          {pendingLogs.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle2 size={28} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-[#4E5968]">확인할 출근 기록이 없어요.</p>
            </div>
          )}
          {pendingLogs.map((log) => {
            const name = staffNameFromUserId(log.staff_user_id, academyTeachers, academyAssistants);
            const isBusy = busyId === log.id;
            return (
              <div key={log.id} className="rounded-2xl bg-white border border-gray-100 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[#191F28]">{name}</p>
                  <span className="text-[11px] text-[#8B95A1]">{log.work_date}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <p className="text-[#8B95A1] mb-0.5">예정</p>
                    <p className="text-[#4E5968] font-semibold">
                      {formatTime(log.scheduled_start_time)} - {formatTime(log.scheduled_end_time)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8B95A1] mb-0.5">실제</p>
                    <p className="text-[#191F28] font-semibold">
                      {formatTime(log.actual_start_time)} - {formatTime(log.actual_end_time)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => approveAsScheduled(log)}
                    className="py-2.5 rounded-xl bg-[#E8F3FF] text-[#3182F6] text-[11px] font-bold disabled:opacity-60"
                  >
                    예정 시간으로 인정
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => approveAsActual(log)}
                    className="py-2.5 rounded-xl bg-[#3182F6] text-white text-[11px] font-bold disabled:opacity-60"
                  >
                    실제 시간으로 인정
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setEditing(log)}
                    className="py-2.5 rounded-xl bg-white border border-gray-200 text-[#4E5968] text-[11px] font-bold flex items-center justify-center gap-1 disabled:opacity-60"
                  >
                    <Pencil size={11} /> 직접 수정
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => reject(log)}
                    className="py-2.5 rounded-xl bg-[#FFF1F2] text-[#E53935] text-[11px] font-bold flex items-center justify-center gap-1 disabled:opacity-60"
                  >
                    <XIcon size={11} /> 반려
                  </button>
                </div>
                {isBusy && (
                  <div className="flex items-center gap-1 text-[10px] text-[#8B95A1]">
                    <Loader2 size={10} className="animate-spin" /> 처리 중...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
      {editing && (
        <EditLogSheet
          log={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            setBusyId(editing.id);
            try {
              await updateStaffAttendanceLogLocal(editing.id, { ...patch, status: 'approved' });
              showToast('수정 후 승인했어요.');
              setEditing(null);
            } catch (err) {
              showToast(err?.message || '저장에 실패했어요.', 'error');
            } finally {
              setBusyId(null);
            }
          }}
        />
      )}
    </>
  );
}

function EditLogSheet({ log, onClose, onSave }) {
  const [start, setStart] = useState(log.actual_start_time?.slice(0, 5) || log.scheduled_start_time?.slice(0, 5) || '');
  const [end, setEnd] = useState(log.actual_end_time?.slice(0, 5) || log.scheduled_end_time?.slice(0, 5) || '');
  const [breakMin, setBreakMin] = useState(log.break_minutes ?? 0);
  const [memo, setMemo] = useState(log.memo || '');
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="출근 기록 수정"
      footer={
        <button
          type="button"
          onClick={() => onSave({
            actual_start_time: start || null,
            actual_end_time: end || null,
            break_minutes: Number(breakMin) || 0,
            memo: memo || null,
          })}
          className="w-full bg-[#3182F6] text-white font-bold py-3.5 rounded-xl"
        >
          수정 후 승인
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-[11px] font-bold text-[#4E5968]">출근 시각</label>
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="input mt-1 w-full"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-[#4E5968]">퇴근 시각</label>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="input mt-1 w-full"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-[#4E5968]">휴게 (분)</label>
          <input
            type="number"
            value={breakMin}
            onChange={(e) => setBreakMin(e.target.value)}
            className="input mt-1 w-full"
            min={0}
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-[#4E5968]">메모</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="input mt-1 w-full"
            placeholder="필요하면 사유"
          />
        </div>
      </div>
    </Modal>
  );
}
