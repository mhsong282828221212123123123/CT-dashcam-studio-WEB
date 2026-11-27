import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

const iconArrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
const wheelSvg = '<svg class="hud-wheel js-steer-wheel" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="25"/><circle cx="32" cy="32" r="6"/><path d="M8 28h18m12 0h18M32 38v19"/></svg>';
const railIcons = [
  '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 21h10M12 18v3"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/></svg>',
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M2 12h3m14 0h3M4.9 19.1 7 17m10-10 2.1-2.1"/></svg>',
];

function mediaUrls(assetRoot, assets) {
  return {
    front: assetRoot + (assets.front || 'front.mp4'),
    back: assetRoot + (assets.back || 'back.mp4'),
    left: assetRoot + (assets.left || 'left.mp4'),
    right: assetRoot + (assets.right || 'right.mp4'),
    frontPoster: assetRoot + (assets.frontPoster || 'front-poster.jpg'),
    backPoster: assetRoot + (assets.backPoster || 'back-poster.jpg'),
    leftPoster: assetRoot + (assets.leftPoster || 'left-poster.jpg'),
    rightPoster: assetRoot + (assets.rightPoster || 'right-poster.jpg'),
    strips: Array.from({ length: 8 }, (_, i) => assetRoot + (assets[`strip${i}`] || `strip-${i}.jpg`)),
  };
}

function videoSlot(cam, label, src, poster, width, height, { lazy = false, active = false } = {}) {
  const preload = lazy ? 'none' : 'metadata';
  return `<div class="cam-slot${active ? ' is-focused' : ''}" data-cam="${cam}"><video class="cam-video" data-cam-video="${cam}" src="${src}" poster="${poster}" width="${width}" height="${height}" muted loop playsinline preload="${preload}" aria-label="${label}"></video><span class="cam-badge">${label}</span></div>`;
}

function minimapSvg() {
  return `<div class="mini-map" aria-hidden="true"><svg viewBox="0 0 180 76"><path class="map-grid" d="M0 20h180M0 52h180M45 0v76M128 0v76"/><path class="map-road" d="M12 64 C52 58, 78 44, 110 34 S148 18, 170 12"/><path class="map-route" d="M12 64 C52 58, 78 44, 110 34 S148 18, 170 12"/><circle class="map-car js-map-car" cx="88" cy="40" r="5"/></svg></div>`;
}

function hudDeck({ detailed = false } = {}) {
  const blinker = detailed
    ? `<div class="hud-blinker"><small>BLINKER</small><div class="blinker-arrows js-blinker" aria-hidden="true"><span class="arrow-l">◀</span><span class="arrow-r">▶</span></div></div>`
    : '';
  const modeHtml = detailed
    ? `<div class="hud-mode"><small>DRIVE MODE</small><div class="mode-pills"><span>MANUAL</span><span>TACC</span><span class="is-on">AUTOPILOT</span><span>FSD</span></div></div>`
    : `<div class="hud-mode"><small>DRIVE MODE</small><span class="mode-pill is-on">AUTOPILOT</span></div>`;
  return `<div class="demo-hud${detailed ? ' is-detailed' : ''}">
    ${minimapSvg()}
    <div class="hud-time"><small>TIME</small><strong class="js-hud-time">12:34:29</strong></div>
    <div class="hud-steer"><small>STEERING</small><div class="steer-wrap">${wheelSvg}<span class="js-steer-deg">+2°</span></div></div>
    ${blinker}
    <div class="hud-speed-cell"><small>SPEED</small><strong class="hud-speed"><span class="js-hud-speed">92</span><em>km/h</em></strong></div>
    <div class="hud-pedals"><small>PEDALS</small><div class="pedal-meter"><i class="js-pedal-bar"></i></div><div class="pedal-meta"><span class="js-pedal-pct">24%</span><b class="brake-pill">BRAKE</b></div></div>
    ${modeHtml}
  </div>`;
}

function viewer(c, media, appRoot) {
  return `<div class="viewer-demo" data-reveal>
    <div class="demo-toolbar">
      <div class="demo-brand"><img src="${appRoot}ct-icon-v3-180.png" width="18" height="18" alt=""><span>CT Dashcam Studio</span><small>SavedClips · 4 CH</small></div>
      <div class="demo-controls">
        <span class="demo-clock js-video-clock">00:00 / 00:08</span>
        <button type="button" class="demo-play-btn js-play-toggle" aria-label="Play or pause preview" aria-pressed="true"><span class="icon-pause" aria-hidden="true">❚❚</span><span class="icon-play" aria-hidden="true">▶</span></button>
      </div>
    </div>
    <div class="demo-shell">
      <aside class="demo-rail" aria-hidden="true">${railIcons.map((svg, i) => `<span class="${i === 0 ? 'is-active' : ''}">${svg}</span>`).join('')}</aside>
      <div class="demo-stage-col">
        <div class="camera-stage js-video-stage" data-stage="hero" data-layout="front-focus" data-active-cam="front">
          ${videoSlot('front', 'FRONT', media.front, media.frontPoster, 800, 600, { active: true })}
          ${videoSlot('back', 'REAR', media.back, media.backPoster, 480, 360)}
          ${videoSlot('left', 'LEFT', media.left, media.leftPoster, 480, 360)}
          ${videoSlot('right', 'RIGHT', media.right, media.rightPoster, 480, 360)}
        </div>
        ${hudDeck()}
        <div class="demo-timeline" aria-hidden="true">
          <div class="demo-range-fill"></div>
          <span class="demo-playhead js-playhead"></span>
        </div>
        <div class="demo-bottom">
          <span>2026-09-22 · 12:34:29</span>
          <span>${escape(c.selectedRange)} 00:02 — 00:06</span>
        </div>
      </div>
    </div>
    <p class="preview-caption">${escape(c.preview)}</p>
  </div>`;
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
  const media = mediaUrls(assetRoot, assets);
  const localeLinks = Object.values(INTRO_CONTENT).map(other=>`<a href="${localeRoot}${other.slug}/" lang="${other.lang}" hreflang="${hreflang(other.lang)}"${other.lang===c.lang?' aria-current="page"':''}>${escape(other.name)}</a>`).join('');
  const alternates = Object.values(INTRO_CONTENT).map(other=>`<link rel="alternate" hreflang="${hreflang(other.lang)}" href="${PRODUCTION}intro/${other.slug}/">`).join('\n');
  const structured = {'@context':'https://schema.org','@type':'WebPage',name:c.seoTitle,description:c.seoDescription,url:canonical,inLanguage:c.lang,about:{'@type':'SoftwareApplication',name:'CT Dashcam Studio',applicationCategory:'MultimediaApplication',operatingSystem:'Web browser, Windows',isAccessibleForFree:true}};
  const layoutIds = ['front-focus', 'quad', 'single'];
  const camPills = [
    ['front', 'FRONT'],
    ['back', 'REAR'],
    ['left', 'LEFT'],
    ['right', 'RIGHT'],
  ];

  return `<!doctype html>
<html lang="${c.lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(c.seoTitle)}</title><meta name="description" content="${escape(c.seoDescription)}">
<link rel="canonical" href="${canonical}">${alternates}<link rel="alternate" hreflang="x-default" href="${PRODUCTION}intro/en/">
<meta name="robots" content="${isDev||hub?'noindex,follow':'index,follow'}">
<meta property="og:type" content="website"><meta property="og:title" content="${escape(c.seoTitle)}"><meta property="og:description" content="${escape(c.seoDescription)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${PRODUCTION}ct-icon-v3-512.png">
<meta name="twitter:card" content="summary"><meta name="theme-color" content="#0b0d11">
<link rel="icon" href="${appRoot}ct-favicon-v3.ico">
<link rel="stylesheet" href="${assetRoot}${assets.style||'intro.css'}">
<meta name="license" content="GPL-3.0-only"><link rel="license" href="${appRoot}legal/license.html"><link rel="stylesheet" href="${appRoot}legal/privacy.css"><script type="module" src="${appRoot}legal/consent.js" data-ct-privacy></script>
<script type="application/ld+json">${JSON.stringify(structured).replace(/</g,'\\u003c')}</script><script defer src="${assetRoot}${assets.script||'intro.js'}"></script>
</head><body id="top">
<a class="skip-link" href="#main">${escape(c.navFeatures)}</a><div class="reading-progress" aria-hidden="true"></div>
<header class="site-header wrap"><a class="brand" href="${web}"><img src="${appRoot}ct-icon-v3-180.png" width="30" height="30" alt=""><span>CT Dashcam Studio</span>${isDev?'<small>DEV</small>':''}</a><nav class="header-nav"><a href="#features">${escape(c.navFeatures)}</a><a href="#versions">${escape(c.navVersions)}</a></nav><div class="header-tools"><details class="language-menu"><summary>${escape(c.name)}</summary><nav aria-label="${escape(c.language)}">${localeLinks}</nav></details></div></header>
<main id="main">
<section class="hero wrap">
  <div class="hero-copy">
    <p class="eyebrow">${escape(c.kicker)}</p>
    <h1>${lines(c.heroTitle)}</h1>
    <p class="lead">${escape(c.heroBody)}</p>
    <div class="actions"><a class="button primary" href="${web}">${escape(c.openWeb)}${iconArrow}</a><a class="text-link" href="#versions">${escape(c.navVersions)}<span aria-hidden="true">↓</span></a></div>
    <p class="quiet">${escape(c.heroNote)}</p>
  </div>
  <div class="hero-view">${viewer(c, media, appRoot)}</div>
  <div class="hero-facts">${c.facts.map((fact,i)=>`<span><i>0${i+1}</i>${escape(fact)}</span>`).join('')}</div>
</section>
<section class="feature-section wrap" id="features">
  <div class="section-heading" data-reveal><p class="eyebrow">${escape(c.cameraLabel)}</p><h2>${lines(c.cameraTitle)}</h2><p>${escape(c.cameraBody)}</p></div>
  <div class="camera-study" data-reveal>
    <div class="study-bar">
      <div class="layout-switch" role="tablist" aria-label="${escape(c.cameraLabel)}">${c.cameraModes.map((name,i)=>`<button type="button" class="layout-btn${i===0?' is-active':''}" role="tab" aria-selected="${i===0?'true':'false'}" data-layout-btn="${layoutIds[i]}"><b aria-hidden="true">${['▱','⊞','□'][i]}</b>${escape(name)}</button>`).join('')}</div>
      <div class="cam-picker" aria-label="Camera channel">${camPills.map(([key,label],i)=>`<button type="button" class="cam-pill${i===0?' is-active':''}" data-cam-btn="${key}">${label}</button>`).join('')}</div>
    </div>
    <div class="camera-stage js-video-stage" data-stage="study" data-layout="front-focus" data-active-cam="front">
      ${videoSlot('front', 'FRONT', media.front, media.frontPoster, 800, 600, { lazy: true, active: true })}
      ${videoSlot('back', 'REAR', media.back, media.backPoster, 480, 360, { lazy: true })}
      ${videoSlot('left', 'LEFT REPEATER', media.left, media.leftPoster, 480, 360, { lazy: true })}
      ${videoSlot('right', 'RIGHT REPEATER', media.right, media.rightPoster, 480, 360, { lazy: true })}
    </div>
  </div>
</section>
<section class="data-section"><div class="wrap"><div class="data-heading" data-reveal><div><p class="eyebrow">${escape(c.dataLabel)}</p><h2>${lines(c.dataTitle)}</h2></div><div><p>${escape(c.dataBody)}</p><small>${escape(c.dataNote)}</small></div></div><div class="telemetry-showcase" data-reveal>${hudDeck({ detailed: true })}</div></div></section>
<section class="range-section wrap"><div class="range-intro" data-reveal><p class="eyebrow">${escape(c.rangeLabel)}</p><h2>${lines(c.rangeTitle)}</h2><p>${escape(c.rangeBody)}</p></div><div class="range-study" data-reveal><div class="filmstrip">${media.strips.map((src,i)=>`<div class="strip-frame${i>=2&&i<=5?' is-selected':''}"><img src="${src}" width="200" height="120" loading="lazy" alt=""><span>00:0${i}</span></div>`).join('')}</div><div class="range-rail"><div class="range-fill"><i></i><i></i></div><span class="range-head js-range-head"></span></div><div class="range-readout"><span>${escape(c.rangeIn)} <b>00:02</b></span><span>${escape(c.selectedRange)} <b>00:04</b></span><span>${escape(c.rangeOut)} <b>00:06</b></span></div></div><ol class="workflow">${c.steps.map(([title,body],i)=>`<li data-reveal style="--reveal-delay:${i*80}ms"><span>0${i+1}</span><h3>${escape(title)}</h3><p>${escape(body)}</p></li>`).join('')}</ol></section>
<section class="versions-section wrap" id="versions"><div class="section-heading" data-reveal><p class="eyebrow">${escape(c.versionsLabel)}</p><h2>${lines(c.versionsTitle)}</h2></div><div class="version-options"><article data-reveal><div class="version-symbol" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="5" y="8" width="38" height="29" rx="4"/><path d="M5 16h38M17 42h14m-7-5v5"/></svg></div><span class="version-platform">WEB / PC · ANDROID · iPHONE</span><h3>${escape(c.webTitle)}</h3><p>${escape(c.webBody)}</p><small>${escape(c.webNote)}</small><a class="button primary" href="${web}">${escape(c.openWeb)}${iconArrow}</a></article><article data-reveal style="--reveal-delay:100ms"><div class="version-symbol" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m6 10 15-2v15H6Zm19-3 17-2v18H25ZM6 27h15v15L6 40Zm19 0h17v18l-17-2Z"/></svg></div><span class="version-platform">WINDOWS x64 / PORTABLE</span><h3>${escape(c.winTitle)}</h3><p>${escape(c.winBody)}</p><small>${escape(c.winNote)}</small><small class="windows-languages">${escape(c.language)}: 한국어 · English · 日本語 · 简体中文 · 繁體中文</small><a class="button secondary" href="${PC_REPO}/releases" ${external}>${escape(c.getWindows)}${iconArrow}</a></article></div></section>
<section class="faq-section wrap" data-reveal><h2>${escape(c.faqTitle)}</h2><div>${c.faq.map(([q,a])=>`<details><summary>${escape(q)}<span aria-hidden="true">+</span></summary><p>${escape(a)}</p></details>`).join('')}</div></section>
<section class="closing wrap" data-reveal><img src="${appRoot}ct-icon-v3-180.png" width="56" height="56" alt="" loading="lazy"><h2>${lines(c.closingTitle)}</h2><p>${escape(c.closingBody)}</p><a class="button primary" href="${web}">${escape(c.openWeb)}${iconArrow}</a></section>
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
  const assetsDir = path.join(outputDir, 'assets');
  rmSync(assetsDir, { recursive: true, force: true });
  mkdirSync(assetsDir, { recursive: true });

  const sourceFiles = {
    style: readFileSync(path.join(repo,'intro','intro.css')),
    script: readFileSync(path.join(repo,'intro','intro.js')),
    front: readFileSync(path.join(repo,'intro','media','front.mp4')),
    back: readFileSync(path.join(repo,'intro','media','back.mp4')),
    left: readFileSync(path.join(repo,'intro','media','left.mp4')),
    right: readFileSync(path.join(repo,'intro','media','right.mp4')),
    frontPoster: readFileSync(path.join(repo,'intro','media','front-poster.jpg')),
    backPoster: readFileSync(path.join(repo,'intro','media','back-poster.jpg')),
    leftPoster: readFileSync(path.join(repo,'intro','media','left-poster.jpg')),
    rightPoster: readFileSync(path.join(repo,'intro','media','right-poster.jpg')),
    ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [
      `strip${i}`,
      readFileSync(path.join(repo, 'intro', 'media', `strip-${i}.jpg`)),
    ])),
  };

  const extMap = {
    style: 'css',
    script: 'js',
    front: 'mp4',
    back: 'mp4',
    left: 'mp4',
    right: 'mp4',
  };

  const assets = {};
  for (const [name, source] of Object.entries(sourceFiles)) {
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 10);
    const extension = extMap[name] || 'jpg';
    assets[name] = `${name}-${hash}.${extension}`;
    writeFileSync(path.join(assetsDir, assets[name]), source);
  }

  for (const [lang, c] of Object.entries(INTRO_CONTENT)) {
    mkdirSync(path.join(outputDir, c.slug), { recursive: true });
    writeFileSync(path.join(outputDir, c.slug, 'index.html'), renderIntro(lang, { basePath, assets }));
  }
  writeFileSync(path.join(outputDir, 'index.html'), renderIntro('en', { basePath, assets, hub: true }));
  writeFileSync(path.join(repo, 'public', 'sitemap.xml'), renderSitemap());
  return { pages: Object.values(INTRO_CONTENT).map(c => `${basePath}intro/${c.slug}/`), assets };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(buildIntro(), null, 2));
}
