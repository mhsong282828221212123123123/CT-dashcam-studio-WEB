import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nManager, LOCALIZED_SEO, SupportedLang, TRANSLATIONS } from '../src/core/i18n';

function environment(languages: string[] = [], saved: string | null = null, search = '') {
  const storage = { getItem: vi.fn(() => saved), setItem: vi.fn() };
  vi.stubGlobal('window', { location: { search } });
  vi.stubGlobal('navigator', { languages, language: languages[0] || '', userAgent: '' });
  vi.stubGlobal('localStorage', storage);
  return storage;
}

// Minimal DOM fixture exercises actual applyDOM calls without a browser dependency.
function documentFixture() {
  const label = { dataset: { i18n: 'label_resolution' }, textContent: '' };
  const progressTitle = { dataset: { i18n: 'progress_waiting_files' }, textContent: '' };
  const progressCount = { dataset: { i18n: 'progress_waiting_files_detail', i18nParams: '[]' }, textContent: '' };
  const language = { value: '', setAttribute: vi.fn() };
  const folder = { textContent: '' };
  const document = {
    documentElement: { lang: '' }, title: '',
    body: { classList: { contains: () => false } },
    getElementById: (id: string) => id === 'select-language' ? language : id === 'btn-open-folder-text' ? folder : null,
    querySelector: () => null,
    querySelectorAll: (selector: string) => selector === '[data-i18n]' ? [label, progressTitle, progressCount] : [],
  };
  vi.stubGlobal('document', document);
  return { document, label, language, folder, progressTitle, progressCount };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('initial language and persistence', () => {
  it.each([
    ['en-US', 'en'], ['en-GB', 'en'], ['ko-KR', 'ko'], ['ja-JP', 'ja'],
    ['de-DE', 'de'], ['de-AT', 'de'], ['fr-CA', 'fr'], ['es-MX', 'es'],
    ['zh-CN', 'zh-CN'], ['zh-SG', 'zh-CN'], ['zh-Hans-TW', 'zh-CN'],
    ['zh-TW', 'zh-TW'], ['zh-HK', 'zh-TW'], ['zh-MO', 'zh-TW'], ['zh-Hant-US', 'zh-TW'],
  ])('matches first-visit preference %s to %s', (locale, expected) => {
    const storage = environment([locale]);
    expect(new I18nManager().getLang()).toBe(expected);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('skips unsupported preferences in order', () => {
    environment(['it-IT', 'fr-FR', 'en-US']);
    expect(new I18nManager().getLang()).toBe('fr');
  });

  it('uses navigator.language if the preference list is unavailable', () => {
    environment();
    vi.stubGlobal('navigator', { language: 'es-ES' });
    expect(new I18nManager().getLang()).toBe('es');
  });

  it('uses English for unsupported or unavailable browser languages', () => {
    environment(['it-IT', 'pt-BR']);
    expect(new I18nManager().getLang()).toBe('en');
    vi.stubGlobal('navigator', undefined);
    expect(new I18nManager().getLang()).toBe('en');
  });

  it('prioritizes URL, then stored choice, then browser preference', () => {
    environment(['de-DE'], 'ja', '?lang=fr-CA');
    expect(new I18nManager().getLang()).toBe('fr');
    environment(['de-DE'], 'ja', '?lang=unsupported');
    expect(new I18nManager().getLang()).toBe('ja');
    environment(['de-DE'], 'invalid');
    expect(new I18nManager().getLang()).toBe('de');
  });

  it('normalizes regional codes without accepting unrelated prefixes', () => {
    environment();
    const manager = new I18nManager();
    expect(manager.normalizeLang(' FR_ca ')).toBe('fr');
    for (const invalid of ['english', 'deceptive', 'hant', 'constructor', '__proto__']) {
      expect(manager.normalizeLang(invalid)).toBeNull();
    }
  });

  it('survives inaccessible storage and still updates the interface', () => {
    environment(['de-DE']);
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage blocked'); },
      setItem: () => { throw new Error('Storage blocked'); },
    });
    const fixture = documentFixture();
    const manager = new I18nManager();
    expect(manager.getLang()).toBe('de');
    manager.setLang('es');
    expect(fixture.document.documentElement.lang).toBe('es');
    expect(fixture.folder.textContent).toBe(TRANSLATIONS.es.btn_open_folder);
  });

  it('persists explicit choices and uses them on the next visit', () => {
    const storage = environment(['en-US']);
    documentFixture();
    const manager = new I18nManager();
    manager.setLang('de');
    expect(storage.setItem).toHaveBeenCalledWith('ct_language', 'de');
    storage.getItem.mockReturnValue('de');
    expect(new I18nManager().getLang()).toBe('de');
  });
});

describe('translation review and fallback', () => {
  it.each(Object.keys(TRANSLATIONS) as SupportedLang[])('%s covers all keys and preserves interpolation variables', (lang) => {
    expect(Object.keys(TRANSLATIONS[lang]).sort()).toEqual(Object.keys(TRANSLATIONS.en).sort());
    for (const [key, english] of Object.entries(TRANSLATIONS.en)) {
      const translated = TRANSLATIONS[lang][key];
      expect(translated.trim(), `${lang}.${key}`).not.toBe('');
      expect(translated.match(/\{[^{}]+\}/g)?.sort() || [], `${lang}.${key}`)
        .toEqual(english.match(/\{[^{}]+\}/g)?.sort() || []);
      if (lang !== 'ko') expect(translated, `${lang}.${key}`).not.toMatch(/[가-힣]/);
    }
    expect(LOCALIZED_SEO[lang].desc).toBeTruthy();
    if (lang !== 'ko') expect(LOCALIZED_SEO[lang].ogDesc).not.toMatch(/[가-힣]/);
  });

  it('falls back to English in messages AND direct DOM updates', () => {
    environment(['de-DE']);
    const fixture = documentFixture();
    const manager = new I18nManager();
    const original = { ...TRANSLATIONS.de };
    try {
      delete TRANSLATIONS.de.progress_found_videos;
      delete TRANSLATIONS.de.label_resolution;
      TRANSLATIONS.de.btn_open_folder = '';
      expect(manager.t('progress_found_videos', [3, 1])).toBe('3 videos found (1 folders)');
      manager.applyDOM();
      expect(fixture.label.textContent).toBe(TRANSLATIONS.en.label_resolution);
      expect(fixture.folder.textContent).toBe(TRANSLATIONS.en.btn_open_folder);
      expect(manager.t('unknown_key')).toBe('unknown_key');
    } finally {
      Object.assign(TRANSLATIONS.de, original);
    }
  });

  it('can repeatedly switch all eight languages and update labels, SEO and accessibility names', () => {
    environment(['en-US']);
    const fixture = documentFixture();
    const manager = new I18nManager();
    for (const lang of [...Object.keys(TRANSLATIONS), 'en'] as SupportedLang[]) {
      manager.setLang(lang);
      expect(fixture.label.textContent).toBe(TRANSLATIONS[lang].label_resolution);
      expect(fixture.document.documentElement.lang).toBe(lang);
      expect(fixture.language.value).toBe(lang);
      expect(fixture.language.setAttribute).toHaveBeenLastCalledWith('aria-label', TRANSLATIONS[lang].label_lang.replace(/\s*[:：]\s*$/, ''));
    }
  });
});

describe('visible file loading toast language changes', () => {
  it('updates waiting title and detail together across all eight languages', () => {
    environment(['ko-KR']);
    const fixture = documentFixture();
    const manager = new I18nManager();
    manager.applyDOM();
    expect(fixture.progressTitle.textContent).toBe(TRANSLATIONS.ko.progress_waiting_files);
    for (const lang of ['en', 'ja', 'zh-CN', 'zh-TW', 'de', 'fr', 'es', 'ko'] as SupportedLang[]) {
      manager.setLang(lang);
      expect(fixture.progressTitle.textContent).toBe(TRANSLATIONS[lang].progress_waiting_files);
      expect(fixture.progressCount.textContent).toBe(TRANSLATIONS[lang].progress_waiting_files_detail);
    }
  });
  it('preserves processed file counts and percentages when translating an active scan', () => {
    environment(['ko-KR']);
    const fixture = documentFixture();
    const manager = new I18nManager();
    fixture.progressTitle.dataset.i18n = 'progress_grouping_clips';
    fixture.progressCount.dataset.i18n = 'progress_grouping_status';
    fixture.progressCount.dataset.i18nParams = '[25,100,25,4]';
    for (const lang of Object.keys(TRANSLATIONS) as SupportedLang[]) {
      manager.setLang(lang);
      expect(fixture.progressTitle.textContent).toBe(TRANSLATIONS[lang].progress_grouping_clips);
      expect(fixture.progressCount.textContent).toBe(manager.t('progress_grouping_status', [25,100,25,4]));
      expect(fixture.progressCount.textContent).not.toMatch(/\{\d+\}/);
    }
  });
});
