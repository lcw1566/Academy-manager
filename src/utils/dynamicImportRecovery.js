const RELOAD_HISTORY_KEY = 'seenit:dynamic-import-reload-history';
const MAX_RELOAD_HISTORY = 5;

const DYNAMIC_IMPORT_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /failed to load module script/i,
  /loading chunk [\d-]+ failed/i,
  /chunkloaderror/i,
  /unable to preload css/i,
];

export function isDynamicImportError(error) {
  const message = error instanceof Error
    ? `${error.name} ${error.message}`
    : String(error || '');
  return DYNAMIC_IMPORT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function getBundleFingerprint(documentObject, locationObject) {
  const entryScripts = Array.from(
    documentObject.querySelectorAll('script[type="module"][src]'),
    (script) => script.src,
  ).sort();

  return entryScripts.join('|') || locationObject.href;
}

function readReloadHistory(storage) {
  const stored = JSON.parse(storage.getItem(RELOAD_HISTORY_KEY) || '[]');
  return Array.isArray(stored) ? stored.filter((value) => typeof value === 'string') : [];
}

// Vercel 배포가 교체되면 이미 열려 있던 탭의 엔트리 번들이 더 이상 존재하지 않는
// 해시 청크를 요청할 수 있다. Vite가 보내는 preloadError를 가로채 해당 엔트리 번들당
// 한 번만 새 문서를 받아오고, 같은 번들에서 계속 실패하면 ErrorBoundary가 처리하게 한다.
export function installDynamicImportRecovery({
  windowObject = window,
  documentObject = document,
  navigatorObject = navigator,
} = {}) {
  const handlePreloadError = (event) => {
    if (!isDynamicImportError(event.payload)) return;
    if ('onLine' in navigatorObject && !navigatorObject.onLine) return;

    let history;
    let fingerprint;
    try {
      history = readReloadHistory(windowObject.sessionStorage);
      fingerprint = getBundleFingerprint(documentObject, windowObject.location);
      if (history.includes(fingerprint)) return;

      windowObject.sessionStorage.setItem(
        RELOAD_HISTORY_KEY,
        JSON.stringify([...history, fingerprint].slice(-MAX_RELOAD_HISTORY)),
      );
    } catch {
      // 저장소를 사용할 수 없으면 새로고침 루프를 확실히 막을 수 없으므로
      // 기본 오류 흐름을 유지한다.
      return;
    }

    event.preventDefault();
    windowObject.location.reload();
  };

  windowObject.addEventListener('vite:preloadError', handlePreloadError);
  return () => windowObject.removeEventListener('vite:preloadError', handlePreloadError);
}

