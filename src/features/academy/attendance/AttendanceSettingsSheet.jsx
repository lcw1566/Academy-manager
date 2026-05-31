// AttendanceSettingsSheet — Phase 41
//
// 출결·등하원 설정 화면. 두 가지 진입 모드를 모두 지원:
//   - kind='onboarding' : 학원 첫 진입 시 호출. 닫기 버튼 없음/약함, "설정 완료" 만 노출.
//   - kind='settings'   : 더보기 탭에서 호출. 닫기 가능, 변경사항 저장.
//
// 데이터는 useWorkspaceStore.memberships 의 academy 컬럼을 source of truth 로 본다.
// 저장은 saveAttendanceSettings 액션을 호출 (academies update). owner 만 호출 가능.

import { useEffect, useMemo, useState } from 'react';
import { QrCode, UserCheck, Loader2, Info, X as XIcon } from 'lucide-react';
import Modal from '../../../components/Modal';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import useAcademyStore from '../../../store/useAcademyStore';
import { readAttendanceSettings, generateQrToken } from './attendanceHelpers';

export default function AttendanceSettingsSheet({ kind = 'settings', onClose }) {
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const saveAttendanceSettings = useWorkspaceStore((s) => s.saveAttendanceSettings);
  const showToast = useAcademyStore((s) => s.showToast);

  const academy = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId)?.academy || null,
    [memberships, currentAcademyId],
  );
  const current = useMemo(() => readAttendanceSettings(academy), [academy]);

  // Phase 43 — 선생님 출퇴근 방식은 'qr' 단일. 더 이상 선택 UI 없음.
  const [studentMethod, setStudentMethod]           = useState(current.studentCheckMethod);
  const [studentOverride, setStudentOverride]       = useState(current.studentManualOverrideEnabled);
  const [saving, setSaving]                         = useState(false);

  useEffect(() => {
    // academy 가 바뀌면 폼 초기화 (사용자가 학원 전환 직후 진입한 케이스 대응).
    setStudentMethod(current.studentCheckMethod);
    setStudentOverride(current.studentManualOverrideEnabled);
  }, [current.studentCheckMethod, current.studentManualOverrideEnabled]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // QR 사용을 시작했는데 토큰이 비어 있으면 새로 발급.
      // 선생님 모드는 항상 'qr' 이므로 토큰은 사실상 항상 필요.
      const needToken = !current.attendanceQrToken;
      const patch = {
        staffCheckMethod: 'qr',
        studentCheckMethod: studentMethod,
        studentManualOverrideEnabled: studentOverride,
      };
      if (needToken) patch.attendanceQrToken = generateQrToken();
      if (kind === 'onboarding') patch.markOnboarded = true;
      await saveAttendanceSettings(patch);
      showToast(kind === 'onboarding' ? '출결 방식이 설정되었어요.' : '출결 설정이 저장되었어요.');
      onClose?.();
    } catch (err) {
      showToast(err?.message ?? '저장에 실패했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isOnboarding = kind === 'onboarding';
  const title = isOnboarding ? '출결 관리 방식을 선택해주세요' : '출결·등하원 설정';

  return (
    <Modal
      isOpen
      onClose={isOnboarding ? undefined : onClose}
      title={title}
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#3182F6] text-white font-bold py-3.5 rounded-xl disabled:opacity-60 flex items-center justify-center gap-1.5"
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          {isOnboarding ? '설정 완료' : '저장'}
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        {!isOnboarding && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="self-end -mt-1 -mr-1 w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100"
            aria-label="닫기"
          >
            <XIcon size={16} className="text-gray-400" />
          </button>
        )}

        {/* 직원 출퇴근 방식 — Phase 43 이후 'qr' 고정. 선택 없는 안내 카드만 노출. */}
        <SectionGroup
          title="선생님 출근·퇴근 방식"
          subtitle="공용 화면의 QR을 스캔해 출근·퇴근해요."
        >
          <MethodCard
            icon={QrCode}
            tone="indigo"
            active
            onClick={() => {}}
            title="QR 체크인"
            subtitle="공용 단말 화면에 띄운 QR을 강사 본인 단말로 스캔하면 출근·퇴근이 기록돼요."
            disabled
          />
          <div className="mt-2 flex items-start gap-2 bg-[#F8F9FA] rounded-2xl px-3 py-2.5">
            <Info size={13} className="text-[#4E5968] mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-[#4E5968] leading-relaxed">
              현재는 QR 방식만 지원해요. 강사가 직접 "출근" 버튼을 눌러 기록할 수도 있어요.
            </p>
          </div>
        </SectionGroup>

        {/* 학생 등하원 방식 */}
        <SectionGroup
          title="학생 등원·하원 방식"
          subtitle="학생의 등·하원을 어떻게 기록할지 선택해주세요."
        >
          <MethodCard
            icon={UserCheck}
            tone="emerald"
            active={studentMethod === 'teacher_manual'}
            onClick={() => setStudentMethod('teacher_manual')}
            title="선생님 직접 체크"
            subtitle="담당 선생님이 수업 화면에서 직접 출결을 관리해요."
          />
          <MethodCard
            icon={QrCode}
            tone="indigo"
            active={studentMethod === 'qr'}
            onClick={() => setStudentMethod('qr')}
            title="QR 체크인"
            subtitle="학생이 공용 QR을 스캔해 등원·하원을 기록해요."
          />

          <div className="mt-2 flex items-start gap-2 bg-blue-50 rounded-2xl px-3 py-2.5">
            <Info size={13} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-blue-700 leading-relaxed">
              QR 방식을 사용해도 선생님이 수업 화면에서 직접 수정할 수 있어요.
            </p>
          </div>

          <label className="flex items-center justify-between gap-2 mt-2 px-1">
            <span className="text-sm text-[#191F28]">선생님 수동 수정 허용</span>
            <input
              type="checkbox"
              checked={!!studentOverride}
              onChange={(e) => setStudentOverride(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
          </label>
        </SectionGroup>

        {isOnboarding && (
          <p className="text-[11px] text-[#8B95A1] leading-relaxed text-center -mt-1">
            이 설정은 나중에 "더보기 → 출결·등하원 설정" 에서 다시 바꿀 수 있어요.
          </p>
        )}
      </div>
    </Modal>
  );
}

function SectionGroup({ title, subtitle, children }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-bold text-[#191F28]">{title}</p>
        {subtitle && <p className="text-[11px] text-[#8B95A1] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function MethodCard({ icon: Icon, title, subtitle, active, onClick, tone = 'blue', footer, disabled = false }) {
  const toneClass = {
    blue:    { border: 'border-[#3182F6]', bg: 'bg-blue-50',     iconBg: 'bg-blue-100',    iconColor: 'text-[#3182F6]' },
    indigo:  { border: 'border-indigo-500', bg: 'bg-indigo-50',  iconBg: 'bg-indigo-100',  iconColor: 'text-indigo-600' },
    emerald: { border: 'border-emerald-500', bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl border-2 px-4 py-3.5 text-left transition-colors ${
        active ? `${toneClass.border} ${toneClass.bg}` : 'border-gray-200 bg-white'
      } ${disabled ? 'cursor-default' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          active ? toneClass.iconBg : 'bg-gray-100'
        }`}>
          <Icon size={18} className={active ? toneClass.iconColor : 'text-gray-500'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#191F28]">{title}</p>
          {subtitle && (
            <p className="text-xs text-[#4E5968] mt-0.5 leading-relaxed">{subtitle}</p>
          )}
        </div>
        <span className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
          active ? `${toneClass.border} bg-white` : 'border-gray-300 bg-white'
        }`}>
          {active && <span className={`w-2.5 h-2.5 rounded-full ${toneClass.iconColor.replace('text-', 'bg-')}`} />}
        </span>
      </div>
      {footer}
    </button>
  );
}
