import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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
  const root = { dataset: { theme: '' }, style: { backgroundColor: '' } };
  vi.stubGlobal('localStorage', { getItem: () => theme, setItem });
  vi.stubGlobal('document', {
    documentElement: root,
    getElementById: () => select,
    querySelector: () => meta,
  });
  initializeTheme('/CT-dashcam-studio-WEB/');
  expect(root.dataset.theme).toBe(theme);
  expect(select.value).toBe(theme);
  select.value = theme === 'paper' ? 'midnight' : 'paper';
  const handler = select.addEventListener.mock.calls[0][1];
  handler();
  expect(root.dataset.theme).toBe(select.value);
  expect(root.style.backgroundColor).toBe(THEME_COLORS[select.value as keyof typeof THEME_COLORS]);
  expect(setItem).toHaveBeenCalledWith('ct_theme', select.value);
  expect(meta.setAttribute).toHaveBeenLastCalledWith('content', THEME_COLORS[select.value as keyof typeof THEME_COLORS]);
});


const themeCss = readFileSync(new URL('../src/themes.css', import.meta.url), 'utf8');
const cssVars = (block: string) => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g)].map(m => [m[1], m[2]]));
const paperVars = cssVars(themeCss.match(/html\[data-theme="paper"\],[^{]+\{([^}]+)\}/)![1]);
function luminance(hex: string) {
  const linear = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}
it.each(['paper', 'paper-blue', 'paper-violet', 'paper-rose', 'paper-sand'])('keeps readable text contrast in %s', theme => {
  const overrides = theme === 'paper' ? {} : cssVars(themeCss.match(new RegExp(`html\\[data-theme="${theme}"\\] \\{([^}]+)\\}`))![1]);
  const colors = { ...paperVars, ...overrides };
  for (const [foreground, background] of [
    ['text-main', 'bg-app'], ['text-muted', 'bg-sidebar'], ['text-dim', 'bg-sidebar'],
    ['primary-text', 'primary-bg'], ['selected-text', 'selected-bg'],
    ['clip-recent', 'header-bg'], ['clip-saved', 'header-bg'], ['clip-sentry', 'header-bg'],
  ]) {
    const a = luminance(colors[foreground]), b = luminance(colors[background]);
    expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05), `${theme}: ${foreground} / ${background}`).toBeGreaterThanOrEqual(4.5);
  }
});

it('keeps dev theme experiments separate from the production preference', () => {
  const values: Record<string, string> = { ct_theme: 'paper' };
  const setItem = vi.fn((key: string, value: string) => { values[key] = value; });
  const select = { value: '', addEventListener: vi.fn() };
  const root = { dataset: { theme: '' }, style: { backgroundColor: '' } };
  vi.stubGlobal('localStorage', { getItem: (key: string) => values[key] || null, setItem });
  vi.stubGlobal('document', { documentElement: root, getElementById: () => select, querySelector: () => null });
  initializeTheme('/CT-dashcam-studio-WEB/dev/');
  expect(select.value).toBe('paper');
  select.value = 'paper-blue';
  select.addEventListener.mock.calls[0][1]();
  expect(values.ct_theme).toBe('paper');
  expect(values.ct_theme_dev).toBe('paper-blue');
  initializeTheme('/CT-dashcam-studio-WEB/dev/');
  expect(root.dataset.theme).toBe('paper-blue');
});
it('uses the matching saved palette before first paint on production and dev', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('const savedTheme'))!;
  const values: Record<string, string> = { ct_theme: 'paper', ct_theme_dev: 'paper-violet' };
  for (const [pathname, expected] of [['/CT-dashcam-studio-WEB/', 'paper'], ['/CT-dashcam-studio-WEB/dev/', 'paper-violet']]) {
    const root = { dataset: { theme: 'graphite' } };
    runInNewContext(script, { window: { location: { pathname } }, document: { documentElement: root }, localStorage: { getItem: (key: string) => values[key] || null } });
    expect(root.dataset.theme).toBe(expected);
  }
});
