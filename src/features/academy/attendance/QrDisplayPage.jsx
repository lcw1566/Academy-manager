import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, RefreshCw, Maximize2, Loader2 } from 'lucide-react';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import QrImage from '../../../components/qr/QrImage';
import { issueAcademyCheckinQr } from '../../../services/supabase/workspaceApi';
import { buildPublicCheckinUrl, generateQrToken, readAttendanceSettings } from './attendanceHelpers';

const REFRESH_SEC = 20;

export default function QrDisplayPage({ onClose }) {
  const memberships = useWorkspaceStore((s) => s.memberships);
  const academyId = useWorkspaceStore((s) => s.currentAcademyId);
  const saveAttendanceSettings = useWorkspaceStore((s) => s.saveAttendanceSettings);
  const academy = memberships.find((m) => m.academy_id === academyId)?.academy;
  const settings = readAttendanceSettings(academy);
  const academyName = academy?.name || '학원';
  const [qr, setQr] = useState(null);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [rotating, setRotating] = useState(false);
  const [now, setNow] = useState(Date.now());
  const isOwner = memberships.some((m) => m.academy_id === academyId && m.role === 'owner' && m.status === 'active');

  useEffect(() => {
    const previous = document.title;
    document.title = `${academyName} · 공용 QR`;
    return () => { document.title = previous; };
  }, [academyName]);

  useEffect(() => {
    let active = true;
    let timer;
    setQr(null);
    setError('');
    const load = async () => {
      try {
        const next = await issueAcademyCheckinQr(academyId);
        if (active) { setQr(next); setError(''); setNow(Date.now()); }
      } catch {
        if (active) {
          setQr(null);
          setError('QR을 발급하지 못했어요. 연결 상태와 학원의 QR 출결 설정·발급 권한을 확인해주세요.');
        }
      } finally {
        if (active) timer = window.setTimeout(load, REFRESH_SEC * 1000);
      }
    };
    if (academyId) void load();
    else setError('학원을 먼저 선택해주세요.');
    return () => { active = false; window.clearTimeout(timer); };
  }, [academyId, settings.attendanceQrToken, refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const valid = Boolean(qr && qr.academyId === academyId && qr.expiresAt * 1000 > now);
  const qrValue = useMemo(() => qr ? buildPublicCheckinUrl({ payload: JSON.stringify(qr) }) : '', [qr]);
  const rotate = async () => {
    if (rotating) return;
    setRotating(true);
    setQr(null);
    try {
      await saveAttendanceSettings({ attendanceQrToken: generateQrToken() });
      setRefreshKey((key) => key + 1);
    } catch {
      setError('QR을 교체하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally { setRotating(false); }
  };
  const fullscreen = () => {
    const operation = document.fullscreenElement
      ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
    operation?.catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-seenit-canvas text-seenit-ink">
      <header className="flex items-center justify-between border-b border-seenit-border bg-seenit-surface px-4 py-3">
        <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold pressable-surface">
          <ChevronLeft size={16} /> 닫기
        </button>
        <p className="truncate text-sm font-semibold">{academyName}</p>
        <div className="flex gap-2">
          {isOwner && <button type="button" onClick={rotate} disabled={rotating} aria-label="기존 QR 무효화" className="rounded-lg p-3 text-seenit-secondary disabled:opacity-50 pressable-surface">
            <RefreshCw size={18} className={rotating ? 'animate-spin motion-reduce:animate-none' : ''} />
          </button>}
          <button type="button" onClick={fullscreen} aria-label="전체화면" className="rounded-lg p-3 text-seenit-secondary pressable-surface"><Maximize2 size={18} /></button>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-auto px-5 py-8">
        <div className="text-center">
          <p className="text-sm font-semibold text-seenit-brand">공용 체크인</p>
          <h1 className="mt-2 text-2xl font-bold">{academyName}</h1>
          <p className="mt-2 text-sm text-seenit-muted">학원에서 안내받은 QR을 스캔해 출결을 기록해 주세요.</p>
        </div>
        {valid && qrValue ? (
          // QR contrast must remain black on white in either theme.
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <QrImage value={qrValue} size={320} margin={2} className="h-auto w-[72vw] max-w-[320px] rounded-xl" />
          </div>
        ) : (
          <div role="status" className="flex min-h-64 max-w-sm flex-col items-center justify-center gap-4 rounded-3xl border border-seenit-border bg-seenit-surface px-6 text-center">
            {!error && <Loader2 size={24} className="animate-spin motion-reduce:animate-none text-seenit-brand" />}
            <p className="text-sm text-seenit-secondary">{error || '새 QR을 준비하고 있어요.'}</p>
            {error && <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="rounded-xl bg-seenit-brand-soft px-4 py-3 text-sm font-semibold text-seenit-brand pressable-surface">다시 시도</button>}
          </div>
        )}
        <p className="text-center text-sm text-seenit-muted">QR은 {REFRESH_SEC}초마다 갱신돼요. 만료되면 최신 QR을 다시 스캔해 주세요.</p>
        {isOwner && <p className="max-w-sm text-center text-xs text-seenit-muted">QR 유출이 의심되면 상단의 기존 QR 무효화 버튼을 눌러주세요.</p>}
      </main>
    </div>
  );
}
