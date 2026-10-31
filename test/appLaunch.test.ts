import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isAppWindow, completeAppLaunch } from '../src/core/appLaunch';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('installed app windows', () => {
  it.each(['standalone', 'minimal-ui', 'window-controls-overlay'])('detects %s on desktop/Android', mode => {
    expect(isAppWindow(query => ({ matches: query === `(display-mode: ${mode})` }), false)).toBe(true);
  });
  it('detects the iPhone home-screen flag without Chromium media flags', () => {
    expect(isAppWindow(() => ({ matches: false }), true)).toBe(true);
  });
  it('does not treat a normal browser, even in fullscreen, as an installed app', () => {
    expect(isAppWindow(query => ({ matches: query === '(display-mode: fullscreen)' }), false)).toBe(false);
  });
});

function launchFixture(reduced = false, mode = 'true') {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const root = { dataset: { appLaunch: mode } };
  const remove = vi.fn();
  const removeAttribute = vi.fn();
  vi.stubGlobal('document', { documentElement: root, getElementById: (id: string) =>
    id === 'app' ? { removeAttribute } : { remove } });
  vi.stubGlobal('window', { __ctLaunchStart: 0, matchMedia: () => ({ matches: reduced }),
    setTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id) });
  return { root, remove, removeAttribute };
}

describe('app launch lifecycle', () => {
  it('holds the entrance then reveals the ready app and releases the overlay', () => {
    const f = launchFixture(); completeAppLaunch();
    vi.advanceTimersByTime(1499); expect(f.root.dataset.appLaunch).toBe('true');
    vi.advanceTimersByTime(1); expect(f.root.dataset.appLaunch).toBe('leaving');
    expect(f.removeAttribute).toHaveBeenCalledWith('inert');
    vi.advanceTimersByTime(320); expect(f.root.dataset.appLaunch).toBe('false');
    expect(f.remove).toHaveBeenCalledOnce();
  });
  it('shortens the entrance for reduced motion', () => {
    const f = launchFixture(true); completeAppLaunch(); vi.runAllTimers();
    expect(f.root.dataset.appLaunch).toBe('false'); expect(f.remove).toHaveBeenCalledOnce();
  });
  it('does not add any delay or animation to ordinary browser visits', () => {
    const f = launchFixture(false, 'false'); completeAppLaunch(); vi.runAllTimers();
    expect(f.remove).not.toHaveBeenCalled(); expect(f.removeAttribute).not.toHaveBeenCalled();
  });
});


describe('first-paint bootstrap from the actual HTML', () => {
  function boot(standalone: boolean, theme = 'paper') {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map(match => match[1]).find(script => script.includes('window.__ctLaunchStart'))!;
    const root = { dataset: { theme, appLaunch: undefined as string | undefined }, style: { backgroundColor: '' } };
    const removeAttribute = vi.fn(), remove = vi.fn();
    let failSafe: () => void = () => {};
    runInNewContext(code, { document: { documentElement: root,
      getElementById: (id: string) => id === 'app' ? { removeAttribute } : { remove } },
      navigator: { standalone }, window: { matchMedia: () => ({ matches: false }) },
      performance: { now: () => 0 }, setTimeout: (fn: () => void) => { failSafe = fn; return 1; } });
    return { root, failSafe, removeAttribute, remove };
  }
  it.each(['paper', 'paper-blue', 'paper-violet', 'paper-rose', 'paper-sand'])('paints the stored light theme %s before the module loads', theme => {
    const f = boot(true, theme); expect(f.root.dataset.appLaunch).toBe('true');
    expect(f.root.style.backgroundColor).toBe('#f1f1ed');
  });
  it('does not create a launch overlay for an ordinary browser', () => {
    expect(boot(false).root.dataset.appLaunch).toBeUndefined();
  });
  it('unblocks the page even if application initialization fails', () => {
    const f = boot(true); f.failSafe(); expect(f.root.dataset.appLaunch).toBe('false');
    expect(f.removeAttribute).toHaveBeenCalledWith('inert'); expect(f.remove).toHaveBeenCalledOnce();
  });
});
