// SPDX-License-Identifier: GPL-3.0-only
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || 'dist');
const base = process.env.VITE_BASE_PATH || '/CT-dashcam-studio-WEB/';
const origin = 'https://build.test';
const errors = [];
let pages = 0, links = 0;
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (entry.name.endsWith('.html')) {
      pages++;
      const relative = path.relative(root, file).split(path.sep).join('/');
      const url = new URL(base + relative, origin);
      const html = readFileSync(file, 'utf8');
      for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const value = match[1].replaceAll('&amp;', '&');
        if (/^(?:#|data:|blob:|mailto:)/.test(value)) continue;
        const target = new URL(value, url);
        if (target.origin !== origin) continue;
        links++;
        if (!target.pathname.startsWith(base)) { errors.push(`${relative}: outside base ${value}`); continue; }
        let local = path.join(root, decodeURIComponent(target.pathname.slice(base.length)));
        if (existsSync(local) && statSync(local).isDirectory()) local = path.join(local, 'index.html');
        if (!existsSync(local)) errors.push(`${relative}: missing ${value}`);
      }
      if (relative.startsWith('legal/') && /href="[^" ]*\.md/.test(html)) errors.push(`${relative}: deployed Markdown link`);
      if (relative === 'index.html' && /<script[^>]+src="https:\/\/www.googletagmanager/.test(html)) errors.push('Unconditional GA script');
    }
  }
}
inspect(root);
if (!existsSync(path.join(root,'legal/license.txt'))) errors.push('Missing downloadable GPL text');
if (existsSync(path.join(root,'test/privacy-qa.html'))) errors.push('Local QA harness must not ship');
console.log(JSON.stringify({ base, pages, localLinksChecked:links, errors }, null, 2));
if (errors.length) process.exitCode = 1;
