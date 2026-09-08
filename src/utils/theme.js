export const THEME_PREFERENCES = ['system', 'light', 'dark'];
export const THEME_STORAGE_KEY = 'seenit-theme-preference';
const THEME_TRANSITION_MS = 220;

let themeTransitionTimer = null;

function prepareThemeTransition() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const root = document.documentElement;
  root.classList.add('theme-transitioning');
  // 전환 속성이 먼저 계산된 뒤 색상 토큰이 바뀌어야 첫 프레임부터 자연스럽게 보인다.
  void root.offsetWidth;
  if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
  themeTransitionTimer = window.setTimeout(() => {
    root.classList.remove('theme-transitioning');
    themeTransitionTimer = null;
  }, THEME_TRANSITION_MS + 60);
}

function isThemePreference(value) {
  return THEME_PREFERENCES.includes(value);
}

export function getThemePreference() {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(preference = getThemePreference()) {
  if (preference === 'dark' || preference === 'light') return preference;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(preference = getThemePreference(), { animate = false } = {}) {
  if (typeof document === 'undefined') return resolveTheme(preference);
  if (animate) prepareThemeTransition();
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute('content', resolved === 'dark' ? '#17191F' : '#0064FF');
  return resolved;
}

export function setThemePreference(preference) {
  const next = isThemePreference(preference) ? preference : 'system';
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* 브라우저 저장소가 막혀도 현재 화면에는 적용한다. */
    }
  }
  const resolved = applyTheme(next, { animate: true });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('seenit-theme-change', {
      detail: { preference: next, resolved },
    }));
  }
  return resolved;
}

let initialized = false;

export function initializeTheme() {
  applyTheme();
  if (initialized || typeof window === 'undefined' || !window.matchMedia) return;
  initialized = true;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = () => {
    if (getThemePreference() === 'system') applyTheme('system', { animate: true });
  };
  if (media.addEventListener) media.addEventListener('change', handleSystemThemeChange);
  else media.addListener?.(handleSystemThemeChange);
}
