import puppeteer from 'puppeteer-core';
import * as path from 'path';
import * as fs from 'fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEST_DIR = 'E:\\tesla\\project\\testfile\\SavedClips\\2026-08-17_12-48-22';
const ARTIFACT_DIR = 'C:\\Users\\ddno2\\.gemini\\antigravity\\brain\\1296f195-8d13-4c1e-ae90-bae2100cf725';

async function runEdgeLanguageTest() {
  console.log('=== Starting Edge E2E Language Selector Test ===');

  const files = fs.readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.mp4'))
    .map(f => path.join(TEST_DIR, f));

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1600,1000'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Browser ${msg.type()}]`, msg.text());
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // 1. Check presence of dropdown and its options
  const langInfo = await page.evaluate(() => {
    const row = document.querySelector('.est-size-row');
    const lbl = document.getElementById('lbl-est-size');
    const box = document.querySelector('.lang-select-box');
    const sel = document.getElementById('select-language');
    const label = document.querySelector('.lang-label');

    const options = Array.from(sel ? sel.options : []).map(o => ({
      value: o.value,
      text: o.text
    }));

    // Bounding rects for horizontal layout check
    const lblRect = lbl ? lbl.getBoundingClientRect() : null;
    const selRect = sel ? sel.getBoundingClientRect() : null;

    return {
      rowExists: !!row,
      lblExists: !!lbl,
      boxExists: !!box,
      labelExists: !!label,
      labelText: label ? label.textContent : '',
      options,
      lblRect,
      selRect,
      isRightOf: lblRect && selRect ? selRect.left >= lblRect.right : false
    };
  });

  console.log('Language selector info:', langInfo);
  if (!langInfo.rowExists || !langInfo.boxExists || !langInfo.options.length) {
    throw new Error('Language selector not found in .est-size-row!');
  }
  if (!langInfo.isRightOf) {
    throw new Error(`Language selector must be on the right of estimated size! lblRight=${langInfo.lblRect?.right}, selLeft=${langInfo.selRect?.left}`);
  }

  // 2. Load test clips
  const inputEl = await page.$('#fallback-file-input');
  await inputEl.uploadFile(...files);
  await inputEl.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForSelector('.clip-node', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1500));

  // 3. Test language switching
  const testLangs = [
    { lang: 'en', expectedBtnExport: 'Export Selected Range (MP4)', expectedEstPrefix: 'Est. Size: ~' },
    { lang: 'ja', expectedBtnExport: '選択範囲を出力 (MP4)', expectedEstPrefix: '予想サイズ: 約 ' },
    { lang: 'zh-CN', expectedBtnExport: '导出选中片段 (MP4)', expectedEstPrefix: '预计大小: 约 ' },
    { lang: 'zh-TW', expectedBtnExport: '匯出選取片段 (MP4)', expectedEstPrefix: '預計大小: 約 ' },
    { lang: 'ko', expectedBtnExport: '선택 구간 내보내기 (MP4)', expectedEstPrefix: '예상 크기: 약 ' }
  ];

  for (const item of testLangs) {
    await page.select('#select-language', item.lang);
    await new Promise(r => setTimeout(r, 200));

    const state = await page.evaluate(() => {
      const btnExport = document.getElementById('btn-export')?.textContent?.trim();
      const estSize = document.getElementById('lbl-est-size')?.textContent?.trim();
      const overlaysTitle = document.querySelector('.group-box:not(.mobile-adjust-box):not(.export-group) .group-title')?.textContent?.trim();
      const exportTitle = document.querySelector('.export-group .group-title')?.textContent?.trim();
      return { btnExport, estSize, overlaysTitle, exportTitle };
    });

    console.log(`Lang [${item.lang}] =>`, state);
    if (!state.btnExport?.includes(item.expectedBtnExport)) {
      throw new Error(`Lang [${item.lang}] btnExport mismatch: got "${state.btnExport}", expected "${item.expectedBtnExport}"`);
    }
    if (!state.estSize?.startsWith(item.expectedEstPrefix)) {
      throw new Error(`Lang [${item.lang}] estSize prefix mismatch: got "${state.estSize}", expected to start with "${item.expectedEstPrefix}"`);
    }
  }

  // Take PC screenshot
  const pcScreenshotPath = path.join(ARTIFACT_DIR, 'language_dropdown_pc.png');
  await page.screenshot({ path: pcScreenshotPath });
  console.log('✓ Saved PC screenshot to:', pcScreenshotPath);

  // 4. Test Mobile View
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluate(() => {
    (window).app.viewMode = 'mobile';
    (window).app.applyViewMode();
  });
  await new Promise(r => setTimeout(r, 500));

  // Click [💾 내보내기] mobile tab to view export section with language selector
  const exportTab = await page.$('.mobile-tab-btn[data-tab="export"]');
  if (exportTab) await exportTab.click();
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    const p = document.querySelector('.sidebar-panel');
    if (p) p.scrollTop = p.scrollHeight;
  });
  await new Promise(r => setTimeout(r, 200));

  const mobileScreenshotPath = path.join(ARTIFACT_DIR, 'language_dropdown_mobile.png');
  await page.screenshot({ path: mobileScreenshotPath });
  console.log('✓ Saved Mobile screenshot to:', mobileScreenshotPath);

  await browser.close();
  console.log('=== Edge E2E Language Selector Test Passed 100%! ===');
}

runEdgeLanguageTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
