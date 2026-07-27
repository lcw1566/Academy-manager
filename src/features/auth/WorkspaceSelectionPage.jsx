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
import { motion } from 'framer-motion';
import {
  Building2, ChevronRight, LogOut, Plus, Inbox, Loader2, Mail, Check,
  QrCode, MousePointerClick, Users, Ban,
} from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import useAcademyStore from '../../store/useAcademyStore';
import { formatPhoneNumber, roleMap } from '../../utils/format';
import {
  ACADEMY_SUBJECT_OPTIONS,
  CLINIC_REQUIRED_OPTIONS,
  DEFAULT_ACADEMY_SETTINGS,
  inferAcademyTypeFromSubjects,
} from '../../constants/academySettings';
import { generateQrToken } from '../academy/attendance/attendanceHelpers';
import TuitionRateFields from '../academy/onboarding/TuitionRateFields';

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
  const saveAttendanceSettings = useWorkspaceStore((s) => s.saveAttendanceSettings);
  const signOutUser = useAuthStore((s) => s.signOutUser);
  const showToast = useAcademyStore((s) => s.showToast);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const setAcademyProfile = useAcademyStore((s) => s.setAcademyProfile);

  const [submitting, setSubmitting] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [newAcademyName, setNewAcademyName] = useState('');
  const [academyAddress, setAcademyAddress] = useState('');
  const [academyPhone, setAcademyPhone] = useState('');
  const [academySubjects, setAcademySubjects] = useState([]);
  const [clinicRequired, setClinicRequired] = useState(DEFAULT_ACADEMY_SETTINGS.clinicRequired);
  const tuitionPolicy = DEFAULT_ACADEMY_SETTINGS.tuitionPolicy;
  const [tuitionRates, setTuitionRates] = useState(DEFAULT_ACADEMY_SETTINGS.tuitionRates);
  const [staffCheckMethod, setStaffCheckMethod] = useState('manual');
  const [studentCheckMethod, setStudentCheckMethod] = useState('teacher_manual');
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
      showToast(
        result?.role === 'pending'
          ? `${academyName} 초대를 수락했어요. 역할 배정을 기다려주세요.`
          : `${academyName}에 참여했어요.`,
      );
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
    if (academySubjects.length === 0) {
      showToast('운영 과목을 하나 이상 선택해주세요.', 'error');
      return;
    }
    if (createSubmitting) return;
    setCreateSubmitting(true);
    try {
      const academyType = inferAcademyTypeFromSubjects(academySubjects);
      await createAcademy({
        name: trimmed,
        academyType,
        academySubjects,
        clinicRequired,
        tuitionPolicy,
        tuitionRates,
        address: academyAddress,
        phone: academyPhone,
      });
      let attendanceSettingsSaved = true;
      try {
        const usesQr = staffCheckMethod === 'qr' || studentCheckMethod === 'qr';
        await saveAttendanceSettings({
          staffCheckMethod,
          studentCheckMethod,
          staffManualOverrideEnabled: staffCheckMethod === 'manual',
          studentManualOverrideEnabled: true,
          ...(usesQr ? { attendanceQrToken: generateQrToken() } : {}),
          markOnboarded: true,
        });
      } catch (attendanceError) {
        attendanceSettingsSaved = false;
        console.warn('[onboarding] attendance settings save failed', attendanceError);
      }
      setAcademyProfile({
        name: trimmed,
        academyType,
        academySubjects,
        clinicRequired,
        tuitionPolicy,
        tuitionRates,
        address: academyAddress.trim(),
        phone: academyPhone.trim(),
      });
      showToast(
        attendanceSettingsSaved
          ? '학원 설정이 완료되었어요.'
          : '학원은 생성됐어요. 출결 설정을 다시 확인해주세요.',
        attendanceSettingsSaved ? 'success' : 'error',
      );
      resetCreateForm();
      setCreating(false);
      setActiveTab('home');
      markWorkspacePicked();
    } catch (err) {
      showToast(err?.message ?? '학원 생성에 실패했어요.', 'error');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setCreateStep(0);
    setNewAcademyName('');
    setAcademyAddress('');
    setAcademyPhone('');
    setAcademySubjects([]);
    setClinicRequired(DEFAULT_ACADEMY_SETTINGS.clinicRequired);
    setTuitionRates(DEFAULT_ACADEMY_SETTINGS.tuitionRates);
    setStaffCheckMethod('manual');
    setStudentCheckMethod('teacher_manual');
  };

  const handleCancelCreate = () => {
    setCreating(false);
    resetCreateForm();
  };

  const toggleAcademySubject = (subjectId) => {
    setAcademySubjects((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
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
                      {inv.role === 'pending'
                        ? '직원 초대 · 수락 후 역할 배정'
                        : `${roleMap[inv.role] || inv.role} 초대`}
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
              학원을 만들면 선생님을 초대하고 학생을 관리할 수 있어요.
            </p>
            {creating ? (
              <AcademyCreateOnboarding
                step={createStep}
                name={newAcademyName}
                address={academyAddress}
                phone={academyPhone}
                subjects={academySubjects}
                clinicRequired={clinicRequired}
                tuitionRates={tuitionRates}
                staffCheckMethod={staffCheckMethod}
                studentCheckMethod={studentCheckMethod}
                submitting={createSubmitting}
                onNameChange={setNewAcademyName}
                onAddressChange={setAcademyAddress}
                onPhoneChange={setAcademyPhone}
                onSubjectToggle={toggleAcademySubject}
                onClinicRequiredChange={setClinicRequired}
                onTuitionRatesChange={setTuitionRates}
                onStaffCheckMethodChange={setStaffCheckMethod}
                onStudentCheckMethodChange={setStudentCheckMethod}
                onStepChange={setCreateStep}
                onCancel={handleCancelCreate}
                onCreate={handleCreate}
              />
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

function AcademyCreateOnboarding({
  step,
  name,
  address,
  phone,
  subjects,
  clinicRequired,
  tuitionRates,
  staffCheckMethod,
  studentCheckMethod,
  submitting,
  onNameChange,
  onAddressChange,
  onPhoneChange,
  onSubjectToggle,
  onClinicRequiredChange,
  onTuitionRatesChange,
  onStaffCheckMethodChange,
  onStudentCheckMethodChange,
  onStepChange,
  onCancel,
  onCreate,
}) {
  const isNameReady = !!name.trim();
  const isSubjectReady = subjects.length > 0;
  const steps = [
    { emoji: '🏫', title: '학원 기본 정보를 알려주세요', desc: '학원 기본정보는 나중에도 변경할 수 있어요.' },
    { emoji: '📚', title: '어떤 과목을 운영하나요?', desc: '여러 개를 골라도 괜찮아요. 나중에 수정할 수 있어요.' },
    { emoji: '💳', title: '수강료 가격표를 설정해주세요', desc: '필요하면 세부설정을 바꿀 수 있어요.' },
    { emoji: '📝', title: '클리닉을 어떻게 쓸까요?', desc: '수업 후 자습이 기본값이에요.' },
    { emoji: '⏱️', title: '직원 출퇴근은 어떻게 기록할까요?', desc: '직접 기록하거나 QR을 사용할 수 있어요.' },
    { emoji: '✅', title: '학생 등하원은 어떻게 기록할까요?', desc: '학원에 맞는 방식을 골라주세요.' },
  ];
  const canGoNext = step === 0 ? isNameReady : step === 1 ? isSubjectReady : true;
  const primaryLabel = step === steps.length - 1 ? '만들기' : '다음';

  const handlePrimary = () => {
    if (!canGoNext || submitting) return;
    if (step < steps.length - 1) {
      onStepChange(step + 1);
      return;
    }
    onCreate();
  };

  const handleSecondary = () => {
    if (submitting) return;
    if (step === 0) onCancel();
    else onStepChange(step - 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center justify-between text-[11px] font-bold">
          <span className="text-blue-600">학원 설정</span>
          <span className="text-gray-400">{step + 1} / {steps.length}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
          <motion.div
            className="h-full rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.45)]"
            initial={false}
            animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 180, damping: 24 }}
          />
        </div>
      </div>

      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gray-50 text-xl">
          {steps[step].emoji}
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-lg font-bold text-gray-900">{steps[step].title}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{steps[step].desc}</p>
        </div>
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">학원 이름</span>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="예: 우리 학원"
              className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl text-base focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">학원 주소</span>
            <input
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="예: 서울시 강남구 테헤란로 00"
              autoComplete="street-address"
              className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">학원 전화번호</span>
            <input
              value={phone}
              onChange={(e) => onPhoneChange(formatPhoneNumber(e.target.value))}
              placeholder="02-0000-0000"
              inputMode="tel"
              autoComplete="tel"
              className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500"
            />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-2 gap-2">
          {ACADEMY_SUBJECT_OPTIONS.map((subject) => {
            const selected = subjects.includes(subject.id);
            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => onSubjectToggle(subject.id)}
                className={`min-h-[52px] rounded-2xl border px-4 py-3 text-left transition-colors ${
                  selected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-100 bg-gray-50 active:bg-gray-100'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-bold ${selected ? 'text-blue-700' : 'text-gray-800'}`}>
                    {subject.label}
                  </span>
                  <span className="flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center">
                    <Check
                      size={15}
                      className={selected ? 'text-blue-600' : 'invisible'}
                    />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === 2 && (
        <div>
          <TuitionRateFields
            rates={tuitionRates}
            onChange={onTuitionRatesChange}
            subjects={subjects}
          />
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-2">
          {CLINIC_REQUIRED_OPTIONS.map((option) => {
            const selected = clinicRequired === option.value;
            return (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => onClinicRequiredChange(option.value)}
                className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                  selected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-100 bg-gray-50 active:bg-gray-100'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${selected ? 'text-blue-700' : 'text-gray-900'}`}>
                      {option.label}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">{option.description}</p>
                  </div>
                  <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
                    <Check
                      size={16}
                      className={selected ? 'text-blue-600' : 'invisible'}
                    />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-2">
          <AttendanceMethodChoice
            selected={staffCheckMethod === 'manual'}
            Icon={MousePointerClick}
            title="직접 출퇴근 기록"
            description="직원이 앱에서 출근·퇴근 버튼을 눌러요."
            onClick={() => onStaffCheckMethodChange('manual')}
          />
          <AttendanceMethodChoice
            selected={staffCheckMethod === 'qr'}
            Icon={QrCode}
            title="QR로 출퇴근"
            description="공용 QR을 스캔해야 출퇴근이 기록돼요."
            onClick={() => onStaffCheckMethodChange('qr')}
          />
        </div>
      )}

      {step === 5 && (
        <div className="flex flex-col gap-2">
          <AttendanceMethodChoice
            selected={studentCheckMethod === 'teacher_manual'}
            Icon={Users}
            title="선생님이 직접 체크"
            description="수업 화면에서 출석·지각·결석을 입력해요."
            onClick={() => onStudentCheckMethodChange('teacher_manual')}
          />
          <AttendanceMethodChoice
            selected={studentCheckMethod === 'qr'}
            Icon={QrCode}
            title="학생 QR 등하원"
            description="학생이 공용 QR과 PIN으로 등·하원을 기록해요."
            onClick={() => onStudentCheckMethodChange('qr')}
          />
          <AttendanceMethodChoice
            selected={studentCheckMethod === 'disabled'}
            Icon={Ban}
            title="사용하지 않음"
            description="등·하원 기능만 끄고 수업 출결은 따로 기록할 수 있어요."
            onClick={() => onStudentCheckMethodChange('disabled')}
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSecondary}
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold disabled:opacity-50"
        >
          {step === 0 ? '취소' : '이전'}
        </button>
        <button
          type="button"
          onClick={handlePrimary}
          disabled={submitting || !canGoNext}
          className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:bg-blue-300 disabled:opacity-70 flex items-center justify-center gap-1.5"
        >
          {submitting && <Loader2 size={13} className="animate-spin" />}
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}

function AttendanceMethodChoice({ selected, Icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-100 bg-gray-50 active:bg-gray-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${
          selected ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'
        }`}>
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-bold ${selected ? 'text-blue-700' : 'text-gray-900'}`}>
            {title}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-gray-500">{description}</span>
        </span>
        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
          <Check
            size={16}
            className={selected ? 'text-blue-600' : 'invisible'}
          />
        </span>
      </div>
    </button>
  );
}
