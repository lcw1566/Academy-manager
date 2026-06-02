import { Capacitor } from '@capacitor/core';

export function canUseNativeQrScanner() {
  return !!Capacitor?.isNativePlatform?.();
}

export async function scanNativeQrCode() {
  const {
    CapacitorBarcodeScanner,
    CapacitorBarcodeScannerCameraDirection,
    CapacitorBarcodeScannerScanOrientation,
    CapacitorBarcodeScannerTypeHint,
  } = await import('@capacitor/barcode-scanner');

  const result = await CapacitorBarcodeScanner.scanBarcode({
    hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
    cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
    scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
    scanInstructions: 'QR 코드를 카메라에 맞춰주세요.',
    scanButton: false,
    scanText: '스캔',
  });

  return result?.ScanResult || '';
}
