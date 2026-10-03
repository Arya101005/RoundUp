const STORAGE_KEY = 'roundup.theme';

export type ThemeMode = 'dark' | 'light';

export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // storage unavailable; fall through to default
  }
  return 'dark';
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'light') {
    root.classList.add('light');
  } else {
    root.classList.remove('light');
  }
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // storage unavailable; theme applies for this session only
  }
}
