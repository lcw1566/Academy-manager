// StaffWaitingPage
//
// Phase 25 — staff(account_type=staff) 사용자가 아직 어떤 학원에도
// 멤버로 등록되지 않은 경우 보여주는 안내 화면. RoleSelectPage 대신 이 화면을
// 노출해 원장 권한 같은 잘못된 모드 진입을 막는다.
//
// 동작:
//   - 받은 초대(pending)가 있으면 학원 이름 + "수락" 버튼 표시.
//   - 받은 초대가 없으면 안내 문구만 표시 + 새로고침 버튼.
//   - 상단에 로그아웃 버튼 — 다른 계정으로 로그인 흐름.
//
// 표시 조건은 App.jsx 에서 결정한다.
import { useState } from 'react';
import { Building2, Mail, Check, Loader2, RefreshCw, LogOut } from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import useAcademyStore from '../../store/useAcademyStore';

const INVITE_ROLE_LABEL = { teacher: '강사', assistant: '보조강사' };

export default function StaffWaitingPage() {
  const userEmail = useAuthStore((s) => s.user?.email);
  const signOutUser = useAuthStore((s) => s.signOutUser);
  const profile = useWorkspaceStore((s) => s.profile);
  const myPendingInvitations = useWorkspaceStore((s) => s.myPendingInvitations);
  const isMyPendingInvitationsLoading = useWorkspaceStore((s) => s.isMyPendingInvitationsLoading);
  const loadMyPendingInvitations = useWorkspaceStore((s) => s.loadMyPendingInvitations);
  const acceptInvitation = useWorkspaceStore((s) => s.acceptInvitation);
  const showToast = useAcademyStore((s) => s.showToast);
  const setRole = useAcademyStore((s) => s.setRole);

  const [acceptingId, setAcceptingId] = useState(null);

  const handleAccept = async (invitationId) => {
    if (acceptingId) return;
    setAcceptingId(invitationId);
    try {
      const result = await acceptInvitation(invitationId);
      const academyName = result?.academy?.name ?? '학원';
      showToast(`${academyName}에 참여했어요.`);
    } catch (err) {
      showToast(err?.message ?? '초대 수락에 실패했어요.', 'error');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-6 pt-14">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">📨</div>
          <h1 className="text-xl font-bold text-gray-900">초대를 기다리고 있어요</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            아직 참여 중인 학원이 없어요.<br />원장의 초대를 수락해주세요.
          </p>
        </div>

        {/* 계정 정보 */}
        <div className="bg-white rounded-2xl p-3.5 shadow-sm mb-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
            <Mail size={15} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400">로그인 계정</p>
            <p className="text-sm font-bold text-gray-900 truncate">
              {profile?.display_name || userEmail || ''}
            </p>
            {profile?.display_name && userEmail && (
              <p className="text-[11px] text-gray-400 truncate">{userEmail}</p>
            )}
          </div>
        </div>

        {/* 받은 초대 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-900">받은 초대</p>
            <button
              type="button"
              onClick={loadMyPendingInvitations}
              disabled={isMyPendingInvitationsLoading}
              className="text-xs text-blue-600 font-semibold flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw
                size={12}
                className={isMyPendingInvitationsLoading ? 'animate-spin' : ''}
              />
              새로고침
            </button>
          </div>
          {isMyPendingInvitationsLoading && myPendingInvitations.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              불러오는 중…
            </div>
          ) : myPendingInvitations.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-5 leading-relaxed">
              받은 초대가 없어요.<br />원장에게 본인 이메일로 초대를 요청해주세요.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {myPendingInvitations.map((inv) => {
                const accepting = acceptingId === inv.id;
                const academyName = inv.academy?.name ?? '(이름 없는 학원)';
                const roleLabel = INVITE_ROLE_LABEL[inv.role] ?? inv.role;
                return (
                  <div
                    key={inv.id}
                    className="border border-gray-100 rounded-xl p-3 flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Building2 size={16} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{academyName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{roleLabel} 역할</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAccept(inv.id)}
                      disabled={!!acceptingId}
                      className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-60 flex-shrink-0 flex items-center gap-1"
                    >
                      {accepting ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          참여 중…
                        </>
                      ) : (
                        <>
                          <Check size={12} />
                          수락
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 다른 모드 시도 (escape hatch) */}
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setRole('tutor')}
            className="w-full text-center py-2.5 text-xs text-gray-500 hover:text-blue-600"
          >
            과외 선생님 모드로 전환
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-400 hover:text-red-500"
          >
            <LogOut size={12} />
            다른 계정으로 로그인
          </button>
        </div>
      </div>
    </div>
  );
}
