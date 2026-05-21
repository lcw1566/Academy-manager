// AcademyStaffMembersSection
//
// Shows accepted server-side staff members (teacher / assistant) for the
// current academy, joined with their profile (display_name/email/phone).
// Owner-managed academy-specific settings (subject, wage, memo) come from
// academy_staff_profiles.
//
// This is intentionally a separate UI surface from the existing localStorage
// "academyTeachers" / "academyAssistants" lists. Local staff lists remain
// for backwards-compatibility with payrolls etc.; the server-backed members
// listed here are the source of truth for "who is invited and accepted".
//
// Editing academy-specific settings opens AcademyStaffProfileModal which
// upserts academy_staff_profiles only. User profile fields are NOT edited
// by the owner.
import { useMemo, useState } from 'react';
import { ChevronRight, GraduationCap, Users, Pencil, Loader2, RefreshCw } from 'lucide-react';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import AcademyStaffProfileModal from './AcademyStaffProfileModal';

const ROLE_LABEL = { teacher: '강사', assistant: '보조강사' };

export default function AcademyStaffMembersSection() {
  const memberships = useWorkspaceStore((s) => s.memberships);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const memberProfiles = useWorkspaceStore((s) => s.academyMemberProfiles);
  const staffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles);
  const loadAcademyMemberProfiles = useWorkspaceStore((s) => s.loadAcademyMemberProfiles);
  const loadAcademyStaffProfiles = useWorkspaceStore((s) => s.loadAcademyStaffProfiles);
  const isMemberProfilesLoading = useWorkspaceStore((s) => s.isAcademyMemberProfilesLoading);
  const isStaffProfilesLoading = useWorkspaceStore((s) => s.isAcademyStaffProfilesLoading);

  const [editingUserId, setEditingUserId] = useState(null);
  const [editingRole, setEditingRole] = useState(null);

  // Accepted teacher/assistant members from server. We need the original
  // memberships list to filter by role, but we have to fetch it separately
  // since memberships are user-scoped. Instead we lean on member_profiles
  // (only available to the owner) + cross-check with academy_staff_profiles
  // for role. For accepted invitations the staff profile exists too.
  //
  // Easier: query academy_members via a join. But the workspace store
  // already lists memberships only for the CURRENT user, so we can't see
  // others' rows directly. The member-profiles RPC (security definer)
  // returns the profile rows of all active members of the academy, but
  // it doesn't expose `role` from academy_members.
  //
  // For Phase 20 we approximate role from academy_staff_profiles when
  // present; if not present yet (member accepted but owner hasn't
  // configured them), fall back to "강사 / 보조강사 미지정".
  const accepted = useMemo(() => {
    if (!currentAcademyId) return [];
    return memberProfiles.map((p) => {
      const staff = staffProfiles.find((sp) => sp.user_id === p.user_id);
      // Exclude current user (owner) from the list — the owner is also a
      // member but doesn't need to be configured as a teacher/assistant.
      // Owner detection: check memberships list (scoped to current user)
      // since the RPC doesn't expose role.
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

  // Hide the owner themselves: the memberships array (current user only)
  // tells us our own academy_members.role.
  const myMembership = memberships.find((m) => m.academy_id === currentAcademyId);
  const myUserId = myMembership?.user_id;
  const visible = accepted.filter((m) => m.userId !== myUserId);

  if (!currentAcademyId) return null;

  const loading = isMemberProfilesLoading || isStaffProfilesLoading;

  const handleRefresh = () => {
    loadAcademyMemberProfiles();
    loadAcademyStaffProfiles();
  };

  return (
    <div className="mx-4 mt-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-gray-700">학원 멤버 (서버)</p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="text-xs font-semibold text-blue-600 flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {loading && visible.length === 0 ? (
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin" />
          멤버 정보를 불러오는 중…
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm text-gray-400 text-center">
            아직 초대를 수락한 멤버가 없어요.
          </p>
          <p className="text-[11px] text-gray-400 text-center mt-1.5 leading-relaxed">
            아래 “강사 관리 / 보조강사 관리” 에서 이메일로 앱 초대를 보낼 수 있어요.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {visible.map((m) => {
            const roleLabel = m.role ? ROLE_LABEL[m.role] : '미지정';
            const RoleIcon = m.role === 'assistant' ? Users : GraduationCap;
            const tone =
              m.role === 'assistant' ? 'text-purple-600 bg-purple-50' :
              m.role === 'teacher'   ? 'text-blue-600 bg-blue-50'     :
                                       'text-gray-500 bg-gray-100';
            const wageLabel = m.staff
              ? m.staff.wage_type === 'monthly'
                ? `월급 ${(m.staff.monthly_salary || 0).toLocaleString()}원`
                : m.staff.wage_type === 'hourly'
                ? `시급 ${(m.staff.hourly_wage || 0).toLocaleString()}원`
                : '급여 미설정'
              : '학원 설정 미작성';

            return (
              <button
                key={m.userId}
                type="button"
                onClick={() => {
                  setEditingUserId(m.userId);
                  // Default role pick: existing or teacher
                  setEditingRole(m.role || 'teacher');
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 text-left active:bg-gray-50"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tone}`}>
                  <RoleIcon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {m.displayName || m.email || '(이름 없음)'}
                    </p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tone}`}>
                      {roleLabel}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{m.email}</p>
                  {m.phone && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{m.phone}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-0.5">{wageLabel}</p>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-blue-600 flex-shrink-0">
                  <Pencil size={11} />
                  설정
                  <ChevronRight size={12} className="text-gray-300" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
        멤버의 이름·전화는 본인이 “내 프로필”에서 직접 등록해요.
        과목·급여·메모 같은 학원 설정만 여기서 수정해요.
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
