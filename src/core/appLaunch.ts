/** Installed-window detection shared by install controls and launch completion. */
export function isAppWindow(
  match: (query: string) => { matches: boolean } = window.matchMedia.bind(window),
  iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true,
): boolean {
  return iosStandalone || ['standalone', 'minimal-ui', 'window-controls-overlay']
    .some(mode => match(`(display-mode: ${mode})`).matches);
}

/** Dismiss only after the UI has mounted; first-paint timing starts in the HTML head. */
export function completeAppLaunch(): void {
  if (document.documentElement.dataset.appLaunch !== 'true') return;
  const state = window as Window & { __ctLaunchStart?: number; __ctLaunchTimeout?: number };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const elapsed = performance.now() - (state.__ctLaunchStart ?? 0);
  window.setTimeout(() => {
    window.clearTimeout(state.__ctLaunchTimeout);
    document.documentElement.dataset.appLaunch = 'leaving';
    const app = document.getElementById('app');
    app?.removeAttribute('inert');
    window.setTimeout(() => {
      document.documentElement.dataset.appLaunch = 'false';
      document.getElementById('app-launch-screen')?.remove();
    }, reduced ? 0 : 320);
  }, Math.max(0, (reduced ? 300 : 1500) - elapsed));
}
