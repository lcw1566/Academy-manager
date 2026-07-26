// AttendanceSettingsSheet — Phase 41
//
// 출결·등하원 설정 화면. 두 가지 진입 모드를 모두 지원:
//   - kind='onboarding' : 학원 첫 진입 시 호출. 닫기 버튼 없음/약함, "확인했어요" 만 노출.
//   - kind='settings'   : 더보기 탭에서 호출. 닫기 가능, 변경사항 저장.
//
// SQL 027 — 직원과 학생의 QR 사용 여부를 각각 선택한다.
//
// 데이터는 useWorkspaceStore.memberships 의 academy 컬럼을 source of truth 로 본다.
// 저장은 saveAttendanceSettings 액션을 호출 (academies update). owner 만 호출 가능.

import { useEffect, useMemo, useState } from 'react';
import {
  QrCode, Loader2, Info, X as XIcon, RefreshCw, Monitor, MousePointerClick, Users, Check,
} from 'lucide-react';
import Modal from '../../../components/Modal';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import useAcademyStore from '../../../store/useAcademyStore';
import { readAttendanceSettings, generateQrToken } from './attendanceHelpers';
import QrDisplayPage from './QrDisplayPage';

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

  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [showQrDisplay, setShowQrDisplay] = useState(false);
  const [staffCheckMethod, setStaffCheckMethod] = useState(current.staffCheckMethod);
  const [studentCheckMethod, setStudentCheckMethod] = useState(current.studentCheckMethod);

  const isOnboarding = kind === 'onboarding';
  const isQrInUse = staffCheckMethod === 'qr' || studentCheckMethod === 'qr';

  useEffect(() => {
    setStaffCheckMethod(current.staffCheckMethod);
    setStudentCheckMethod(current.studentCheckMethod);
  }, [current.staffCheckMethod, current.studentCheckMethod]);

  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const patch = {
        staffCheckMethod,
        studentCheckMethod,
        studentManualOverrideEnabled: true,
        staffManualOverrideEnabled: staffCheckMethod === 'manual',
      };
      if (isQrInUse && !current.attendanceQrToken) patch.attendanceQrToken = generateQrToken();
      if (isOnboarding) patch.markOnboarded = true;
      await saveAttendanceSettings(patch);
      showToast(isOnboarding ? '출결 설정이 완료되었어요.' : '출결 설정이 저장되었어요.');
      onClose?.();
    } catch (err) {
      showToast(err?.message ?? '저장에 실패했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRotateToken = async () => {
    if (rotating) return;
    setRotating(true);
    try {
      await saveAttendanceSettings({ attendanceQrToken: generateQrToken() });
      showToast('QR 토큰을 새로 발급했어요.');
    } catch (err) {
      showToast(err?.message ?? '토큰 발급에 실패했어요.', 'error');
    } finally {
      setRotating(false);
    }
  };

  const title = isOnboarding ? '출결 방식을 선택해주세요' : '출결·등하원 설정';

  return (
    <>
      <Modal
        isOpen
        onClose={isOnboarding ? undefined : onClose}
        title={title}
        footer={
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="w-full bg-[#3182F6] text-white font-bold py-3.5 rounded-xl disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isOnboarding ? '설정 완료' : '저장'}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
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

          {isOnboarding && (
            <div>
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold">
                <span className="text-blue-600">마지막 설정</span>
                <span className="text-gray-400">출결 관리</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
                <div className="h-full w-full rounded-full bg-blue-600" />
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-bold text-[#191F28]">직원 출퇴근</p>
            <div className="flex flex-col gap-2">
              <MethodOption
                selected={staffCheckMethod === 'manual'}
                Icon={MousePointerClick}
                title="직접 기록"
                description="직원이 앱에서 출근·퇴근 버튼을 눌러요."
                onClick={() => setStaffCheckMethod('manual')}
              />
              <MethodOption
                selected={staffCheckMethod === 'qr'}
                Icon={QrCode}
                title="QR 체크인"
                description="공용 QR을 스캔해야 출퇴근이 기록돼요."
                onClick={() => setStaffCheckMethod('qr')}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-[#191F28]">학생 등하원</p>
            <div className="flex flex-col gap-2">
              <MethodOption
                selected={studentCheckMethod === 'teacher_manual'}
                Icon={Users}
                title="선생님이 직접 체크"
                description="수업 화면에서 출석·지각·결석을 입력해요."
                onClick={() => setStudentCheckMethod('teacher_manual')}
              />
              <MethodOption
                selected={studentCheckMethod === 'qr'}
                Icon={QrCode}
                title="학생 QR 등하원"
                description="공용 QR과 학생 PIN으로 등·하원을 기록해요."
                onClick={() => setStudentCheckMethod('qr')}
              />
            </div>
          </div>

          {/* Owner 액션 — onboarding 모드에서는 숨겨서 흐름을 가볍게 한다. */}
          {!isOnboarding && isQrInUse && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowQrDisplay(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 bg-white active:bg-gray-50 text-left"
              >
                <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center">
                  <Monitor size={15} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#191F28]">공용 QR 화면 열기</p>
                  <p className="text-[11px] text-[#8B95A1] mt-0.5">키오스크/태블릿에 띄워두는 풀스크린 QR</p>
                </div>
              </button>
              <button
                type="button"
                onClick={handleRotateToken}
                disabled={rotating}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 bg-white active:bg-gray-50 text-left disabled:opacity-60"
              >
                <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center">
                  {rotating
                    ? <Loader2 size={15} className="text-amber-600 animate-spin" />
                    : <RefreshCw size={15} className="text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#191F28]">QR 토큰 새로고침</p>
                  <p className="text-[11px] text-[#8B95A1] mt-0.5">의심스러운 스캔이 있을 때 토큰을 재발급</p>
                </div>
              </button>
            </div>
          )}

          {/* 수동 수정 권한 안내 */}
          <div className="mt-1 flex items-start gap-2 bg-[#F8F9FA] rounded-2xl px-3 py-2.5">
            <Info size={13} className="text-[#4E5968] mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-[#4E5968] leading-relaxed">
              설정은 나중에도 바꿀 수 있어요. QR을 선택하면 학원 공용 화면에서 같은
              QR을 사용하고, 직접 체크를 선택하면 각 업무 화면에서 기록해요.
            </p>
          </div>
        </div>
      </Modal>

      {showQrDisplay && (
        <QrDisplayPage onClose={() => setShowQrDisplay(false)} />
      )}
    </>
  );
}

function MethodOption({ selected, Icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white active:bg-gray-50'
      }`}
    >
      <span className="flex items-center gap-3">
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
          selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
        }`}>
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-bold ${selected ? 'text-blue-700' : 'text-[#191F28]'}`}>
            {title}
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-[#8B95A1]">{description}</span>
        </span>
        {selected && <Check size={15} className="flex-shrink-0 text-blue-600" />}
      </span>
    </button>
  );
}
