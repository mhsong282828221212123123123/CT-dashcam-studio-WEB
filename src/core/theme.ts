export type Theme = 'graphite' | 'classic';

/** UI preferences are local to this browser and independent of the export settings. */
export function initializeTheme(): void {
  let theme: Theme = 'graphite';
  try {
    if (localStorage.getItem('ct_theme') === 'classic') theme = 'classic';
  } catch { /* The default also works when browser storage is unavailable. */ }

  const select = document.getElementById('select-theme') as HTMLSelectElement | null;
  const apply = (value: Theme) => {
    document.documentElement.dataset.theme = value;
    if (select) select.value = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'graphite' ? '#171817' : '#0a0d14');
  };
  apply(theme);
  select?.addEventListener('change', () => {
    const value: Theme = select.value === 'classic' ? 'classic' : 'graphite';
    apply(value);
    try { localStorage.setItem('ct_theme', value); } catch { /* Persistence is optional. */ }
  });
}
