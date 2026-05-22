// WorkspaceSelectionPage — Phase 32 workspace-first 진입
//
// 로그인한 모든 academy 사용자(owner/teacher/assistant)가 진입 직후 거치는 한 화면.
// 학원 수와 관계없이 항상 노출되며, 다음 항목을 한 곳에서 처리한다:
//
//   1) 받은 초대 (pending invitations) — 있으면 상단에 노출, 수락 가능
//   2) 소속 학원 목록 — 카드로 노출, 클릭 시 진입
//   3) 빈 상태 :
//       - owner: "학원 만들기" 진입 onboarding
//       - staff: "받은 초대가 없어요" 안내
//
// 진입 동작:
//   - 카드 클릭 → setCurrentAcademyId + setActiveTab('home') + markWorkspacePicked()
//   - App.jsx 의 auto-role effect 가 새 academy 의 membership.role 로 진입시킨다.
//
// "학원 전환" 더보기 옵션을 누르면 sessionStorage 키를 비우고 다시 이 화면을 띄운다.
import { useState } from 'react';
import {
  Building2, ChevronRight, LogOut, Plus, Inbox, Loader2, Mail,
} from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import useAcademyStore from '../../store/useAcademyStore';
import { roleMap } from '../../utils/format';

export const WORKSPACE_PICKED_KEY = 'workspace-picked';

// Phase 32 — 학원 선택 picked flag 는 useWorkspaceStore 의 reactive state 로 옮겼다.
// 이 함수들은 store 액션을 호출하면서 sessionStorage 도 동기화 (새로고침 보존).
// store subscribe 가 안 되는 외부 helper 함수 영역에서도 호출 가능.
export function markWorkspacePicked() {
  useWorkspaceStore.getState().setWorkspacePicked?.(true);
}

export function clearWorkspacePicked() {
  useWorkspaceStore.getState().setWorkspacePicked?.(false);
}

// 호환을 위해 유지 (store.workspacePicked 와 동일). 새 코드는 store 를 직접 subscribe.
export function wasWorkspacePicked() {
  return !!useWorkspaceStore.getState().workspacePicked;
}

export default function WorkspaceSelectionPage() {
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const setCurrentAcademyId = useWorkspaceStore((s) => s.setCurrentAcademyId);
  const profile = useWorkspaceStore((s) => s.profile);
  const myPendingInvitations = useWorkspaceStore((s) => s.myPendingInvitations) ?? [];
  const acceptInvitation = useWorkspaceStore((s) => s.acceptInvitation);
  const createAcademy = useWorkspaceStore((s) => s.createAcademy);
  const signOutUser = useAuthStore((s) => s.signOutUser);
  const showToast = useAcademyStore((s) => s.showToast);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);

  const [submitting, setSubmitting] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newAcademyName, setNewAcademyName] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const isOwner = profile?.account_type === 'owner';
  const isStaff = profile?.account_type === 'staff';

  const handlePick = (academyId) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (academyId !== currentAcademyId) setCurrentAcademyId(academyId);
      setActiveTab('home');
      markWorkspacePicked();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async (invitationId) => {
    if (acceptingId) return;
    setAcceptingId(invitationId);
    try {
      const result = await acceptInvitation(invitationId);
      const academyName = result?.academy?.name ?? '학원';
      showToast(`${academyName}에 참여했어요.`);
      // 새 학원 자동 진입.
      if (result?.academyId) {
        setActiveTab('home');
        markWorkspacePicked();
      }
    } catch (err) {
      showToast(err?.message ?? '초대 수락에 실패했어요.', 'error');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleCreate = async () => {
    const trimmed = (newAcademyName || '').trim();
    if (!trimmed) {
      showToast('학원 이름을 입력해주세요.', 'error');
      return;
    }
    if (createSubmitting) return;
    setCreateSubmitting(true);
    try {
      await createAcademy({ name: trimmed });
      showToast('학원이 생성되었어요.');
      setNewAcademyName('');
      setCreating(false);
      setActiveTab('home');
      markWorkspacePicked();
    } catch (err) {
      showToast(err?.message ?? '학원 생성에 실패했어요.', 'error');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (err) {
      showToast(err?.message ?? '로그아웃에 실패했어요.', 'error');
    }
  };

  const hasInvitations = myPendingInvitations.length > 0;
  const hasMemberships = memberships.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-6 pt-12 pb-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🏫</div>
          <h1 className="text-xl font-bold text-gray-900">학원을 선택해주세요</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            진입할 학원을 선택하면 해당 학원의 운영 화면이 열려요.
          </p>
        </div>

        {/* 받은 초대 (상단) */}
        {hasInvitations && (
          <div className="mb-5">
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Inbox size={12} className="text-amber-600" />
              <p className="text-xs font-bold text-gray-700">받은 초대 ({myPendingInvitations.length})</p>
            </div>
            <div className="flex flex-col gap-2">
              {myPendingInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="bg-white rounded-2xl px-4 py-3.5 border border-amber-100 shadow-sm flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <Mail size={16} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {inv.academy?.name || '학원'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {roleMap[inv.role] || inv.role} 초대
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAccept(inv.id)}
                    disabled={acceptingId === inv.id}
                    className="text-xs font-bold px-3 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-60 flex items-center gap-1"
                  >
                    {acceptingId === inv.id && <Loader2 size={11} className="animate-spin" />}
                    수락
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 소속 학원 목록 */}
        {hasMemberships ? (
          <>
            <p className="text-xs font-bold text-gray-700 mb-2 px-1">내 학원</p>
            <div className="flex flex-col gap-2">
              {memberships.map((m) => {
                const academyName = m.academy?.name ?? '(이름 없음)';
                const roleLabel = roleMap[m.role] ?? m.role;
                const isCurrent = m.academy_id === currentAcademyId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => handlePick(m.academy_id)}
                    className={`w-full flex items-center gap-3 rounded-2xl px-4 py-4 text-left transition-colors shadow-sm ${
                      isCurrent
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-white border border-gray-100 active:bg-gray-50'
                    } disabled:opacity-60`}
                  >
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCurrent ? 'bg-blue-100' : 'bg-gray-100'
                      }`}
                    >
                      <Building2
                        size={18}
                        className={isCurrent ? 'text-blue-600' : 'text-gray-400'}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-gray-900 truncate">{academyName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{roleLabel}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {/* owner 빈 상태 — 학원 만들기 onboarding */}
        {isOwner && !hasMemberships && (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <p className="text-sm font-bold text-gray-900 mb-1">아직 학원이 없어요</p>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">
              학원을 만들면 강사·보조강사를 초대하고 학생을 관리할 수 있어요.
            </p>
            {creating ? (
              <div className="flex flex-col gap-2">
                <input
                  value={newAcademyName}
                  onChange={(e) => setNewAcademyName(e.target.value)}
                  placeholder="예: 우리 학원"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setNewAcademyName(''); }}
                    disabled={createSubmitting}
                    className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={createSubmitting || !newAcademyName.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {createSubmitting && <Loader2 size={11} className="animate-spin" />}
                    만들기
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold active:bg-blue-700"
              >
                <Plus size={14} />
                학원 만들기
              </button>
            )}
          </div>
        )}

        {/* staff 빈 상태 — 초대 없음 안내 */}
        {isStaff && !hasMemberships && !hasInvitations && (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
            <Inbox size={20} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-gray-900 mb-1">아직 참여 중인 학원이 없어요</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              원장에게 본인 이메일로 초대를 요청해주세요.<br />
              초대를 받으면 이 화면에서 수락할 수 있어요.
            </p>
          </div>
        )}

        {/* tutor 또는 기타 — 안전한 fallback */}
        {!isOwner && !isStaff && !hasMemberships && (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
            <p className="text-sm font-bold text-gray-900 mb-1">아직 학원이 없어요</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              계정 유형을 확인하거나 학원 초대를 받아주세요.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSignOut}
          className="w-full mt-8 flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-400 hover:text-red-500"
        >
          <LogOut size={12} />
          다른 계정으로 로그인
        </button>
      </div>
    </div>
  );
}
