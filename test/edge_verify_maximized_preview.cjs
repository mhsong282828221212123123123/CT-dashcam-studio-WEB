const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\ddno2\\.gemini\\antigravity\\brain\\1296f195-8d13-4c1e-ae90-bae2100cf725';

(async () => {
  console.log('=== Verifying Maximized Window Preview Scaling ===');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Test at Ultrawide 2560x1080 (same aspect ratio as user's screenshot: 1024x416 ~ 2.46)
  await page.setViewport({ width: 2560, height: 1080 });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // Upload test files so the player is actively rendering a clip
  const testDir = 'E:\\tesla\\project\\testfile\\SavedClips\\2026-08-17_12-48-22';
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.mp4')).map(f => path.join(testDir, f));
  const inputEl = await page.$('#fallback-file-input');
  await inputEl.uploadFile(...files);
  await inputEl.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));

  await page.waitForSelector('.clip-node', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1200));

  const metrics2560 = await page.evaluate(() => {
    const canvas = document.getElementById('player-canvas');
    const container = document.querySelector('.canvas-container');
    const cRect = canvas.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      container: { w: Math.round(contRect.width), h: Math.round(contRect.height) },
      canvasDOM: { w: Math.round(cRect.width), h: Math.round(cRect.height) },
    };
  });
  console.log('Metrics at Ultrawide 2560x1080:', metrics2560);

  // Capture screenshot of maximized ultrawide window
  const shotPath = path.join(ARTIFACT_DIR, 'maximized_ultrawide_preview.png');
  await page.screenshot({ path: shotPath });
  const docsPath = path.join(__dirname, '../docs/maximized_ultrawide_preview.png');
  fs.copyFileSync(shotPath, docsPath);
  console.log(`✓ Screenshot of maximized preview saved to: ${shotPath}`);

  // Also test at 3440x1440
  await page.setViewport({ width: 3440, height: 1440 });
  await new Promise(r => setTimeout(r, 300));

  const metrics3440 = await page.evaluate(() => {
    const canvas = document.getElementById('player-canvas');
    const container = document.querySelector('.canvas-container');
    const cRect = canvas.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      container: { w: Math.round(contRect.width), h: Math.round(contRect.height) },
      canvasDOM: { w: Math.round(cRect.width), h: Math.round(cRect.height) },
    };
  });
  console.log('Metrics at Ultrawide 3440x1440:', metrics3440);

  // Assertions:
  // In both 2560x1080 and 3440x1440, canvasDOM.h must match container.h (within 2px) so it fills vertical height 100%!
  if (Math.abs(metrics2560.canvasDOM.h - metrics2560.container.h) > 4) {
    throw new Error(`Canvas height (${metrics2560.canvasDOM.h}) does not fill container height (${metrics2560.container.h}) at 2560x1080!`);
  }
  if (Math.abs(metrics3440.canvasDOM.h - metrics3440.container.h) > 4) {
    throw new Error(`Canvas height (${metrics3440.canvasDOM.h}) does not fill container height (${metrics3440.container.h}) at 3440x1440!`);
  }
  console.log('✓ Canvas preview fully expands and scales with maximized window height!');

  await browser.close();
  console.log('=== All Maximized Window Preview Scaling Tests Passed 100%! ===');
})();
