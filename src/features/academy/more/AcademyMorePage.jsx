// AcademyMorePage — Phase 40
//
// "더보기" 탭은 학원 정보·계정·기본 설정만 다룬다. 직원/강사/보조강사·근무·급여
// 관련 진입점은 모두 "직원" 탭으로 이동.
//
// 구성:
//   - Owner : 학원 정보 + 원장 프로필 / 학원 전환 / 데이터 새로고침 / 로그아웃
//   - Staff (teacher/assistant) : 내 프로필 / 소속 학원 / 받은 초대 / 학원 전환 / 로그아웃
import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, RefreshCw, LogOut, Loader2, Inbox, UserCog, Building2, Mail, Phone,
  CheckSquare, QrCode,
} from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import { roleMap, formatPhoneNumber } from '../../../utils/format';
import WorkspaceSection from '../../workspace/WorkspaceSection';
import ProfileEditModal from '../../workspace/ProfileEditModal';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { clearWorkspacePicked } from '../../auth/WorkspaceSelectionPage';
import AttendanceSettingsSheet from '../attendance/AttendanceSettingsSheet';
import QrDisplayPage from '../attendance/QrDisplayPage';
import { readAttendanceSettings } from '../attendance/attendanceHelpers';

export default function AcademyMorePage() {
  const role = useAcademyStore((s) => s.role);
  const academyProfile = useAcademyStore((s) => s.academyProfile);
  const setAcademyProfile = useAcademyStore((s) => s.setAcademyProfile);
  const showToast = useAcademyStore((s) => s.showToast);

  const [showProfileEdit, setShowProfileEdit]         = useState(false);
  const [showUserProfileEdit, setShowUserProfileEdit] = useState(false);
  const [showAttendanceSettings, setShowAttendanceSettings] = useState(false);
  const [showQrDisplay, setShowQrDisplay]             = useState(false);

  const authUserEmail = useAuthStore((s) => s.user?.email);
  const userProfile = useWorkspaceStore((s) => s.profile);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);

  // 실제 학원 이름은 memberships 의 academy.name 우선 (academyProfile.name 의 기본값 '우리 학원'
  // 이 노출되지 않도록).
  const currentMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );
  const currentAcademyName = currentMembership?.academy?.name || null;

  useEffect(() => {
    if (!currentAcademyId || !currentAcademyName) return;
    const localName = academyProfile?.name;
    if (localName === currentAcademyName) return;
    setAcademyProfile({
      ...(academyProfile || { ownerName: '', address: '', phone: '' }),
      name: currentAcademyName,
    });
  }, [currentAcademyId, currentAcademyName, academyProfile, setAcademyProfile]);

  const lastSyncedAt = useWorkspaceStore((s) => s.serverStudentsLoadedAt)
    || useWorkspaceStore((s) => s.serverClassGroupsLoadedAt)
    || useWorkspaceStore((s) => s.serverClassSessionsLoadedAt);
  const lastSyncedLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const isOwner = role === 'owner';
  const showSwitchAcademy = memberships.length > 1;
  const ownerHasNoAcademy = isOwner && memberships.length === 0;

  const handleSwitchAcademy = () => {
    clearWorkspacePicked();
    if (typeof window !== 'undefined') window.location.reload();
  };

  return (
    <div>
      <Header title="더보기" />
      <div className="pt-14 md:pt-0 pb-6">
        {isOwner ? (
          ownerHasNoAcademy ? (
            <OwnerEmptyState
              displayName={userProfile?.display_name || authUserEmail}
              onEditMyProfile={() => setShowUserProfileEdit(true)}
            />
          ) : (
            <OwnerMoreSections
              academyProfile={academyProfile}
              academyName={currentAcademyName}
              displayName={userProfile?.display_name}
              email={authUserEmail}
              phone={userProfile?.phone}
              memberships={memberships}
              showSwitchAcademy={showSwitchAcademy}
              lastSyncedLabel={lastSyncedLabel}
              onEditAcademy={() => setShowProfileEdit(true)}
              onEditMyProfile={() => setShowUserProfileEdit(true)}
              onSwitchAcademy={handleSwitchAcademy}
              onOpenAttendanceSettings={() => setShowAttendanceSettings(true)}
              onOpenQrDisplay={() => setShowQrDisplay(true)}
            />
          )
        ) : (
          <StaffMoreSections
            role={role}
            academyProfile={academyProfile}
            displayName={userProfile?.display_name}
            email={authUserEmail}
            phone={userProfile?.phone}
            memberships={memberships}
            showSwitchAcademy={showSwitchAcademy}
            onEditMyProfile={() => setShowUserProfileEdit(true)}
            onSwitchAcademy={handleSwitchAcademy}
          />
        )}
      </div>

      {/* 학원 정보 수정 */}
      {showProfileEdit && (
        <AcademyProfileModal
          profile={academyProfile}
          onClose={() => setShowProfileEdit(false)}
          onSave={(data) => {
            setAcademyProfile(data);
            showToast('학원 정보가 저장되었습니다.');
            setShowProfileEdit(false);
          }}
        />
      )}

      {/* 내 프로필 수정 */}
      <ProfileEditModal
        isOpen={showUserProfileEdit}
        onClose={() => setShowUserProfileEdit(false)}
      />

      {/* 출결·등하원 설정 (owner 만) */}
      {showAttendanceSettings && (
        <AttendanceSettingsSheet
          kind="settings"
          onClose={() => setShowAttendanceSettings(false)}
        />
      )}

      {/* 공용 QR 화면 (owner 만) */}
      {showQrDisplay && (
        <QrDisplayPage onClose={() => setShowQrDisplay(false)} />
      )}
    </div>
  );
}

// ─── 공통 layout 헬퍼 ────────────────────────────────────────────
function SectionTitle({ children, className = '' }) {
  return (
    <p className={`mx-4 mt-6 mb-2 text-xs font-bold text-gray-800 ${className}`}>
      {children}
    </p>
  );
}

function SettingsRow({
  icon: Icon, title, subtitle, onClick, tone = 'gray', danger = false, rightAdornment,
}) {
  const toneClass =
    danger ? 'text-red-600 bg-red-50' :
    tone === 'blue' ? 'text-blue-600 bg-blue-50' :
    tone === 'emerald' ? 'text-emerald-600 bg-emerald-50' :
    'text-gray-600 bg-gray-100';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 text-left active:bg-gray-50 ${danger ? 'border border-red-100' : 'border border-gray-100'} shadow-sm`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${toneClass}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{title}</p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      {rightAdornment || (
        <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
      )}
    </button>
  );
}

function InfoRow({ icon: Icon, label, value, placeholder }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={13} className="text-gray-400 flex-shrink-0" />
      <span className="text-xs text-gray-500 flex-shrink-0 w-16">{label}</span>
      <span className={`text-xs flex-1 min-w-0 truncate ${value ? 'text-gray-800' : 'text-gray-400'}`}>
        {value || placeholder || '—'}
      </span>
    </div>
  );
}

function InlineLogoutButton() {
  const signOutUser = useAuthStore((s) => s.signOutUser);
  const isAuthLoading = useAuthStore((s) => s.isAuthLoading);
  const showToast = useAcademyStore((s) => s.showToast);

  const handle = async () => {
    try {
      await signOutUser();
      showToast('로그아웃되었어요.');
    } catch (err) {
      showToast(err?.message ?? '로그아웃에 실패했어요.', 'error');
    }
  };

  return (
    <SettingsRow
      icon={LogOut}
      title="로그아웃"
      onClick={handle}
      rightAdornment={
        isAuthLoading ? <Loader2 size={14} className="animate-spin text-gray-400" /> : <span />
      }
    />
  );
}

// ─── 학원 정보 + 원장 프로필 통합 카드 ─────────────────────────────
function AcademyOwnerInfoCard({
  academyProfile, academyName, displayName, email, phone, onEditAcademy, onEditMyProfile,
}) {
  const displayedAcademyName = academyName || academyProfile?.name || '학원';
  return (
    <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-sm">
      <button
        type="button"
        onClick={onEditAcademy}
        className="w-full flex items-center gap-3 text-left active:opacity-90"
      >
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">
          🏫
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-base truncate">{displayedAcademyName}</p>
          <p className="text-xs text-gray-500 mt-0.5">원장</p>
        </div>
        <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
      </button>

      <div className="mt-3 pt-3 border-t border-gray-50 flex flex-col gap-2">
        <InfoRow icon={UserCog} label="원장 이름" value={displayName} />
        <InfoRow icon={Mail} label="이메일" value={email} />
        <InfoRow icon={Phone} label="연락처" value={phone} placeholder="등록되지 않음" />
      </div>

      <button
        type="button"
        onClick={onEditMyProfile}
        className="mt-3 w-full py-2.5 rounded-xl bg-gray-50 text-gray-700 text-xs font-bold active:bg-gray-100"
      >
        내 프로필 수정
      </button>
    </div>
  );
}

// ─── Owner: 학원 없는 신규 가입 상태 ──────────────────────────────
function OwnerEmptyState({ displayName, onEditMyProfile }) {
  return (
    <>
      <div className="mx-4 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        <p className="font-bold text-gray-900 text-base mb-1">학원을 먼저 만들어주세요</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          학원을 만들면 직원 초대와 학생 관리를 시작할 수 있어요.
        </p>
      </div>
      <WorkspaceSection />
      <SectionTitle>계정</SectionTitle>
      <div className="mx-4 flex flex-col gap-2">
        <SettingsRow
          icon={UserCog}
          title={displayName || '내 프로필'}
          subtitle="이름·연락처 수정"
          onClick={onEditMyProfile}
        />
        <InlineLogoutButton />
      </div>
    </>
  );
}

// ─── Owner 메인 layout ────────────────────────────────────────────
function OwnerMoreSections({
  academyProfile, academyName, displayName, email, phone, memberships = [], showSwitchAcademy,
  lastSyncedLabel,
  onEditAcademy, onEditMyProfile, onSwitchAcademy,
  onOpenAttendanceSettings, onOpenQrDisplay,
}) {
  const showToast = useAcademyStore((s) => s.showToast);
  const [refreshing, setRefreshing] = useState(false);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const currentAcademy = memberships.find((m) => m.academy_id === currentAcademyId)?.academy || null;
  const attendance = readAttendanceSettings(currentAcademy);
  const methodSubtitle = (() => {
    const studentLabel = attendance.studentCheckMethod === 'qr' ? 'QR' : '선생님 직접 체크';
    return `직원 QR · 학생 ${studentLabel}`;
  })();
  // Phase 43 — staff 는 항상 QR. 공용 QR 화면은 항상 노출 가치 있음.
  const isQrInUse = true;

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const ws = useWorkspaceStore.getState();
    try {
      await Promise.all([
        ws.loadServerStudents?.(),
        ws.loadServerClassGroups?.(),
        ws.loadServerClassSessions?.(),
        ws.loadServerLessonRecords?.(),
        ws.loadServerAttendanceRecords?.(),
        ws.loadServerClinicRecords?.(),
        ws.loadServerPayments?.(),
        ws.loadServerPayrolls?.(),
        ws.loadAcademyMemberProfiles?.(),
        ws.loadAcademyStaffProfiles?.(),
        ws.loadAcademyInvitations?.(),
        ws.loadServerStaffShifts?.(),
      ]);
      showToast('새로고침했어요.');
    } catch (err) {
      console.warn('[refresh-all] failed', err);
      showToast('일부 데이터를 불러오지 못했어요.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <AcademyOwnerInfoCard
        academyProfile={academyProfile}
        academyName={academyName}
        displayName={displayName}
        email={email}
        phone={phone}
        onEditAcademy={onEditAcademy}
        onEditMyProfile={onEditMyProfile}
      />

      <SectionTitle>학원 설정</SectionTitle>
      <div className="mx-4 flex flex-col gap-2">
        <SettingsRow
          icon={CheckSquare}
          tone="emerald"
          title="출결·등하원 설정"
          subtitle={methodSubtitle}
          onClick={onOpenAttendanceSettings}
        />
        {isQrInUse && (
          <SettingsRow
            icon={QrCode}
            tone="blue"
            title="공용 QR 화면 열기"
            subtitle="공용 단말에 풀스크린 QR을 띄워요."
            onClick={onOpenQrDisplay}
          />
        )}
        <SettingsRow
          icon={RefreshCw}
          title="데이터 새로고침"
          subtitle={lastSyncedLabel ? `마지막 동기화 ${lastSyncedLabel}` : '최신 정보를 다시 불러와요'}
          onClick={handleRefresh}
          rightAdornment={
            refreshing ? <Loader2 size={14} className="animate-spin text-gray-400" /> : undefined
          }
        />
        {showSwitchAcademy && (
          <SettingsRow
            icon={Building2}
            tone="blue"
            title="학원 전환"
            subtitle={`다른 학원으로 이동 (${memberships.length}개 보유)`}
            onClick={onSwitchAcademy}
          />
        )}
      </div>

      <SectionTitle>계정</SectionTitle>
      <div className="mx-4">
        <InlineLogoutButton />
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed mt-4 px-5">
        직원 관리와 근무·계약·권한 설정은 "직원" 탭에서 진행해요.
      </p>
    </>
  );
}

// ─── Staff (teacher / assistant) 메인 layout ────────────────────
function StaffMoreSections({
  role, academyProfile, displayName, email, phone, memberships = [], showSwitchAcademy,
  onEditMyProfile, onSwitchAcademy,
}) {
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const myPendingInvitations = useWorkspaceStore((s) => s.myPendingInvitations) ?? [];
  const acceptInvitation = useWorkspaceStore((s) => s.acceptInvitation);
  const showToast = useAcademyStore((s) => s.showToast);
  const [acceptingId, setAcceptingId] = useState(null);

  const myMembership = memberships.find((m) => m.academy_id === currentAcademyId);
  const myRoleLabel = roleMap[role] || role;

  const handleAcceptInvitation = async (invitationId) => {
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

  return (
    <>
      <SectionTitle>내 프로필</SectionTitle>
      <div className="mx-4">
        <button
          type="button"
          onClick={onEditMyProfile}
          className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-4 text-left active:bg-gray-50 border border-gray-100 shadow-sm"
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-base font-bold text-blue-600 flex-shrink-0">
            {(displayName || email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base truncate">
              {displayName || '이름을 등록해주세요'}
            </p>
            {email && <p className="text-xs text-gray-500 mt-0.5 truncate">{email}</p>}
            {phone && <p className="text-xs text-gray-400 mt-0.5 truncate">{phone}</p>}
          </div>
          <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
        </button>
      </div>

      <SectionTitle>소속 학원</SectionTitle>
      <div className="mx-4 flex flex-col gap-2">
        <div className="bg-white rounded-2xl px-4 py-3.5 border border-gray-100 shadow-sm flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Building2 size={16} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              {myMembership?.academy?.name || academyProfile?.name || '학원'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{myRoleLabel}</p>
          </div>
        </div>

        {showSwitchAcademy && (
          <SettingsRow
            icon={Building2}
            tone="blue"
            title="학원 전환"
            subtitle={`다른 학원으로 이동 (${memberships.length}개 소속)`}
            onClick={onSwitchAcademy}
          />
        )}

        {myPendingInvitations.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-50 flex items-center gap-2">
              <Inbox size={13} className="text-amber-600" />
              <p className="text-xs font-bold text-gray-700">받은 초대 ({myPendingInvitations.length})</p>
            </div>
            {myPendingInvitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 px-4 py-3 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {inv.academy?.name || '학원'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{roleMap[inv.role] || inv.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAcceptInvitation(inv.id)}
                  disabled={acceptingId === inv.id}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-60"
                >
                  {acceptingId === inv.id ? '수락 중…' : '수락'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <SectionTitle>계정</SectionTitle>
      <div className="mx-4">
        <InlineLogoutButton />
      </div>
    </>
  );
}

// ─── 학원 정보 수정 모달 ────────────────────────────────────────
function AcademyProfileModal({ profile, onClose, onSave }) {
  const [form, setForm] = useState({
    name:      profile?.name      || '',
    ownerName: profile?.ownerName || '',
    address:   profile?.address   || '',
    phone:     profile?.phone     || '',
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="학원 정보 수정"
      footer={
        <button
          type="button"
          onClick={() => onSave(form)}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl"
        >
          저장
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">학원 이름</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="우리 학원"
            className="input"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">원장 이름</label>
          <input
            value={form.ownerName}
            onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
            placeholder="예: 김원장"
            className="input"
          />
          <p className="text-xs text-gray-400 mt-1.5">반의 담당 강사 선택 시 원장 본인을 배정할 수 있어요.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">주소</label>
          <input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="서울시 강남구..."
            className="input"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">연락처</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))}
            placeholder="02-0000-0000"
            className="input"
          />
        </div>
      </div>
    </Modal>
  );
}
