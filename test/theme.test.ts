import { afterEach, expect, it, vi } from 'vitest';
import { initializeTheme, resolveTheme, THEME_COLORS } from '../src/core/theme';

afterEach(() => vi.unstubAllGlobals());

it('migrates Classic to Midnight and rejects invalid saved themes', () => {
  expect(resolveTheme('classic')).toBe('midnight');
  expect(resolveTheme(null)).toBe('graphite');
  expect(resolveTheme('toString')).toBe('graphite');
});

it.each(Object.keys(THEME_COLORS))('restores and persists %s with matching browser chrome', (theme) => {
  const setItem = vi.fn();
  const meta = { setAttribute: vi.fn() };
  const select = { value: '', addEventListener: vi.fn() };
  const root = { dataset: { theme: '' } };
  vi.stubGlobal('localStorage', { getItem: () => theme, setItem });
  vi.stubGlobal('document', {
    documentElement: root,
    getElementById: () => select,
    querySelector: () => meta,
  });
  initializeTheme();
  expect(root.dataset.theme).toBe(theme);
  expect(select.value).toBe(theme);
  select.value = theme === 'paper' ? 'midnight' : 'paper';
  const handler = select.addEventListener.mock.calls[0][1];
  handler();
  expect(root.dataset.theme).toBe(select.value);
  expect(setItem).toHaveBeenCalledWith('ct_theme', select.value);
  expect(meta.setAttribute).toHaveBeenLastCalledWith('content', THEME_COLORS[select.value as keyof typeof THEME_COLORS]);
});
