import { i18n } from './i18n';

export type TutorialPlatform = 'pc' | 'android' | 'ios';
export function detectTutorialPlatform(device: { userAgent?: string; platform?: string; maxTouchPoints?: number }): TutorialPlatform {
  if (/iPhone|iPad|iPod/i.test(device.userAgent || '') || (device.platform === 'MacIntel' && (device.maxTouchPoints || 0) > 1)) return 'ios';
  return /Android/i.test(device.userAgent || '') ? 'android' : 'pc';
}
export function tutorialStep(platform: TutorialPlatform, index: number) {
  const step = Number.isFinite(index) ? Math.max(0, Math.min(2, Math.trunc(index))) : 0;
  const heading = ['load', 'range', 'export'][step];
  const body = step === 1 ? (platform === 'pc' ? 'pc_range' : 'mobile_range') : `${platform}_${heading}`;
  return { heading: `tutorial_${heading}`, body: `tutorial_${body}`, warning: platform === 'ios' && step === 0 };
}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const t = (key: string) => escape(i18n.t(key));
const cursor = '<svg class="tutorial-cursor" viewBox="0 0 24 28"><path d="M2 1v22l6-6 5 9 4-2-5-8h9Z"/></svg>';
const road = '<div class="tutorial-road"><i></i><i></i><i></i><span class="tutorial-car"></span></div>';

function demo(platform: TutorialPlatform, step: number): string {
  const files = ['front', 'back', 'left_repeater', 'right_repeater'].map(name => `<div class="tutorial-file"><i></i><span>13-00-23-${name}.mp4</span></div>`).join('');
  let content: string;
  if (step === 0) {
    const action = platform === 'ios' ? 'btn_open_files' : platform === 'pc' ? 'btn_open_folder' : 'btn_open_folder_mobile';
    content = `<div class="tutorial-demo-load"><span class="tutorial-demo-action">${t(action)}</span><div class="tutorial-file-picker">${files}</div><div class="tutorial-loaded-view">${road}<span>13:00:23</span></div>${cursor}</div>`;
  } else if (step === 1) {
    content = `${road}<div class="tutorial-demo-timeline"><div class="tutorial-demo-range"></div><span class="tutorial-demo-playhead"></span></div><div class="tutorial-demo-points"><span>${t('btn_in')}</span><span>${t('btn_out')}</span></div><div class="tutorial-demo-times">00:05 — 00:20</div>${cursor}`;
  } else {
    content = `<div class="tutorial-demo-export"><span class="tutorial-demo-action">${t('btn_export')}</span><div class="tutorial-demo-export-progress"><div class="tutorial-demo-gauge"><i></i></div><span class="tutorial-demo-complete">CT_export.mp4</span></div>${cursor}</div>`;
  }
  const tabs = platform === 'pc' ? '' : `<div class="tutorial-demo-tabs"><span class="${step === 0 ? 'active' : ''}">${t('drawer_clips')}</span><span>${t('drawer_overlays')}</span><span class="${step === 2 ? 'active' : ''}">${t('tab_export_label')}</span></div>`;
  return `<div class="tutorial-demo-app" data-platform="${platform}" data-step="${step}"><div class="tutorial-demo-title"><span>CT Dashcam Studio</span><small>${platform === 'pc' ? 'PC' : platform === 'android' ? 'Android' : 'iPhone'}</small></div><div class="tutorial-demo-body">${content}</div>${tabs}</div>`;
}

export function initTutorial(beforeOpen: () => boolean = () => true): void {
  const root = document.createElement('div');
  root.className = 'tutorial-backdrop';
  root.id = 'tutorial-backdrop';
  root.hidden = true;
  root.innerHTML = `<section class="tutorial-panel" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
    <header class="tutorial-header"><h1 id="tutorial-title"></h1><button type="button" data-tutorial-close></button></header>
    <div class="tutorial-content">
      <div class="tutorial-platforms" role="group"><button type="button" data-platform="pc">PC / Web</button><button type="button" data-platform="android">Android</button><button type="button" data-platform="ios">iPhone</button></div>
      <ol class="tutorial-steps">${['load', 'range', 'export'].map((name, index) => `<li><button type="button" data-tutorial-step="${index}"><small>0${index + 1}</small><span data-tutorial-label="${name}"></span></button></li>`).join('')}</ol>
      <div class="tutorial-story"><div class="tutorial-visual"><p class="tutorial-demo-label"></p><div id="tutorial-stage" aria-hidden="true"></div></div><div class="tutorial-copy"><p class="tutorial-count" aria-live="polite"></p><h2 id="tutorial-step-title"></h2><p id="tutorial-description"></p></div></div>
      <aside class="tutorial-warning" hidden><strong></strong><p></p></aside>
    </div>
    <footer class="tutorial-footer"><button type="button" data-tutorial-replay></button><div><button type="button" data-tutorial-prev></button><button type="button" data-tutorial-next class="tutorial-primary"></button></div></footer>
  </section>`;
  document.body.append(root);
  const query = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const closeButton = query<HTMLButtonElement>('[data-tutorial-close]');
  const prevButton = query<HTMLButtonElement>('[data-tutorial-prev]');
  const nextButton = query<HTMLButtonElement>('[data-tutorial-next]');
  const stage = query('#tutorial-stage');
  const app = document.getElementById('app');
  let platform = detectTutorialPlatform(navigator);
  let step = 0;
  let savedFocus: HTMLElement | null = null;
  let previousInert = false;
  let previousAria: string | null = null;
  let previousOverflow = '';

  const render = () => {
    const state = tutorialStep(platform, step);
    query('#tutorial-title').textContent = i18n.t('tutorial_title');
    query('.tutorial-platforms').setAttribute('aria-label', i18n.t('tutorial_device'));
    query('.tutorial-demo-label').textContent = i18n.t('tutorial_demo');
    closeButton.textContent = i18n.t('btn_close');
    prevButton.textContent = i18n.t('tutorial_prev');
    nextButton.textContent = i18n.t(step === 2 ? 'tutorial_done' : 'tutorial_next');
    query('[data-tutorial-replay]').textContent = i18n.t('tutorial_replay');
    query('.tutorial-count').textContent = `${step + 1} / 3`;
    query('#tutorial-step-title').textContent = i18n.t(state.heading);
    query('#tutorial-description').textContent = i18n.t(state.body);
    root.querySelectorAll<HTMLButtonElement>('.tutorial-platforms [data-platform]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.platform === platform)));
    root.querySelectorAll<HTMLButtonElement>('[data-tutorial-step]').forEach(button => {
      if (Number(button.dataset.tutorialStep) === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    root.querySelectorAll<HTMLElement>('[data-tutorial-label]').forEach(label => label.textContent = i18n.t(`tutorial_${label.dataset.tutorialLabel}`));
    const warning = query('.tutorial-warning');
    warning.hidden = !state.warning;
    query('.tutorial-warning strong').textContent = i18n.t('tutorial_warning_title');
    query('.tutorial-warning p').textContent = i18n.t('tutorial_warning');
    stage.innerHTML = demo(platform, step);
    prevButton.disabled = step === 0;
    if (document.activeElement === prevButton && prevButton.disabled) nextButton.focus();
  };
  const close = () => {
    if (root.hidden) return;
    root.hidden = true;
    if (app) {
      app.inert = previousInert;
      if (previousAria === null) app.removeAttribute('aria-hidden');
      else app.setAttribute('aria-hidden', previousAria);
    }
    document.body.style.overflow = previousOverflow;
    if (savedFocus?.isConnected) savedFocus.focus();
  };
  const open = () => {
    if (!root.hidden || !beforeOpen()) return;
    savedFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousInert = app?.inert || false;
    previousAria = app?.getAttribute('aria-hidden') ?? null;
    previousOverflow = document.body.style.overflow;
    platform = detectTutorialPlatform(navigator);
    step = 0;
    root.hidden = false;
    render();
    closeButton.focus();
    if (app) { app.inert = true; app.setAttribute('aria-hidden', 'true'); }
    document.body.style.overflow = 'hidden';
    query('.tutorial-content').scrollTop = 0;
  };
  document.querySelectorAll<HTMLElement>('[data-open-tutorial]').forEach(button => button.addEventListener('click', open));
  closeButton.addEventListener('click', close);
  prevButton.addEventListener('click', () => { step = Math.max(0, step - 1); render(); });
  nextButton.addEventListener('click', () => { if (step === 2) close(); else { step++; render(); } });
  query('[data-tutorial-replay]').addEventListener('click', () => { stage.innerHTML = demo(platform, step); });
  root.querySelectorAll<HTMLButtonElement>('.tutorial-platforms [data-platform]').forEach(button => button.addEventListener('click', () => {
    platform = button.dataset.platform as TutorialPlatform; step = 0; render();
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-tutorial-step]').forEach(button => button.addEventListener('click', () => {
    step = Number(button.dataset.tutorialStep); render();
  }));
  root.addEventListener('click', event => { if (event.target === root) close(); });
  window.addEventListener('keydown', event => {
    if (root.hidden) return;
    // Tutorial keys never seek, play, or alter the user's actual export range.
    event.stopImmediatePropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, true);
  i18n.onChange(() => { if (!root.hidden) render(); });
}
