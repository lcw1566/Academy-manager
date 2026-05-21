// DangerZoneSection
//
// Owner-only block that exposes irreversible operations:
//   1) Reset current academy server data (keeps academy / members / invitations)
//   2) Delete the entire academy workspace
//
// Both flows require typed confirmation. The buttons are hidden entirely
// for teacher/assistant accounts and for the local-only mode (which uses
// the existing tutor MorePage path).
import { useState } from 'react';
import { AlertTriangle, Trash2, Eraser, Loader2 } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import useAuthStore from '../../../store/useAuthStore';
import Modal from '../../../components/Modal';
import {
  resetCurrentAcademyServerData,
  deleteAcademyWorkspace,
} from '../../../services/supabase/dangerApi';

export default function DangerZoneSection() {
  const role = useAcademyStore((s) => s.role);
  const showToast = useAcademyStore((s) => s.showToast);
  const resetAcademyData = useAcademyStore((s) => s.resetAcademyData);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const memberships = useWorkspaceStore((s) => s.memberships);
  const setCurrentAcademyId = useWorkspaceStore((s) => s.setCurrentAcademyId);

  // Loaders we'll refresh after server reset
  const loadServerStudents = useWorkspaceStore((s) => s.loadServerStudents);
  const loadServerClassGroups = useWorkspaceStore((s) => s.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const loadServerLessonRecords = useWorkspaceStore((s) => s.loadServerLessonRecords);
  const loadServerAttendanceRecords = useWorkspaceStore((s) => s.loadServerAttendanceRecords);
  const loadServerClinicRecords = useWorkspaceStore((s) => s.loadServerClinicRecords);
  const loadServerPayments = useWorkspaceStore((s) => s.loadServerPayments);
  const loadServerPayrolls = useWorkspaceStore((s) => s.loadServerPayrolls);
  const loadMemberships = useWorkspaceStore((s) => s.loadMemberships);

  const [serverResetOpen, setServerResetOpen] = useState(false);
  const [deleteAcademyOpen, setDeleteAcademyOpen] = useState(false);

  // Only owners of the current academy see Danger Zone. We check both
  // the local "role" state and the server membership to be safe — for
  // a fresh signup the local role might still be 'tutor' until they
  // explicitly switch into academy mode.
  const currentMembership = memberships.find((m) => m.academy_id === currentAcademyId);
  const isOwnerHere = currentMembership?.role === 'owner';
  if (!isAuthenticated || !currentAcademyId || !isOwnerHere) return null;

  // Hide from explicit teacher/assistant role view as well
  if (role === 'teacher' || role === 'assistant') return null;

  const academyName = currentMembership?.academy?.name ?? '(이름 없음)';

  const handleServerReset = async () => {
    try {
      const summary = await resetCurrentAcademyServerData(currentAcademyId);
      const total = Object.values(summary).reduce((acc, n) => acc + n, 0);
      showToast(`서버 데이터를 초기화했어요. (${total}개 row 삭제)`);
      await Promise.all([
        loadServerStudents(),
        loadServerClassGroups(),
        loadServerClassSessions(),
        loadServerLessonRecords(),
        loadServerAttendanceRecords(),
        loadServerClinicRecords(),
        loadServerPayments(),
        loadServerPayrolls(),
      ]);
    } catch (err) {
      showToast(err?.message ?? '서버 데이터 초기화에 실패했어요.', 'error');
      throw err;
    }
  };

  const handleAcademyDelete = async () => {
    try {
      await deleteAcademyWorkspace(currentAcademyId);
      // Pick another academy if available, else clear
      const remaining = memberships.filter((m) => m.academy_id !== currentAcademyId);
      setCurrentAcademyId(remaining[0]?.academy_id ?? null);
      await loadMemberships();
      // Local academy data tied to this workspace is now stale. We don't
      // auto-wipe localStorage — the user can run "Reset this device only"
      // separately if they want.
      showToast('학원이 삭제되었어요.');
    } catch (err) {
      showToast(err?.message ?? '학원 삭제에 실패했어요.', 'error');
      throw err;
    }
  };

  return (
    <div className="mx-4 mt-5">
      <p className="text-xs font-bold text-red-500 mb-3 flex items-center gap-1.5">
        <AlertTriangle size={12} />
        Danger Zone — 되돌릴 수 없는 작업
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setServerResetOpen(true)}
          className="w-full flex items-center gap-3 bg-white border border-red-100 rounded-2xl px-4 py-3.5 text-left active:bg-red-50"
        >
          <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <Eraser size={16} className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-700">현재 학원 서버 데이터 초기화</p>
            <p className="text-[11px] text-red-400 mt-0.5 leading-relaxed">
              학원 / 멤버 / 초대는 유지하고, 학생·반·수업·기록·수납·급여만 삭제해요.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setDeleteAcademyOpen(true)}
          className="w-full flex items-center gap-3 bg-white border border-red-200 rounded-2xl px-4 py-3.5 text-left active:bg-red-50"
        >
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Trash2 size={16} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-700">현재 학원 삭제</p>
            <p className="text-[11px] text-red-400 mt-0.5 leading-relaxed">
              학원과 멤버, 초대, 모든 도메인 데이터를 완전히 삭제해요.
            </p>
          </div>
        </button>
      </div>

      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
        ⓘ 모든 기기의 localStorage 백업을 자동으로 정리하지는 않아요.
        다른 기기에서는 “기기 데이터 초기화”로 별도 정리하세요.
      </p>

      <ConfirmTypedModal
        isOpen={serverResetOpen}
        onClose={() => setServerResetOpen(false)}
        title="현재 학원 서버 데이터 초기화"
        description={`'${academyName}' 학원의 학생/반/수업/기록/수납/급여 데이터가 서버에서 영구 삭제돼요.`}
        confirmWord="삭제"
        actionLabel="초기화"
        onConfirm={handleServerReset}
        tone="amber"
      />

      <ConfirmTypedModal
        isOpen={deleteAcademyOpen}
        onClose={() => setDeleteAcademyOpen(false)}
        title="현재 학원 삭제"
        description={`'${academyName}' 학원과 모든 멤버/초대/도메인 데이터가 영구 삭제돼요. 이 작업은 되돌릴 수 없어요.`}
        confirmWord={academyName}
        confirmHint="학원 이름을 정확히 입력해 주세요."
        actionLabel="학원 삭제"
        onConfirm={handleAcademyDelete}
        tone="red"
      />
    </div>
  );
}

function ConfirmTypedModal({
  isOpen,
  onClose,
  title,
  description,
  confirmWord,
  confirmHint,
  actionLabel,
  onConfirm,
  tone = 'red',
}) {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const matches = input.trim() === confirmWord;

  const handleClose = () => {
    if (submitting) return;
    setInput('');
    onClose?.();
  };

  const handleSubmit = async () => {
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
      setInput('');
      onClose?.();
    } catch {
      /* error already toasted by caller */
    } finally {
      setSubmitting(false);
    }
  };

  const buttonClass =
    tone === 'red'
      ? 'bg-red-600 text-white'
      : 'bg-amber-500 text-white';
  const bannerClass =
    tone === 'red'
      ? 'bg-red-50 text-red-700 border-red-100'
      : 'bg-amber-50 text-amber-800 border-amber-100';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!matches || submitting}
            className={`flex-1 py-3.5 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-1.5 ${buttonClass}`}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
            {actionLabel}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className={`rounded-2xl px-4 py-3 border flex items-start gap-3 ${bannerClass}`}>
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed">{description}</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
            확인을 위해 <span className="font-bold text-gray-900">“{confirmWord}”</span> 을(를) 입력해 주세요
          </label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={confirmWord}
            disabled={submitting}
            className="input"
            autoFocus
          />
          {confirmHint && (
            <p className="text-[11px] text-gray-400 mt-1.5">{confirmHint}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
