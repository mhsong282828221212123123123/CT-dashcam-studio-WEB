// SPDX-License-Identifier: GPL-3.0-only
import { PRIVACY_STRINGS } from './strings.js';

export const CONSENT_KEY = 'ct_analytics_consent';
export const CONSENT_VERSION = 1;
const deniedSignals = {
  analytics_storage: 'denied', ad_storage: 'denied',
  ad_user_data: 'denied', ad_personalization: 'denied',
};

export function parseConsent(value) {
  try {
    const record = JSON.parse(value);
    return record?.v === CONSENT_VERSION && ['granted', 'denied'].includes(record.analytics)
      ? record.analytics : null;
  } catch { return null; }
}

// Only the viewer supplies a measurement ID. Intro/legal pages manage the same
// preference but do not add tracking to surfaces that previously had none.
export function createAnalyticsConsent({ win, doc, measurementId = '', environment = 'production', storage }) {
  let choice = null;
  let initialized = false;
  let tag = null;
  let persistent = true;
  const listeners = new Set();
  function queue() { win.dataLayer.push(arguments); }
  const read = () => { try { return parseConsent(storage?.getItem(CONSENT_KEY)); } catch { return null; } };
  win.dataLayer = win.dataLayer || [];
  if (measurementId) {
    win[`ga-disable-${measurementId}`] = true;
    // The queue is local: Basic Mode sends nothing, including consent pings,
    // unless an explicit grant subsequently loads the Google tag.
    queue('consent', 'default', { ...deniedSignals });
    queue('set', 'ads_data_redaction', true);
    win.gtag = function (...args) {
      if (choice === 'granted') queue(...args);
    };
  }

  function deleteAnalyticsCookies() {
    // Remove only Google's analytics cookies, never editor preferences or other
    // cookies. Try host-only and parent domains, and all ancestor paths.
    let cookies;
    try { cookies = doc.cookie.split(';').map(part => part.trim().split('=')[0]).filter(name => /^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)); }
    catch { return; }
    const labels = win.location.hostname.split('.');
    const domains = ['', ...labels.map((_, i) => labels.slice(i).join('.')).filter(d => d.includes('.'))];
    const segments = win.location.pathname.split('/').filter(Boolean);
    const paths = ['/', ...segments.map((_, i) => '/' + segments.slice(0, i + 1).join('/'))];
    for (const name of cookies) for (const domain of domains) for (const path of paths) {
      try { doc.cookie = `${name}=; Max-Age=0; path=${path};${domain ? ` domain=${domain};` : ''} SameSite=Lax`; } catch {}
    }
  }

  function apply(next) {
    const previous = choice;
    choice = next;
    if (measurementId) {
      win[`ga-disable-${measurementId}`] = choice !== 'granted';
      if (choice === 'granted') {
        // Every update keeps all three advertising signals denied.
        if (previous !== 'granted') queue('consent', 'update', { ...deniedSignals, analytics_storage: 'granted' });
        if (!initialized) {
          initialized = true;
          queue('js', new Date());
          // Keep the existing automatic page_view: one config per document.
          // Do not forward URL query strings/hashes to Analytics.
          queue('config', measurementId, {
            allow_google_signals: false, allow_ad_personalization_signals: false,
            page_location: win.location.origin + win.location.pathname,
            page_referrer: safeReferrer(doc.referrer),
            deployment_environment: environment,
          });
          tag = doc.createElement('script');
          tag.async = true;
          tag.dataset.ctAnalytics = 'true';
          tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
          doc.head.appendChild(tag);
        }
      } else {
        // Disable before updating consent, so withdrawal never intentionally
        // transitions to Advanced Mode's cookieless analytics collection.
        if (initialized && previous === 'granted') queue('consent', 'update', { ...deniedSignals });
      }
    }
    if (choice !== 'granted') deleteAnalyticsCookies();
    listeners.forEach(listener => listener({ choice, persistent }));
  }

  function safeReferrer(value) {
    try { const url = new URL(value); return url.origin + url.pathname; } catch { return ''; }
  }

  const onStorage = event => {
    if (event.key === CONSENT_KEY || event.key === null) apply(read());
  };
  win.addEventListener('storage', onStorage);
  // Re-check after back/forward cache restoration and when a background tab
  // returns, so a choice changed elsewhere is honored before more page activity.
  win.addEventListener('pageshow', () => { if (persistent) apply(read()); });
  doc.addEventListener('visibilitychange', () => { if (persistent && doc.visibilityState === 'visible') apply(read()); });
  apply(read());
  return {
    get choice() { return choice; },
    get persistent() { return persistent; },
    setChoice(next) {
      if (!['granted', 'denied'].includes(next)) throw new Error('Invalid analytics choice');
      try {
        storage?.setItem(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, analytics: next }));
        persistent = Boolean(storage);
      } catch { persistent = false; }
      apply(next);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export function initPrivacyUI(win = window, doc = document) {
  if (win.__ctPrivacy) return win.__ctPrivacy;
  const script = doc.querySelector('script[data-ct-privacy]');
  if (!script) return;
  const base = new URL('./', script.src);
  let storage;
  try { storage = win.localStorage; } catch {}
  const controller = createAnalyticsConsent({ win, doc, storage,
    measurementId: script.dataset.measurementId || '',
    environment: script.dataset.environment || (win.location.pathname.includes('/dev/') ? 'development' : 'production') });
  win.__ctPrivacy = controller;
  const lang = () => PRIVACY_STRINGS[doc.documentElement.lang] ? doc.documentElement.lang : 'en';
  const legalURL = file => {
    const url = new URL(file, base);
    url.searchParams.set('lang', lang());
    return url.href;
  };
  const panel = doc.createElement('section');
  panel.className = 'ct-privacy-notice';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', 'ct-privacy-heading');
  panel.hidden = true;
  panel.innerHTML = `<div class="ct-privacy-heading"><h2 id="ct-privacy-heading"></h2><button type="button" class="ct-privacy-close"></button></div><p data-copy="body"></p><details><summary data-copy="map"></summary><p data-copy="mapBody"></p></details><p class="ct-privacy-status" role="status"></p><div class="ct-privacy-actions"><button type="button" data-choice="granted"></button><button type="button" data-choice="denied"></button></div><nav class="ct-privacy-links"><a data-legal="privacy.html" data-copy="privacy"></a><a data-legal="license.html" data-copy="licenses"></a><a data-legal="third-party.html" data-copy="thirdParty"></a></nav>`;
  let opener = null;
  const close = () => { panel.hidden = true; render(); opener?.focus(); };
  const render = () => {
    const strings = PRIVACY_STRINGS[lang()];
    panel.querySelector('h2').textContent = controller.choice ? strings.settings : strings.analytics;
    panel.querySelector('.ct-privacy-close').textContent = strings.close;
    panel.querySelector('[data-choice="granted"]').textContent = strings.accept;
    panel.querySelector('[data-choice="denied"]').textContent = strings.reject;
    panel.querySelectorAll('[data-copy]').forEach(el => { el.textContent = strings[el.dataset.copy]; });
    panel.querySelector('.ct-privacy-status').textContent = controller.choice ? strings[controller.choice] + (controller.persistent ? '' : ' ' + strings.storage) : '';
    doc.querySelectorAll('[data-privacy-settings]').forEach(el => {
      el.textContent = strings[el.dataset.privacyLabel || 'preferences'] + (el.hasAttribute('data-show-license') ? ' · GPL-3.0-only' : '');
      el.setAttribute('href', legalURL('index.html'));
      el.setAttribute('aria-controls', 'ct-privacy-notice');
      el.setAttribute('aria-expanded', String(!panel.hidden));
      el.setAttribute('title', strings.change);
    });
    doc.querySelectorAll('[data-legal]').forEach(el => {
      el.href = legalURL(el.dataset.legal);
      const key = el.dataset.copy;
      if (key && strings[key]) el.textContent = strings[key] + (key === 'licenses' ? ' · GPL-3.0-only' : '');
    });
    doc.querySelectorAll('[data-privacy-copy]').forEach(el => { el.textContent = strings[el.dataset.privacyCopy] || ''; });
    doc.querySelectorAll('[data-legal-back]').forEach(el => { el.href = new URL(`../?lang=${lang()}`, base).href; });
  };
  const open = trigger => { opener = trigger; panel.hidden = false; render(); panel.querySelector('h2').setAttribute('tabindex', '-1'); panel.querySelector('h2').focus(); };
  panel.id = 'ct-privacy-notice';
  panel.querySelector('.ct-privacy-close').addEventListener('click', close);
  panel.addEventListener('keydown', event => {
    // Editor shortcuts must not fire while operating the privacy controls.
    event.stopPropagation();
    if (event.key === 'Escape') close();
  });
  panel.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => {
    controller.setChoice(button.dataset.choice);
    // A failed write is explained without blocking editing. Successful choices
    // dismiss the notice; settings remain available in the footer.
    if (controller.persistent) close();
  }));
  doc.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-privacy-settings]');
    if (trigger) { event.preventDefault(); open(trigger); }
  });
  const mount = () => {
    doc.body.appendChild(panel);
    panel.hidden = controller.choice !== null;
    render();
    controller.subscribe(() => { if (!controller.choice) panel.hidden = false; render(); });
    // Viewer localization changes <html lang>; intro pages already have lang.
    new win.MutationObserver(render).observe(doc.documentElement, { attributes: true, attributeFilter: ['lang'] });
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  return controller;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') initPrivacyUI();
