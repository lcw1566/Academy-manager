// StaffWaitingPage
//
// staff(account_type=staff) 사용자가 active 학원 멤버가 되기 전 보여주는 안내
// 화면. 역할 없는 직원 초대를 수락한 뒤에는 원장/운영 매니저의 배정이 끝날
// 때까지 이 화면에 머물러 원장 권한이나 학원 데이터에 잘못 접근하지 못한다.
//
// 동작:
//   - 받은 초대(pending)가 있으면 학원 이름 + "수락" 버튼 표시.
//   - 수락 후 pending/invited 멤버십이면 역할 배정 대기 상태를 표시.
//   - 상단에 로그아웃 버튼 — 다른 계정으로 로그인 흐름.
//
// 표시 조건은 App.jsx 에서 결정한다.
import { useState } from 'react';
import { Building2, Mail, Check, Loader2, RefreshCw, LogOut } from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import useAcademyStore from '../../store/useAcademyStore';

const INVITE_ROLE_LABEL = {
  teacher: '기본', assistant: '기본', manager: '운영', pending: '미설정',
};

export default function StaffWaitingPage({ assignmentMembership = null }) {
  const userEmail = useAuthStore((s) => s.user?.email);
  const signOutUser = useAuthStore((s) => s.signOutUser);
  const profile = useWorkspaceStore((s) => s.profile);
  const myPendingInvitations = useWorkspaceStore((s) => s.myPendingInvitations);
  const isMyPendingInvitationsLoading = useWorkspaceStore((s) => s.isMyPendingInvitationsLoading);
  const loadMyPendingInvitations = useWorkspaceStore((s) => s.loadMyPendingInvitations);
  const loadMemberships = useWorkspaceStore((s) => s.loadMemberships);
  const acceptInvitation = useWorkspaceStore((s) => s.acceptInvitation);
  const showToast = useAcademyStore((s) => s.showToast);

  const [acceptingId, setAcceptingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const isRoleAssignmentPending =
    assignmentMembership?.role === 'pending' && assignmentMembership?.status === 'invited';
  const waitingAcademyName = assignmentMembership?.academy?.name ?? '초대한 학원';

  const handleAccept = async (invitationId) => {
    if (acceptingId) return;
    setAcceptingId(invitationId);
    try {
      const result = await acceptInvitation(invitationId);
      const academyName = result?.academy?.name ?? '학원';
      showToast(
        result?.role === 'pending'
          ? `${academyName} 초대를 수락했어요. 역할 배정을 기다려주세요.`
          : `${academyName}에 참여했어요.`,
      );
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

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([loadMyPendingInvitations(), loadMemberships()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-6 pt-14">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">📨</div>
          <h1 className="text-xl font-bold text-gray-900">
            {isRoleAssignmentPending ? '역할 배정 대기 중이에요' : '초대를 기다리고 있어요'}
          </h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            {isRoleAssignmentPending ? (
              <>초대 수락이 완료됐어요.<br />원장 또는 운영 매니저가 역할을 배정하면 자동으로 입장돼요.</>
            ) : (
              <>아직 참여 중인 학원이 없어요.<br />학원 관리자의 초대를 수락해주세요.</>
            )}
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

        {/* 권한 설정 대기 */}
        {isRoleAssignmentPending && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                <Building2 size={16} className="text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{waitingAcademyName}</p>
                <p className="text-xs text-orange-700 mt-0.5">직원 권한 설정 대기</p>
              </div>
            </div>
            <p className="mt-3 rounded-xl bg-orange-50 px-3 py-2.5 text-xs leading-relaxed text-orange-700">
              권한이 설정될 때까지 학생·수업·자료 등 학원 정보에는 접근할 수 없어요.
            </p>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="mt-3 w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              상태 새로고침
            </button>
          </div>
        )}

        {/* 받은 초대 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-900">받은 초대</p>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isMyPendingInvitationsLoading || refreshing}
              className="text-xs text-blue-600 font-semibold flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw
                size={12}
                className={isMyPendingInvitationsLoading || refreshing ? 'animate-spin' : ''}
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
              받은 초대가 없어요.<br />원장 또는 운영 매니저에게 본인 이메일로 초대를 요청해주세요.
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
                      <p className="text-xs text-gray-500 mt-0.5">
                        {inv.role === 'pending'
                          ? '직원 초대 · 수락 후 권한 설정'
                          : `${inv.job_title || roleLabel} · ${roleLabel} 권한`}
                      </p>
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

        <div className="mt-6">
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
