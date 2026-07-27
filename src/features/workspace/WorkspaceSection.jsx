import { useState } from 'react';
import {
  Building2, Check, ChevronRight, Plus, Loader2, X, RefreshCw,
  Mail, GraduationCap, Users,
} from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import useAcademyStore from '../../store/useAcademyStore';
import { fetchAcademySnapshot } from '../../services/supabase/hydrateApi';
import { roleMap, appRoleToLabel, formatPhoneNumber } from '../../utils/format';
import {
  ACADEMY_SUBJECT_OPTIONS,
  CLINIC_REQUIRED_OPTIONS,
  DEFAULT_ACADEMY_SETTINGS,
  inferAcademyTypeFromSubjects,
} from '../../constants/academySettings';
import TuitionRateFields from '../academy/onboarding/TuitionRateFields';

const ACCOUNT_TYPE_HINT = {
  tutor: {
    title: '과외 선생님 계정',
    desc: '개인 과외 모드로 사용할 수 있어요. 학원에 참여하지 않아도 돼요.',
    Icon: GraduationCap,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  owner: {
    title: '학원 원장 계정',
    desc: '학원 워크스페이스를 만들고 강사를 초대할 수 있어요.',
    Icon: Building2,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  staff: {
    title: '직원 계정',
    desc: '학원 초대를 수락한 뒤 원장 또는 운영 매니저가 역할을 배정해요.',
    Icon: Users,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
  },
};

const INVITE_ROLE_LABEL = {
  teacher: '강사', assistant: '보조강사', manager: '운영 매니저', pending: '직원',
};

export default function WorkspaceSection() {
  const isSupabaseReady = useAuthStore((s) => s.isSupabaseReady);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const profile = useWorkspaceStore((s) => s.profile);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const setCurrentAcademyId = useWorkspaceStore((s) => s.setCurrentAcademyId);
  const createAcademy = useWorkspaceStore((s) => s.createAcademy);
  const isWorkspaceLoading = useWorkspaceStore((s) => s.isWorkspaceLoading);
  const isWorkspaceReady = useWorkspaceStore((s) => s.isWorkspaceReady);
  const myPendingInvitations = useWorkspaceStore((s) => s.myPendingInvitations) ?? [];
  const isMyPendingInvitationsLoading = useWorkspaceStore((s) => s.isMyPendingInvitationsLoading);
  const loadMyPendingInvitations = useWorkspaceStore((s) => s.loadMyPendingInvitations);
  const acceptInvitation = useWorkspaceStore((s) => s.acceptInvitation);
  // Phase 28: 학원 정보 카드의 "새로고침" 버튼이 실제로 부르는 loaders. 사용자에게는
  // 서버/로컬 구분 없이 "동기화" 로만 표현한다.
  const loadServerStudents = useWorkspaceStore((s) => s.loadServerStudents);
  const loadServerClassGroups = useWorkspaceStore((s) => s.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const loadServerLessonRecords = useWorkspaceStore((s) => s.loadServerLessonRecords);
  const loadServerAttendanceRecords = useWorkspaceStore((s) => s.loadServerAttendanceRecords);
  const loadServerClinicRecords = useWorkspaceStore((s) => s.loadServerClinicRecords);
  const loadServerPayments = useWorkspaceStore((s) => s.loadServerPayments);
  const loadServerPayrolls = useWorkspaceStore((s) => s.loadServerPayrolls);
  const showToast = useAcademyStore((s) => s.showToast);
  const setAcademyProfile = useAcademyStore((s) => s.setAcademyProfile);
  const hydrateAcademyFromServerSnapshot = useAcademyStore((s) => s.hydrateAcademyFromServerSnapshot);
  const appRole = useAcademyStore((s) => s.role);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [academySubjects, setAcademySubjects] = useState([]);
  const [clinicRequired, setClinicRequired] = useState(DEFAULT_ACADEMY_SETTINGS.clinicRequired);
  const tuitionPolicy = DEFAULT_ACADEMY_SETTINGS.tuitionPolicy;
  const [tuitionRates, setTuitionRates] = useState(DEFAULT_ACADEMY_SETTINGS.tuitionRates);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);

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

  const handleHydrate = async () => {
    if (hydrating) return;
    if (!currentAcademyId) {
      showToast('학원을 먼저 선택해주세요.', 'error');
      return;
    }
    const ok = window.confirm(
      appRole === 'owner'
        ? 'Supabase의 최신 데이터로 이 기기를 동기화합니다. 아직 서버에 저장되지 않은 원장 기기의 항목은 보존됩니다. 계속할까요?'
        : 'Supabase의 최신 데이터와 권한을 기준으로 이 기기를 다시 맞춥니다. 서버에 없는 임시 항목은 정리됩니다. 계속할까요?'
    );
    if (!ok) return;
    setHydrating(true);
    try {
      // 1) snapshot fetch — 어느 한 테이블이라도 실패하면 throw → hydrate 시도하지 않음
      const snapshot = await fetchAcademySnapshot(currentAcademyId);
      if (useWorkspaceStore.getState().currentAcademyId !== currentAcademyId) {
        showToast('학원이 변경되어 이전 학원의 동기화를 취소했어요.', 'error');
        return;
      }
      // 2) localStorage 반영. 서버 저장 실패로 남은 local-only row는 유실 방지를 위해 보존한다.
      const counts = hydrateAcademyFromServerSnapshot(snapshot, {
        strategy: 'serverWins',
        preserveLocalOnly: useAcademyStore.getState().role === 'owner',
      });
      // 3) 서버 카운트도 재조회 (snapshot fetch 직후라 사실상 동일하지만 일관성 유지)
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
      const total =
        (counts?.students || 0) + (counts?.classGroups || 0) +
        (counts?.classSessions || 0) + (counts?.lessonRecords || 0) +
        (counts?.attendanceRecords || 0) + (counts?.clinicRecords || 0) +
        (counts?.payments || 0) + (counts?.payrolls || 0);
      showToast(`서버 기준으로 데이터를 맞췄어요. (${total}개)`);
    } catch (err) {
      console.error('[hydrate] fetchAcademySnapshot failed', err);
      showToast(
        err?.message ?? '데이터를 불러오지 못했어요.',
        'error',
      );
    } finally {
      setHydrating(false);
    }
  };

  // 미로그인 / 미설정이면 표시하지 않음 (AuthSection 이 처리)
  if (!isSupabaseReady || !isAuthenticated) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (academySubjects.length === 0) {
      showToast('운영 과목을 하나 이상 선택해주세요.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const academyType = inferAcademyTypeFromSubjects(academySubjects);
      await createAcademy({
        name: trimmed,
        academyType,
        academySubjects,
        clinicRequired,
        tuitionPolicy,
        tuitionRates,
        address,
        phone,
      });
      setAcademyProfile({
        name: trimmed,
        academyType,
        academySubjects,
        clinicRequired,
        tuitionPolicy,
        tuitionRates,
        address: address.trim(),
        phone: phone.trim(),
      });
      showToast('학원 워크스페이스가 생성되었어요.');
      setName('');
      setAddress('');
      setPhone('');
      setAcademySubjects([]);
      setClinicRequired(DEFAULT_ACADEMY_SETTINGS.clinicRequired);
      setTuitionRates(DEFAULT_ACADEMY_SETTINGS.tuitionRates);
      setCreating(false);
    } catch (err) {
      showToast(err?.message ?? '학원 생성에 실패했어요.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setCreating(false);
    setName('');
    setAddress('');
    setPhone('');
    setAcademySubjects([]);
    setClinicRequired(DEFAULT_ACADEMY_SETTINGS.clinicRequired);
    setTuitionRates(DEFAULT_ACADEMY_SETTINGS.tuitionRates);
  };

  const toggleAcademySubject = (subjectId) => {
    setAcademySubjects((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const accountType = profile?.account_type || 'tutor';
  const isStaffAccount = accountType === 'staff';
  const hasPendingInvitations = myPendingInvitations.length > 0;

  // Current membership for the active academy.
  const currentMembership = memberships.find((m) => m.academy_id === currentAcademyId);
  const membershipRole = currentMembership?.role || null;

  // Phase 28 — 사용자 시야에 노출되는 UX:
  //   - "학원 워크스페이스" 라는 기술적 이름 대신 "학원 정보" 로 부른다.
  //   - 서버/로컬 구분 라벨을 모두 제거. "동기화됨" 으로 통일.
  //   - 원장이 학원 1개를 운영하는 일반 케이스에서는 학원 목록(선택 UI) 을 숨긴다.
  //   - 강사/보조강사 의 학원 선택은 별도 페이지(WorkspaceSelectionPage) 에서 처리.
  const isOwnerRole = appRole === 'owner';
  const showAcademyList = memberships.length > 1; // 여러 학원이 있을 때만 노출
  const lastSyncedLabel = useLastSyncedLabel();

  return (
    <div className="mx-4 mt-5">
      <p className="text-sm font-bold text-gray-700 mb-3">학원 정보</p>

      {/* 계정 유형 안내 — profile 이 동기화되면 표시 */}
      {profile && ACCOUNT_TYPE_HINT[accountType] && (
        <AccountTypeHint type={accountType} />
      )}

      {/* 받은 학원 초대 — 강사/보조강사 또는 누구든 pending 이 있으면 표시 */}
      {(isStaffAccount || hasPendingInvitations) && (
        <InvitationsCard
          invitations={myPendingInvitations}
          loading={isMyPendingInvitationsLoading}
          acceptingId={acceptingId}
          onAccept={handleAcceptInvitation}
          onRefresh={loadMyPendingInvitations}
        />
      )}

      {/* 현재 학원 + 동기화 상태 — currentAcademy 가 있을 때만 표시 */}
      {currentMembership && (
        <CurrentAcademyCard
          academyName={currentMembership.academy?.name ?? '(이름 없음)'}
          membershipRole={membershipRole}
          lastSyncedLabel={lastSyncedLabel}
          onRefresh={handleHydrate}
          refreshing={hydrating}
        />
      )}

      {memberships.length === 0 ? (
        // staff 계정이고 pending 초대가 표시될 예정이면 EmptyCard 의 학원 만들기 강조는 줄임.
        <EmptyCard
          loading={!isWorkspaceReady && isWorkspaceLoading}
          creating={creating}
          submitting={submitting}
          name={name}
          address={address}
          phone={phone}
          academySubjects={academySubjects}
          clinicRequired={clinicRequired}
          tuitionRates={tuitionRates}
          onNameChange={setName}
          onAddressChange={setAddress}
          onPhoneChange={setPhone}
          onSubjectToggle={toggleAcademySubject}
          onClinicRequiredChange={setClinicRequired}
          onTuitionRatesChange={setTuitionRates}
          onStart={() => setCreating(true)}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          deemphasized={isStaffAccount}
        />
      ) : showAcademyList ? (
        // 여러 학원에 소속된 경우에만 학원 전환 카드 노출.
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold text-gray-500 mt-2">학원 전환</p>
          {memberships.map((m) => {
            const isCurrent = m.academy_id === currentAcademyId;
            const academyName = m.academy?.name ?? '(이름 없음)';
            const roleLabel = roleMap[m.role] ?? m.role;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setCurrentAcademyId(m.academy_id)}
                className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors ${
                  isCurrent
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-white shadow-sm border border-transparent active:bg-gray-50'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCurrent ? 'bg-blue-100' : 'bg-gray-100'
                  }`}
                >
                  <Building2
                    size={16}
                    className={isCurrent ? 'text-blue-600' : 'text-gray-400'}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {academyName}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{roleLabel}</p>
                </div>
                {isCurrent ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                    <Check size={13} />
                    선택됨
                  </span>
                ) : (
                  <ChevronRight size={14} className="text-gray-300" />
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Phase 28: 원장이 1개 학원만 운영하면 "새 학원 만들기" 는 노출하지 않는다.
          여러 학원이 있을 때만 fold-out 식 추가 UI (드물게 사용). */}
      {isOwnerRole && memberships.length > 0 && showAcademyList && (
        creating ? (
          <InlineCreateForm
            name={name}
            address={address}
            phone={phone}
            academySubjects={academySubjects}
            clinicRequired={clinicRequired}
            tuitionRates={tuitionRates}
            submitting={submitting}
            onNameChange={setName}
            onAddressChange={setAddress}
            onPhoneChange={setPhone}
            onSubjectToggle={toggleAcademySubject}
            onClinicRequiredChange={setClinicRequired}
            onTuitionRatesChange={setTuitionRates}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-2 w-full text-center py-2 text-xs text-gray-400 hover:text-blue-600"
          >
            직접 학원 만들기
          </button>
        )
      )}
    </div>
  );
}

// Phase 28: "마지막 동기화 HH:mm" 라벨용 보조 훅. 핵심 3개 loadedAt 중 최신값.
function useLastSyncedLabel() {
  const a = useWorkspaceStore((s) => s.serverStudentsLoadedAt);
  const b = useWorkspaceStore((s) => s.serverClassGroupsLoadedAt);
  const c = useWorkspaceStore((s) => s.serverClassSessionsLoadedAt);
  const latest = [a, b, c].filter(Boolean).sort().pop() || null;
  if (!latest) return null;
  return new Date(latest).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// Phase 28: "현재 학원" 카드. 학원 이름 + 권한 + 마지막 동기화 시간 + 새로고침.
// 서버/로컬 구분 라벨은 모두 제거 — 일반 앱처럼 "동기화됨" 만 보여준다.
function CurrentAcademyCard({ academyName, membershipRole, lastSyncedLabel, onRefresh, refreshing }) {
  const membershipLabel = appRoleToLabel(membershipRole) || '';
  return (
    <div className="bg-white rounded-2xl shadow-sm mb-2 overflow-hidden">
      <div className="p-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Building2 size={16} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">
            {academyName}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {membershipLabel}
            {lastSyncedLabel ? (
              <>
                <span className="text-gray-300"> · </span>
                마지막 동기화 {lastSyncedLabel}
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="새로고침"
          className="text-xs text-blue-600 font-semibold flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>
    </div>
  );
}

// Phase 28 — ServerDataStatus / StatusLine / MembershipRoleStatus 컴포넌트 제거.
// "서버 데이터" 라는 기술적 라벨을 사용자에게 노출하지 않고, CurrentAcademyCard 의
// "마지막 동기화 HH:mm + 새로고침" 만 노출한다. 자동 hydrate 가 정상 흐름.

function EmptyCard({
  loading, creating, submitting, name, address, phone, academySubjects, clinicRequired, tuitionRates,
  onNameChange, onAddressChange, onPhoneChange,
  onSubjectToggle, onClinicRequiredChange, onTuitionRatesChange,
  onStart, onSubmit, onCancel, deemphasized,
}) {
  // staff 계정은 학원을 직접 만들기보다 초대 수락 흐름을 권장하므로
  // 버튼/문구를 약하게 노출한다.
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Building2 size={18} className="text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">
            {deemphasized ? '아직 참여한 학원이 없어요' : '연결된 학원이 없어요'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {deemphasized
              ? '원장이 보낸 초대를 수락하면 학원에 합류할 수 있어요.'
              : '학원을 만들면 PC와 핸드폰에서 같은 데이터를 사용할 수 있어요.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-50 text-gray-400 text-sm">
          <Loader2 size={14} className="animate-spin" />
          불러오는 중…
        </div>
      ) : creating ? (
        <InlineCreateForm
          name={name}
          address={address}
          phone={phone}
          academySubjects={academySubjects}
          clinicRequired={clinicRequired}
          tuitionRates={tuitionRates}
          submitting={submitting}
          onNameChange={onNameChange}
          onAddressChange={onAddressChange}
          onPhoneChange={onPhoneChange}
          onSubjectToggle={onSubjectToggle}
          onClinicRequiredChange={onClinicRequiredChange}
          onTuitionRatesChange={onTuitionRatesChange}
          onSubmit={onSubmit}
          onCancel={onCancel}
          variant="empty"
        />
      ) : deemphasized ? (
        <button
          type="button"
          onClick={onStart}
          className="w-full text-center py-2 text-xs text-gray-400 hover:text-blue-600"
        >
          직접 학원 만들기
        </button>
      ) : (
        <button
          type="button"
          onClick={onStart}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold"
        >
          <Plus size={14} />학원 만들기
        </button>
      )}
    </div>
  );
}

function AccountTypeHint({ type }) {
  const config = ACCOUNT_TYPE_HINT[type];
  if (!config) return null;
  const { title, desc, Icon, iconBg, iconColor } = config;
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm flex items-start gap-3 mb-2">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon size={16} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function InvitationsCard({ invitations, loading, acceptingId, onAccept, onRefresh }) {
  if (loading && (!invitations || invitations.length === 0)) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-2 mb-2 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" />
        받은 초대 확인 중…
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm mb-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail size={14} className="text-blue-500" />
          <p className="text-sm font-bold text-gray-900">받은 학원 초대</p>
          {invitations.length > 0 && (
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {invitations.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-xs text-blue-600 font-semibold flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>
      {invitations.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">
          받은 초대가 없어요.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {invitations.map((inv) => {
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
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {academyName}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {inv.role === 'pending'
                      ? '직원 초대 · 수락 후 역할 배정'
                      : `${roleLabel} 역할`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onAccept(inv.id)}
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
  );
}

function InlineCreateForm({
  name, address, phone, academySubjects, clinicRequired, tuitionRates, submitting,
  onNameChange, onAddressChange, onPhoneChange,
  onSubjectToggle, onClinicRequiredChange, onTuitionRatesChange,
  onSubmit, onCancel, variant,
}) {
  const containerClass =
    variant === 'empty'
      ? ''
      : 'bg-white rounded-2xl p-3 shadow-sm';
  return (
    <form onSubmit={onSubmit} className={containerClass}>
      <input
        autoFocus
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="학원 이름"
        disabled={submitting}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60"
      />
      <input
        value={address}
        onChange={(e) => onAddressChange(e.target.value)}
        placeholder="학원 주소"
        autoComplete="street-address"
        disabled={submitting}
        className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60"
      />
      <input
        value={phone}
        onChange={(e) => onPhoneChange(formatPhoneNumber(e.target.value))}
        placeholder="학원 전화번호"
        inputMode="tel"
        autoComplete="tel"
        disabled={submitting}
        className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60"
      />
      <SubjectChipGroup
        subjects={academySubjects}
        onToggle={onSubjectToggle}
      />
      <TuitionRateFields
        rates={tuitionRates}
        onChange={onTuitionRatesChange}
        subjects={academySubjects}
      />
      <CreateChoiceGroup
        label="클리닉 운영"
        options={CLINIC_REQUIRED_OPTIONS.map((option) => ({ ...option, id: option.value }))}
        value={clinicRequired}
        onChange={onClinicRequiredChange}
      />
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold disabled:opacity-60"
        >
          <X size={13} />취소
        </button>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              생성 중…
            </>
          ) : (
            <>
              <Check size={13} />
              만들기
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function SubjectChipGroup({ subjects, onToggle }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-bold text-gray-700">운영 과목</p>
      <div className="grid grid-cols-2 gap-1.5">
        {ACADEMY_SUBJECT_OPTIONS.map((option) => {
          const selected = subjects.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              className={`rounded-xl border px-3 py-2.5 text-left ${
                selected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-100 bg-gray-50'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-xs font-bold ${selected ? 'text-blue-700' : 'text-gray-800'}`}>
                  {option.label}
                </span>
                {selected && <Check size={13} className="text-blue-600" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreateChoiceGroup({ label, options, value, onChange, columns = 1 }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-bold text-gray-700">{label}</p>
      <div className={`grid gap-1.5 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={String(option.id)}
              type="button"
              onClick={() => onChange(option.id)}
              className={`rounded-xl border px-3 py-2 text-left ${
                selected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-100 bg-gray-50'
              }`}
            >
              <p className={`text-xs font-bold ${selected ? 'text-blue-700' : 'text-gray-800'}`}>
                {option.label}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
