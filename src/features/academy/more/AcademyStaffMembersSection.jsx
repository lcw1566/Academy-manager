// AcademyStaffMembersSection — 학원 구성원 통합 관리 (Phase 31 cleanup)
//
// 노출 구조 (role 별 그룹핑):
//   1) 원장 (본인) — 항상 1명
//   2) 강사
//   3) 보조강사
//   4) 미지정 (학원 설정 미작성)
//   5) 대기 중인 초대
//
// 액션:
//   - 멤버 카드 클릭: 학원-특정 설정 모달 (과목/급여/메모/권한)
//   - 대기 초대 카드: 취소
//   - 헤더 우측: 직원 초대 버튼 (compact)
//
// embedded prop:
//   - true 일 때는 자체 `mx-4 mt-5` 외부 마진 / 헤더 타이틀을 줄여 SectionTitle
//     아래에 깔끔히 들어가도록 한다.
//   - false (기본) 일 때는 자체 헤더 ("구성원 관리") + 새로고침 버튼을 노출.
import { useMemo, useState } from 'react';
import {
  GraduationCap, Users, Loader2, RefreshCw, Plus,
  Building2, Clock, X as XIcon,
} from 'lucide-react';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import AcademyStaffProfileModal from './AcademyStaffProfileModal';

const ROLE_LABEL = { teacher: '강사', assistant: '보조강사', owner: '원장' };

function memberWageLabel(staff) {
  if (!staff) return '학원 설정 미작성';
  if (staff.wage_type === 'monthly') return `월급 ${(staff.monthly_salary || 0).toLocaleString()}원`;
  if (staff.wage_type === 'hourly') {
    const modeLabel = staff.scope?.hourlyMode === 'lessonHours' ? '수업시간 기준' : '근무시간 기준';
    return `시급 ${(staff.hourly_wage || 0).toLocaleString()}원 · ${modeLabel}`;
  }
  return '급여 미설정';
}

function MemberCard({ m, onClickSettings }) {
  const tone =
    m.role === 'assistant' ? 'text-purple-600 bg-purple-50' :
    m.role === 'teacher'   ? 'text-blue-600 bg-blue-50'     :
                             'text-gray-500 bg-gray-100';
  const RoleIcon = m.role === 'assistant' ? Users : GraduationCap;
  return (
    <div className="flex items-stretch border-b border-gray-50 last:border-0">
      <button
        type="button"
        onClick={onClickSettings}
        className="flex-1 flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 min-w-0"
      >
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tone}`}>
          <RoleIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {m.displayName || m.email || '(이름 없음)'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {m.email || '이메일 없음'}
            {m.phone ? ` · ${m.phone}` : ''}
          </p>
          {m.role && (
            <p className="text-[11px] text-gray-500 mt-0.5">{memberWageLabel(m.staff)}</p>
          )}
        </div>
      </button>
    </div>
  );
}

function MemberGroup({ title, count, children }) {
  if (!count) return null;
  return (
    <div className="mb-2">
      <p className="text-[11px] font-semibold text-gray-500 px-1 mb-1">
        {title} <span className="text-gray-400">({count})</span>
      </p>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export default function AcademyStaffMembersSection({
  onAddTeacher, onAddAssistant, embedded = false,
}) {
  // Phase 29 — store fallback. HMR / 마이그레이션 도중 키가 undefined 로 들어와도 안전.
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const memberProfiles = useWorkspaceStore((s) => s.academyMemberProfiles) ?? [];
  const staffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const academyInvitations = useWorkspaceStore((s) => s.academyInvitations) ?? [];
  const userProfile = useWorkspaceStore((s) => s.profile);
  const loadAcademyMemberProfiles = useWorkspaceStore((s) => s.loadAcademyMemberProfiles);
  const loadAcademyStaffProfiles = useWorkspaceStore((s) => s.loadAcademyStaffProfiles);
  const loadAcademyInvitations = useWorkspaceStore((s) => s.loadAcademyInvitations);
  const cancelAcademyInvitationById = useWorkspaceStore((s) => s.cancelAcademyInvitationById);
  const isMemberProfilesLoading = useWorkspaceStore((s) => s.isAcademyMemberProfilesLoading);
  const isStaffProfilesLoading = useWorkspaceStore((s) => s.isAcademyStaffProfilesLoading);
  const isInvitationsLoading = useWorkspaceStore((s) => s.isAcademyInvitationsLoading);
  const showToast = useAcademyStore((s) => s.showToast);
  const authUserEmail = useAuthStore((s) => s.user?.email);

  const [editingUserId, setEditingUserId] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const myMembership = memberships.find((m) => m.academy_id === currentAcademyId);
  const myUserId = myMembership?.user_id;
  const myRole = myMembership?.role; // 'owner' | 'teacher' | 'assistant'
  const isOwner = myRole === 'owner';

  // 멤버 → 카드 데이터. 본인은 별도 처리 (그룹 1 = 원장 = 본인이 owner 인 경우).
  const allMembers = useMemo(() => {
    if (!currentAcademyId) return [];
    return memberProfiles.map((p) => {
      const staff = staffProfiles.find((sp) => sp.user_id === p.user_id);
      return {
        userId: p.user_id,
        displayName: p.display_name,
        email: p.email,
        phone: p.phone,
        accountType: p.account_type,
        role: staff?.role || null,
        staff,
      };
    });
  }, [currentAcademyId, memberProfiles, staffProfiles]);

  const teachers = useMemo(
    () => allMembers.filter((m) => m.userId !== myUserId && m.role === 'teacher'),
    [allMembers, myUserId],
  );
  const assistants = useMemo(
    () => allMembers.filter((m) => m.userId !== myUserId && m.role === 'assistant'),
    [allMembers, myUserId],
  );
  const unassigned = useMemo(
    () => allMembers.filter((m) => m.userId !== myUserId && !m.role),
    [allMembers, myUserId],
  );
  const pendingInvitations = useMemo(
    () => (academyInvitations || []).filter((inv) => inv.status === 'pending'),
    [academyInvitations],
  );

  if (!currentAcademyId) return null;

  const loading = isMemberProfilesLoading || isStaffProfilesLoading || isInvitationsLoading;
  const totalMembers = teachers.length + assistants.length + unassigned.length + (isOwner ? 1 : 0);
  const isEmpty = totalMembers === (isOwner ? 1 : 0) && pendingInvitations.length === 0;

  const handleRefresh = () => {
    loadAcademyMemberProfiles();
    loadAcademyStaffProfiles();
    loadAcademyInvitations();
  };

  const handleCancel = async (invitationId) => {
    if (cancellingId) return;
    setCancellingId(invitationId);
    try {
      await cancelAcademyInvitationById(invitationId);
      showToast('초대를 취소했어요.');
    } catch (err) {
      showToast(err?.message ?? '초대 취소에 실패했어요.', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  const ownerName = userProfile?.display_name || authUserEmail || '나';
  const ownerEmail = userProfile?.email || authUserEmail || '';

  const openSettings = (m) => {
    if (!isOwner) return; // staff 는 클릭해도 모달 안 열림
    setEditingUserId(m.userId);
    setEditingRole(m.role || 'teacher');
  };

  return (
    <div className={embedded ? '' : 'mx-4 mt-5'}>
      {/* 헤더 — embedded 일 때는 부모 SectionTitle 이 대체. 아니면 자체 헤더. */}
      {!embedded && (
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs font-bold text-gray-800">구성원 관리</p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="text-xs font-semibold text-gray-500 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>
        </div>
      )}

      {/* 초대 진입점 + 새로고침 (embedded 일 때 상단에 작게) */}
      {isOwner && (onAddTeacher || onAddAssistant) && (
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={onAddTeacher || onAddAssistant}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold active:bg-blue-100"
          >
            <Plus size={12} />
            직원 초대
          </button>
          {embedded && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 text-gray-500 active:bg-gray-100 disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      )}

      {loading && isEmpty ? (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin" />
          구성원 정보를 불러오는 중…
        </div>
      ) : isEmpty ? (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500 text-center">아직 참여 중인 강사·보조강사가 없어요.</p>
          <p className="text-[11px] text-gray-400 text-center mt-1.5 leading-relaxed">
            위 "직원 초대" 에서 이메일로 초대를 보낼 수 있어요.
          </p>
        </div>
      ) : (
        <>
          {/* 1) 원장 (본인) */}
          {isOwner && (
            <MemberGroup title="원장" count={1}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Building2 size={16} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm truncate">{ownerName}</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-blue-600 bg-blue-50">
                      나
                    </span>
                  </div>
                  {ownerEmail && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{ownerEmail}</p>
                  )}
                </div>
              </div>
            </MemberGroup>
          )}

          {/* 2) 강사 */}
          <MemberGroup title="강사" count={teachers.length}>
            {teachers.map((m) => (
              <MemberCard
                key={m.userId}
                m={m}
                onClickSettings={() => openSettings(m)}
              />
            ))}
          </MemberGroup>

          {/* 3) 보조강사 */}
          <MemberGroup title="보조강사" count={assistants.length}>
            {assistants.map((m) => (
              <MemberCard
                key={m.userId}
                m={m}
                onClickSettings={() => openSettings(m)}
              />
            ))}
          </MemberGroup>

          {/* 4) 미지정 */}
          <MemberGroup title="역할 미지정" count={unassigned.length}>
            {unassigned.map((m) => (
              <MemberCard
                key={m.userId}
                m={m}
                onClickSettings={() => openSettings(m)}
              />
            ))}
          </MemberGroup>

          {/* 5) 대기 중인 초대 */}
          {isOwner && pendingInvitations.length > 0 && (
            <MemberGroup title="대기 중인 초대" count={pendingInvitations.length}>
              {pendingInvitations.map((inv) => {
                const tone =
                  inv.role === 'assistant'
                    ? 'text-purple-600 bg-purple-50'
                    : 'text-blue-600 bg-blue-50';
                const Icon = inv.role === 'assistant' ? Users : GraduationCap;
                return (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tone}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{inv.email}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tone}`}>
                          {ROLE_LABEL[inv.role] || inv.role}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-amber-700 bg-amber-50 flex items-center gap-0.5">
                          <Clock size={9} />
                          대기
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCancel(inv.id)}
                      disabled={cancellingId === inv.id}
                      className="flex items-center gap-1 text-xs font-semibold text-red-500 px-2 py-1.5 rounded-lg active:bg-red-50 disabled:opacity-50 flex-shrink-0"
                    >
                      <XIcon size={11} />
                      취소
                    </button>
                  </div>
                );
              })}
            </MemberGroup>
          )}
        </>
      )}

      <p className="text-[11px] text-gray-400 mt-2 leading-relaxed px-1">
        이름·연락처는 본인이 "내 프로필"에서 등록해요. 과목·급여·메모·권한은 카드를 눌러 설정합니다.
      </p>

      {editingUserId && (
        <AcademyStaffProfileModal
          userId={editingUserId}
          defaultRole={editingRole || 'teacher'}
          onClose={() => { setEditingUserId(null); setEditingRole(null); }}
        />
      )}
    </div>
  );
}
