import puppeteer from 'puppeteer-core';
import * as path from 'path';
import * as fs from 'fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEST_DIR = 'E:\\tesla\\project\\testfile\\SavedClips\\2026-08-17_12-48-22';
const SCREENSHOT_PATH = 'E:\\tesla\\project\\CT-dashcam-studio-web\\test_screenshot_edge.png';

async function runEdgeE2ETest() {
  console.log('=== Starting Microsoft Edge E2E Test ===');
  console.log('Edge executable:', EDGE_PATH);

  // Collect test video files from 2026-08-17_12-48-22
  const files = fs.readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.mp4'))
    .map(f => path.join(TEST_DIR, f));

  console.log(`Found ${files.length} test MP4 files in ${TEST_DIR}`);

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
    console.log(`[Browser ${msg.type()}]`, msg.text());
  });

  page.on('requestfailed', req => {
    console.log('[Request Failed]', req.url(), req.failure()?.errorText);
  });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // 1. Check title & Tier badge
  const tierBadgeText = await page.$eval('#tier-badge', el => el.textContent);
  console.log('✓ Detected Device Tier Badge:', tierBadgeText);

  // 2. Upload test files into fallback file input
  console.log('Uploading test video files to app...');
  const inputEl = await page.$('#fallback-file-input');
  await inputEl.uploadFile(...files);

  // Dispatch change event explicitly
  await inputEl.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));

  // 3. Wait for clips tree to populate
  await page.waitForSelector('.clip-node', { timeout: 10000 });
  const clipNodesCount = await page.$$eval('.clip-node', els => els.length);
  console.log(`✓ Clips tree loaded: ${clipNodesCount} clips found!`);

  // 4. Wait a bit for front SEI decoder to parse
  await new Promise(r => setTimeout(r, 2000));

  // Check time display
  const initialTime = await page.$eval('#time-display', el => el.textContent);
  console.log('✓ Initial time display:', initialTime);

  // 5. Click Play button
  console.log('Testing Playback...');
  await page.click('#btn-play');
  await new Promise(r => setTimeout(r, 3000)); // Play for 3s

  const playingTime = await page.$eval('#time-display', el => el.textContent);
  console.log('✓ Time display after 3s playback:', playingTime);

  // 6. Test Layout Switch (Switch to 2x2 layout)
  console.log('Testing 2x2 Layout switch...');
  await page.click('.btn-tab[data-layout="2x2 분할 (전후/좌우)"]');
  await new Promise(r => setTimeout(r, 1000));

  // 7. Take screenshot of canvas
  await page.screenshot({ path: SCREENSHOT_PATH });
  console.log('✓ Screenshot saved to:', SCREENSHOT_PATH);

  // 8. Test In/Out point setting
  console.log('Testing Range In/Out points...');
  await page.click('#btn-set-in');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.click('#btn-set-out');
  const rangeText = await page.$eval('#range-text', el => el.textContent);
  console.log('✓ Range set:', rangeText);

  await browser.close();
  console.log('=== Microsoft Edge E2E Test Passed Successfully! ===');
}

runEdgeE2ETest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
