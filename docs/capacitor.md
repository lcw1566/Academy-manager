# Capacitor 앱 빌드 메모

이 프로젝트는 React/Vite 앱을 그대로 유지하고, iOS/Android 앱에서는 Capacitor 네이티브 QR 스캐너를 우선 사용한다.

## 현재 상태

`ios/`, `android/` 프로젝트는 이미 생성되어 있다. 일반적으로는 웹 코드를 빌드한 뒤 Capacitor 동기화만 하면 된다.

```bash
npm install
npm run cap:sync
```

## iOS

`ios/App/App/Info.plist`에 카메라 권한 문구를 추가해두었다.

```xml
<key>NSCameraUsageDescription</key>
<string>출퇴근 및 등하원 QR 체크인을 위해 카메라를 사용합니다.</string>
```

## Android

공식 `@capacitor/barcode-scanner`는 Android `minSdkVersion` 26 이상을 요구한다.
`android/variables.gradle`에 아래 값을 반영해두었다.

```gradle
ext {
    minSdkVersion = 26
}
```

## 개발 흐름

웹 화면 개발은 기존처럼 진행한다.

```bash
npm run dev
```

앱에 반영할 때만 빌드 후 동기화한다.

```bash
npm run cap:sync
```
