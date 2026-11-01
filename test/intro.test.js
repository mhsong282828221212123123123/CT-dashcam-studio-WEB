import { describe, expect, it } from 'vitest';
import { INTRO_CONTENT, PRODUCTION, renderIntro, renderSitemap } from '../scripts/build-intro.mjs';

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
    for(const c of Object.values(INTRO_CONTENT)) {
      expect(html).toContain(`hreflang="${c.lang}" href="${PRODUCTION}intro/${c.slug}/"`);
      expect(html).toContain(`href="../${c.slug}/" lang="${c.lang}"`);
    }
  });
  it('keeps preview introductions out of search while canonical links point to production',()=>{
    const html=renderIntro('ko',{basePath:'/CT-dashcam-studio-WEB/dev/'});
    expect(html).toContain('content="noindex,follow"');
    expect(html).toContain(`rel="canonical" href="${PRODUCTION}intro/kr/"`);
    expect(html).not.toMatch(/rel="(?:canonical|alternate)"[^>]*href="[^"]*\/dev\//);
  });
  it('indexes the viewer and eight introductions without indexing the dev channel',()=>{
    const xml=renderSitemap();
    expect(xml.match(/<loc>/g)).toHaveLength(9);
    expect(xml).toContain(`<loc>${PRODUCTION}</loc>`);
    for(const c of Object.values(INTRO_CONTENT))expect(xml).toContain(`<loc>${PRODUCTION}intro/${c.slug}/</loc>`);
    expect(xml).not.toContain('/dev/');
  });
  it('keeps the language hub as a non-indexed convenience page with working relative links',()=>{
    const html=renderIntro('en',{hub:true});
    expect(html).toContain('content="noindex,follow"');
    expect(html).toContain('href="./kr/"');
    expect(html).toContain('href="../?lang=en"');
  });
});
