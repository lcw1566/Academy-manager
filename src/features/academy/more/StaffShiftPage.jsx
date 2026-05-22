// StaffShiftPage — Phase 30 근무표 / 타임카드 (local scaffold)
//
// Owner 또는 staff 가 한 명의 staff (teacher / assistant) 의 월 근무표를 보고
// shift 를 추가/수정한다. 우선은 로컬 store 만 사용하며, 서버 동기화는 향후 작업.
//
// Props:
//   - staff: { id, name, ... } — 로컬 academyTeachers / academyAssistants 항목
//   - staffRole: 'teacher' | 'assistant'
//   - canEdit: boolean — true 면 추가/수정 가능 (owner / 본인 한정)
//   - onBack: 닫기
//
// 데이터 모델 (useAcademyStore.academyStaffShifts):
//   { id, staffId, staffRole, date, scheduledStartTime, scheduledEndTime,
//     actualStartTime, actualEndTime, breakMinutes, status, memo,
//     createdAt, updatedAt }
import { useMemo, useState } from 'react';
import { ChevronLeft, Plus, Clock, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyStaffShift,
  updateAcademyStaffShift as updateServerStaffShift,
  deleteAcademyStaffShift as deleteServerStaffShift,
} from '../../../services/supabase/domainApi';
import Modal from '../../../components/Modal';
import { getCurrentMonth } from '../../../utils/date';

const STATUS_LABELS = {
  scheduled: '예정',
  completed: '완료',
  canceled: '취소',
};

const STATUS_TONES = {
  scheduled: 'text-blue-700 bg-blue-50',
  completed: 'text-emerald-700 bg-emerald-50',
  canceled: 'text-gray-500 bg-gray-100',
};

export default function StaffShiftPage({ staff, staffRole, canEdit, onBack }) {
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const addAcademyStaffShift = useAcademyStore((s) => s.addAcademyStaffShift);
  const updateAcademyStaffShift = useAcademyStore((s) => s.updateAcademyStaffShift);
  const deleteAcademyStaffShift = useAcademyStore((s) => s.deleteAcademyStaffShift);
  const setStaffShiftServerId = useAcademyStore((s) => s.setStaffShiftServerId);
  const computeStaffHoursForMonth = useAcademyStore((s) => s.computeStaffHoursForMonth);
  const showToast = useAcademyStore((s) => s.showToast);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerStaffShifts = useWorkspaceStore((s) => s.loadServerStaffShifts);

  const [month, setMonth] = useState(getCurrentMonth());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const monthShifts = useMemo(
    () =>
      academyStaffShifts
        .filter((sh) => sh.staffId === staff?.id && (sh.date || '').startsWith(month))
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || '')),
    [academyStaffShifts, staff?.id, month],
  );

  const totalHours = useMemo(
    () => (staff?.id ? computeStaffHoursForMonth(staff.id, month) : 0),
    [computeStaffHoursForMonth, staff?.id, month],
  );

  if (!staff) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-400">강사 정보를 찾을 수 없어요.</p>
      </div>
    );
  }

  const handleSave = async (data) => {
    if (editing) {
      // 로컬 먼저
      updateAcademyStaffShift(editing.id, data);
      setFormOpen(false);
      setEditing(null);
      // 서버 write-through (serverId 가 있을 때만)
      if (editing.serverId && isAuthenticated && currentAcademyId) {
        try {
          await updateServerStaffShift(editing.serverId, {
            date: data.date,
            scheduled_start_time: data.scheduledStartTime || null,
            scheduled_end_time: data.scheduledEndTime || null,
            actual_start_time: data.actualStartTime || null,
            actual_end_time: data.actualEndTime || null,
            break_minutes: Number(data.breakMinutes) || 0,
            status: data.status,
            memo: data.memo || null,
          });
        } catch (err) {
          console.warn('[supabase] update staff shift failed', err);
          showToast(err?.message ?? '서버 동기화는 실패했어요.', 'error');
        }
      }
    } else {
      // 로컬 먼저
      const created = addAcademyStaffShift({ staffId: staff.id, staffRole, ...data });
      setFormOpen(false);
      setEditing(null);
      // 서버 write-through — staff.serverUserId 가 있어야 한다.
      if (staff.serverUserId && isAuthenticated && currentAcademyId) {
        try {
          const sr = await createAcademyStaffShift({
            academyId: currentAcademyId,
            staff_user_id: staff.serverUserId,
            staff_role: staffRole,
            date: data.date,
            scheduled_start_time: data.scheduledStartTime || null,
            scheduled_end_time: data.scheduledEndTime || null,
            actual_start_time: data.actualStartTime || null,
            actual_end_time: data.actualEndTime || null,
            break_minutes: Number(data.breakMinutes) || 0,
            status: data.status || 'scheduled',
            memo: data.memo || null,
          });
          if (sr?.id) setStaffShiftServerId(created.id, sr.id);
          // 서버 목록 새로고침
          loadServerStaffShifts();
        } catch (err) {
          console.warn('[supabase] create staff shift failed', err);
          showToast(err?.message ?? '서버 동기화는 실패했어요.', 'error');
        }
      }
    }
  };

  const handleConfirmDelete = async (shiftId) => {
    const target = academyStaffShifts.find((sh) => sh.id === shiftId);
    deleteAcademyStaffShift(shiftId);
    if (target?.serverId && isAuthenticated && currentAcademyId) {
      try {
        await deleteServerStaffShift(target.serverId);
      } catch (err) {
        console.warn('[supabase] delete staff shift failed', err);
      }
    }
  };

  return (
    <div>
      <div className="fixed top-0 left-0 right-0 z-20 bg-white/95 border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 h-14">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 truncate">{staff.name} 근무표</p>
            <p className="text-xs text-gray-400">{staffRole === 'assistant' ? '보조강사' : '강사'}</p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="flex items-center gap-1 text-sm font-semibold text-blue-600 px-3 py-1.5 rounded-xl active:bg-blue-50"
            >
              <Plus size={14} />
              일정 추가
            </button>
          )}
        </div>
      </div>

      <div className="pt-16 pb-12 px-4 flex flex-col gap-4">
        {/* 월 선택 + 합계 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">조회 월</p>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="text-sm font-bold text-gray-900 bg-transparent focus:outline-none"
            />
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">합계 근무시간</p>
            <p className="text-base font-bold text-blue-600">{totalHours.toFixed(1)}시간</p>
          </div>
        </div>

        {/* 일정 목록 */}
        {monthShifts.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <Clock size={20} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400 text-center">이 달의 근무 일정이 없어요.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {monthShifts.map((sh) => (
              <div
                key={sh.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-900">{sh.date}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_TONES[sh.status]}`}>
                      {STATUS_LABELS[sh.status]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    예정 {sh.scheduledStartTime || '-'} ~ {sh.scheduledEndTime || '-'}
                    {sh.breakMinutes ? ` · 휴게 ${sh.breakMinutes}분` : ''}
                  </p>
                  {(sh.actualStartTime || sh.actualEndTime) && (
                    <p className="text-xs text-emerald-600 mt-0.5">
                      실제 {sh.actualStartTime || '-'} ~ {sh.actualEndTime || '-'}
                    </p>
                  )}
                  {sh.memo && <p className="text-xs text-gray-400 mt-0.5 truncate">{sh.memo}</p>}
                </div>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(sh);
                        setFormOpen(true);
                      }}
                      className="p-2 text-blue-600 active:bg-blue-50 rounded-lg"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(sh.id)}
                      className="p-2 text-red-500 active:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-gray-400 leading-relaxed">
          시급 직원의 급여 계산은 이 근무표 합계 시간을 기준으로 합니다.
          actual 시간이 비어 있으면 status=완료 인 경우에만 scheduled 시간을 사용합니다.
        </p>
      </div>

      {formOpen && (
        <ShiftFormModal
          initial={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}

      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="근무 일정 삭제"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                handleConfirmDelete(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
              className="flex-1 py-3.5 rounded-xl bg-red-500 text-white text-sm font-bold"
            >
              삭제
            </button>
          </div>
        }
      >
        <div className="bg-red-50 rounded-2xl px-4 py-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-red-700">선택한 근무 일정을 삭제할까요?</p>
        </div>
      </Modal>
    </div>
  );
}

function ShiftFormModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    date: initial?.date || new Date().toISOString().slice(0, 10),
    scheduledStartTime: initial?.scheduledStartTime || '',
    scheduledEndTime: initial?.scheduledEndTime || '',
    actualStartTime: initial?.actualStartTime || '',
    actualEndTime: initial?.actualEndTime || '',
    breakMinutes: initial?.breakMinutes ? String(initial.breakMinutes) : '',
    status: initial?.status || 'scheduled',
    memo: initial?.memo || '',
  });

  const handleSave = () => {
    if (!form.date) return alert('날짜를 입력해주세요.');
    onSave({
      ...form,
      breakMinutes: Number(form.breakMinutes) || 0,
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={initial ? '근무 일정 수정' : '근무 일정 추가'}
      footer={
        <button
          type="button"
          onClick={handleSave}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl"
        >
          저장
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">날짜</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className="input"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">예정 시작</label>
            <input
              type="time"
              value={form.scheduledStartTime}
              onChange={(e) => setForm((f) => ({ ...f, scheduledStartTime: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">예정 종료</label>
            <input
              type="time"
              value={form.scheduledEndTime}
              onChange={(e) => setForm((f) => ({ ...f, scheduledEndTime: e.target.value }))}
              className="input"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">실제 시작</label>
            <input
              type="time"
              value={form.actualStartTime}
              onChange={(e) => setForm((f) => ({ ...f, actualStartTime: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">실제 종료</label>
            <input
              type="time"
              value={form.actualEndTime}
              onChange={(e) => setForm((f) => ({ ...f, actualEndTime: e.target.value }))}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">휴게(분)</label>
          <input
            type="number"
            value={form.breakMinutes}
            onChange={(e) => setForm((f) => ({ ...f, breakMinutes: e.target.value }))}
            placeholder="0"
            className="input"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">상태</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(STATUS_LABELS).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, status: id }))}
                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${
                  form.status === id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
          <textarea
            value={form.memo}
            onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
            rows={2}
            placeholder="특이사항"
            className="input resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}
