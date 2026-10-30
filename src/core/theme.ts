export const THEME_COLORS = {
  graphite: '#171817',
  midnight: '#14191f',
  forest: '#141b18',
  burgundy: '#1d1518',
  amber: '#1c1912',
  paper: '#f1f1ed',
} as const;
export type Theme = keyof typeof THEME_COLORS;

export function resolveTheme(saved: string | null): Theme {
  // Retire Classic while preserving a returning user's preference for blue.
  if (saved === 'classic') return 'midnight';
  return saved && Object.hasOwn(THEME_COLORS, saved) ? saved as Theme : 'graphite';
}

/** UI preferences are local to this browser and independent of the export settings. */
export function initializeTheme(): void {
  let theme: Theme = 'graphite';
  try {
    theme = resolveTheme(localStorage.getItem('ct_theme'));
  } catch { /* The default also works when browser storage is unavailable. */ }

  const select = document.getElementById('select-theme') as HTMLSelectElement | null;
  const apply = (value: Theme) => {
    document.documentElement.dataset.theme = value;
    if (select) select.value = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[value]);
  };
  apply(theme);
  select?.addEventListener('change', () => {
    const value = resolveTheme(select.value);
    apply(value);
    try { localStorage.setItem('ct_theme', value); } catch { /* Persistence is optional. */ }
  });
}
