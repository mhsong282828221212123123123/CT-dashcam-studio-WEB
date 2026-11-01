import { describe, expect, it } from 'vitest';
import { INTRO_CONTENT, PRODUCTION, renderIntro, renderSitemap } from '../scripts/build-intro.mjs';

const expectedVariants = {
  en: 'en', ko: 'kr', ja: 'jp', 'zh-Hans': 'zh-cn', 'zh-Hant': 'zh-tw', de: 'de', fr: 'fr', es: 'es',
};

describe('indexable multilingual introduction pages',()=>{
  it.each(Object.keys(INTRO_CONTENT))('%s serves translated content without running JavaScript', lang=>{
    const c=INTRO_CONTENT[lang], html=renderIntro(lang);
    expect(html).toContain(`<html lang="${c.lang}"`);
    expect(html).toContain(`<h1>`);
    expect(html).toContain(c.heroBody.replace(/&/g,'&amp;').replace(/'/g,'&#39;'));
    expect(html).toContain(`<meta name="robots" content="index,follow">`);
    expect(html).toContain(`href="${PRODUCTION}intro/${c.slug}/"`);
    expect(html).toContain(`href="../../?lang=${c.lang}"`);
    expect(html).toContain('CT-dashcam-studio/releases');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('aggregateRating');
    const data=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    expect(data.url).toBe(`${PRODUCTION}intro/${c.slug}/`);
    expect(data.inLanguage).toBe(c.lang);
    expect(data.about.isAccessibleForFree).toBe(true);
  });
  it('uses requested kr/jp URLs with standard ko/ja language codes',()=>{
    expect(INTRO_CONTENT.ko.slug).toBe('kr');
    expect(INTRO_CONTENT.ja.slug).toBe('jp');
    const html=renderIntro('en');
    expect(html).toContain(`hreflang="ko" href="${PRODUCTION}intro/kr/"`);
    expect(html).toContain(`hreflang="ja" href="${PRODUCTION}intro/jp/"`);
    expect(html).toContain(`hreflang="x-default" href="${PRODUCTION}intro/en/"`);
  });
  it.each(Object.keys(INTRO_CONTENT))('%s reciprocally links all language alternatives',lang=>{
    const html=renderIntro(lang);
    for(const [code, slug] of Object.entries(expectedVariants)) {
      expect(html).toContain(`hreflang="${code}" href="${PRODUCTION}intro/${slug}/"`);
      expect(html).toContain(`href="../${slug}/"`);
    }
  });
  it('keeps preview introductions out of search while canonical links point to production',()=>{
    const html=renderIntro('ko',{basePath:'/CT-dashcam-studio-WEB/dev/'});
    expect(html).toContain('content="noindex,follow"');
    expect(html).toContain(`rel="canonical" href="${PRODUCTION}intro/kr/"`);
    expect(html).not.toMatch(/rel="(?:canonical|alternate)"[^>]*href="[^"]*\/dev\//);
  });
  it('includes only the eight production introductions in the sitemap',()=>{
    const xml=renderSitemap();
    expect(xml.match(/<loc>/g)).toHaveLength(8);
    expect(xml).not.toContain(`<loc>${PRODUCTION}</loc>`);
    for(const c of Object.values(INTRO_CONTENT))expect(xml).toContain(`<loc>${PRODUCTION}intro/${c.slug}/</loc>`);
    expect(xml).not.toContain('/dev/');
  });
  it('gives every sitemap URL the same eight reciprocal alternatives and verified English default',()=>{
    const xml=renderSitemap();
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    const entries=xml.match(/<url>[\s\S]*?<\/url>/g);
    expect(entries).toHaveLength(8);
    for(const entry of entries) {
      expect(entry.match(/<xhtml:link /g)).toHaveLength(9);
      for(const [code,slug] of Object.entries(expectedVariants)) {
        expect(entry).toContain(`hreflang="${code}" href="${PRODUCTION}intro/${slug}/"`);
      }
      expect(entry).toContain(`hreflang="x-default" href="${PRODUCTION}intro/en/"`);
    }
    expect(xml).not.toMatch(/<lastmod>|hreflang="zh-(?:CN|TW)"/);
  });
  it.each(Object.keys(INTRO_CONTENT))('%s keeps exactly one self canonical and dev-only noindex',lang=>{
    const production=renderIntro(lang);
    const dev=renderIntro(lang,{basePath:'/CT-dashcam-studio-WEB/dev/'});
    const canonical=`<link rel="canonical" href="${PRODUCTION}intro/${INTRO_CONTENT[lang].slug}/">`;
    expect(production.match(/rel="canonical"/g)).toHaveLength(1);
    expect(production).toContain(canonical);
    expect(production).not.toContain('noindex');
    expect(dev).toContain(canonical);
    expect(dev).toContain('content="noindex,follow"');
    expect(production).not.toMatch(/hreflang="zh-(?:CN|TW)"/);
  });
  it('keeps the language hub as a non-indexed convenience page with working relative links',()=>{
    const html=renderIntro('en',{hub:true});
    expect(html).toContain('content="noindex,follow"');
    expect(html).toContain('href="./kr/"');
    expect(html).toContain('href="../?lang=en"');
  });
});
