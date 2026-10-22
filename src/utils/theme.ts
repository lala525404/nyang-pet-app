// 라이트 → 다크 → 시스템 순환. html[data-theme]에 실제 적용값(light/dark)을 넣고,
// 사용자가 고른 값(themePref)은 localStorage에 저장해 재시작 후에도 유지한다.
// 설정창·알림 창·펫 창이 같은 localStorage를 쓰므로 모두 같은 테마를 따른다.
export type ThemePref = 'light' | 'dark' | 'system';

export const THEME_ORDER: ThemePref[] = ['light', 'dark', 'system'];
export const THEME_KEY = 'themePref';

// 완전 새 설치의 기본 테마는 라이트. 메인이 새 설치라고 알려 준 창(#/settings?...entrance=new, #/pet?fresh=1)에서
// 저장된 테마도 설정도 없을 때만 적용하고, 기존 사용자는 예전 기본값(시스템)을 그대로 쓴다. 마이그레이션은 없다.
export const FRESH_THEME: ThemePref = 'light';
const isFreshWindow = () => /entrance=new|fresh=1/.test(window.location.hash);

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
    return isFreshWindow() && localStorage.getItem('petSettings') === null ? FRESH_THEME : 'system';
  } catch {
    return 'system';
  }
}

// 새 설치를 확정하는 순간(설정 기본값을 저장할 때) 테마도 같이 저장해, 이후 창이 다시 열려도 라이트가 유지되게 한다
export function seedFreshTheme(): void {
  try { if (localStorage.getItem(THEME_KEY) === null) localStorage.setItem(THEME_KEY, FRESH_THEME); } catch { /* 저장이 막혀도 이번 실행에는 라이트 */ }
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(pref);
  root.dataset.themePref = pref;
}

export function nextThemePref(pref: ThemePref): ThemePref {
  return THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length];
}

// 버튼으로 고른 값은 시스템 설정보다 우선한다
export function setThemePref(pref: ThemePref): void {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* 저장이 막혀도 이번 실행에는 적용 */ }
  applyTheme(pref);
}

// 앱 시작 시 1회: 첫 렌더 전에 적용하고, 다른 창의 변경·시스템 설정 변경을 따라간다
export function initTheme(): void {
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system');
  });
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY || e.key === null) applyTheme();
  });
}
