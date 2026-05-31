// AttendanceSettingsSheet — Phase 41
//
// 출결·등하원 설정 화면. 두 가지 진입 모드를 모두 지원:
//   - kind='onboarding' : 학원 첫 진입 시 호출. 닫기 버튼 없음/약함, "확인했어요" 만 노출.
//   - kind='settings'   : 더보기 탭에서 호출. 닫기 가능, 변경사항 저장.
//
// Phase 44 (Pilot Hotfix) — 정책이 "QR 단일" 로 단순화됨. 더 이상 직원/학생
// 체크인 방식을 선택하지 않음. owner 가 보는 화면은 안내 + 액션(공용 QR 열기 /
// 토큰 재발급) 만 노출. 수동 수정은 항상 허용 (owner 전체, teacher 본인 담당).
//
// 데이터는 useWorkspaceStore.memberships 의 academy 컬럼을 source of truth 로 본다.
// 저장은 saveAttendanceSettings 액션을 호출 (academies update). owner 만 호출 가능.

import { useMemo, useState } from 'react';
import { QrCode, Loader2, Info, X as XIcon, RefreshCw, Monitor } from 'lucide-react';
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

  const isOnboarding = kind === 'onboarding';

  // 정책 단순화 — onboarding 이거나 QR 토큰이 비어 있으면 자동으로 발급 + 마킹.
  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const patch = {
        staffCheckMethod: 'qr',
        studentCheckMethod: 'qr',
        studentManualOverrideEnabled: true,
        staffManualOverrideEnabled: true,
      };
      if (!current.attendanceQrToken) patch.attendanceQrToken = generateQrToken();
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

  const title = isOnboarding ? '출결은 QR로 관리해요' : '출결·등하원 설정';

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
            {isOnboarding ? '확인했어요' : '저장'}
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

          {/* 정책 안내 */}
          <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <QrCode size={16} className="text-indigo-600" />
              <p className="text-sm font-bold text-[#191F28]">QR 체크인을 사용 중이에요</p>
            </div>
            <p className="text-xs text-[#4E5968] leading-relaxed">
              직원과 학생 모두 공용 QR로 출퇴근·등하원을 기록해요.<br />
              원장과 담당 선생님은 필요할 때 직접 수정할 수 있어요.
            </p>
          </div>

          {/* Owner 액션 — onboarding 모드에서는 숨겨서 흐름을 가볍게 한다. */}
          {!isOnboarding && (
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
              원장은 직원·학생 출결을 모두 수정할 수 있어요. 담당 선생님은 본인 수업의
              학생 출결을 수정할 수 있어요. 수정한 기록은 "선생님 수정" 으로 표시돼요.
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
