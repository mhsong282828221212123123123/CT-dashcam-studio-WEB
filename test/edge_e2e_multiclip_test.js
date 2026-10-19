import puppeteer from 'puppeteer-core';
import * as path from 'path';
import * as fs from 'fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEST_DIR = 'E:\\tesla\\project\\testfile\\SavedClips\\2026-08-17_12-48-22';
const SCREENSHOT_PATH = 'E:\\tesla\\project\\CT-dashcam-studio-web\\docs\\multiclip_range_highlight.png';

async function runEdgeMultiClipTest() {
  console.log('=== Starting Microsoft Edge Multi-Clip Range & Highlight E2E Test ===');

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

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // 1. Upload test files
  const inputEl = await page.$('#fallback-file-input');
  await inputEl.uploadFile(...files);
  await inputEl.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));

  await page.waitForSelector('.clip-node', { timeout: 10000 });
  console.log('✓ Clips loaded into explorer tree');
  await new Promise(r => setTimeout(r, 2000));

  const clipNodes = await page.$$('.clip-node');
  console.log(`Found ${clipNodes.length} clips in tree`);
  if (clipNodes.length < 3) {
    throw new Error('Expected at least 3 clips for multi-clip test!');
  }

  // 2. Select Clip 0 and seek to 15.0s, then set in-point
  console.log('Testing Clip 0: Setting in-point at 15.0s...');
  await clipNodes[0].click();
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    const app = (window).app;
    app.seekTo(15.0);
    app.setInPoint();
  });

  // Verify Clip 0 timeline range highlight
  const clip0Range = await page.evaluate(() => {
    const range = document.getElementById('timeline-range');
    const rangeText = document.getElementById('range-text');
    return {
      display: range.style.display,
      left: range.style.left,
      width: range.style.width,
      text: rangeText.textContent
    };
  });
  console.log('✓ Clip 0 Range Highlight:', clip0Range);
  if (clip0Range.display !== 'block' || !clip0Range.left.startsWith('25')) {
    throw new Error(`Clip 0 range highlight failed: ${JSON.stringify(clip0Range)}`);
  }

  // 3. Select Clip 1 (intermediate clip)
  console.log('Testing Clip 1 (Intermediate): Checking full clip highlight...');
  await clipNodes[1].click();
  await new Promise(r => setTimeout(r, 1000));

  const clip1Range = await page.evaluate(() => {
    const range = document.getElementById('timeline-range');
    return {
      display: range.style.display,
      left: range.style.left,
      width: range.style.width
    };
  });
  console.log('✓ Clip 1 (Intermediate) Range Highlight:', clip1Range);
  if (clip1Range.display !== 'block' || clip1Range.left !== '0%' || clip1Range.width !== '100%') {
    throw new Error(`Clip 1 range highlight failed: ${JSON.stringify(clip1Range)}`);
  }

  // 4. Select Clip 2 (end clip) and seek to 30.0s, then set out-point
  console.log('Testing Clip 2 (End): Setting out-point at 30.0s...');
  await clipNodes[2].click();
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    const app = (window).app;
    app.seekTo(30.0);
    app.setOutPoint();
  });

  // Verify Clip 2 timeline range highlight (should be 0% to 50%)
  const clip2Range = await page.evaluate(() => {
    const range = document.getElementById('timeline-range');
    const rangeText = document.getElementById('range-text');
    return {
      display: range.style.display,
      left: range.style.left,
      width: range.style.width,
      text: rangeText.textContent
    };
  });
  console.log('✓ Clip 2 Range Highlight:', clip2Range);
  if (clip2Range.display !== 'block' || clip2Range.left !== '0%' || !clip2Range.width.startsWith('50')) {
    throw new Error(`Clip 2 range highlight failed: ${JSON.stringify(clip2Range)}`);
  }

  // 5. Verify range text contains multi-file info
  console.log('✓ Range Text Display:', clip2Range.text);
  if (!clip2Range.text.includes('3개 파일 연속')) {
    throw new Error(`Range text should indicate 3 continuous clips! Got: ${clip2Range.text}`);
  }

  // 6. Verify tree node highlights (.clip-node.in-range)
  const treeHighlightStates = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.clip-node'));
    return nodes.map((node, i) => ({
      index: i,
      inRange: node.classList.contains('in-range'),
      text: node.textContent.trim().replace(/\s+/g, ' ')
    }));
  });
  console.log('✓ Tree nodes highlight status:');
  treeHighlightStates.slice(0, 5).forEach(s => {
    console.log(`  Clip [${s.index}]: inRange=${s.inRange} (${s.text})`);
  });

  if (!treeHighlightStates[0].inRange || !treeHighlightStates[1].inRange || !treeHighlightStates[2].inRange) {
    throw new Error('Clips 0, 1, 2 must all have .in-range highlight!');
  }
  if (treeHighlightStates[3].inRange) {
    throw new Error('Clip 3 must NOT have .in-range highlight!');
  }

  // 7. Verify buildTargetClipChain
  const targetChain = await page.evaluate(() => {
    const chain = (window).app.buildTargetClipChain();
    return chain.map(c => ({
      clipId: c.clip.id,
      startSec: c.startSec,
      endSec: c.endSec,
      baseTimeStr: c.baseTimeStr
    }));
  });
  console.log('✓ Target clip export chain:', targetChain);
  if (targetChain.length !== 3) {
    throw new Error(`Expected chain length 3, got ${targetChain.length}`);
  }
  if (targetChain[0].startSec !== 15.0 || targetChain[0].endSec !== 60.0) {
    throw new Error(`Segment 0 unexpected bounds: ${JSON.stringify(targetChain[0])}`);
  }
  if (targetChain[1].startSec !== 0 || targetChain[1].endSec !== 60.0) {
    throw new Error(`Segment 1 unexpected bounds: ${JSON.stringify(targetChain[1])}`);
  }
  if (targetChain[2].startSec !== 0 || targetChain[2].endSec !== 30.0) {
    throw new Error(`Segment 2 unexpected bounds: ${JSON.stringify(targetChain[2])}`);
  }

  // 8. Capture screenshot showing the timeline highlight and tree highlights
  await page.screenshot({ path: SCREENSHOT_PATH });
  console.log(`✓ Screenshot saved to ${SCREENSHOT_PATH}`);

  // Also copy screenshot to artifact directory
  const artifactDir = 'C:\\Users\\ddno2\\.gemini\\antigravity\\brain\\1296f195-8d13-4c1e-ae90-bae2100cf725';
  fs.copyFileSync(SCREENSHOT_PATH, path.join(artifactDir, 'multiclip_range_highlight.png'));

  // 9. Test Reset Range button
  console.log('Testing Range Reset button...');
  await page.click('#btn-reset-range');
  await new Promise(r => setTimeout(r, 500));

  const afterReset = await page.evaluate(() => {
    const range = document.getElementById('timeline-range');
    const rangeText = document.getElementById('range-text');
    const inRangeNodes = document.querySelectorAll('.clip-node.in-range');
    return {
      display: range.style.display,
      text: rangeText.textContent,
      highlightedNodesCount: inRangeNodes.length
    };
  });
  console.log('✓ After Reset state:', afterReset);
  if (afterReset.display !== 'none' || afterReset.highlightedNodesCount !== 0) {
    throw new Error(`Reset failed: ${JSON.stringify(afterReset)}`);
  }

  // 10. Re-apply range (0 to 1) and test multi-clip export execution
  console.log('Testing Multi-Clip Export execution on 2 consecutive clips...');
  await clipNodes[0].click();
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const app = (window).app;
    app.seekTo(55.0); // 5 seconds of clip 0
    app.setInPoint();
  });
  await clipNodes[1].click();
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const app = (window).app;
    app.seekTo(5.0); // 5 seconds of clip 1
    app.setOutPoint();
  });

  // Check export speed, select 8.0x for rapid headless export test
  await page.select('#export-speed-select', '8.0');
  await page.select('#export-fps-select', '15'); // 15fps for fast test

  console.log('Clicking export button...');
  await page.click('#btn-export');

  // Wait for export progress to reach completion
  await page.waitForFunction(() => {
    const status = document.getElementById('export-status-label');
    return status && status.textContent && status.textContent.includes('성공적으로 완료');
  }, { timeout: 45000 });

  const finalStatus = await page.evaluate(() => {
    return document.getElementById('export-status-label').textContent;
  });
  console.log('✓ Export completed successfully:', finalStatus);

  await browser.close();
  console.log('🎉 ALL EDGE E2E TESTS PASSED 100%!');
}

runEdgeMultiClipTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
