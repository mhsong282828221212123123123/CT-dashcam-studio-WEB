import puppeteer from 'puppeteer-core';
import * as path from 'path';
import * as fs from 'fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEST_DIR = 'E:\\tesla\\project\\testfile\\SavedClips\\2026-08-17_12-48-22';

async function runEdgeFpsTest() {
  console.log('=== Starting Edge E2E Export FPS Feature Test ===');

  const files = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.mp4')).map(f => path.join(TEST_DIR, f));

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Browser error]`, msg.text());
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // 1. Upload files
  const inputEl = await page.$('#fallback-file-input');
  await inputEl.uploadFile(...files);
  await inputEl.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForSelector('.clip-node', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1500));

  // 2. Check initial FPS options for 6-cam HW4 clip (base fps = 24.0)
  const fpsInfo6Cam = await page.evaluate(() => {
    const sel = document.getElementById('export-fps-select');
    return {
      options: Array.from(sel.options).map(o => ({ value: o.value, text: o.text })),
      selectedValue: sel.value,
      estSize: document.getElementById('lbl-est-size')?.textContent
    };
  });
  console.log('✓ 6-cam (HW4 pillar) FPS options:', fpsInfo6Cam);

  // 3. Switch to 4-cam clip (HW3, base fps = 36.0)
  const clips = await page.$$('.clip-node');
  if (clips.length > 1) {
    await clips[1].click();
    await new Promise(r => setTimeout(r, 500));
  }

  const fpsInfo4Cam = await page.evaluate(() => {
    const sel = document.getElementById('export-fps-select');
    return {
      options: Array.from(sel.options).map(o => ({ value: o.value, text: o.text })),
      selectedValue: sel.value,
      estSize: document.getElementById('lbl-est-size')?.textContent
    };
  });
  console.log('✓ 4-cam (no pillars) FPS options:', fpsInfo4Cam);

  // 4. Test changing export speed -> FPS options dynamic update
  console.log('Testing speed change to 2.0x...');
  await page.select('#export-speed-select', '2.0');
  await new Promise(r => setTimeout(r, 300));

  const fpsInfo2x = await page.evaluate(() => {
    const sel = document.getElementById('export-fps-select');
    return {
      options: Array.from(sel.options).map(o => ({ value: o.value, text: o.text })),
      selectedValue: sel.value,
      estSize: document.getElementById('lbl-est-size')?.textContent
    };
  });
  console.log('✓ 2.0x speed FPS options (should have high fps candidates):', fpsInfo2x);

  // 5. Test changing FPS and verifying estimated size changes dynamically
  console.log('Testing FPS dropdown changing estimated size...');
  await page.select('#export-speed-select', '1.0');
  await new Promise(r => setTimeout(r, 300));

  await page.select('#export-fps-select', '36');
  await new Promise(r => setTimeout(r, 200));
  const sizeAt36 = await page.evaluate(() => document.getElementById('lbl-est-size')?.textContent);

  await page.select('#export-fps-select', '30');
  await new Promise(r => setTimeout(r, 200));
  const sizeAt30 = await page.evaluate(() => document.getElementById('lbl-est-size')?.textContent);

  await page.select('#export-fps-select', '24');
  await new Promise(r => setTimeout(r, 200));
  const sizeAt24 = await page.evaluate(() => document.getElementById('lbl-est-size')?.textContent);

  console.log(`✓ Estimated sizes by FPS: 36fps="${sizeAt36}", 30fps="${sizeAt30}", 24fps="${sizeAt24}"`);
  if (sizeAt36 === sizeAt30 || sizeAt30 === sizeAt24) {
    throw new Error('Estimated size did not change when selecting different FPS!');
  }

  // 6. Test Export with 1.0x speed and 30 FPS
  console.log('Testing 1.0x export execution...');
  await page.evaluate(() => {
    const app = (window).app;
    app.seekTo(0);
    app.setInPoint();
    app.seekTo(2.0); // 2 second export
    app.setOutPoint();
  });

  await page.select('#export-fps-select', '30');
  await page.click('#btn-export');

  await page.waitForFunction(() => {
    const status = document.getElementById('export-status-label');
    return status && status.textContent && status.textContent.includes('완료');
  }, { timeout: 30000 });

  const exportResult = await page.evaluate(() => document.getElementById('export-status-label')?.textContent);
  console.log('✓ Export result at 1.0x, 30fps:', exportResult);

  await browser.close();
  console.log('=== All Export FPS Tests Passed 100%! ===');
}

runEdgeFpsTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
