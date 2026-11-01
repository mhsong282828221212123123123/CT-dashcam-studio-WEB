import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildLegal, legalLinks } from './build-legal.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
export const INTRO_CONTENT = JSON.parse(readFileSync(new URL('../intro/content.json', import.meta.url), 'utf8'));
export const PRODUCTION = 'https://mhsong282828221212123123123.github.io/CT-dashcam-studio-WEB/';
// SEO language tags are independent of the existing UI locale IDs and URL slugs.
const hreflang = lang => ({ 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant' }[lang] || lang);
const WEB_REPO = 'https://github.com/mhsong282828221212123123123/CT-dashcam-studio-WEB';
const PC_REPO = 'https://github.com/mhsong282828221212123123123/CT-dashcam-studio';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines = value => escape(value).replace(/\n/g, '<br>');
const external = 'target="_blank" rel="noopener noreferrer"';
const themes = ['Graphite','Midnight','Forest','Burgundy','Amber','Paper Green','Paper Blue','Paper Violet','Paper Rose','Paper Sand'];
const themeIds = ['graphite','midnight','forest','burgundy','amber','paper','paper-blue','paper-violet','paper-rose','paper-sand'];
const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
const wheel = '<svg class="hud-wheel" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26"/><circle cx="32" cy="32" r="5"/><path d="m7 27 20 5m30-5-20 5m-5 5v20"/></svg>';
function hud() {
  return `<div class="demo-hud"><div class="mini-map" aria-hidden="true"><i></i></div><div><small>TIME</small><strong>12:34:56</strong></div><div><small>STEERING</small>${wheel}</div><div><small>SPEED</small><strong class="hud-speed">72<em>km/h</em></strong></div><div class="hud-pedals"><small>PEDALS</small><i></i><span>24%</span></div><div class="hud-mode"><small>DRIVE MODE</small><strong>MANUAL</strong></div></div>`;
}
function viewer(c, scene) {
  return `<div class="viewer-demo" data-reveal><div class="demo-toolbar"><span><i></i> CT Dashcam Studio</span><span>WEB</span></div><div class="demo-workspace"><div class="demo-explorer"><span>TeslaCam</span><p>RecentClips</p><p class="folder-active">SavedClips</p>${['12:32:40','12:33:40','12:34:41','12:35:41'].map((time,i)=>`<div class="${i===2?'clip-active':''}">${time}<small>4 CH</small></div>`).join('')}<p>SentryClips</p></div><div class="demo-preview"><div class="camera-layout"><div class="camera-front"><img src="${scene}" width="1280" height="720" alt=""><span>FRONT</span></div><div class="camera-side">${['REAR','LEFT','RIGHT'].map((name,i)=>`<div><img src="${scene}" width="1280" height="720" alt="" class="side-${i}"><span>${name}</span></div>`).join('')}</div></div>${hud()}<div class="demo-timeline"><span></span><i></i></div><div class="demo-bottom"><span>00:05 / 00:59</span><span>${escape(c.selectedRange)} 00:05 — 00:20</span></div></div></div><p class="preview-caption">${escape(c.preview)}</p></div>`;
}
export function renderIntro(lang, { basePath = '/CT-dashcam-studio-WEB/', assets = {}, hub = false } = {}) {
  const c = INTRO_CONTENT[lang];
  if (!c) throw new Error(`Unknown introduction language: ${lang}`);
  const assetRoot = hub ? './assets/' : '../assets/';
  const appRoot = hub ? '../' : '../../';
  const localeRoot = hub ? './' : '../';
  const isDev = basePath.includes('/dev/');
  const canonical = `${PRODUCTION}intro/${c.slug}/`;
  const web = `${appRoot}?lang=${c.lang}`;
  const scene = assetRoot + (assets.scene || 'scene.svg');
  const localeLinks = Object.values(INTRO_CONTENT).map(other=>`<a href="${localeRoot}${other.slug}/" lang="${other.lang}" hreflang="${hreflang(other.lang)}"${other.lang===c.lang?' aria-current="page"':''}>${escape(other.name)}</a>`).join('');
  const alternates = Object.values(INTRO_CONTENT).map(other=>`<link rel="alternate" hreflang="${hreflang(other.lang)}" href="${PRODUCTION}intro/${other.slug}/">`).join('\n');
  const structured = {'@context':'https://schema.org','@type':'WebPage',name:c.seoTitle,description:c.seoDescription,url:canonical,inLanguage:c.lang,about:{'@type':'SoftwareApplication',name:'CT Dashcam Studio',applicationCategory:'MultimediaApplication',operatingSystem:'Web browser, Windows',isAccessibleForFree:true}};
  const startTheme = `(function(){try{var k=location.pathname.includes('/dev/')?'ct_theme_dev':'ct_theme',v=localStorage.getItem(k)||localStorage.getItem('ct_theme');if(v==='classic')v='midnight';if(${JSON.stringify(themeIds)}.includes(v))document.documentElement.dataset.theme=v}catch(e){}})();`;
  return `<!doctype html>
<html lang="${c.lang}" data-theme="graphite"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(c.seoTitle)}</title><meta name="description" content="${escape(c.seoDescription)}">
<link rel="canonical" href="${canonical}">${alternates}<link rel="alternate" hreflang="x-default" href="${PRODUCTION}intro/en/">
<meta name="robots" content="${isDev||hub?'noindex,follow':'index,follow'}">
<meta property="og:type" content="website"><meta property="og:title" content="${escape(c.seoTitle)}"><meta property="og:description" content="${escape(c.seoDescription)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${PRODUCTION}ct-icon-v3-512.png">
<meta name="twitter:card" content="summary"><meta name="theme-color" content="#171817">
<link rel="icon" href="${appRoot}ct-favicon-v3.ico"><script>${startTheme}</script>
<link rel="stylesheet" href="${assetRoot}${assets.palettes||'palettes.css'}"><link rel="stylesheet" href="${assetRoot}${assets.style||'intro.css'}">
<meta name="license" content="GPL-3.0-only"><link rel="license" href="${appRoot}legal/license.html"><link rel="stylesheet" href="${appRoot}legal/privacy.css"><script type="module" src="${appRoot}legal/consent.js" data-ct-privacy></script>
<script type="application/ld+json">${JSON.stringify(structured).replace(/</g,'\\u003c')}</script><script defer src="${assetRoot}${assets.script||'intro.js'}"></script>
</head><body id="top">
<a class="skip-link" href="#main">${escape(c.navFeatures)}</a><div class="reading-progress" aria-hidden="true"></div>
<header class="site-header wrap"><a class="brand" href="${web}"><img src="${appRoot}ct-icon-v3-180.png" width="30" height="30" alt=""><span>CT Dashcam Studio</span>${isDev?'<small>DEV</small>':''}</a><nav class="header-nav"><a href="#features">${escape(c.navFeatures)}</a><a href="#versions">${escape(c.navVersions)}</a></nav><div class="header-tools"><select id="intro-theme" aria-label="${escape(c.theme)}">${themeIds.map((id,i)=>`<option value="${id}">${themes[i]}</option>`).join('')}</select><details class="language-menu"><summary>${escape(c.name)}</summary><nav aria-label="${escape(c.language)}">${localeLinks}</nav></details></div></header>
<main id="main">
<section class="hero wrap"><div class="hero-copy"><p class="eyebrow">${escape(c.kicker)}</p><h1>${lines(c.heroTitle)}</h1><p class="lead">${escape(c.heroBody)}</p><div class="actions"><a class="button primary" href="${web}">${escape(c.openWeb)}${icon}</a><a class="text-link" href="#versions">${escape(c.navVersions)}<span aria-hidden="true">↓</span></a></div><p class="quiet">${escape(c.heroNote)}</p></div><div class="hero-view">${viewer(c,scene)}</div><div class="hero-facts">${c.facts.map((fact,i)=>`<span><i>0${i+1}</i>${escape(fact)}</span>`).join('')}</div></section>
<section class="feature-section wrap" id="features"><div class="section-heading" data-reveal><p class="eyebrow">${escape(c.cameraLabel)}</p><h2>${lines(c.cameraTitle)}</h2><p>${escape(c.cameraBody)}</p></div><div class="camera-study" data-reveal><div class="angle-main"><img src="${scene}" width="1280" height="720" loading="lazy" alt=""><span>FRONT</span></div><div class="angle-row">${['REAR','LEFT','RIGHT'].map((label,i)=>`<div><img src="${scene}" width="1280" height="720" loading="lazy" class="side-${i}" alt=""><span>${label}</span></div>`).join('')}</div><div class="layout-legend">${c.cameraModes.map((name,i)=>`<span><b aria-hidden="true">${['▱','⊞','□'][i]}</b>${escape(name)}</span>`).join('')}</div></div></section>
<section class="data-section"><div class="wrap"><div class="data-heading" data-reveal><div><p class="eyebrow">${escape(c.dataLabel)}</p><h2>${lines(c.dataTitle)}</h2></div><div><p>${escape(c.dataBody)}</p><small>${escape(c.dataNote)}</small></div></div><div class="telemetry-showcase" data-reveal>${hud()}</div></div></section>
<section class="range-section wrap"><div class="range-intro" data-reveal><p class="eyebrow">${escape(c.rangeLabel)}</p><h2>${lines(c.rangeTitle)}</h2><p>${escape(c.rangeBody)}</p></div><div class="range-study" data-reveal><div class="filmstrip">${Array.from({length:8},(_,i)=>`<img src="${scene}" width="160" height="90" loading="lazy" alt="" style="object-position:${i*14}% center">`).join('')}</div><div class="range-rail"><div class="range-fill"><i></i><i></i></div><span class="range-head"></span></div><div class="range-readout"><span>${escape(c.rangeIn)} <b>00:05</b></span><span>${escape(c.selectedRange)} <b>00:15</b></span><span>${escape(c.rangeOut)} <b>00:20</b></span></div></div><ol class="workflow">${c.steps.map(([title,body],i)=>`<li data-reveal style="--reveal-delay:${i*80}ms"><span>0${i+1}</span><h3>${escape(title)}</h3><p>${escape(body)}</p></li>`).join('')}</ol></section>
<section class="versions-section wrap" id="versions"><div class="section-heading" data-reveal><p class="eyebrow">${escape(c.versionsLabel)}</p><h2>${lines(c.versionsTitle)}</h2></div><div class="version-options"><article data-reveal><div class="version-symbol" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="5" y="8" width="38" height="29" rx="4"/><path d="M5 16h38M17 42h14m-7-5v5"/></svg></div><span class="version-platform">WEB / PC · ANDROID · iPHONE</span><h3>${escape(c.webTitle)}</h3><p>${escape(c.webBody)}</p><small>${escape(c.webNote)}</small><a class="button primary" href="${web}">${escape(c.openWeb)}${icon}</a></article><article data-reveal style="--reveal-delay:100ms"><div class="version-symbol" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m6 10 15-2v15H6Zm19-3 17-2v18H25ZM6 27h15v15L6 40Zm19 0h17v18l-17-2Z"/></svg></div><span class="version-platform">WINDOWS x64 / PORTABLE</span><h3>${escape(c.winTitle)}</h3><p>${escape(c.winBody)}</p><small>${escape(c.winNote)}</small><small class="windows-languages">${escape(c.language)}: 한국어 · English · 日本語 · 简体中文 · 繁體中文</small><a class="button secondary" href="${PC_REPO}/releases" ${external}>${escape(c.getWindows)}${icon}</a></article></div></section>
<section class="faq-section wrap" data-reveal><h2>${escape(c.faqTitle)}</h2><div>${c.faq.map(([q,a])=>`<details><summary>${escape(q)}<span aria-hidden="true">+</span></summary><p>${escape(a)}</p></details>`).join('')}</div></section>
<section class="closing wrap" data-reveal><img src="${appRoot}ct-icon-v3-180.png" width="56" height="56" alt="" loading="lazy"><h2>${lines(c.closingTitle)}</h2><p>${escape(c.closingBody)}</p><a class="button primary" href="${web}">${escape(c.openWeb)}${icon}</a></section>
</main><footer class="site-footer wrap"><div><strong>CT Dashcam Studio</strong><p>${escape(c.footer)}</p></div><nav><a href="${WEB_REPO}" ${external}>Web ${escape(c.source)}</a><a href="${PC_REPO}" ${external}>Windows ${escape(c.source)}</a><a href="https://forms.gle/Lh1doyRZNAZ6cqRk9" ${external}>${escape(c.feedback)}<small>${escape(c.feedbackNote)}</small></a><a href="#top">${escape(c.backTop)} ↑</a></nav>${legalLinks(c.lang, appRoot+'legal/')}<nav class="footer-languages" aria-label="${escape(c.language)}">${localeLinks}</nav></footer>
</body></html>`;
}
export function renderSitemap() {
  const variants = Object.values(INTRO_CONTENT);
  const alternatives = variants.map(other => `    <xhtml:link rel="alternate" hreflang="${hreflang(other.lang)}" href="${PRODUCTION}intro/${other.slug}/"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${variants.map(c => `  <url>\n    <loc>${PRODUCTION}intro/${c.slug}/</loc>\n${alternatives}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${PRODUCTION}intro/en/"/>\n  </url>`).join('\n')}\n</urlset>\n`;
}
export function buildIntro({ basePath = process.env.VITE_BASE_PATH || '/CT-dashcam-studio-WEB/', outputDir = path.join(repo,'public','intro') } = {}) {
  buildLegal({ basePath });
  mkdirSync(path.join(outputDir,'assets'), {recursive:true});
  const themeSource=readFileSync(path.join(repo,'src','themes.css'),'utf8');
  const marker='/* Common controls and layout for every palette. */';
  if(!themeSource.includes(marker))throw new Error('Viewer palette boundary missing');
  const sourceFiles={palettes:themeSource.split(marker)[0],style:readFileSync(path.join(repo,'intro','intro.css'),'utf8'),script:readFileSync(path.join(repo,'intro','intro.js'),'utf8'),scene:readFileSync(path.join(repo,'intro','scene.svg'),'utf8')};
  const assets={};
  for(const [name,source] of Object.entries(sourceFiles)){
    const hash=createHash('sha256').update(source).digest('hex').slice(0,10);
    const extension=name==='script'?'js':name==='scene'?'svg':'css';
    assets[name]=`${name}-${hash}.${extension}`;
    writeFileSync(path.join(outputDir,'assets',assets[name]),source);
  }
  for(const [lang,c] of Object.entries(INTRO_CONTENT)){
    mkdirSync(path.join(outputDir,c.slug),{recursive:true});
    writeFileSync(path.join(outputDir,c.slug,'index.html'),renderIntro(lang,{basePath,assets}));
  }
  writeFileSync(path.join(outputDir,'index.html'),renderIntro('en',{basePath,assets,hub:true}));
  writeFileSync(path.join(repo,'public','sitemap.xml'),renderSitemap());
  return {pages:Object.values(INTRO_CONTENT).map(c=>`${basePath}intro/${c.slug}/`),assets};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(JSON.stringify(buildIntro(),null,2));
