// QrDisplayPage — Phase 41
//
// 공용 단말에 띄우는 풀스크린 QR 화면. owner 가 학원 설정에서 "공용 QR 화면 열기"
// 로 진입하면 모달이 아니라 전체 viewport 를 점유하는 페이지로 표시한다.
//
// 페이로드: buildPublicCheckinPayload({ academyId, token, purpose: 'shared' }).
// 토큰은 academies.attendance_qr_token. 자동 회전(30~60초 간격) — token 회전 시
// payload 의 issuedAt/expiresAt 만 갱신한다 (DB 의 토큰 자체 회전은 owner 가
// 명시적으로 트리거할 때만 — 회전 빈도가 너무 잦으면 분실 단말 대응 외엔 무의미).

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, RefreshCw, Maximize2 } from 'lucide-react';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import QrImage from '../../../components/qr/QrImage';
import { buildPublicCheckinPayload, generateQrToken, readAttendanceSettings } from './attendanceHelpers';

const REFRESH_SEC = 60; // 60초마다 issuedAt/expiresAt 갱신 (cached read 도 충분).

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
      <div className="fixed inset-0 z-50 bg-[#0B1220] text-white flex flex-col items-center justify-center px-6">
        <p className="text-sm text-white/80 text-center mb-4">
          {currentAcademyId ? 'QR 토큰이 아직 발급되지 않았어요.' : '학원이 선택되지 않았어요.'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 rounded-xl bg-white text-[#0B1220] text-sm font-bold"
        >
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0B1220] text-white flex flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-sm font-semibold text-white/80 px-2 py-1.5 rounded-lg active:bg-white/10"
        >
          <ChevronLeft size={16} /> 닫기
        </button>
        <p className="text-sm font-semibold text-white/90 truncate">{academyName}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRotateToken}
            disabled={rotating}
            className="px-2 py-1.5 rounded-lg text-white/70 active:bg-white/10 disabled:opacity-50"
            aria-label="QR 토큰 회전"
          >
            <RefreshCw size={14} className={rotating ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={handleFullscreen}
            className="px-2 py-1.5 rounded-lg text-white/70 active:bg-white/10"
            aria-label="전체화면"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl">
          <QrImage value={payload} size={320} margin={2} />
        </div>
        <p className="mt-6 text-base md:text-lg font-bold text-white text-center">
          직원과 학생이 이 QR을 스캔해 체크인할 수 있어요.
        </p>
        <p className="mt-2 text-xs text-white/60 text-center">
          {REFRESH_SEC}초마다 자동으로 갱신돼요. 분실/유출이 의심되면 우측 상단 새로고침 버튼으로 토큰을 회전하세요.
        </p>
      </main>

      <footer className="px-5 py-4 text-center text-[11px] text-white/40">
        Academy Manager · Phase 41
      </footer>
    </div>
  );
}
