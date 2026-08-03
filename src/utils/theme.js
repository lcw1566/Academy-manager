export const THEME_PREFERENCES = ['system', 'light', 'dark'];
export const THEME_STORAGE_KEY = 'seenit-theme-preference';

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

export function applyTheme(preference = getThemePreference()) {
  if (typeof document === 'undefined') return resolveTheme(preference);
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
  const resolved = applyTheme(next);
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
    if (getThemePreference() === 'system') applyTheme('system');
  };
  if (media.addEventListener) media.addEventListener('change', handleSystemThemeChange);
  else media.addListener?.(handleSystemThemeChange);
}
