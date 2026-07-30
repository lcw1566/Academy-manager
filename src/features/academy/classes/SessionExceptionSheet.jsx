// SessionExceptionSheet — Phase 44.7 / Phase C
//
// 학원장이 특정 수업 회차의 일회성 변경을 기록하는 sheet.
// 룰 기반 planned 회차에도, 실제 class_sessions row 에도 적용 가능.
//
// 타입:
//   - cancel     : 휴강 처리 (해당 날짜의 회차 제거)
//   - reschedule : 시간 변경
//   - extra      : 같은 그룹의 추가 회차 (정기 외)
//
// 대체 강사 (substitute) 는 ClassSessionPage 의 기존 SubstituteTeacherModal 이
// 담당하므로 여기에는 포함하지 않는다 (UI 중복 회피).
//
// 저장은 useWorkspaceStore.createClassSessionExceptionLocal 호출.
// 기존 class_sessions / lesson_records / attendance_records 는 건드리지 않음.

import { useState } from 'react';
import { CalendarX, Clock, PlusCircle, Loader2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import useAcademyStore from '../../../store/useAcademyStore';

export default function SessionExceptionSheet({ session, group, onClose }) {
  const createException = useWorkspaceStore((s) => s.createClassSessionExceptionLocal);
  const ensureClassSessionsForRangeLocal = useWorkspaceStore(
    (s) => s.ensureClassSessionsForRangeLocal,
  );
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const loadClassSessionExceptions = useWorkspaceStore(
    (s) => s.loadClassSessionExceptions,
  );
  const showToast = useAcademyStore((s) => s.showToast);

  const [mode, setMode] = useState(null); // null | 'cancel' | 'reschedule' | 'extra'
  const [start, setStart] = useState(session?.startTime?.slice(0, 5) || '');
  const [end, setEnd] = useState(session?.endTime?.slice(0, 5) || '');
  const [extraDate, setExtraDate] = useState(session?.date || '');
  const [reason, setReason] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  if (!session || !group) return null;

  const groupServerId = group.serverId;
  if (!groupServerId) {
    return (
      <Modal isOpen onClose={onClose} title="회차 변경">
        <p className="text-sm text-[#4E5968] leading-relaxed py-6 text-center">
          이 반은 아직 서버에 저장되지 않아 회차 변경을 적용할 수 없어요.<br />
          잠시 후 다시 시도해 주세요.
        </p>
      </Modal>
    );
  }

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let successMessage = '';
      const targetDate = mode === 'extra' ? extraDate : session.date;
      if (mode === 'cancel') {
        await createException({
          class_group_id: groupServerId,
          session_date: session.date,
          type: 'cancel',
          reason: reason || null,
          memo: memo || null,
        });
        successMessage = '휴강으로 처리됐어요.';
      } else if (mode === 'reschedule') {
        await createException({
          class_group_id: groupServerId,
          session_date: session.date,
          type: 'reschedule',
          start_time: start || null,
          end_time: end || null,
          reason: reason || null,
          memo: memo || null,
        });
        successMessage = '시간이 변경됐어요.';
      } else if (mode === 'extra') {
        await createException({
          class_group_id: groupServerId,
          session_date: extraDate,
          type: 'extra',
          start_time: start || null,
          end_time: end || null,
          memo: memo || null,
        });
        successMessage = '보강 수업이 추가됐어요.';
      }

      // 예외 행만 저장하고 닫으면 기존 실제 회차가 잠시 남아 등하원·클리닉에
      // 이전 시간이 보일 수 있다. 해당 날짜를 즉시 다시 실체화하고 최신 행을 받는다.
      try {
        await ensureClassSessionsForRangeLocal({
          fromDate: targetDate,
          toDate: targetDate,
          classGroupId: groupServerId,
        });
        await Promise.all([
          loadServerClassSessions(),
          loadClassSessionExceptions({ fromDate: targetDate, toDate: targetDate }),
        ]);
      } catch (refreshError) {
        console.warn('[class-session] saved exception refresh deferred', refreshError);
        showToast('변경은 저장됐지만 화면 반영이 늦어지고 있어요.', 'error');
        onClose?.();
        return;
      }

      showToast(successMessage);
      onClose?.();
    } catch (err) {
      showToast(err?.message || '저장에 실패했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const canSave = (() => {
    if (mode === 'cancel') return true;
    if (mode === 'reschedule') return !!start && !!end;
    if (mode === 'extra') return !!extraDate && !!start && !!end;
    return false;
  })();

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="회차 변경"
      footer={
        mode ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full bg-[#3182F6] text-white font-bold py-3.5 rounded-xl disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            저장
          </button>
        ) : null
      }
    >
      {!mode && (
        <div className="flex flex-col gap-2">
          <ActionRow
            icon={CalendarX}
            tone="red"
            title="휴강 처리"
            subtitle="이 날 수업을 진행하지 않아요."
            onClick={() => setMode('cancel')}
          />
          <ActionRow
            icon={Clock}
            tone="blue"
            title="시간 변경"
            subtitle="이 회차만 시작/종료 시간을 바꿔요."
            onClick={() => setMode('reschedule')}
          />
          <ActionRow
            icon={PlusCircle}
            tone="emerald"
            title="보강/추가 수업"
            subtitle="이 반의 추가 회차를 만들어요."
            onClick={() => setMode('extra')}
          />
        </div>
      )}

      {mode === 'cancel' && (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-[#4E5968] leading-relaxed bg-[#FFF1F2] rounded-2xl px-3 py-2.5">
            {session.date} 의 {group.name} 수업이 휴강으로 표시돼요. 이미 작성된 출결/수업 기록은 그대로 남습니다.
          </p>
          <div>
            <label className="text-[11px] font-bold text-[#4E5968]">사유 (선택)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-1 w-full" placeholder="예: 학원 공휴일" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-[#4E5968]">메모 (선택)</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} className="input mt-1 w-full" />
          </div>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-[#4E5968] leading-relaxed bg-[#E8F3FF] rounded-2xl px-3 py-2.5">
            {session.date} 의 시간만 변경돼요. 다음 회차부터는 원래 시간으로 돌아갑니다.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-[#4E5968]">시작</label>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input mt-1 w-full" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#4E5968]">종료</label>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input mt-1 w-full" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-[#4E5968]">사유 (선택)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-1 w-full" />
          </div>
        </div>
      )}

      {mode === 'extra' && (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-[#4E5968] leading-relaxed bg-[#ECFDF5] rounded-2xl px-3 py-2.5">
            정기 일정 외 추가 회차를 만들어요. {group.name} 반에 단발성 수업이 추가됩니다.
          </p>
          <div>
            <label className="text-[11px] font-bold text-[#4E5968]">날짜</label>
            <input type="date" value={extraDate} onChange={(e) => setExtraDate(e.target.value)} className="input mt-1 w-full" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-[#4E5968]">시작</label>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input mt-1 w-full" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#4E5968]">종료</label>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input mt-1 w-full" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-[#4E5968]">메모 (선택)</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} className="input mt-1 w-full" />
          </div>
        </div>
      )}
    </Modal>
  );
}

function ActionRow({ icon: Icon, tone = 'blue', title, subtitle, onClick }) {
  const toneClass = {
    red:     { bg: 'bg-[#FFF1F2]', color: 'text-[#E53935]' },
    blue:    { bg: 'bg-[#E8F3FF]', color: 'text-[#3182F6]' },
    emerald: { bg: 'bg-[#ECFDF5]', color: 'text-[#059669]' },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-gray-200 bg-white active:bg-gray-50"
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${toneClass.bg}`}>
        <Icon size={16} className={toneClass.color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#191F28]">{title}</p>
        <p className="text-[11px] text-[#8B95A1] mt-0.5">{subtitle}</p>
      </div>
    </button>
  );
}
