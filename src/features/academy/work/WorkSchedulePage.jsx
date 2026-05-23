// WorkSchedulePage — Pre-Phase 34
//
// 학원 모드 전용 "근무" 탭 페이지.
//
// 역할별 진입:
//   - owner   : 전체 staff 근무 일정 (오늘 / 이번 주) + "근무 추가" 버튼
//   - teacher : 본인 근무만 (오늘 / 이번 주 / 이번 달 합계) + 출/퇴근
//   - assistant : 본인 근무만 (동일)
//
// 데이터 모델은 기존 academyStaffShifts 를 그대로 사용한다 (Phase 30).
// staffId 는 academyTeachers / academyAssistants 의 로컬 id.
//
// 근무 추가 모달:
//   1) 강사/보조강사 선택 (검색 가능)
//   2) 날짜
//   3) 예정 시작/종료 + 휴게 분
//   4) 메모 (옵션)
// 저장 → 로컬 + (서버 user 매핑되어 있으면) Supabase write-through.
//
// 근무는 수업과는 별도. 한 명이 15:00–21:00 근무 안에 17:00–18:00 수업이 있어도
// 근무 일정은 한 row 로 관리할 수 있다 — "근무 시간 ≠ 수업 시간".

import { useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, Clock, LogIn, LogOut as LogOutIcon, Search,
  AlertTriangle, ChevronRight, Loader2,
} from 'lucide-react';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import {
  today as todayDate,
  formatDateShort,
  getCurrentMonth,
  getWeekDates,
  getKoreanWeekdayFromYMD,
} from '../../../utils/date';
import {
  createAcademyStaffShift,
  updateAcademyStaffShift as updateServerStaffShift,
  deleteAcademyStaffShift as deleteServerStaffShift,
} from '../../../services/supabase/domainApi';

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

function nowHHmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function shiftMinutes(sh) {
  const start = sh.actualStartTime || (sh.status === 'completed' ? sh.scheduledStartTime : null);
  const end = sh.actualEndTime || (sh.status === 'completed' ? sh.scheduledEndTime : null);
  if (!start || !end) return 0;
  const [sh1, sm1] = start.split(':').map(Number);
  const [sh2, sm2] = end.split(':').map(Number);
  if (Number.isNaN(sh1) || Number.isNaN(sh2)) return 0;
  const m = sh2 * 60 + sm2 - (sh1 * 60 + sm1) - (sh.breakMinutes || 0);
  return m > 0 ? m : 0;
}

export default function WorkSchedulePage() {
  const role = useAcademyStore((s) => s.role);
  if (role === 'owner') return <OwnerWorkView />;
  return <StaffWorkView />;
}

// ─── Owner: 전체 staff 일정 ──────────────────────────────────────
function OwnerWorkView() {
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const addAcademyStaffShift = useAcademyStore((s) => s.addAcademyStaffShift);
  const updateAcademyStaffShift = useAcademyStore((s) => s.updateAcademyStaffShift);
  const deleteAcademyStaffShift = useAcademyStore((s) => s.deleteAcademyStaffShift);
  const setStaffShiftServerId = useAcademyStore((s) => s.setStaffShiftServerId);
  const showToast = useAcademyStore((s) => s.showToast);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerStaffShifts = useWorkspaceStore((s) => s.loadServerStaffShifts);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const todayStr = todayDate();
  const weekDates = useMemo(() => getWeekDates(todayStr), [todayStr]);

  // staffId 로 lookup 하기 위한 map
  const staffMap = useMemo(() => {
    const m = new Map();
    academyTeachers.forEach((t) => m.set(t.id, { ...t, _role: 'teacher' }));
    academyAssistants.forEach((a) => m.set(a.id, { ...a, _role: 'assistant' }));
    return m;
  }, [academyTeachers, academyAssistants]);

  const todayShifts = useMemo(
    () => academyStaffShifts
      .filter((sh) => sh.date === todayStr && sh.status !== 'canceled')
      .sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || '')),
    [academyStaffShifts, todayStr],
  );

  const weekShiftsByDate = useMemo(() => {
    const map = new Map();
    weekDates.forEach((d) => map.set(d, []));
    for (const sh of academyStaffShifts) {
      if (!sh.date || !map.has(sh.date)) continue;
      if (sh.status === 'canceled') continue;
      map.get(sh.date).push(sh);
    }
    for (const d of weekDates) {
      map.get(d).sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''));
    }
    return map;
  }, [academyStaffShifts, weekDates]);

  const handleSave = async (data) => {
    if (!data.staffId) return;
    const staff = staffMap.get(data.staffId);
    if (!staff) return;
    const staffRole = staff._role;
    if (editing) {
      updateAcademyStaffShift(editing.id, {
        date: data.date,
        scheduledStartTime: data.scheduledStartTime || '',
        scheduledEndTime: data.scheduledEndTime || '',
        breakMinutes: Number(data.breakMinutes) || 0,
        memo: data.memo || '',
        status: data.status || editing.status,
      });
      setFormOpen(false);
      setEditing(null);
      if (editing.serverId && isAuthenticated && currentAcademyId) {
        try {
          await updateServerStaffShift(editing.serverId, {
            date: data.date,
            scheduled_start_time: data.scheduledStartTime || null,
            scheduled_end_time: data.scheduledEndTime || null,
            break_minutes: Number(data.breakMinutes) || 0,
            memo: data.memo || null,
            status: data.status || editing.status,
          });
        } catch (err) {
          console.warn('[supabase] update shift failed', err);
          showToast('변경사항은 저장됐지만 동기화에 실패했어요.', 'error');
        }
      }
      return;
    }
    const created = addAcademyStaffShift({
      staffId: data.staffId,
      staffRole,
      date: data.date,
      scheduledStartTime: data.scheduledStartTime || '',
      scheduledEndTime: data.scheduledEndTime || '',
      breakMinutes: Number(data.breakMinutes) || 0,
      memo: data.memo || '',
      status: 'scheduled',
    });
    setFormOpen(false);
    setEditing(null);
    if (staff.serverUserId && isAuthenticated && currentAcademyId) {
      try {
        const sr = await createAcademyStaffShift({
          academyId: currentAcademyId,
          staff_user_id: staff.serverUserId,
          staff_role: staffRole,
          date: data.date,
          scheduled_start_time: data.scheduledStartTime || null,
          scheduled_end_time: data.scheduledEndTime || null,
          break_minutes: Number(data.breakMinutes) || 0,
          status: 'scheduled',
          memo: data.memo || null,
        });
        if (sr?.id) setStaffShiftServerId(created.id, sr.id);
        loadServerStaffShifts();
      } catch (err) {
        console.warn('[supabase] create shift failed', err);
        showToast('변경사항은 저장됐지만 동기화에 실패했어요.', 'error');
      }
    }
  };

  const handleDelete = async (id) => {
    const target = academyStaffShifts.find((sh) => sh.id === id);
    deleteAcademyStaffShift(id);
    if (target?.serverId && isAuthenticated && currentAcademyId) {
      try { await deleteServerStaffShift(target.serverId); }
      catch (err) { console.warn('[supabase] delete shift failed', err); }
    }
  };

  const openEdit = (sh) => {
    setEditing(sh);
    setFormOpen(true);
  };

  return (
    <div>
      <Header title="근무 관리" />
      <div className="pt-14 pb-12">
        {/* 오늘 근무 */}
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-gray-700">오늘 근무 · {formatDateShort(todayStr)}</p>
            <button
              type="button"
              onClick={() => { setEditing(null); setFormOpen(true); }}
              className="flex items-center gap-1 text-xs font-bold text-blue-600 px-3 py-1.5 rounded-xl bg-blue-50 active:bg-blue-100"
            >
              <Plus size={12} /> 근무 추가
            </button>
          </div>
          {todayShifts.length === 0 ? (
            <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
              <Clock size={20} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">오늘 근무 일정이 없어요.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {todayShifts.map((sh) => (
                <OwnerShiftRow
                  key={sh.id}
                  shift={sh}
                  staff={staffMap.get(sh.staffId)}
                  onEdit={() => openEdit(sh)}
                  onDelete={() => setConfirmDeleteId(sh.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 이번 주 근무표 */}
        <div className="px-4 pt-5">
          <p className="text-sm font-bold text-gray-700 mb-2">이번 주 근무표</p>
          <div className="flex flex-col gap-2">
            {weekDates.map((d) => {
              const shifts = weekShiftsByDate.get(d) || [];
              const isTodayDate = d === todayStr;
              return (
                <div
                  key={d}
                  className={`bg-white rounded-2xl px-4 py-3 shadow-sm ${isTodayDate ? 'border border-blue-200' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`text-xs font-bold ${isTodayDate ? 'text-blue-600' : 'text-gray-700'}`}>
                      {d.slice(5)} ({getKoreanWeekdayFromYMD(d)})
                    </p>
                    {isTodayDate && (
                      <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                        오늘
                      </span>
                    )}
                    <p className="ml-auto text-[11px] text-gray-400">{shifts.length}건</p>
                  </div>
                  {shifts.length === 0 ? (
                    <p className="text-xs text-gray-300 mt-1">근무 없음</p>
                  ) : (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {shifts.map((sh) => {
                        const staff = staffMap.get(sh.staffId);
                        return (
                          <button
                            key={sh.id}
                            type="button"
                            onClick={() => openEdit(sh)}
                            className="flex items-center gap-2 text-left active:opacity-70"
                          >
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              staff?._role === 'assistant'
                                ? 'bg-purple-50 text-purple-700'
                                : 'bg-blue-50 text-blue-700'
                            }`}>
                              {staff?.name || '(이름 없음)'}
                            </span>
                            <span className="text-xs text-gray-600">
                              {sh.scheduledStartTime || '-'}~{sh.scheduledEndTime || '-'}
                            </span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_TONES[sh.status]}`}>
                              {STATUS_LABELS[sh.status]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed mt-5 px-4">
          근무 일정은 수업 일정과 별도예요. 한 근무 안에 여러 수업이 포함돼도 한 줄로 등록할 수 있어요.
          시급 직원의 급여는 이 근무 합계 시간을 기준으로 계산해요.
        </p>
      </div>

      {formOpen && (
        <ShiftFormModal
          initial={editing}
          teachers={academyTeachers}
          assistants={academyAssistants}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="근무 일정 삭제"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmDeleteId(null)}
              className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">취소</button>
            <button type="button" onClick={() => { handleDelete(confirmDeleteId); setConfirmDeleteId(null); }}
              className="flex-1 py-3.5 rounded-xl bg-red-500 text-white text-sm font-bold">삭제</button>
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

function OwnerShiftRow({ shift, staff, onEdit, onDelete }) {
  const tone = staff?._role === 'assistant'
    ? 'bg-purple-50 text-purple-700'
    : 'bg-blue-50 text-blue-700';
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tone}`}>
            {staff?._role === 'assistant' ? '보조' : '강사'}
          </span>
          <p className="text-sm font-bold text-gray-900 truncate">{staff?.name || '(삭제된 강사)'}</p>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_TONES[shift.status]}`}>
            {STATUS_LABELS[shift.status]}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          예정 {shift.scheduledStartTime || '-'}~{shift.scheduledEndTime || '-'}
          {shift.breakMinutes ? ` · 휴게 ${shift.breakMinutes}분` : ''}
        </p>
        {(shift.actualStartTime || shift.actualEndTime) && (
          <p className="text-xs text-emerald-600 mt-0.5">
            실제 {shift.actualStartTime || '-'}~{shift.actualEndTime || '-'}
          </p>
        )}
        {shift.memo && <p className="text-xs text-gray-400 mt-0.5 truncate">{shift.memo}</p>}
      </div>
      <button type="button" onClick={onEdit} className="p-2 text-blue-600 active:bg-blue-50 rounded-lg">
        <Pencil size={14} />
      </button>
      <button type="button" onClick={onDelete} className="p-2 text-red-500 active:bg-red-50 rounded-lg">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ─── Staff: 본인 근무 + 출/퇴근 ───────────────────────────────────
function StaffWorkView() {
  const role = useAcademyStore((s) => s.role);
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const updateAcademyStaffShift = useAcademyStore((s) => s.updateAcademyStaffShift);
  const computeStaffHoursForMonth = useAcademyStore((s) => s.computeStaffHoursForMonth);
  const showToast = useAcademyStore((s) => s.showToast);

  const authUserId = useAuthStore((s) => s.user?.id);
  const authUserEmail = useAuthStore((s) => s.user?.email);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerStaffShifts = useWorkspaceStore((s) => s.loadServerStaffShifts);
  const myMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );

  const myStaff = useMemo(
    () => findLocalStaffForUser(
      role === 'assistant' ? academyAssistants : academyTeachers,
      { userId: authUserId, memberId: myMembership?.id, email: authUserEmail },
    ),
    [academyTeachers, academyAssistants, role, authUserId, myMembership?.id, authUserEmail],
  );

  const [busy, setBusy] = useState(false);

  const todayStr = todayDate();
  const currentMonth = getCurrentMonth();
  const weekDates = useMemo(() => getWeekDates(todayStr), [todayStr]);

  const myShifts = useMemo(
    () => (myStaff ? academyStaffShifts.filter((sh) => sh.staffId === myStaff.id) : []),
    [academyStaffShifts, myStaff],
  );

  const todayShift = useMemo(() => {
    const list = myShifts
      .filter((sh) => sh.date === todayStr && sh.status !== 'canceled')
      .sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''));
    return list[0] || null;
  }, [myShifts, todayStr]);

  const weekShiftsByDate = useMemo(() => {
    const map = new Map();
    weekDates.forEach((d) => map.set(d, []));
    for (const sh of myShifts) {
      if (!sh.date || !map.has(sh.date)) continue;
      if (sh.status === 'canceled') continue;
      map.get(sh.date).push(sh);
    }
    for (const d of weekDates) {
      map.get(d).sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''));
    }
    return map;
  }, [myShifts, weekDates]);

  const totalHours = useMemo(
    () => (myStaff?.id ? computeStaffHoursForMonth(myStaff.id, currentMonth) : 0),
    [computeStaffHoursForMonth, myStaff?.id, currentMonth],
  );

  const writeThrough = async (serverId, patch) => {
    if (!serverId || !isAuthenticated || !currentAcademyId) return;
    try {
      await updateServerStaffShift(serverId, patch);
      loadServerStaffShifts();
    } catch (err) {
      console.warn('[supabase] clock action failed', err);
    }
  };

  const handleClockIn = async () => {
    if (!todayShift || busy) return;
    setBusy(true);
    const time = nowHHmm();
    updateAcademyStaffShift(todayShift.id, { actualStartTime: time });
    showToast('출근 시간을 기록했어요.');
    await writeThrough(todayShift.serverId, { actual_start_time: time });
    setBusy(false);
  };

  const handleClockOut = async () => {
    if (!todayShift || busy) return;
    setBusy(true);
    const time = nowHHmm();
    updateAcademyStaffShift(todayShift.id, { actualEndTime: time, status: 'completed' });
    showToast('퇴근 시간을 기록했어요.');
    await writeThrough(todayShift.serverId, { actual_end_time: time, status: 'completed' });
    setBusy(false);
  };

  const clockedIn = !!todayShift?.actualStartTime;
  const clockedOut = !!todayShift?.actualEndTime;

  return (
    <div>
      <Header title="내 근무" />
      <div className="pt-14 pb-12">
        {/* 오늘 근무 + 출/퇴근 */}
        <div className="px-4 pt-4">
          <p className="text-sm font-bold text-gray-700 mb-2">오늘 근무 · {formatDateShort(todayStr)}</p>
          {!todayShift ? (
            <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
              <Clock size={20} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">오늘 근무 일정이 없어요.</p>
              <p className="text-[11px] text-gray-400 mt-1">원장이 일정을 등록하면 여기에 표시돼요.</p>
            </div>
          ) : (
            <div className="bg-blue-50 rounded-2xl px-4 py-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={14} className="text-blue-600" />
                <p className="text-sm font-bold text-blue-700">
                  예정 {todayShift.scheduledStartTime || '-'} ~ {todayShift.scheduledEndTime || '-'}
                </p>
                <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_TONES[todayShift.status]}`}>
                  {STATUS_LABELS[todayShift.status]}
                </span>
              </div>
              {(clockedIn || clockedOut) && (
                <p className="text-xs text-gray-600 mb-2">
                  {clockedIn && `출근 ${todayShift.actualStartTime}`}
                  {clockedIn && clockedOut && ' · '}
                  {clockedOut && `퇴근 ${todayShift.actualEndTime}`}
                </p>
              )}
              {todayShift.memo && <p className="text-xs text-gray-500 mb-2">{todayShift.memo}</p>}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  disabled={clockedIn || busy}
                  onClick={handleClockIn}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white text-blue-700 text-xs font-bold border border-blue-200 active:bg-blue-100 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
                  {clockedIn ? '출근 완료' : '출근'}
                </button>
                <button
                  type="button"
                  disabled={!clockedIn || clockedOut || busy}
                  onClick={handleClockOut}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white text-emerald-700 text-xs font-bold border border-emerald-200 active:bg-emerald-100 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <LogOutIcon size={12} />}
                  {clockedOut ? '퇴근 완료' : '퇴근'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 이번 주 근무 */}
        <div className="px-4 pt-5">
          <p className="text-sm font-bold text-gray-700 mb-2">이번 주 근무</p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {weekDates.map((d) => {
              const list = weekShiftsByDate.get(d) || [];
              const isTodayDate = d === todayStr;
              return (
                <div
                  key={d}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${isTodayDate ? 'bg-blue-50/40' : ''}`}
                >
                  <div className="w-12 flex-shrink-0">
                    <p className={`text-xs font-bold ${isTodayDate ? 'text-blue-600' : 'text-gray-700'}`}>
                      {d.slice(5)}
                    </p>
                    <p className="text-[10px] text-gray-400">{getKoreanWeekdayFromYMD(d)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    {list.length === 0 ? (
                      <p className="text-xs text-gray-300">근무 없음</p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {list.map((sh) => (
                          <p key={sh.id} className="text-xs text-gray-700">
                            {sh.scheduledStartTime || '-'}~{sh.scheduledEndTime || '-'}
                            {sh.actualStartTime ? ` · 실제 ${sh.actualStartTime}~${sh.actualEndTime || '-'}` : ''}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 이번 달 합계 */}
        <div className="px-4 pt-5">
          <div className="bg-white rounded-2xl px-4 py-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">이번 달 합계 근무시간</p>
              <p className="text-xs text-gray-400 mt-0.5">{currentMonth}</p>
            </div>
            <p className="text-2xl font-bold text-blue-600">{totalHours.toFixed(1)}<span className="text-sm text-gray-400 font-normal ml-1">시간</span></p>
          </div>
        </div>

        {!myStaff && (
          <div className="mx-4 mt-5 bg-white rounded-2xl p-5 shadow-sm text-center">
            <p className="text-sm font-bold text-gray-700 mb-1">연결된 강사 정보가 없어요</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              원장이 본 계정과 연결된 강사/보조강사 항목을 만들면 여기에 일정이 표시돼요.
            </p>
          </div>
        )}

        <p className="text-[11px] text-gray-400 leading-relaxed mt-5 px-4">
          시급 계산은 이 근무 합계 시간을 기준으로 해요. actual 시간이 비어 있고 상태가 "완료" 인 경우 예정 시간을 사용해요.
        </p>
      </div>
    </div>
  );
}

// ─── 근무 추가/수정 모달 ─────────────────────────────────────────
// initial 이 있으면 수정 모드 (staffId 고정), 없으면 신규 모드 (staff 선택 가능)
function ShiftFormModal({ initial, teachers = [], assistants = [], onClose, onSave }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    staffId: initial?.staffId || '',
    date: initial?.date || todayDate(),
    scheduledStartTime: initial?.scheduledStartTime || '',
    scheduledEndTime: initial?.scheduledEndTime || '',
    breakMinutes: initial?.breakMinutes ? String(initial.breakMinutes) : '',
    memo: initial?.memo || '',
    status: initial?.status || 'scheduled',
  });
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const allStaff = useMemo(() => [
    ...teachers.map((t) => ({ ...t, _role: 'teacher' })),
    ...assistants.map((a) => ({ ...a, _role: 'assistant' })),
  ], [teachers, assistants]);
  const selectedStaff = allStaff.find((s) => s.id === form.staffId);
  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allStaff;
    return allStaff.filter((s) => (s.name || '').toLowerCase().includes(q)
      || (s.email || '').toLowerCase().includes(q));
  }, [allStaff, search]);

  const computedMinutes = useMemo(() => {
    if (!form.scheduledStartTime || !form.scheduledEndTime) return 0;
    return shiftMinutes({
      status: 'completed',
      scheduledStartTime: form.scheduledStartTime,
      scheduledEndTime: form.scheduledEndTime,
      breakMinutes: Number(form.breakMinutes) || 0,
    });
  }, [form.scheduledStartTime, form.scheduledEndTime, form.breakMinutes]);

  const canSave = !!form.staffId && !!form.date;

  const handleSave = () => {
    if (!canSave) return;
    onSave(form);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? '근무 일정 수정' : '근무 추가'}
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
        >
          저장
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 강사 선택 */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">대상 *</label>
          {isEdit ? (
            <div className="px-3 py-2.5 rounded-xl bg-gray-50 text-sm text-gray-700">
              {selectedStaff
                ? `${selectedStaff._role === 'assistant' ? '보조강사' : '강사'} · ${selectedStaff.name}`
                : '(삭제된 강사)'}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setStaffPickerOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 active:bg-gray-50 text-left"
            >
              <div className="flex-1 min-w-0">
                {selectedStaff ? (
                  <span className="text-sm text-gray-800">
                    {selectedStaff._role === 'assistant' ? '보조강사' : '강사'} · {selectedStaff.name}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">강사를 선택해주세요</span>
                )}
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </button>
          )}
        </div>

        {/* 날짜 */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">날짜 *</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className="input"
          />
        </div>

        {/* 시간 */}
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

        {/* 휴게 + 합계 */}
        <div className="grid grid-cols-2 gap-2">
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
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">근무 시간 (계산)</label>
            <div className="input flex items-center text-sm text-gray-700">
              {(computedMinutes / 60).toFixed(1)}시간
            </div>
          </div>
        </div>

        {/* 상태 (수정 모드에서만 변경 가능) */}
        {isEdit && (
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">상태</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(STATUS_LABELS).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, status: id }))}
                  className={`py-2.5 rounded-xl text-sm font-bold border-2 ${
                    form.status === id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 메모 */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
          <textarea
            value={form.memo}
            onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
            rows={2}
            placeholder="관련 수업, 클리닉, 특이사항 등"
            className="input resize-none"
          />
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed">
          한 근무 안에 여러 수업이 포함돼도 한 줄로 등록하세요. 시급 직원의 급여는 이 근무 합계로 계산돼요.
        </p>
      </div>

      {/* 강사 선택 서브 모달 */}
      {staffPickerOpen && (
        <Modal
          isOpen
          onClose={() => setStaffPickerOpen(false)}
          title="대상 선택"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50">
              <Search size={14} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름 또는 이메일로 검색"
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
            </div>
            <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
              {filteredStaff.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">등록된 강사가 없어요.</p>
              ) : (
                filteredStaff.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, staffId: s.id }));
                      setStaffPickerOpen(false);
                      setSearch('');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:bg-gray-50"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      s._role === 'assistant' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {(s.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{s.name || '(이름 없음)'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s._role === 'assistant' ? '보조강사' : '강사'}
                        {s.email ? ` · ${s.email}` : ''}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
