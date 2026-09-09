import { readFile } from 'node:fs/promises';

const read = (path, encoding) => readFile(new URL(path, import.meta.url), encoding);

const [brand192, brand512, public192, public512, publicMaskable, indexHtml] = await Promise.all([
  read('../docs/brand/icon-192.png.png'),
  read('../docs/brand/icon-512.png.png'),
  read('../public/icon-192.png'),
  read('../public/icon-512.png'),
  read('../public/icon-maskable-512.png'),
  read('../index.html', 'utf8'),
]);

for (const [name, actual, expected] of [
  ['public/icon-192.png', public192, brand192],
  ['public/icon-512.png', public512, brand512],
  ['public/icon-maskable-512.png', publicMaskable, brand512],
]) {
  if (!actual.equals(expected)) {
    throw new Error(`${name}이 docs/brand의 공식 로고와 다릅니다.`);
  }
}

const brandedScreens = [
  '../src/components/Sidebar.jsx',
  '../src/features/landing/LandingPage.jsx',
  '../src/features/auth/AuthPage.jsx',
  '../src/features/auth/RoleSelectPage.jsx',
  '../src/features/auth/WorkspaceSelectionPage.jsx',
  '../src/features/auth/StaffWaitingPage.jsx',
];

for (const path of brandedScreens) {
  const source = await read(path, 'utf8');
  if (!source.includes('<SeenitLogo')) {
    throw new Error(`${path}에서 공통 씨닛 로고를 사용하지 않습니다.`);
  }
}

if (!indexHtml.includes('href="/icon-192.png"')) {
  throw new Error('브라우저 또는 Apple 홈 화면 아이콘이 공식 로고를 사용하지 않습니다.');
}

console.log(`brand assets: ${brandedScreens.length} screens + PWA icons synced`);
