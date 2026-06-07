import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { isPayloadExpired, parseCheckinPayload } from './attendanceHelpers';

function readPayloadFromLocation() {
  if (typeof window === 'undefined') return null;
  return parseCheckinPayload(window.location.href);
}

export default function PublicCheckinPage() {
  const payload = useMemo(() => readPayloadFromLocation(), []);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState(null);

  const invalid = !payload || payload.type !== 'academy_checkin';
  const expired = !invalid && isPayloadExpired(payload);
  const canSubmit = !invalid && !expired && /^\d{4}$/.test(pin);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setMessage({
      type: 'info',
      title: 'PIN 체크인 연결 준비 중',
      detail: 'QR URL은 정상입니다. 다음 단계에서 PIN 검증과 등하원 저장 RPC를 연결하면 바로 기록됩니다.',
    });
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#191F28] flex items-center justify-center px-5 py-8">
      <main className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <p className="text-xs font-bold text-[#3182F6]">Academy Check-in</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-normal">등하원 체크</h1>
          <p className="mt-2 text-sm text-[#6B7684] leading-relaxed">
            학원에서 안내받은 4자리 PIN을 입력해 주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-[#E5E8EB] rounded-2xl shadow-sm p-5">
          {invalid || expired ? (
            <div className="rounded-xl bg-amber-50 px-4 py-3 flex gap-2">
              <AlertTriangle size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800">
                  {invalid ? '사용할 수 없는 QR입니다' : 'QR 시간이 만료됐습니다'}
                </p>
                <p className="mt-1 text-xs text-amber-700 leading-relaxed">
                  학원 화면의 최신 QR을 다시 스캔해 주세요.
                </p>
              </div>
            </div>
          ) : (
            <>
              <label className="block text-xs font-bold text-[#4E5968] mb-2" htmlFor="checkin-pin">
                PIN
              </label>
              <input
                id="checkin-pin"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                placeholder="0000"
                className="w-full h-16 rounded-xl border border-[#D1D6DB] bg-white px-4 text-center text-3xl font-extrabold tracking-[0.4em] focus:outline-none focus:border-[#3182F6]"
              />
              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-4 w-full h-12 rounded-xl bg-[#191F28] text-white text-sm font-bold disabled:opacity-40"
              >
                체크하기
              </button>
            </>
          )}

          {message && (
            <div className="mt-4 rounded-xl bg-[#E8F3FF] px-4 py-3 flex gap-2">
              <CheckCircle2 size={17} className="text-[#1B64DA] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-[#1B64DA]">{message.title}</p>
                <p className="mt-1 text-xs text-[#1B64DA] leading-relaxed">{message.detail}</p>
              </div>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
