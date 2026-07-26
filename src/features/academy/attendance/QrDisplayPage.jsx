// QrDisplayPage — Phase 41
//
// 공용 단말에 띄우는 풀스크린 QR 화면. owner 가 학원 설정에서 "공용 QR 화면 열기"
// 로 진입하면 모달이 아니라 전체 viewport 를 점유하는 페이지로 표시한다.
//
// 페이로드: buildPublicCheckinPayload({ academyId, token, purpose: 'shared' }).
// 토큰은 academies.attendance_qr_token. 자동 회전(20초 간격) — token 회전 시
// payload 의 issuedAt/expiresAt 만 갱신한다 (DB 의 토큰 자체 회전은 owner 가
// 명시적으로 트리거할 때만 — 회전 빈도가 너무 잦으면 분실 단말 대응 외엔 무의미).

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, RefreshCw, Maximize2 } from 'lucide-react';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import QrImage from '../../../components/qr/QrImage';
import {
  buildPublicCheckinPayload,
  buildPublicCheckinUrl,
  generateQrToken,
  readAttendanceSettings,
} from './attendanceHelpers';

const REFRESH_SEC = 20; // 20초마다 issuedAt/expiresAt 갱신 (cached read 도 충분).

export default function QrDisplayPage({ onClose }) {
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const saveAttendanceSettings = useWorkspaceStore((s) => s.saveAttendanceSettings);
  const academy = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId)?.academy || null,
    [memberships, currentAcademyId],
  );
  const settings = readAttendanceSettings(academy);
  const academyName = academy?.name || '학원';
  const token = settings.attendanceQrToken;
  const qrAudience =
    settings.staffCheckMethod === 'qr' && settings.studentCheckMethod === 'qr'
      ? '직원 출퇴근과 학생 등하원'
      : settings.staffCheckMethod === 'qr'
      ? '직원 출퇴근'
      : '학생 등하원';

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), REFRESH_SEC * 1000);
    return () => clearInterval(id);
  }, []);

  const payload = useMemo(
    () => buildPublicCheckinPayload({
      academyId: currentAcademyId,
      token,
      purpose: 'shared',
      ttlSec: REFRESH_SEC * 2,
    }),
    // tick 으로 issuedAt 만 갱신 — 캐시된 academy/token 이 바뀌지 않으면 token 은 그대로.
    [currentAcademyId, token, tick],
  );
  const qrValue = useMemo(
    () => buildPublicCheckinUrl({ payload }),
    [payload],
  );
  const isPublicQrUrl = /^https?:\/\//i.test(qrValue);

  const [rotating, setRotating] = useState(false);
  const handleRotateToken = async () => {
    if (rotating) return;
    setRotating(true);
    try {
      await saveAttendanceSettings({ attendanceQrToken: generateQrToken() });
    } catch (err) {
      console.warn('[qr] rotate token failed', err);
    } finally {
      setRotating(false);
    }
  };

  const handleFullscreen = () => {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el?.requestFullscreen) el.requestFullscreen();
      else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
    } catch { /* ignore */ }
  };

  if (!currentAcademyId || !token) {
    return (
      <div className="fixed inset-0 z-50 bg-[#F2F4F6] text-[#191F28] flex flex-col items-center justify-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-4">
          <RefreshCw size={22} className="text-[#3182F6]" />
        </div>
        <p className="text-sm text-[#4E5968] text-center mb-4">
          {currentAcademyId ? 'QR 토큰이 아직 발급되지 않았어요.' : '학원이 선택되지 않았어요.'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 rounded-xl bg-[#191F28] text-white text-sm font-bold"
        >
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#F7F8FA] text-[#191F28] flex flex-col">
      <header className="flex items-center justify-between px-4 md:px-6 py-3 bg-white/95 border-b border-[#E5E8EB]">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-sm font-bold text-[#4E5968] px-2 py-1.5 rounded-lg active:bg-[#F2F4F6]"
        >
          <ChevronLeft size={16} /> 닫기
        </button>
        <p className="text-sm font-bold text-[#191F28] truncate">{academyName}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRotateToken}
            disabled={rotating}
            className="px-2 py-1.5 rounded-lg text-[#6B7684] active:bg-[#F2F4F6] disabled:opacity-50"
            aria-label="QR 토큰 회전"
          >
            <RefreshCw size={14} className={rotating ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={handleFullscreen}
            className="px-2 py-1.5 rounded-lg text-[#6B7684] active:bg-[#F2F4F6]"
            aria-label="전체화면"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="min-h-full max-w-5xl mx-auto px-5 py-8 md:py-12 flex flex-col justify-center">
          <div className="text-center mb-6 md:mb-8">
            <span className="inline-flex items-center rounded-full bg-[#E8F3FF] text-[#1B64DA] px-3 py-1 text-xs font-bold">
              공용 체크인
            </span>
            <h1 className="mt-3 text-2xl md:text-4xl font-extrabold text-[#191F28] tracking-normal">
              {academyName}
            </h1>
            <p className="mt-2 text-sm md:text-base text-[#6B7684] font-medium">
              {qrAudience}을 기록해요.
            </p>
          </div>

          <div className="grid md:grid-cols-[auto_1fr] items-center gap-5 md:gap-8">
            <div className="mx-auto rounded-[28px] bg-white p-4 md:p-6 shadow-[0_18px_50px_rgba(25,31,40,0.12)] ring-1 ring-[#E5E8EB]">
              <QrImage
                value={qrValue}
                size={320}
                margin={2}
                className="w-[72vw] max-w-[320px] h-auto rounded-2xl"
              />
              {!isPublicQrUrl && (
                <div className="w-[72vw] max-w-[320px] aspect-square rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center px-5 text-center">
                  <p className="text-xs font-bold leading-relaxed text-amber-700">
                    공개 앱 주소가 없어 기본 카메라용 QR을 만들지 못했어요. VITE_PUBLIC_APP_URL을 설정해 주세요.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-[#E5E8EB]">
                <p className="text-xs font-bold text-[#3182F6] mb-1">스캔 가능</p>
                <p className="text-xl md:text-2xl font-extrabold text-[#191F28] leading-tight">
                  카메라로 QR을 비추면 바로 체크인돼요.
                </p>
                <p className="mt-2 text-sm text-[#6B7684] leading-relaxed">
                  현재 학원에서 선택한 {qrAudience} 방식으로 처리됩니다.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-[#E5E8EB]">
                  <p className="text-[11px] font-bold text-[#8B95A1]">자동 갱신</p>
                  <p className="mt-1 text-lg font-extrabold text-[#191F28]">{REFRESH_SEC}초</p>
                </div>
                <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-[#E5E8EB]">
                  <p className="text-[11px] font-bold text-[#8B95A1]">보안 토큰</p>
                  <p className="mt-1 text-lg font-extrabold text-[#191F28]">활성</p>
                </div>
              </div>

              <p className="px-1 text-xs text-[#8B95A1] leading-relaxed">
                분실이나 유출이 의심되면 우측 상단 새로고침 버튼으로 QR 토큰을 새로 발급하세요.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
