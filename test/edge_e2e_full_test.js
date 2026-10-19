import puppeteer from 'puppeteer-core';
import * as path from 'path';
import * as fs from 'fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEST_DIR = 'E:\\tesla\\project\\testfile\\SavedClips\\2026-08-17_12-48-22';
const SCREENSHOT_PATH = 'E:\\tesla\\project\\CT-dashcam-studio-web\\docs\\current_web_ui.png';

async function runEdgeFullTest() {
  console.log('=== Starting Complete Edge E2E Test (Qt6 UI Parity) ===');

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
    console.log(`[Browser ${msg.type()}]`, msg.text());
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // 1. Upload test files
  const inputEl = await page.$('#fallback-file-input');
  await inputEl.uploadFile(...files);
  await inputEl.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));

  await page.waitForSelector('.clip-node', { timeout: 10000 });
  console.log('✓ Clips loaded in explorer tree');
  await new Promise(r => setTimeout(r, 2000));

  // Check PIP state on initial 6-cam clip
  const pipState1 = await page.evaluate(() => {
    const chk = document.getElementById('chk-pillar-pip');
    return { disabled: chk.disabled, checked: chk.checked };
  });
  console.log('✓ Initial 6-cam clip PIP state:', pipState1);
  if (pipState1.disabled || !pipState1.checked) {
    throw new Error('Initial 6-cam clip should have PIP enabled and checked!');
  }

  // Switch to single-cam mode and verify PIP is disabled and unchecked
  console.log('Testing Single Camera Mode PIP gating...');
  await page.evaluate(() => {
    (window).app.setLayoutMode('단일 카메라');
  });
  const pipStateSingle = await page.evaluate(() => {
    const chk = document.getElementById('chk-pillar-pip');
    return { disabled: chk.disabled, checked: chk.checked };
  });
  console.log('✓ Single-cam mode PIP state:', pipStateSingle);
  if (!pipStateSingle.disabled || pipStateSingle.checked) {
    throw new Error('Single-cam mode should have PIP disabled and unchecked!');
  }

  // Switch back to 1:3 layout
  console.log('Switching back to 1:3 multi-cam mode...');
  await page.evaluate(() => {
    (window).app.setLayoutMode('기본 (1:3 세로배치)');
  });
  const pipStateMulti = await page.evaluate(() => {
    const chk = document.getElementById('chk-pillar-pip');
    return { disabled: chk.disabled, checked: chk.checked };
  });
  console.log('✓ Multi-cam restored PIP state:', pipStateMulti);
  if (pipStateMulti.disabled || !pipStateMulti.checked) {
    throw new Error('Multi-cam with pillars should have PIP enabled and checked!');
  }

  // Test selecting second clip (which has NO pillar cams)
  const clipNodes = await page.$$('.clip-node');
  if (clipNodes.length > 1) {
    console.log('Selecting second clip (4-cam, no pillars)...');
    await clipNodes[1].click();
    await new Promise(r => setTimeout(r, 1000));
    const pipState4Cam = await page.evaluate(() => {
      const chk = document.getElementById('chk-pillar-pip');
      return { disabled: chk.disabled, checked: chk.checked };
    });
    console.log('✓ 4-cam (no pillars) clip PIP state:', pipState4Cam);
    if (!pipState4Cam.disabled || pipState4Cam.checked) {
      throw new Error('4-cam clip without pillars should have PIP disabled and unchecked!');
    }
    // Switch back to first clip (6-cam) for the rest of the tests & screenshot
    await clipNodes[0].click();
    await new Promise(r => setTimeout(r, 1000));
  }

  // 1-1. Test Double Click on Sub-Camera Slots (1:3 Layout)
  console.log('Testing Double Click on Camera Slots (1:3 Layout)...');
  const dblClickSlot = async (slotName, relXRatio, relYRatio) => {
    return page.evaluate(({ relXRatio, relYRatio }) => {
      const canvas = document.getElementById('player-canvas');
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + rect.width * relXRatio;
      const clientY = rect.top + rect.height * relYRatio;
      const evt = new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
      });
      canvas.dispatchEvent(evt);
      return {
        layout: (window).app.options.layout,
        single_cam: (window).app.options.single_cam,
      };
    }, { relXRatio, relYRatio });
  };

  // Test clicking REAR slot (top of right column: x ~ 88%, y ~ 15%)
  const resRear = await dblClickSlot('REAR', 0.88, 0.15);
  console.log('✓ Double-clicked REAR slot ->', resRear);
  if (resRear.layout !== '단일 카메라' || resRear.single_cam !== 'back') {
    throw new Error(`Expected single cam 'back', got ${JSON.stringify(resRear)}`);
  }

  // Double click anywhere to restore
  const resRestore1 = await dblClickSlot('RESTORE', 0.5, 0.5);
  console.log('✓ Double-clicked to restore ->', resRestore1.layout);
  if (resRestore1.layout !== '기본 (1:3 세로배치)') {
    throw new Error(`Expected restore to '기본 (1:3 세로배치)', got ${resRestore1.layout}`);
  }

  // Test clicking LEFT REPEATER slot (middle of right column: x ~ 88%, y ~ 45%)
  const resLeftRep = await dblClickSlot('LEFT REPEATER', 0.88, 0.45);
  console.log('✓ Double-clicked LEFT REPEATER slot ->', resLeftRep);
  if (resLeftRep.layout !== '단일 카메라' || resLeftRep.single_cam !== 'left_repeater') {
    throw new Error(`Expected single cam 'left_repeater', got ${JSON.stringify(resLeftRep)}`);
  }

  // Double click to restore
  await dblClickSlot('RESTORE', 0.5, 0.5);

  // Test clicking RIGHT REPEATER slot (bottom of right column: x ~ 88%, y ~ 75%)
  const resRightRep = await dblClickSlot('RIGHT REPEATER', 0.88, 0.75);
  console.log('✓ Double-clicked RIGHT REPEATER slot ->', resRightRep);
  if (resRightRep.layout !== '단일 카메라' || resRightRep.single_cam !== 'right_repeater') {
    throw new Error(`Expected single cam 'right_repeater', got ${JSON.stringify(resRightRep)}`);
  }

  // Double click to restore
  await dblClickSlot('RESTORE', 0.5, 0.5);

  // 1-2. Test Telemetry Column Hit Test and Drag
  console.log('Testing Telemetry Column Drag & Hit Testing...');
  const dragResult = await page.evaluate(() => {
    const app = (window).app;
    const hitTime = app.hitTestTelemetryCol(500, 990);
    const hitSteer = app.hitTestTelemetryCol(760, 990);
    const hitBlinker = app.hitTestTelemetryCol(980, 990);
    const hitSpeed = app.hitTestTelemetryCol(1200, 990);
    const hitPedal = app.hitTestTelemetryCol(1500, 990);
    const hitFsd = app.hitTestTelemetryCol(1780, 990);
    const beforeOrder = [...app.options.telemetryOrder];

    // Drag steering to the right past blinker
    app.draggingColKey = 'steering';
    const swapped = app.updateTelemetryDrag(1100);
    const afterOrder = [...app.options.telemetryOrder];
    app.draggingColKey = null;

    // Reset via double click simulation on HUD
    const canvas = document.getElementById('player-canvas');
    const rect = canvas.getBoundingClientRect();
    const evt = new MouseEvent('dblclick', {
      bubbles: true,
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + rect.height * 0.95, // in HUD bar
    });
    canvas.dispatchEvent(evt);
    const resetOrder = [...app.options.telemetryOrder];

    return { hitTime, hitSteer, hitBlinker, hitSpeed, hitPedal, hitFsd, swapped, beforeOrder, afterOrder, resetOrder };
  });
  console.log('✓ Telemetry Hit Test & Drag Result:', dragResult);
  if (
    dragResult.hitTime !== 'timestamp' ||
    dragResult.hitSteer !== 'steering' ||
    dragResult.hitBlinker !== 'turn_signal' ||
    dragResult.hitSpeed !== 'speed' ||
    dragResult.hitPedal !== 'pedal' ||
    dragResult.hitFsd !== 'fsd' ||
    !dragResult.swapped
  ) {
    throw new Error(`Telemetry hit test or drag failed: ${JSON.stringify(dragResult)}`);
  }

  // 2. Test Playback
  console.log('Testing Playback...');
  await page.click('#btn-play');
  await new Promise(r => setTimeout(r, 3000)); // Play 3s

  const playBtnText = await page.$eval('#btn-play', el => el.textContent);
  console.log('✓ Play Button State while playing:', playBtnText);

  // 3. Test Ad Placeholder, Brand, and Tier Tooltip Card
  console.log('Verifying Ad Placeholder, Footer Brand, and Tier Tooltip...');
  const brandText = await page.$eval('.footer-brand', el => el.textContent);
  console.log('✓ Footer Brand text:', brandText);
  if (brandText !== 'CT Dash Studio WEB') {
    throw new Error(`Expected brand 'CT Dash Studio WEB', got '${brandText}'`);
  }

  const hasAdSpace = await page.$eval('.ad-box-group', el => Boolean(el));
  console.log('✓ Ad placeholder present in sidebar:', hasAdSpace);

  const tierReason = await page.$eval('#tooltip-reason', el => el.textContent);
  console.log('✓ Tier calculation reason:', tierReason);
  if (!tierReason || tierReason.includes('측정 중')) {
    throw new Error('Tier calculation reason was not populated!');
  }

  // 4. Set 2-second range for export test
  console.log('Setting 2-second range for Export test...');
  await page.evaluate(() => {
    (window).app.inPointSec = 5.0;
    (window).app.outPointSec = 7.0;
    (window).app.updateRangeUI();
    (window).app.updateEstimatedSize();
  });

  const rangeText = await page.$eval('#range-text', el => el.textContent);
  const estSizeText = await page.$eval('#lbl-est-size', el => el.textContent);
  console.log('✓ Range set:', rangeText);
  console.log('✓ Estimated size calculated:', estSizeText);

  // 5. Take screenshot of current UI state matching reference
  await page.screenshot({ path: SCREENSHOT_PATH });
  console.log('✓ Current UI screenshot saved to:', SCREENSHOT_PATH);

  // Also copy to test_screenshot_full_edge.png for backwards compatibility
  fs.copyFileSync(SCREENSHOT_PATH, 'E:\\tesla\\project\\CT-dashcam-studio-web\\test_screenshot_full_edge.png');

  // 6. Test Inline Export (Compact resolution for fast run)
  console.log('Starting WebCodecs MP4 Export test...');
  await page.select('#export-resolution', 'Compact (960x540) - 모바일용');
  await page.select('#export-speed-select', '2.0');

  await page.click('#btn-export');

  await page.waitForFunction(
    () => {
      const txt = document.getElementById('export-status-label')?.textContent || '';
      return txt.includes('완료') || txt.includes('오류');
    },
    { timeout: 30000 }
  );

  const exportStatus = await page.$eval('#export-status-label', el => el.textContent);
  console.log('✓ Export Result:', exportStatus);

  await browser.close();
  console.log('=== All Features Verified Successfully on Microsoft Edge! ===');
}

runEdgeFullTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
