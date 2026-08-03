import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { publicStudentCheckin } from '../../../services/supabase/workspaceApi';
import { isPayloadExpired, parseCheckinPayload } from './attendanceHelpers';

function readPayloadFromLocation() {
  if (typeof window === 'undefined') return null;
  return parseCheckinPayload(window.location.href);
}

const CHECKIN_FAILURE_MESSAGES = {
  invalid_qr: {
    title: '사용할 수 없는 QR입니다',
    detail: '학원 화면의 최신 QR을 다시 스캔해 주세요.',
  },
  expired_qr: {
    title: 'QR 시간이 만료됐습니다',
    detail: '학원 화면의 최신 QR을 다시 스캔해 주세요.',
  },
  invalid_pin: {
    title: 'PIN을 다시 확인해 주세요',
    detail: '4자리 숫자로 입력해 주세요.',
  },
  pin_not_found: {
    title: 'PIN을 찾을 수 없습니다',
    detail: '학원에 등록된 등하원 PIN인지 확인해 주세요.',
  },
  duplicate_pin: {
    title: '같은 PIN을 쓰는 학생이 있습니다',
    detail: '학원에 알려 PIN을 다시 설정해 주세요.',
  },
  default: {
    title: '체크인에 실패했습니다',
    detail: '잠시 후 다시 시도해 주세요.',
  },
};

export default function PublicCheckinPage() {
  const payload = useMemo(() => readPayloadFromLocation(), []);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const invalid = !payload || payload.type !== 'academy_checkin';
  const expired = !invalid && isPayloadExpired(payload);
  const canSubmit = !invalid && !expired && /^\d{4}$/.test(pin);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await publicStudentCheckin({
        academyId: payload.academyId,
        qrToken: payload.token,
        pin,
        expiresAt: payload.expiresAt,
      });
      if (result?.ok) {
        const eventLabel = result.event_type === 'check_out' ? '하원' : '등원';
        const isAutoCheckout = result.message === 'auto_checkout';
        const isDuplicate = result.message === 'duplicate' || isAutoCheckout;
        const timeLabel = result.event_time
          ? new Date(result.event_time).toLocaleTimeString('ko-KR', {
              timeZone: 'Asia/Seoul',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '';
        setMessage({
          type: 'success',
          title: `${result.student_name || '학생'} ${eventLabel} ${isDuplicate ? '확인' : '완료'}`,
          detail: isAutoCheckout
            ? '밤 10시에 자동 하원 처리된 기록이에요.'
            : isDuplicate
              ? '이미 처리된 기록이에요. 중복으로 저장하지 않았어요.'
            : timeLabel ? `${timeLabel}에 기록됐어요.` : '기록됐어요.',
        });
        setPin('');
        return;
      }
      const failure = CHECKIN_FAILURE_MESSAGES[result?.message] || CHECKIN_FAILURE_MESSAGES.default;
      setMessage({ type: 'error', ...failure });
    } catch (err) {
      setMessage({
        type: 'error',
        title: '체크인 저장 실패',
        detail: err?.message || '잠시 후 다시 시도해 주세요.',
      });
    } finally {
      setBusy(false);
    }
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
                disabled={!canSubmit || busy}
                className="mt-4 w-full h-12 rounded-xl bg-[#191F28] text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                체크하기
              </button>
            </>
          )}

          {message && (
            <div className={`mt-4 rounded-xl px-4 py-3 flex gap-2 ${
              message.type === 'success' ? 'bg-emerald-50' : 'bg-amber-50'
            }`}>
              {message.type === 'success' ? (
                <CheckCircle2 size={17} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-bold ${
                  message.type === 'success' ? 'text-emerald-700' : 'text-amber-800'
                }`}>{message.title}</p>
                <p className={`mt-1 text-xs leading-relaxed ${
                  message.type === 'success' ? 'text-emerald-700' : 'text-amber-700'
                }`}>{message.detail}</p>
              </div>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
