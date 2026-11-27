import { describe, expect, it } from 'vitest';

import { SUPPORTED_LANGS } from '../src/i18n';
import { INTRO_SLUGS, introUrl } from '../src/lib/links';

describe('introUrl', () => {
  it('maps every supported language to its intro slug', () => {
    for (const lang of SUPPORTED_LANGS) {
      expect(introUrl(lang, '/CT-dashcam-studio-WEB/')).toBe(
        `/CT-dashcam-studio-WEB/intro/${INTRO_SLUGS[lang]}/`,
      );
    }
    expect(introUrl('ko', '/CT-dashcam-studio-WEB/')).toBe('/CT-dashcam-studio-WEB/intro/kr/');
    expect(introUrl('ja', '/CT-dashcam-studio-WEB/')).toBe('/CT-dashcam-studio-WEB/intro/jp/');
  });

  it('resolves the site root from preview/pr-1/ and preserves /dev/', () => {
    expect(introUrl('en', '/CT-dashcam-studio-WEB/preview/pr-1/')).toBe(
      '/CT-dashcam-studio-WEB/intro/en/',
    );
    expect(introUrl('ko', '/CT-dashcam-studio-WEB/dev/')).toBe(
      '/CT-dashcam-studio-WEB/dev/intro/kr/',
    );
  });
});
