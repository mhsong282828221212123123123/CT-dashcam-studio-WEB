const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEST_DIR = 'E:\\tesla\\project\\testfile\\SavedClips\\2026-08-17_12-48-22';

async function runExportModalAndFpsTest() {
  console.log('=== Starting Edge Export Modal & 4x FPS E2E Test ===');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,800',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    page.on('console', (msg) => {
      const txt = msg.text();
      if (!txt.includes('[vite]') && !txt.includes('404')) {
        console.log(`[Browser ${msg.type()}]`, txt);
      }
    });

    await page.goto('http://localhost:5173/CT-dashcam-studio-WEB/?perf=1', { waitUntil: 'networkidle0' });

    // Load clips via fallback-file-input
    const testFiles = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.mp4')).map(f => path.join(TEST_DIR, f));
    const inputEl = await page.$('#fallback-file-input');
    await inputEl.uploadFile(...testFiles);
    await inputEl.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));

    await page.waitForSelector('.clip-node', { timeout: 10000 });
    const clipNodes = await page.$$('.clip-node');
    await clipNodes[0].click();
    await new Promise(r => setTimeout(r, 600));

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: FPS Options verification at 1.0x and 4.0x export speed
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 1. Testing FPS Select at 1.0x and 4.0x ---');

    const fpsCheck1x = await page.evaluate(() => {
      const speedSelect = document.getElementById('export-speed-select');
      const fpsSelect = document.getElementById('export-fps-select');
      speedSelect.value = '1.0';
      speedSelect.dispatchEvent(new Event('change'));
      const options = Array.from(fpsSelect.options).map(o => ({ val: o.value, text: o.text }));
      return {
        selectedFps: fpsSelect.value,
        options,
      };
    });
    console.log('1.0x Speed FPS Options:', fpsCheck1x);
    if (parseInt(fpsCheck1x.selectedFps) > 60) {
      throw new Error(`1.0x speed selected FPS should not exceed 60: ${fpsCheck1x.selectedFps}`);
    }

    const fpsCheck4x = await page.evaluate(() => {
      const speedSelect = document.getElementById('export-speed-select');
      const fpsSelect = document.getElementById('export-fps-select');
      speedSelect.value = '4.0';
      speedSelect.dispatchEvent(new Event('change'));
      const options = Array.from(fpsSelect.options).map(o => ({ val: o.value, text: o.text }));
      return {
        selectedFps: fpsSelect.value,
        options,
      };
    });
    console.log('4.0x Speed FPS Options:', fpsCheck4x);

    // CRITICAL ASSERTION: 4.0x must NOT default to 120 FPS!
    if (fpsCheck4x.selectedFps === '120') {
      throw new Error('FAILURE: 4.0x export speed must NOT default to 120 FPS (iOS Slo-Mo Bug)!');
    }
    const isStandardFps = ['24', '30', '36'].includes(fpsCheck4x.selectedFps);
    if (!isStandardFps) {
      throw new Error(`Expected standard default FPS (24, 30, or 36), got: ${fpsCheck4x.selectedFps}`);
    }
    console.log('✓ 4.0x speed correctly defaulted to standard FPS:', fpsCheck4x.selectedFps);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Active camera filtering check in Exporter
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing Exporter Active Camera Filtering ---');

    const activeCamsResult = await page.evaluate(() => {
      const app = (window).app;
      const exporter = app.exporter;

      // Single camera layout
      const singleKeys = exporter.getActiveCamKeys({ layout: '단일 카메라', single_cam: 'front' });
      // 1:3 layout without pillar
      const standardKeys = exporter.getActiveCamKeys({ layout: '기본 (1:3 세로배치)', pillar_pip: false });
      // 1:3 layout with pillar
      const pillarKeys = exporter.getActiveCamKeys({ layout: '기본 (1:3 세로배치)', pillar_pip: true });

      return { singleKeys, standardKeys, pillarKeys };
    });
    console.log('Active camera keys:', activeCamsResult);
    if (activeCamsResult.singleKeys.length !== 1 || activeCamsResult.singleKeys[0] !== 'front') {
      throw new Error(`Single cam keys should be ['front'], got: ${JSON.stringify(activeCamsResult.singleKeys)}`);
    }
    if (activeCamsResult.standardKeys.length !== 4) {
      throw new Error(`Standard keys should be 4 cameras, got: ${JSON.stringify(activeCamsResult.standardKeys)}`);
    }
    if (activeCamsResult.pillarKeys.length !== 6) {
      throw new Error(`Pillar PIP keys should be 6 cameras, got: ${JSON.stringify(activeCamsResult.pillarKeys)}`);
    }
    console.log('✓ Exporter active camera filtering verified 100%!');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Export Modal Lifecycle & Touch Blocking & Cancelation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Testing Export Progress Modal & Cancellation ---');

    // Verify initial modal state
    const modalInitial = await page.evaluate(() => {
      const modal = document.getElementById('export-progress-modal');
      return {
        exists: Boolean(modal),
        display: modal ? window.getComputedStyle(modal).display : 'null',
      };
    });
    console.log('Initial modal state:', modalInitial);
    if (!modalInitial.exists || modalInitial.display !== 'none') {
      throw new Error(`Export modal should exist and be hidden initially: ${JSON.stringify(modalInitial)}`);
    }

    // Set short in/out range for export
    await page.evaluate(() => {
      const app = (window).app;
      app.seekTo(0);
      app.setInPoint();
      app.seekTo(2.0);
      app.setOutPoint();
    });

    // Start export
    console.log('Starting export...');
    await page.click('#btn-export');
    await new Promise(r => setTimeout(r, 300));

    // Verify modal is displayed and backdrop blocks screen
    const modalActive = await page.evaluate(() => {
      const modal = document.getElementById('export-progress-modal');
      const card = modal?.querySelector('.export-progress-card');
      const pct = document.getElementById('export-modal-pct');
      const gauge = document.getElementById('export-modal-gauge-fill');
      const warning = modal?.querySelector('.export-warning-callout');
      const cancelBtn = document.getElementById('btn-cancel-export-modal');

      const style = modal ? window.getComputedStyle(modal) : null;
      return {
        display: style?.display,
        zIndex: style?.zIndex,
        pctText: pct?.textContent,
        gaugeWidth: gauge?.style.width,
        hasWarning: Boolean(warning && warning.textContent.includes('화면을 켠 채로 유지')),
        cancelBtnVisible: Boolean(cancelBtn && cancelBtn.textContent.includes('내보내기 취소')),
      };
    });
    console.log('Active modal state:', modalActive);
    if (modalActive.display !== 'flex' || modalActive.zIndex !== '9999') {
      throw new Error(`Modal not properly displayed or z-index not 9999: ${JSON.stringify(modalActive)}`);
    }
    if (!modalActive.hasWarning) {
      throw new Error('Screen wake/sleep warning text missing in modal!');
    }
    if (!modalActive.cancelBtnVisible) {
      throw new Error('Cancel button missing in modal!');
    }
    console.log('✓ Export modal successfully covering screen with warning and cancel button!');

    // Capture screenshot of the active export modal
    const modalShotPath = path.join(__dirname, '../docs/mobile_export_progress_modal.png');
    await page.screenshot({ path: modalShotPath });
    const artifactDir = 'C:\\Users\\ddno2\\.gemini\\antigravity\\brain\\1296f195-8d13-4c1e-ae90-bae2100cf725';
    fs.copyFileSync(modalShotPath, path.join(artifactDir, 'mobile_export_progress_modal.png'));
    console.log('✓ Saved export modal screenshot to docs and artifact directory');

    // Test cancellation via modal cancel button
    console.log('Clicking modal cancel button (#btn-cancel-export-modal)...');
    await page.click('#btn-cancel-export-modal');
    await new Promise(r => setTimeout(r, 600));

    // Verify modal closes and export status updates
    const modalAfterCancel = await page.evaluate(() => {
      const modal = document.getElementById('export-progress-modal');
      const statusLabel = document.getElementById('export-status-label');
      const btnExport = document.getElementById('btn-export');
      const style = modal ? window.getComputedStyle(modal) : null;

      return {
        display: style?.display,
        isExporting: (window).app.isExporting,
        statusText: statusLabel?.textContent,
        btnText: btnExport?.textContent,
      };
    });
    console.log('State after modal cancellation:', modalAfterCancel);
    if (modalAfterCancel.display !== 'none') {
      throw new Error(`Modal should close after cancellation: ${modalAfterCancel.display}`);
    }
    if (modalAfterCancel.isExporting) {
      throw new Error('isExporting should be false after cancellation!');
    }
    console.log('✓ Modal closed and export cancelled cleanly!');

    console.log('\n🎉 ALL EXPORT MODAL & FPS TESTS PASSED 100%!');
  } finally {
    await browser.close();
  }
}

runExportModalAndFpsTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
