// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PRIVACY_STRINGS } from '../legal/strings.js';

const repo = fileURLToPath(new URL('../', import.meta.url));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const read = name => readFileSync(path.join(repo, name), 'utf8');
const sourceRepo = 'https://github.com/mhsong282828221212123123123/CT-dashcam-studio-WEB';

export function legalLinks(lang = 'en', prefix = './legal/') {
  const s = PRIVACY_STRINGS[lang] || PRIVACY_STRINGS.en;
  return `<nav class="ct-legal-links"><a href="${prefix}index.html?lang=${lang}" data-privacy-settings>${escape(s.preferences)}</a><a href="${prefix}privacy.html?lang=${lang}" data-legal="privacy.html" data-copy="privacy">${escape(s.privacy)}</a><a href="${prefix}license.html?lang=${lang}" data-legal="license.html" data-copy="licenses">${escape(s.licenses)} · GPL-3.0-only</a><a href="${prefix}third-party.html?lang=${lang}" data-legal="third-party.html" data-copy="thirdParty">${escape(s.thirdParty)}</a></nav>`;
}

// Small, deterministic renderer for our maintained legal Markdown; no untrusted
// HTML, parser dependency or client-side document fetching is introduced.
export function markdown(text) {
  let html = '', paragraph = [], list = false;
  const inline = value => escape(value).replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const flush = () => { if (paragraph.length) { html += `<p>${inline(paragraph.join(' '))}</p>`; paragraph = []; } };
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^(#{1,3}) (.+)/);
    if (heading) { flush(); if (list) { html += '</ul>'; list = false; } html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`; }
    else if (/^- /.test(line)) { flush(); if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(line.slice(2))}</li>`; }
    else if (!line.trim()) { flush(); if (list) { html += '</ul>'; list = false; } }
    else paragraph.push(line);
  }
  flush(); if (list) html += '</ul>';
  return html;
}

export function buildLegal({ basePath = process.env.VITE_BASE_PATH || '/CT-dashcam-studio-WEB/', outputDir = path.join(repo, 'public', 'legal') } = {}) {
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(path.join(outputDir, 'notices'), { recursive: true });
  let revision = '';
  try { revision = execFileSync('git', ['-c', 'safe.directory=*', 'rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(); } catch {}
  const source = `${sourceRepo}/tree/${/^[a-f0-9]{40}$/.test(revision) ? revision : basePath.includes('/dev/') ? 'dev' : 'main'}`;
  const sourceZip = source.replace('/tree/', '/archive/') + '.zip';
  const consent = read('legal/consent.js').replace("import { PRIVACY_STRINGS } from './strings.js';", `const PRIVACY_STRINGS = ${JSON.stringify(PRIVACY_STRINGS)};`);
  writeFileSync(path.join(outputDir, 'consent.js'), consent);
  writeFileSync(path.join(outputDir, 'privacy.css'), read('legal/privacy.css'));
  writeFileSync(path.join(outputDir, 'palettes.css'), read('src/themes.css').split('/* Common controls and layout for every palette. */')[0]);
  // Exact original byte text is also downloadable; it is never run through the
  // HTML/Markdown renderer or modified to say "only" inside the license itself.
  writeFileSync(path.join(outputDir, 'license.txt'), readFileSync(path.join(repo, 'LICENSE')));
  const notices = readdirSync(path.join(repo, 'licenses')).filter(file => file.endsWith('.txt'));
  for (const file of notices) writeFileSync(path.join(outputDir, 'notices', file), readFileSync(path.join(repo, 'licenses', file)));
  const languageOptions = [['en','English'],['ko','한국어'],['ja','日本語'],['zh-CN','简体中文'],['zh-TW','繁體中文'],['de','Deutsch'],['fr','Français'],['es','Español']];
  const init = `(()=>{try{const q=new URLSearchParams(location.search).get('lang');if(${JSON.stringify(Object.keys(PRIVACY_STRINGS))}.includes(q))document.documentElement.lang=q;const v=localStorage.getItem(location.pathname.includes('/dev/')?'ct_theme_dev':'ct_theme')||localStorage.getItem('ct_theme');if(${JSON.stringify(['graphite','midnight','forest','burgundy','amber','paper','paper-blue','paper-violet','paper-rose','paper-sand'])}.includes(v))document.documentElement.dataset.theme=v}catch{}})();`;
  const page = (title, content) => `<!doctype html><html lang="en" data-theme="graphite"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} — CT Dashcam Studio</title><meta name="robots" content="noindex,follow"><meta name="license" content="GPL-3.0-only"><link rel="icon" href="../ct-favicon-v3.ico"><link rel="stylesheet" href="./palettes.css"><link rel="stylesheet" href="./privacy.css"><script>${init}</script><script type="module" src="./consent.js" data-ct-privacy></script></head><body class="ct-legal-page"><main class="ct-legal-document"><a href="../" data-legal-back data-privacy-copy="back">Back to viewer</a> <select id="ct-legal-language" aria-label="Language">${languageOptions.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select>${legalLinks('en', './')}<p data-privacy-copy="canonical">${PRIVACY_STRINGS.en.canonical}</p><article lang="en">${content}</article><nav lang="en"><a href="${source}">Corresponding source (this revision)</a><a href="${sourceZip}">Download source ZIP</a><a href="./license.txt">Unmodified GPLv3 text</a></nav></main><script>const language=document.getElementById('ct-legal-language');language.value=document.documentElement.lang;language.addEventListener('change',()=>{document.documentElement.lang=language.value;const u=new URL(location.href);u.searchParams.set('lang',language.value);history.replaceState(null,'',u)});</script></body></html>`;
  const documents = {
    'index.html': ['Privacy & Licenses', '<h1>Privacy & Licenses</h1><p>Original project code is licensed GPL-3.0-only where the owner holds the necessary rights. Third-party code and assets retain their own terms. GPL does not grant rights in user footage, third-party artwork or map data.</p><p>Copyright in original code remains with its respective holders. This software comes without warranty; see the license. Some provenance and OpenStreetMap attribution issues remain unresolved; consult the audit before redistribution.</p><p><a href="./license.html">GPL-3.0-only license</a> · <a href="./third-party.html">Third-party notices</a> · <a href="./audit.html">License audit and unresolved issues</a> · <a href="./data-flow.html">Technical privacy/data-flow audit</a></p><p>Analytics is optional. Use the localized privacy settings link above to change your choice at any time.</p>'],
    'privacy.html': ['Privacy Policy', markdown(read('PRIVACY.md'))],
    'license.html': ['GPL-3.0-only', `<h1>GNU GPL-3.0-only</h1><p>Applies to original project code only where the owner has the necessary rights; third-party notices and unresolved provenance remain applicable. User videos and telemetry are not relicensed by using this editor.</p><pre>${escape(read('LICENSE'))}</pre>`],
    'third-party.html': ['Third-party Licenses', `<h1>Third-party notices</h1><pre>${escape(read('THIRD_PARTY_NOTICES.md'))}</pre>${notices.map(file=>`<details><summary>${escape(file)}</summary><p><a href="./notices/${file}">Download original notice</a></p><pre>${escape(read('licenses/'+file))}</pre></details>`).join('')}`],
    'audit.html': ['License audit', markdown(read('LICENSE_AUDIT.md'))],
    'data-flow.html': ['Privacy/data-flow audit', markdown(read('PRIVACY_DATA_FLOW.md'))],
  };
  for (const [file, [title, body]] of Object.entries(documents)) writeFileSync(path.join(outputDir, file), page(title, body));
  return { source, pages: Object.keys(documents), notices };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(buildLegal());
