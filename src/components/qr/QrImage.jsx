// QrImage — Phase 41
//
// `qrcode` 패키지로부터 data URL 을 받아 <img> 로 표시. SSR / 미설치 환경에서
// 안전하게 동작하기 위해 dynamic import 없이 직접 호출. 실패 시 placeholder 표시.

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QrImage({
  value,
  size = 256,
  margin = 2,
  ariaLabel = 'QR 코드',
  className = '',
}) {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!value) { setDataUrl(''); setError(null); return; }
    QRCode.toDataURL(value, {
      width: size,
      margin,
      color: { dark: '#191F28', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => { if (!cancelled) { setDataUrl(url); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, [value, size, margin]);

  if (!value) return null;

  if (error) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center bg-gray-100 text-xs text-gray-400 rounded-xl ${className}`}
      >
        QR 생성 실패
      </div>
    );
  }
  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center bg-gray-50 text-xs text-gray-400 rounded-xl ${className}`}
      >
        QR 생성 중…
      </div>
    );
  }
  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt={ariaLabel}
      className={`bg-white ${className}`}
    />
  );
}
